# ========================================
# OpenStu v0.46
# Author: github@qibaoseven, bilibili@七宝-Seven
# ========================================
# 存储层 —— 替代 Netlify Blobs
# ========================================
# Netlify Blobs 的「桶 + key」模型直接映射成本地文件：
#     <root>/<桶名>/<key>.json
#
#   主桶 studentos-main      -> data/studentos-main/classes.json
#                               data/studentos-main/tokens.json
#   班级桶 class-{id}        -> data/class-{id}/data.json
#                               data/class-{id}/password_hash.json
#                               data/class-{id}/homework_data.json
#                               data/class-{id}/homework_meta.json
#                               data/class-{id}/journal_{学号}.json
#
# 与 Blobs 的行为差异（刻意保持语义一致的部分）：
#   · get(key)  —— 不存在时返回 None（不是抛异常、不是空串）
#   · set(key, value) —— 传入的值本身就是一个字符串（密文 base64、哈希、或
#     已序列化的 JSON 文本）。我们把它原样存进 .json 文件，
#     也就是「文件内容是那个字符串」，不做二次包装。
#   · delete(key) —— 删除该 key 对应的文件；文件不存在时静默无事发生
#     （Blobs 的 delete 也是幂等的）
#
# 目录按需创建，首次写入时自动 mkdir -p。
# ========================================
import os
import json
import asyncio

# 主桶名称（与 JS 里的 MAIN_STORE 保持一致）
MAIN_STORE = 'studentos-main'

# 数据根目录：<项目根>/data
_HERE = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_HERE)
DATA_ROOT = os.path.join(_PROJECT_ROOT, 'data')


def _bucket_dir(bucket):
    """桶名 -> 目录绝对路径"""
    return os.path.join(DATA_ROOT, bucket)


def _key_path(bucket, key):
    """
    (桶名, key) -> 文件绝对路径

    key 会做一层安全处理：不允许路径分隔符与 .. 逃逸，
    避免 journal_{学号} 之类的外部输入穿越目录。
    """
    safe = str(key)
    # 拒绝任何可能穿越目录的字符
    if ('/' in safe) or ('\\' in safe) or ('..' in safe) or safe in ('', '.'):
        raise ValueError(f'非法的存储 key: {key!r}')
    return os.path.join(_bucket_dir(bucket), f'{safe}.json')


class LocalStore:
    """
    一个桶的本地文件实现，接口与 Netlify Blobs 的 store 对齐。

    只有三个方法，全部 async：
        await store.get(key)         -> str | None
        await store.set(key, value)  -> None
        await store.delete(key)      -> None
    """

    def __init__(self, bucket):
        self.bucket = bucket
        self.directory = _bucket_dir(bucket)

    # ---------- 读 ----------
    async def get(self, key):
        path = _key_path(self.bucket, key)
        if not os.path.exists(path):
            return None
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            # 与 Blobs 一致：不存在就是 None，不是错误
            return None

    # ---------- 写 ----------
    async def set(self, key, value):
        path = _key_path(self.bucket, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)

        # 与 Blobs 一致：写入的是字符串本身。
        # 若上游传了非字符串（例如对象），序列化成 JSON 文本，
        # 保证读回来仍是字符串，不改变调用方的行为。
        if isinstance(value, (bytes, bytearray)):
            text = value.decode('utf-8')
        elif isinstance(value, str):
            text = value
        else:
            text = json.dumps(value)

        # 原子写：先写临时文件再 replace，避免中途失败留下半截文件
        tmp = f'{path}.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)

    # ---------- 删 ----------
    async def delete(self, key):
        path = _key_path(self.bucket, key)
        try:
            os.remove(path)
        except FileNotFoundError:
            pass  # 幂等


# ========================================
# 桶工厂（对应 blobs.js 里的 getMainStore / getStoreForClass）
# ========================================

def get_main_store():
    """主桶：存班级列表与 tokens"""
    return LocalStore(MAIN_STORE)


def get_store_for_class(class_id):
    """
    每个班级一个独立桶。

    注意：调用方传进来的 class_id 本身就已经带前缀了
    （api.js 里是 `class_${Date.now()}`，路由里由 /class_\\d+/ 匹配出来），
    而 netlify/functions/blobs.js 的写法是 getBlobStore(`class-${classId}`)。

    所以真实的桶名形如 `class-class_1780000000000`，
    对应的目录也叫这个名字 —— 这里刻意与 JS 保持逐字一致，
    不"顺手"去重前缀，否则就和原实现的桶名对不上了。
    """
    return LocalStore(f'class-{class_id}')


# ========================================
# 班级列表 / tokens 的读写（对应 blobs.js 的同名函数）
# ========================================

async def get_classes_list():
    """班级列表存在主桶的 'classes' key，内容是 JSON 文本"""
    store = get_main_store()
    data = await store.get('classes')
    if not data:
        return []
    return json.loads(data)


async def save_classes_list(classes):
    store = get_main_store()
    await store.set('classes', json.dumps(classes, ensure_ascii=False))


async def get_tokens():
    """
    取 tokens 列表，首次访问时用项目根目录的 tokens.json 初始化 —— 
    与 blobs.js 的行为一致。
    """
    store = get_main_store()
    data = await store.get('tokens')

    if not data:
        # 尝试从本地 tokens.json 读取默认值
        tokens_path = os.path.join(_PROJECT_ROOT, 'tokens.json')
        try:
            with open(tokens_path, 'r', encoding='utf-8') as f:
                default_tokens = json.load(f)
            await store.set('tokens', json.dumps(default_tokens, ensure_ascii=False))
            return default_tokens
        except Exception:
            empty = {'tokens': [], 'used': []}
            await store.set('tokens', json.dumps(empty, ensure_ascii=False))
            return empty

    if isinstance(data, str):
        return json.loads(data)
    return data


async def save_tokens(tokens):
    store = get_main_store()
    await store.set('tokens', json.dumps(tokens, ensure_ascii=False))


def init_blobs(event=None):
    """
    JS 里这个函数用来 connectLambda(event)。
    本地文件版不需要任何初始化，保留为空函数以便调用方零改动。
    """
    return None

# ========================================
# OpenStu v0.45
# Author: github@qibaoseven, bilibili@七宝-Seven
# ========================================
# UUID 子系统 - 学号 -> 卡片原生 UID(7 字节)
# ========================================
# 说明：
#   校园卡(MIFARE Classic / CUID)每张卡出厂都有一个 4 或 7 字节的
#   唯一 UID，普通工具刷不干净，正好拿来当"物理身份"。这里只用
#   学号做 key，值是定长 7 字节（其他长度自动左补 0x00）。
#
# 存储形态：班级桶里 key = 'uuids'，内容为 JSON 字符串，形如
#   { "1": [0x12,0x34,0x56,0x78,0x9a,0xbc,0xde], "2": [...] }
# 即 int -> byte[7]，独立于「整班数据」，只存在于作业子系统，
# 仅通过下面三个 API 读写。
# ========================================
#
# Python port of netlify/functions/uuids.js (behavior-preserving).
# class_store 由外部注入（具 get/set 两个 await 方法）。
import base64
import binascii
import json
import re

UUID_KEY = 'uuids'
UID_LENGTH = 7

_INT_RE = re.compile(r'^\d+$')
_HEX_RE = re.compile(r'^[0-9a-fA-F]+$')


def normalize_uuid_student_id(value):
    """
    学号规范化：接受数字或数字字符串，返回非负整数；非法返回 None。
    等价于 JS 的 normalizeUuidStudentId()。
    """
    if value is None or value is False:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, str):
        s = value.strip()
        if not s or not _INT_RE.match(s):
            return None
        return int(s)
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float):
        if value < 0 or value != int(value):
            return None
        return int(value)
    return None


def parse_uid(value):
    """
    把 API 传来的各种写法统一成 7 字节 bytes。

    支持：
      - 字节数组 [0x12, 0x34, ...]
      - 十六进制串 '12:34:56:78:9A:BC:DE' / '123456789ABCDE' / '0x12 0x34 ...'
      - base64 串（解码后 <= 7 字节）
      - {'hex': '...'} / {'bytes': [...]}
      - 非数组的 dict {0:18,1:52,...}

    返回定长 7 字节 bytes；非法返回 None。
    """
    if isinstance(value, (bytes, bytearray)):
        buf = bytes(value)
    elif isinstance(value, dict):
        if value.get('hex') is not None:
            return parse_uid(value['hex'])
        if value.get('bytes') is not None:
            return parse_uid(value['bytes'])
        # 非数组对象形式 {0:18,1:52,...} 也接受
        keys = sorted(value.keys(), key=lambda k: int(k) if str(k).isdigit() else -1)
        idx = [int(k) for k in keys if str(k).isdigit()]
        if idx and idx == list(range(len(idx))):
            return parse_uid([value[str(i)] if str(i) in value else value[i] for i in idx])
        return None
    elif isinstance(value, (list, tuple)):
        if not value or len(value) > UID_LENGTH:
            return None
        out = bytearray()
        for b in value:
            try:
                n = int(b)
            except (TypeError, ValueError):
                return None
            if n < 0 or n > 255:
                return None
            out.append(n)
        buf = bytes(out)
    elif isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        # 十六进制写法：'12:34:..' / '123456789ABCDE' / '0x12 0x34 ...'
        compact = re.sub(r'(^|\s)0x', ' ', s, flags=re.IGNORECASE)
        compact = re.sub(r'[\s:,_\-]', '', compact)
        if _HEX_RE.match(compact) and len(compact) <= UID_LENGTH * 2:
            if len(compact) % 2:
                compact = '0' + compact
            try:
                buf = bytes.fromhex(compact)
            except ValueError:
                return None
        else:
            # 退而求其次当 base64
            try:
                buf = base64.b64decode(s, validate=True)
            except (binascii.Error, ValueError):
                return None
            if not buf or len(buf) > UID_LENGTH:
                return None
    else:
        return None

    if not buf or len(buf) > UID_LENGTH:
        return None

    # 左补 0x00 到 7 字节，保证定长
    return bytes(b'\x00' * (UID_LENGTH - len(buf))) + buf


async def get_uuids(class_store):
    """
    读取整个 uuids 字典，返回 {学号(int): [7 个字节]}。
    """
    raw = await class_store.get(UUID_KEY)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw) if isinstance(raw, (str, bytes, bytearray)) else raw
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}
    if not isinstance(parsed, dict):
        return {}

    result = {}
    for key, val in parsed.items():
        sid = normalize_uuid_student_id(key)
        if sid is None:
            continue
        b = parse_uid(val)
        if b is not None:
            result[sid] = list(b)
    return result


async def save_uuids(class_store, mapping):
    """
    整份覆盖写入 uuids 字典。
    mapping: {学号: UID(数组/hex/base64)}
    返回 {'uuids': {...}, 'count': n}
    """
    if not isinstance(mapping, dict) or isinstance(mapping, (list, tuple)):
        raise ValueError('uuids 必须是一个 dict（学号 -> UID）')

    normalized = {}
    seen = set()

    for key, val in mapping.items():
        sid = normalize_uuid_student_id(key)
        if sid is None:
            raise ValueError(f'非法学号: {key}')
        b = parse_uid(val)
        if b is None:
            raise ValueError(f'学号 {sid} 的 UID 非法（需要 1~7 字节）')
        normalized[str(sid)] = list(b)
        seen.add(b)

    # 同一个 UID 只能绑一个学号，否则刷卡会歧义
    if len(seen) != len(normalized):
        raise ValueError('存在重复的 UID，同一张卡不能绑定多个学号')

    # 与 JS 版一致：按学号数值升序落盘（JS 对象的整数键天然有序）
    ordered = {}
    for sid in sorted(int(k) for k in normalized):
        ordered[str(sid)] = normalized[str(sid)]

    await class_store.set(UUID_KEY, json.dumps(ordered, separators=(',', ':')))
    return {'uuids': ordered, 'count': len(ordered)}


async def add_uuid(class_store, student_id, uid):
    """
    在原有字典基础上追加 / 更新单个学号的 UID（绝不删除其他条目）。
    返回 {'uuids': {...}, 'count': n, 'added': bool}
    """
    sid = normalize_uuid_student_id(student_id)
    if sid is None:
        raise ValueError('缺少或非法的 student_id')

    b = parse_uid(uid)
    if b is None:
        raise ValueError('缺少或非法的 uid（1~7 字节）')

    current = await get_uuids(class_store)

    # 该 UID 已经绑在别人身上 -> 拒绝
    for k, v in current.items():
        if parse_uid(v) == b and k != sid:
            raise ValueError(f'该 UID 已绑定学号 {k}')

    added = sid not in current
    current[sid] = list(b)

    ordered = {}
    for key in sorted(current.keys()):
        ordered[str(key)] = current[key]

    await class_store.set(UUID_KEY, json.dumps(ordered, separators=(',', ':')))
    return {'uuids': ordered, 'count': len(ordered), 'added': added}


def find_student_by_uid(uuids_map, uid):
    """
    用 UID 反查学号（作业提交刷卡用）。
    找到返回 int 学号，找不到返回 None。
    """
    b = parse_uid(uid)
    if b is None:
        return None
    for sid, val in uuids_map.items():
        if parse_uid(val) == b:
            return sid
    return None


__all__ = [
    'UUID_KEY',
    'UID_LENGTH',
    'parse_uid',
    'normalize_uuid_student_id',
    'get_uuids',
    'save_uuids',
    'add_uuid',
    'find_student_by_uid',
]

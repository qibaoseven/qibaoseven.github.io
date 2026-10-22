# ========================================
# OpenStu v0.45
# Author: github@qibaoseven, bilibili@七宝-Seven
# ========================================
# Flask 主应用 —— netlify/functions/api.js 的 1:1 移植
# ========================================
# 路由顺序与判断条件严格照搬 JS：JS 用的是 includes() 顺序匹配，
# 因此「谁先匹配到谁赢」这一点必须保持，特别是：
#   · /students 必须先于整班 GET /api/class/{id}
#   · /homework/init 等子路径必须先于 /homework
#   · /journal/{sid} 与 /journal-export 必须先于 /journal
#   · /uuids/add 必须先于 /uuids（否则会被整份推送分支吃掉）
#   · /uuids 必须排除在整班 GET/POST 之外
#
# 前端请求的路径是 /.netlify/functions/api/...，为了「前端零改动」，
# 这里同时注册该前缀与 /api 前缀两套蓝图。
# ========================================
import json
import re
from datetime import datetime, timezone

from flask import Flask, Response, request

from storage import (
    get_store_for_class,
    get_classes_list,
    save_classes_list,
    get_tokens,
    save_tokens,
)
from homework import (
    init_homework_system,
    get_homework_meta,
    is_homework_initialized,
    update_homework,
    add_day_data,
    get_homework_data,
    get_student_homework,
    get_date_range,
)
from journal import (
    get_journal,
    get_journals,
    append_journal,
    export_journals,
    normalize_student_id,
)
from uuids import (
    get_uuids,
    save_uuids,
    add_uuid,
    find_student_by_uid,
    parse_uid,
    normalize_uuid_student_id,
)
from netlify_compat import (
    derive_key, hash_password, encrypt_data, decrypt_data, extract_students,
)

app = Flask(__name__)

# 前端使用的原始前缀（Netlify Functions 的路径）
LEGACY_PREFIX = '/.netlify/functions/api'
# 同时支持简洁前缀
API_PREFIX = '/api'

CLASS_ID_RE = re.compile(r'class_\d+')


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-Password, X-Password-Hash',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    }


def json_response(payload, status=200):
    return Response(
        json.dumps(payload, ensure_ascii=False),
        status=status,
        mimetype='application/json',
        headers=cors_headers(),
    )


def text_response(body, status=200, content_type='text/markdown; charset=utf-8', extra=None):
    headers = cors_headers()
    if extra:
        headers.update(extra)
    return Response(body, status=status, content_type=content_type, headers=headers)


def get_class_id(path):
    """从请求路径里抠出 class_数字"""
    m = CLASS_ID_RE.search(path)
    return m.group(0) if m else ''


def body_json():
    """对应 JS 的 JSON.parse(body)"""
    raw = request.get_data(as_text=True)
    if not raw:
        return {}
    return json.loads(raw)


# ========================================
# 各路由的实现（与 JS 逐段对应）
# ========================================

def route_classes_list(path):
    """GET /api/classes"""
    classes = asyncio_run(get_classes_list())
    return json_response([{'id': c['id'], 'name': c['name'], 'created_at': c['created_at']}
                          for c in classes])


def route_classes_import(path):
    """POST /api/classes/import"""
    payload = body_json()
    bin_id = payload.get('bin_id')
    master_key = payload.get('master_key')
    class_name = payload.get('class_name')
    class_password = payload.get('class_password')

    if not bin_id or not master_key or not class_name or not class_password:
        return json_response({'error': '缺少必要字段'}, 400)

    # 拉取 JsonBin（与原实现一致，用标准库 http 客户端）
    import urllib.request
    import urllib.error
    try:
        req = urllib.request.Request(
            f'https://api.jsonbin.io/v3/b/{bin_id}',
            headers={'X-Master-Key': master_key},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            jsonbin_data = json.loads(resp.read().decode('utf-8'))
    except Exception:
        return json_response({'error': 'JsonBin验证失败'}, 401)

    record = jsonbin_data.get('record')

    class_id = f'class_{int(datetime.now().timestamp() * 1000)}'
    encrypted = encrypt_data(record, class_password)
    password_hash = hash_password(class_password)

    class_store = get_store_for_class(class_id)
    asyncio_run(class_store.set('data', encrypted))
    asyncio_run(class_store.set('password_hash', password_hash))

    classes = asyncio_run(get_classes_list())
    classes.append({
        'id': class_id,
        'name': class_name,
        'created_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    })
    asyncio_run(save_classes_list(classes))

    return json_response({'id': class_id, 'name': class_name, 'message': '导入成功'}, 201)


def route_classes_create(path):
    """POST /api/classes/create"""
    payload = body_json()
    class_name = payload.get('class_name')
    class_password = payload.get('class_password')
    token = payload.get('token')
    json_data = payload.get('json_data')

    if not class_name or not class_password or not token or not json_data:
        return json_response({'error': '缺少必要字段'}, 400)

    is_valid = asyncio_run(verify_token(token))
    if not is_valid:
        return json_response({'error': 'Token无效或已使用'}, 401)

    class_id = f'class_{int(datetime.now().timestamp() * 1000)}'
    encrypted = encrypt_data(json.loads(json_data), class_password)
    password_hash = hash_password(class_password)

    class_store = get_store_for_class(class_id)
    asyncio_run(class_store.set('data', encrypted))
    asyncio_run(class_store.set('password_hash', password_hash))

    classes = asyncio_run(get_classes_list())
    classes.append({
        'id': class_id,
        'name': class_name,
        'created_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    })
    asyncio_run(save_classes_list(classes))

    return json_response({'id': class_id, 'name': class_name, 'message': '创建成功'}, 201)


async def verify_token(token):
    tokens = await get_tokens()
    if token in tokens.get('tokens', []):
        tokens['tokens'].remove(token)
        tokens.setdefault('used', []).append(token)
        await save_tokens(tokens)
        return True
    return token not in tokens.get('used', [])


def route_class_students(path):
    """GET /api/class/{id}/students"""
    class_id = get_class_id(path)
    password = request.headers.get('X-Password')
    password_hash = request.headers.get('X-Password-Hash')

    if not class_id:
        return json_response({'error': '缺少班级 ID'}, 400)
    if not password:
        return json_response({'error': '缺少密码参数'}, 400)
    if not password_hash:
        return json_response({'error': '缺少密码哈希参数'}, 400)

    class_store = get_store_for_class(class_id)
    encrypted = asyncio_run(class_store.get('data'))
    stored_hash = asyncio_run(class_store.get('password_hash'))

    if not encrypted:
        return json_response({'error': '班级不存在'}, 404)
    # storedHash 存在时必须匹配；不存在（历史班级）则由 data 解密兜底
    if stored_hash and password_hash != stored_hash:
        return json_response({'error': '密码错误'}, 401)

    try:
        data = decrypt_data(encrypted, password)
    except Exception as e:
        msg = str(e)
        if 'Unsupported state' in msg or 'bad' in msg or msg == '数据格式错误':
            return json_response({'error': '密码错误'}, 401)
        return json_response({'error': f'解密失败: {msg}'}, 500)

    include_teachers = request.args.get('teachers', '').lower() in ('1', 'true', 'yes')
    students = extract_students(data, include_teachers=include_teachers)

    return json_response({
        'class_id': class_id,
        'count': len(students),
        'students': students,
    })


def route_class_get(path):
    """GET /api/class/{id} —— 整班数据"""
    class_id = get_class_id(path)
    password = request.headers.get('X-Password')
    password_hash = request.headers.get('X-Password-Hash')

    if not password:
        return json_response({'error': '缺少密码参数'}, 400)
    if not password_hash:
        return json_response({'error': '缺少密码哈希参数'}, 400)

    class_store = get_store_for_class(class_id)
    encrypted = asyncio_run(class_store.get('data'))
    stored_hash = asyncio_run(class_store.get('password_hash'))

    if not encrypted:
        return json_response({'error': '班级不存在'}, 404)
    if stored_hash and password_hash != stored_hash:
        return json_response({'error': '密码错误'}, 401)

    try:
        data = decrypt_data(encrypted, password)
        return json_response({'data': data})
    except Exception as e:
        msg = str(e)
        if 'Unsupported state' in msg or 'bad' in msg or msg == '数据格式错误':
            return json_response({'error': '密码错误'}, 401)
        return json_response({'error': f'解密失败: {msg}'}, 500)


def route_class_post(path):
    """POST /api/class/{id} —— 保存整班数据"""
    class_id = get_class_id(path)
    password = request.headers.get('X-Password')
    password_hash = request.headers.get('X-Password-Hash')
    payload = body_json()
    data = payload.get('data')

    if not password:
        return json_response({'error': '缺少密码参数'}, 400)
    if not password_hash:
        return json_response({'error': '缺少密码哈希参数'}, 400)

    class_store = get_store_for_class(class_id)
    stored_hash = asyncio_run(class_store.get('password_hash'))
    if stored_hash and password_hash != stored_hash:
        return json_response({'error': '密码错误'}, 401)

    encrypted = encrypt_data(data, password)
    asyncio_run(class_store.set('data', encrypted))

    # 首次保存时补记密码哈希
    if not stored_hash:
        asyncio_run(class_store.set('password_hash', password_hash))

    return json_response({'message': '保存成功'})


TEMPLATE_TEXT = '''# 班级数据收集指令

你是一个班级管理系统的数据收集助手。用户需要创建一个新的班级,请你按照以下步骤向用户提问,收集必要信息,最终生成符合 OpenStu 系统格式的 JSON 数据。

## 完整 JSON 模板

以下是系统要求的完整 JSON 格式,请参考这个结构收集数据:

```json
{
  "users": {},
  "scores": {},
  "groups": {},
  "rules": {},
  "logs": [],
  "rewards": {"rewards":{},"hidden_rewards":[]},
  "punishments": {"punishments":{}},
  "userPunishments": {"active":{},"completed":{}},
  "gold": {},
  "exchangeRate": {"score_to_gold":0.1,"gold_to_score":10,"last_updated":null},
  "emoji": {"emojis":"😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘"},
  "dailyReport": {},
  "autoEvents": [],
  "positions": {"list":{},"defaultSalary":5,"lastPayDate":null}
}
```

## 收集内容

1. **用户数据 (users)** — 包含 root、admin、user 角色,password 设为 null
2. **分数数据 (scores)** — 每位学生的初始学分
3. **分组数据 (groups)** — 学习小组及成员
4. **积分规则 (rules)** — 加减分规则及分值
5. **抽奖奖励 (rewards)** — SSR/SR/R/N 各稀有度的奖励
6. **惩罚任务 (punishments)** — SP/SSR/SR/R/N 各稀有度的惩罚
7. **金币数据 (gold)** — 每位学生初始金币
8. **汇率设置 (exchangeRate)** — 学分和金币兑换比率
9. **职位系统 (positions)** — 班干部职位、工资及任职人员
10. **其他设置** — emoji、autoEvents、dailyReport 等

请逐项向用户提问,收集完毕后生成完整 JSON。'''


def route_template(path):
    """GET /api/template"""
    # HTTP 头必须是 latin-1 可编码的，中文文件名要用 RFC 5987 的 filename* 形式
    from urllib.parse import quote
    filename = '班级数据收集指令.md'
    disposition = (
        f"attachment; filename=\"template.md\"; "
        f"filename*=UTF-8''{quote(filename)}"
    )
    return text_response(TEMPLATE_TEXT, extra={'Content-Disposition': disposition})


# ---------- 作业子系统 ----------

def route_homework_init(path):
    class_id = get_class_id(path)
    payload = body_json()

    student_count = payload.get('student_count')
    subject_count = payload.get('subject_count')
    subject_names = payload.get('subject_names')

    if student_count is None or student_count < 1:
        return json_response({'error': '学生数量必须大于0'}, 400)
    if subject_count is None or subject_count < 1:
        return json_response({'error': '学科数量必须大于0'}, 400)
    if not isinstance(subject_names, dict):
        return json_response({'error': '请提供学科名称映射,格式: { "0": "语文", "1": "数学" }'}, 400)

    password = request.headers.get('X-Password')
    password_hash = request.headers.get('X-Password-Hash')
    if not password or not password_hash:
        return json_response({'error': '需要密码验证'}, 401)

    class_store = get_store_for_class(class_id)
    stored_hash = asyncio_run(class_store.get('password_hash'))
    if stored_hash and password_hash != stored_hash:
        return json_response({'error': '密码错误'}, 401)

    try:
        result = asyncio_run(init_homework_system(class_store, {
            'studentCount': student_count,
            'subjectCount': subject_count,
            'subjectNames': {str(k): v for k, v in subject_names.items()},
            'startDate': payload.get('start_date'),
        }, password))
        return json_response(result)
    except Exception as error:
        return json_response({'error': str(error)}, 400)


def route_homework_meta(path):
    class_id = get_class_id(path)
    class_store = get_store_for_class(class_id)
    meta = asyncio_run(get_homework_meta(class_store))
    if not meta:
        return json_response({'error': '作业系统未初始化'}, 404)
    return json_response(meta)


def route_homework_status(path):
    class_id = get_class_id(path)
    class_store = get_store_for_class(class_id)
    initialized = asyncio_run(is_homework_initialized(class_store))
    return json_response({
        'initialized': initialized,
        'message': '作业系统已初始化' if initialized else '作业系统未初始化',
    })


def route_homework_get(path):
    class_id = get_class_id(path)
    password = request.headers.get('X-Password')
    password_hash = request.headers.get('X-Password-Hash')
    if not password or not password_hash:
        return json_response({'error': '需要密码验证'}, 401)

    class_store = get_store_for_class(class_id)
    stored_hash = asyncio_run(class_store.get('password_hash'))
    if stored_hash and password_hash != stored_hash:
        return json_response({'error': '密码错误'}, 401)

    try:
        result = asyncio_run(get_homework_data(class_store, password))
    except Exception as e:
        msg = str(e)
        if 'Unsupported state' in msg or '数据格式错误' in msg:
            return json_response({'error': '密码错误'}, 401)
        raise

    if not result['exists']:
        return json_response({'error': '作业数据不存在'}, 404)

    rng = get_date_range(result['data'])
    return json_response({
        'data': result['data'],
        'dateFrom': rng['dateFrom'].strftime('%Y-%m-%d') if rng['dateFrom'] else None,
        'dateTo': rng['dateTo'].strftime('%Y-%m-%d') if rng['dateTo'] else None,
        'totalDays': rng['totalDays'],
    })


def route_homework_raw(path):
    class_id = get_class_id(path)
    class_store = get_store_for_class(class_id)
    raw = asyncio_run(class_store.get('homework_data'))
    if not raw:
        return json_response({'error': '作业数据不存在'}, 404)

    import base64 as _b64
    meta = asyncio_run(get_homework_meta(class_store))
    return json_response({
        'data': raw,
        'meta': meta or None,
        'encoding': 'base64',
        'size': len(_b64.b64decode(raw)),
    })


def route_homework_delete(path):
    class_id = get_class_id(path)
    password = request.headers.get('X-Password')
    password_hash = request.headers.get('X-Password-Hash')
    if not password or not password_hash:
        return json_response({'error': '需要密码验证'}, 401)

    class_store = get_store_for_class(class_id)
    stored_hash = asyncio_run(class_store.get('password_hash'))
    if stored_hash and password_hash != stored_hash:
        return json_response({'error': '密码错误'}, 401)

    asyncio_run(class_store.delete('homework_data'))
    asyncio_run(class_store.delete('homework_meta'))
    return json_response({'message': '作业数据已删除'})


def route_homework_student(path):
    """GET /api/class/{id}/homework/student/{sid}[?date=]"""
    class_id = get_class_id(path)
    m = re.search(r'/student/(\d+)', path)
    student_id = int(m.group(1)) if m else -1

    if student_id <= 0:
        return json_response({'error': '无效的学生ID'}, 400)

    target_date = request.args.get('date')

    password = request.headers.get('X-Password')
    password_hash = request.headers.get('X-Password-Hash')
    if not password or not password_hash:
        return json_response({'error': '需要密码验证'}, 401)

    class_store = get_store_for_class(class_id)
    stored_hash = asyncio_run(class_store.get('password_hash'))
    if stored_hash and password_hash != stored_hash:
        return json_response({'error': '密码错误'}, 401)

    try:
        if target_date:
            data = asyncio_run(get_student_homework(class_store, student_id, target_date, password))
            if data is None:
                return json_response({'error': '未找到数据'}, 404)
            return json_response({'date': target_date, 'studentId': student_id, 'homework': data})
        else:
            result = asyncio_run(get_homework_data(class_store, password))
            if not result['exists']:
                return json_response({'error': '作业数据不存在'}, 404)

            rng = get_date_range(result['data'])
            student_data = []
            date_from = rng['dateFrom']
            for day in range(len(result['data'])):
                if student_id < len(result['data'][day]):
                    current = date_from + __import__('datetime').timedelta(days=day)
                    student_data.append({
                        'date': current.strftime('%Y-%m-%d'),
                        'homework': result['data'][day][student_id],
                    })
            return json_response({'studentId': student_id, 'data': student_data})
    except Exception as e:
        msg = str(e)
        if 'Unsupported state' in msg or '数据格式错误' in msg:
            return json_response({'error': '密码错误'}, 401)
        raise


def route_homework_update(path):
    """POST /api/class/{id}/homework/update —— 支持 student_id 学号 或 uid 卡片 UID"""
    class_id = get_class_id(path)
    try:
        payload = body_json()
    except Exception:
        return json_response({'error': '请求体不是合法 JSON'}, 400)
    if not isinstance(payload, dict):
        return json_response({'error': '请求体不是合法 JSON'}, 400)

    student_id = payload.get('student_id')
    target_date = payload.get('target_date')
    subject_id = payload.get('subject_id')
    # uid / uuid / card_uid 三个键名都认，方便刷卡设备直接传
    raw_uid = payload.get('uid')
    if raw_uid is None:
        raw_uid = payload.get('uuid')
    if raw_uid is None:
        raw_uid = payload.get('card_uid')

    if student_id is None and raw_uid is None:
        return json_response({'error': '缺少学生标识: 需要 student_id 或 uid'}, 400)
    if not target_date or subject_id is None:
        return json_response({'error': '缺少必要参数: target_date, subject_id'}, 400)

    password = request.headers.get('X-Password')
    password_hash = request.headers.get('X-Password-Hash')
    if not password or not password_hash:
        return json_response({'error': '需要密码验证'}, 401)

    class_store = get_store_for_class(class_id)
    stored_hash = asyncio_run(class_store.get('password_hash'))
    if stored_hash and password_hash != stored_hash:
        return json_response({'error': '密码错误'}, 401)

    try:
        # 用 uid 认人：把 UID 反查成学号
        if student_id is None:
            if parse_uid(raw_uid) is None:
                return json_response({'error': '缺少或非法的 uid（1~7 字节）'}, 400)
            uuids_map = asyncio_run(get_uuids(class_store))
            resolved = find_student_by_uid(uuids_map, raw_uid)
            if resolved is None:
                return json_response({'error': '该 UID 尚未绑定学号'}, 404)
            resolved_id = resolved
        else:
            resolved_id = normalize_uuid_student_id(student_id)
            if resolved_id is None or resolved_id <= 0:
                return json_response({'error': f'无效的学生ID: {student_id}'}, 400)

        result = asyncio_run(update_homework(class_store, resolved_id, target_date, subject_id, password))
        if result:
            return json_response({'message': '更新成功', 'student_id': resolved_id,
                                  'target_date': target_date, 'subject_id': subject_id})
        return json_response({'error': '保存失败'}, 500)
    except Exception as error:
        msg = str(error)
        if 'Unsupported state' in msg or '数据格式错误' in msg:
            return json_response({'error': '密码错误'}, 401)
        return json_response({'error': msg}, 400)


def route_homework_day(path):
    class_id = get_class_id(path)
    payload = body_json()
    day_data = payload.get('day_data')
    target_date = payload.get('target_date')

    if not day_data or not isinstance(day_data, list):
        return json_response({'error': '缺少必要参数: day_data'}, 400)

    password = request.headers.get('X-Password')
    password_hash = request.headers.get('X-Password-Hash')
    if not password or not password_hash:
        return json_response({'error': '需要密码验证'}, 401)

    class_store = get_store_for_class(class_id)
    stored_hash = asyncio_run(class_store.get('password_hash'))
    if stored_hash and password_hash != stored_hash:
        return json_response({'error': '密码错误'}, 401)

    try:
        result = asyncio_run(add_day_data(class_store, day_data, target_date, password))
        if result:
            return json_response({
                'message': '添加成功',
                'target_date': target_date or datetime.now().strftime('%Y-%m-%d'),
            })
        return json_response({'error': '保存失败'}, 500)
    except Exception as error:
        msg = str(error)
        if 'Unsupported state' in msg or '数据格式错误' in msg:
            return json_response({'error': '密码错误'}, 401)
        return json_response({'error': msg}, 400)


# ---------- UID 字典（学号 -> 卡片原生 7 字节 UID）----------
# 只开放三个入口：读取全部 / 整份覆盖 / 追加单个
# 数据不加密，但三个接口都要过密码校验，并用整班数据解密验真。

def _uuid_store_verified():
    """
    返回 (class_store, 错误响应)。
    校验 X-Password / X-Password-Hash，并用整班数据真解密一次。
    """
    password = request.headers.get('X-Password')
    password_hash = request.headers.get('X-Password-Hash')
    if not password or not password_hash:
        return None, json_response({'error': '需要密码验证'}, 401)

    class_id = get_class_id(request.path)
    class_store = get_store_for_class(class_id)
    stored_hash = asyncio_run(class_store.get('password_hash'))
    if stored_hash and password_hash != stored_hash:
        return None, json_response({'error': '密码错误'}, 401)

    encrypted = asyncio_run(class_store.get('data'))
    if encrypted:
        try:
            decrypt_data(encrypted, password)
        except Exception:
            return None, json_response({'error': '密码错误'}, 401)

    return class_store, None


def route_uuids_get(path):
    """GET /api/class/{id}/uuids —— 读取整个字典"""
    class_store, err = _uuid_store_verified()
    if err:
        return err
    uuids = asyncio_run(get_uuids(class_store))
    return json_response({
        'class_id': get_class_id(path),
        'count': len(uuids),
        'uuids': {str(k): v for k, v in uuids.items()},
    })


def route_uuids_post(path):
    """POST /api/class/{id}/uuids —— 整份覆盖"""
    try:
        payload = body_json()
    except Exception:
        return json_response({'error': '请求体不是合法 JSON'}, 400)

    # 兼容两种写法：直接给字典，或包一层 { uuids: {...} }
    mapping = payload.get('uuids') if isinstance(payload, dict) and 'uuids' in payload else payload
    if not isinstance(mapping, dict) or isinstance(mapping, (list, tuple)):
        return json_response({'error': '缺少 uuids（学号 -> UID 的 dict）'}, 400)

    class_store, err = _uuid_store_verified()
    if err:
        return err

    try:
        result = asyncio_run(save_uuids(class_store, mapping))
    except ValueError as e:
        return json_response({'error': str(e)}, 400)

    return json_response({
        'message': '已保存',
        'class_id': get_class_id(path),
        'count': result['count'],
        'uuids': result['uuids'],
    })


def route_uuids_add(path):
    """POST /api/class/{id}/uuids/add —— 追加 / 更新单个学号"""
    try:
        payload = body_json()
    except Exception:
        return json_response({'error': '请求体不是合法 JSON'}, 400)

    if not isinstance(payload, dict):
        return json_response({'error': '请求体不是合法 JSON'}, 400)

    student_id = payload.get('student_id', payload.get('id'))
    uid = payload.get('uid', payload.get('uuid'))
    if student_id is None:
        return json_response({'error': '缺少 student_id'}, 400)
    if uid is None:
        return json_response({'error': '缺少 uid'}, 400)

    class_store, err = _uuid_store_verified()
    if err:
        return err

    try:
        result = asyncio_run(add_uuid(class_store, student_id, uid))
    except ValueError as e:
        return json_response({'error': str(e)}, 400)

    return json_response({
        'message': '已追加' if result['added'] else '已更新',
        'class_id': get_class_id(path),
        'added': result['added'],
        'count': result['count'],
        'uuids': result['uuids'],
    })


# ---------- 学生历程 ----------

def route_journal_one(path):
    """GET /api/class/{id}/journal/{sid}"""
    class_id = get_class_id(path)
    m = re.search(r'/journal/([A-Za-z0-9_-]+)', path)
    student_id = normalize_student_id(m.group(1) if m else None)
    if not student_id:
        return json_response({'error': '无效的学号'}, 400)

    class_store = get_store_for_class(class_id)
    text = asyncio_run(get_journal(class_store, student_id))
    return json_response({'student_id': student_id, 'journal': text, 'length': len(text)})


def route_journals_batch(path):
    """GET /api/class/{id}/journals?ids=1,2,3"""
    class_id = get_class_id(path)
    ids_param = request.args.get('ids', '')
    ids = [s.strip() for s in ids_param.split(',') if s.strip()]

    if len(ids) > 200:
        return json_response({'error': '一次最多查询 200 名学生'}, 400)

    class_store = get_store_for_class(class_id)
    journals = asyncio_run(get_journals(class_store, ids))

    result = {sid: {'journal': text, 'length': len(text)} for sid, text in journals.items()}
    return json_response({'journals': result})


def route_journal_append(path):
    """POST /api/class/{id}/journal"""
    class_id = get_class_id(path)
    payload = body_json()

    student_id = normalize_student_id(payload.get('student_id'))
    if not student_id:
        return json_response({'error': '缺少或非法的 student_id'}, 400)

    content = payload.get('content')
    if not isinstance(content, str) or content.strip() == '':
        return json_response({'error': 'content 不能为空'}, 400)

    class_store = get_store_for_class(class_id)
    try:
        result = asyncio_run(append_journal(class_store, student_id, content, {
            'operator': payload.get('operator', ''),
            'operator_role': payload.get('operator_role', ''),
            'operator_name': payload.get('operator_name', ''),
        }))
        return json_response({
            'message': '已追加',
            'student_id': student_id,
            'appended': result['appended'],
            'journal': result['journal'],
            'length': result['length'],
        })
    except Exception as e:
        return json_response({'error': str(e)}, 400)


def route_journal_export(path):
    """GET /api/class/{id}/journal-export?ids=&names="""
    class_id = get_class_id(path)
    ids_param = request.args.get('ids', '')
    ids = [s.strip() for s in ids_param.split(',') if s.strip()]
    names = request.args.get('names', '').split(',')

    students = [{'id': i, 'name': names[idx] if idx < len(names) else ''}
                for idx, i in enumerate(ids)]

    class_store = get_store_for_class(class_id)
    result = asyncio_run(export_journals(class_store, students))

    stamp = datetime.now().strftime('%Y-%m-%d')
    # 同样是 ASCII 文件名，安全
    return text_response(
        result['text'] or '',
        content_type='text/plain; charset=utf-8',
        extra={'Content-Disposition': f'attachment; filename="journals_{stamp}.txt"'},
    )


# ========================================
# 分发（严格按 JS 的顺序）
# ========================================

def dispatch(path):
    method = request.method

    if method == 'OPTIONS':
        return Response('', status=204, headers=cors_headers())

    try:
        # 1. GET /api/classes
        if method == 'GET' and '/api/classes' in path:
            return route_classes_list(path)

        # 2. POST /api/classes/import
        if method == 'POST' and '/api/classes/import' in path:
            return route_classes_import(path)

        # 3. POST /api/classes/create
        if method == 'POST' and '/api/classes/create' in path:
            return route_classes_create(path)

        # 4. GET /students（必须在整班路由之前）
        if method == 'GET' and '/api/class/' in path and '/students' in path:
            return route_class_students(path)

        # 5. GET 整班数据
        if (method == 'GET' and '/api/class/' in path
                and '/homework' not in path and '/journal' not in path
                and '/students' not in path and '/uuids' not in path):
            return route_class_get(path)

        # 6. POST 保存整班数据
        if (method == 'POST' and '/api/class/' in path
                and '/homework' not in path and '/journal' not in path
                and '/students' not in path and '/uuids' not in path):
            return route_class_post(path)

        # 7. GET /api/template
        if method == 'GET' and '/api/template' in path:
            return route_template(path)

        # ---- UID 字典 ----
        # add 必须排在整份之前，否则 '/uuids' in path 会把 add 吃掉
        if method == 'GET' and '/api/class/' in path and '/uuids' in path:
            return route_uuids_get(path)

        if method == 'POST' and '/api/class/' in path and '/uuids/add' in path:
            return route_uuids_add(path)

        if method == 'POST' and '/api/class/' in path and '/uuids' in path:
            return route_uuids_post(path)

        # ---- 作业 ----
        if method == 'POST' and '/api/class/' in path and '/homework/init' in path:
            return route_homework_init(path)

        if method == 'GET' and '/api/class/' in path and '/homework/meta' in path:
            return route_homework_meta(path)

        if method == 'GET' and '/api/class/' in path and '/homework/status' in path:
            return route_homework_status(path)

        if (method == 'GET' and '/api/class/' in path and '/homework' in path
                and '/meta' not in path and '/status' not in path
                and '/student' not in path and '/raw' not in path):
            return route_homework_get(path)

        if (method == 'GET' and '/api/class/' in path and '/homework/raw' in path
                and '/download' not in path):
            return route_homework_raw(path)

        if method == 'DELETE' and '/api/class/' in path and '/homework' in path:
            return route_homework_delete(path)

        if method == 'GET' and '/api/class/' in path and '/homework/student/' in path:
            return route_homework_student(path)

        if method == 'POST' and '/api/class/' in path and '/homework/update' in path:
            return route_homework_update(path)

        if method == 'POST' and '/api/class/' in path and '/homework/day' in path:
            return route_homework_day(path)

        # ---- 历程 ----
        if method == 'GET' and '/api/class/' in path and '/journal/' in path:
            return route_journal_one(path)

        if method == 'GET' and '/api/class/' in path and '/journals' in path:
            return route_journals_batch(path)

        if method == 'POST' and '/api/class/' in path and '/journal' in path:
            return route_journal_append(path)

        if method == 'GET' and '/api/class/' in path and '/journal-export' in path:
            return route_journal_export(path)

        print(f'Error: requests invalid  {method} {path}')
        return json_response({'error': 'Not Found', 'path': path}, 404)

    except Exception as error:
        import traceback
        traceback.print_exc()
        return json_response({'error': '服务器内部错误: ' + str(error), 'path': path}, 500)


@app.route(f'{LEGACY_PREFIX}/<path:subpath>', methods=['GET', 'POST', 'DELETE', 'OPTIONS'])
@app.route(f'{API_PREFIX}/<path:subpath>', methods=['GET', 'POST', 'DELETE', 'OPTIONS'])
def api_with_subpath(subpath):
    return dispatch(request.path)


@app.route(LEGACY_PREFIX, methods=['GET', 'POST', 'DELETE', 'OPTIONS'])
@app.route(API_PREFIX, methods=['GET', 'POST', 'DELETE', 'OPTIONS'])
def api_root():
    return dispatch(request.path)


# ========================================
# 静态前端：直接伺服项目根目录，省掉额外起一个静态服务器
# ========================================

from flask import send_from_directory
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@app.route('/')
def index():
    return send_from_directory(PROJECT_ROOT, 'index.html')


@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(PROJECT_ROOT, filename)


# ========================================
# asyncio 桥接：Flask 是同步的，内部逻辑是 async
# ========================================

import asyncio


def asyncio_run(coro):
    """在同步上下文里跑一个协程"""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # 已在事件循环里（理论不会走到），用新线程兜底
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(1) as pool:
            return pool.submit(asyncio.run, coro).result()
    return asyncio.run(coro)


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f'OpenStu (Flask) 启动于 http://127.0.0.1:{port}/')
    print(f'  API 基址: /{LEGACY_PREFIX[1:]}/ 或 /api/')
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)

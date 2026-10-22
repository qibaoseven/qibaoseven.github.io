# ========================================
# OpenStu v0.46
# Author: github@qibaoseven, bilibili@七宝-Seven
# ========================================
# Homework 子系统 - 基于位压缩存储
# ========================================
# 1:1 移植自 netlify/functions/homework.js，逻辑不做改动。
#
# 二进制布局（加密前的明文，已用 Node v22 实测校准）：
#
#   偏移  长度  内容
#   ----  ----  ------------------------------------------
#   0     4     'HWSF' 魔数
#   4     2     students   uint16 小端（不含 0 号机器人哨兵）
#   6     4     daysSince1970 uint32 小端（起始日期距 1970-01-01 的天数）
#   10    1     subjects   uint8
#   11    ...   位打包的作业数据
#
# 位打包是 MSB 优先：字节 0b10000000 -> [1,0,0,0,0,0,0,0]
# 位流顺序：先按天、再按学生、最后按学科，最后补齐到 8 的倍数。
#
# 加密与 api.js 同款 AES-256-GCM，输出布局 iv(12) ‖ authTag(16) ‖ ciphertext。
#
# 学生维度包含 0 号机器人哨兵，真实学生从索引 1 开始。
# ========================================
import base64
import datetime
import hashlib
import hmac
import json
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ALGORITHM = 'aes-256-gcm'
HW_MAGIC = 'HWSF'

# 头部长度：HWSF(4) + students(2) + days(4) + subjects(1)
HEADER_SIZE = 4 + 2 + 4 + 1

MS_PER_DAY = 24 * 60 * 60 * 1000


# ========================================
# 加密 / 解密（与 journal.js 同款，独立实现避免耦合）
# ========================================

def derive_key(password):
    """等价于 JS createHmac('sha256', password).digest()"""
    return hmac.new(str(password).encode('utf-8'), digestmod=hashlib.sha256).digest()


def encrypt_blob(buffer, password):
    """
    加密二进制数据，格式 iv(12) ‖ authTag(16) ‖ ciphertext，base64 编码。
    明文前置 HWSF 魔数用于完整性校验。
    """
    key = derive_key(password)
    iv = secrets.token_bytes(12)
    payload = HW_MAGIC.encode('ascii') + bytes(buffer)
    ct_and_tag = AESGCM(key).encrypt(iv, payload, None)
    ciphertext = ct_and_tag[:-16]
    auth_tag = ct_and_tag[-16:]
    return base64.b64encode(iv + auth_tag + ciphertext).decode('ascii')


def decrypt_blob(encoded, password):
    """解密，返回去掉 HWSF 魔数之后的原始 bytes。"""
    key = derive_key(password)
    buffer = base64.b64decode(encoded)

    iv = buffer[0:12]
    auth_tag = buffer[12:28]
    ciphertext = buffer[28:]

    plain = AESGCM(key).decrypt(iv, ciphertext + auth_tag, None)

    if len(plain) < 4 or plain[0:4].decode('ascii', 'replace') != HW_MAGIC:
        raise Exception('数据格式错误')

    return plain[4:]


# ========================================
# 位数组 <-> 字节数组（MSB 优先，与 JS 完全一致）
# ========================================

def to_bitarray(data):
    """字节数组 -> 位数组，每字节从高位到低位"""
    bits = []
    for byte in bytes(data):
        for i in range(7, -1, -1):
            bits.append((byte >> i) & 1)
    return bits


def from_bitarray(bits):
    """位数组 -> 字节数组，不足 8 位的部分右侧补零"""
    result = bytearray()
    for i in range(0, len(bits), 8):
        byte = 0
        for j in range(8):
            if i + j < len(bits):
                byte = (byte << 1) | (bits[i + j] & 1)
        result.append(byte)
    return bytes(result)


# ========================================
# 日期工具
# ========================================
# JS 的 new Date(y, m, d) / setDate() 都是「本地时区」语义。
# 这里统一用 date 对象做日历运算，只取 Y/M/D，不受时区影响。

def _today_start():
    """今天的零点（对应 JS 的 new Date() + setHours(0,0,0,0)）"""
    today = datetime.datetime.now()
    return datetime.datetime(today.year, today.month, today.day)


def _epoch_1970():
    """对应 JS 的 new Date(1970, 0, 1)"""
    return datetime.datetime(1970, 1, 1)


def _add_days(dt, days):
    """日历加减天数（对应 JS setDate(getDate() + days)）"""
    return dt + datetime.timedelta(days=days)


def _days_since_1970(dt):
    """对应 Math.floor((dateFrom - new Date(1970,0,1)) / 86400000)"""
    delta = _add_days(dt, 0) - _epoch_1970()
    return int(delta.total_seconds() // MS_PER_DAY * 1000) // MS_PER_DAY


def _parse_date(value):
    """
    对应 JS 的 new Date(value) —— 主要接受 'YYYY-MM-DD'。
    纯日期串按本地零点处理。
    """
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, datetime.date):
        return datetime.datetime(value.year, value.month, value.day)
    text = str(value).strip()
    # 取前 10 位的 YYYY-MM-DD
    for fmt in ('%Y-%m-%d', '%Y/%m/%d'):
        try:
            return datetime.datetime.strptime(text[:10], fmt)
        except ValueError:
            continue
    raise ValueError(f'无法解析日期: {value!r}')


def _iso_date(dt):
    """对应 JS 的 toISOString().split('T')[0]（按本地日期输出）"""
    return f'{dt.year:04d}-{dt.month:02d}-{dt.day:02d}'


# ========================================
# 头部读写（小端）
# ========================================

def _write_uint16_le(buffer, offset, value):
    buffer[offset] = value & 0xFF
    buffer[offset + 1] = (value >> 8) & 0xFF


def _write_uint32_le(buffer, offset, value):
    buffer[offset] = value & 0xFF
    buffer[offset + 1] = (value >> 8) & 0xFF
    buffer[offset + 2] = (value >> 16) & 0xFF
    buffer[offset + 3] = (value >> 24) & 0xFF


def _read_uint8(buffer, offset):
    return buffer[offset]


def _read_uint16_le(buffer, offset):
    return buffer[offset] | (buffer[offset + 1] << 8)


def _read_uint32_le(buffer, offset):
    return (buffer[offset] | (buffer[offset + 1] << 8)
            | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24))


# ========================================
# 读取 / 保存作业数据
# ========================================

async def load_homework_data(class_store, password):
    """
    加载班级作业数据（必须是加密格式）。
    数据不存在返回 None；数据存在但密码错误/格式非法时抛错。
    返回三维列表 [天数][学生索引][学科]
    """
    if not password:
        raise Exception('读取作业数据需要密码')

    raw = await class_store.get('homework_data')
    if not raw:
        return None

    # 解密（密码错或魔数不符会抛错，向上传播以拒绝错误密码）
    buffer = decrypt_blob(raw, password)

    offset = 0
    magic = buffer[offset:offset + 4].decode('ascii', 'replace')
    offset += 4
    if magic != HW_MAGIC:
        raise Exception('无效的数据格式')

    students = _read_uint16_le(buffer, offset)
    offset += 2

    days_since_1970 = _read_uint32_le(buffer, offset)
    offset += 4
    date_from = _add_days(_epoch_1970(), days_since_1970)

    subjects = _read_uint8(buffer, offset)
    offset += 1

    # 数据部分
    data_bytes = buffer[offset:]
    bit_list = to_bitarray(data_bytes)

    # 实际学生数 = 读取的学生数 + 1（0 号机器人）
    actual_students = students + 1

    # 总天数
    today = _today_start()
    total_days = int((today - date_from).days) + 1

    bits_per_day = subjects * actual_students

    homework_data = []
    for day_offset in range(total_days):
        start_bit = day_offset * bits_per_day
        end_bit = start_bit + bits_per_day
        if end_bit > len(bit_list):
            break

        day_students = []
        for student_idx in range(actual_students):
            student_start = start_bit + student_idx * subjects
            day_students.append(bit_list[student_start:student_start + subjects])
        homework_data.append(day_students)

    return homework_data


async def save_homework_data(class_store, homework_data, password=None):
    """
    保存班级作业数据。出错时返回 False（与 JS 的 try/catch 行为一致）。
    """
    try:
        if not homework_data or len(homework_data) == 0:
            raise Exception('没有数据可保存')
        if not password:
            raise Exception('保存作业数据需要密码')

        total_days = len(homework_data)
        actual_students = len(homework_data[0])
        students = actual_students - 1          # 减去 0 号机器人
        subjects = len(homework_data[0][0])

        # 起始日期 = 今天往前推 total_days - 1 天
        today = _today_start()
        date_from = _add_days(today, -(total_days - 1))
        days_since_1970 = (date_from - _epoch_1970()).days

        # 三维列表 -> 位列表
        bit_list = []
        for day in range(total_days):
            for student in range(actual_students):
                bit_list.extend(homework_data[day][student])

        # 补齐到 8 的倍数
        while len(bit_list) % 8 != 0:
            bit_list.append(0)

        data_bytes = from_bitarray(bit_list)

        # 构建完整缓冲：header(11) + 位数据
        total_size = HEADER_SIZE + len(data_bytes)
        buffer = bytearray(total_size)

        # 写头部（偏移与 JS 逐字一致）
        buffer[0:4] = HW_MAGIC.encode('ascii')
        _write_uint16_le(buffer, 4, students)
        _write_uint32_le(buffer, 6, days_since_1970)
        buffer[10] = subjects & 0xFF

        # 写数据：JS 里 offset 此时已累加到 11
        buffer[HEADER_SIZE:] = data_bytes

        encrypted = encrypt_blob(bytes(buffer), password)
        await class_store.set('homework_data', encrypted)

        return True
    except Exception as error:
        print('保存作业数据失败:', error)
        return False


# ========================================
# 日期范围
# ========================================

def get_date_range(homework_data):
    if not homework_data or len(homework_data) == 0:
        return {'dateFrom': None, 'dateTo': None, 'totalDays': 0}

    today = _today_start()
    total_days = len(homework_data)
    date_from = _add_days(today, -(total_days - 1))

    return {'dateFrom': date_from, 'dateTo': today, 'totalDays': total_days}


# ========================================
# 初始化
# ========================================

async def init_homework_system(class_store, config, password=None):
    student_count = config.get('studentCount')
    subject_count = config.get('subjectCount')
    subject_names = config.get('subjectNames')
    start_date = config.get('startDate')

    if not password:
        raise Exception('初始化作业系统需要密码')

    if student_count is None or student_count < 1:
        raise Exception('学生数量必须大于0')
    if subject_count is None or subject_count < 1:
        raise Exception('学科数量必须大于0')
    if not isinstance(subject_names, dict):
        raise Exception('请提供学科名称映射')

    # 学科名称必须覆盖 0..subject_count-1
    name_keys = sorted(int(k) for k in subject_names.keys())
    expected_keys = list(range(subject_count))
    if name_keys != expected_keys:
        raise Exception(f'学科名称映射不完整,需要包含 0 到 {subject_count - 1} 的所有学科')

    for i in range(subject_count):
        value = subject_names.get(i, subject_names.get(str(i)))
        if value is None or str(value).strip() == '':
            raise Exception(f'学科 {i} 的名称不能为空')

    existing = await class_store.get('homework_meta')
    if existing:
        raise Exception('该班级已初始化作业系统,如需重新初始化请先删除数据')

    today = _today_start()
    start = _parse_date(start_date) if start_date else today

    actual_students = student_count + 1     # + 0 号机器人

    first_day = [[0] * subject_count for _ in range(actual_students)]
    homework_data = [first_day]

    save_result = await save_homework_data(class_store, homework_data, password)
    if not save_result:
        raise Exception('保存作业数据失败')

    # 学科名称统一用字符串键存（与 JS 一致）
    normalized_names = {str(i): subject_names.get(i, subject_names.get(str(i)))
                        for i in range(subject_count)}

    meta = {
        'studentCount': student_count,
        'subjectCount': subject_count,
        'subjectNames': normalized_names,
        'initializedAt': datetime.datetime.utcnow().isoformat(timespec='milliseconds') + 'Z',
        'startDate': _iso_date(start)
    }
    await class_store.set('homework_meta', json.dumps(meta, ensure_ascii=False))

    return {
        'success': True,
        'message': '作业系统初始化成功',
        'meta': {
            'studentCount': student_count,
            'subjectCount': subject_count,
            'subjectNames': normalized_names,
            'actualStudents': actual_students,
            'startDate': _iso_date(start)
        }
    }


async def get_homework_meta(class_store):
    meta_raw = await class_store.get('homework_meta')
    if not meta_raw:
        return None
    return json.loads(meta_raw)


async def is_homework_initialized(class_store):
    meta = await get_homework_meta(class_store)
    return meta is not None


# ========================================
# 更新 / 追加
# ========================================

async def update_homework(class_store, student_id, target_date, subject_id, password=None):
    if not password:
        raise Exception('更新作业需要密码')

    homework_data = await load_homework_data(class_store, password)
    if not homework_data:
        homework_data = [[[0], [0]]]     # 0 号机器人 + 1 号学生

    actual_students = len(homework_data[0])
    subjects = len(homework_data[0][0])
    total_days = len(homework_data)

    today = _today_start()
    date_from = _add_days(today, -(total_days - 1))

    target = _parse_date(target_date)
    day_index = (target - date_from).days

    if day_index < 0:
        for _ in range(-day_index):
            homework_data.insert(0, [[0] * subjects for _ in range(actual_students)])
        day_index = 0
    elif day_index >= total_days:
        for _ in range(day_index - total_days + 1):
            homework_data.append([[0] * subjects for _ in range(actual_students)])
        day_index = total_days

    actual_students = len(homework_data[0])
    subjects = len(homework_data[0][0])

    if student_id <= 0 or student_id >= actual_students:
        raise Exception(f'无效的学生ID: {student_id}')
    if subject_id < 0 or subject_id >= subjects:
        raise Exception(f'无效的学科ID: {subject_id}')

    homework_data[day_index][student_id][subject_id] = 1

    return await save_homework_data(class_store, homework_data, password)


async def add_day_data(class_store, day_data, target_date=None, password=None):
    if not password:
        raise Exception('添加作业数据需要密码')
    if target_date is None:
        target_date = _today_start()

    homework_data = await load_homework_data(class_store, password)
    if not homework_data:
        homework_data = []

    if not isinstance(day_data, list) or len(day_data) == 0:
        raise Exception('无效的数据格式')

    actual_students = len(day_data)
    subjects = len(day_data[0])

    for student in day_data:
        if not isinstance(student, list) or len(student) != subjects:
            raise Exception('学生数据长度不一致')

    if len(homework_data) > 0:
        existing_students = len(homework_data[0])
        existing_subjects = len(homework_data[0][0])

        if existing_students != actual_students:
            raise Exception(f'学生数量不匹配: 现有 {existing_students}, 新数据 {actual_students}')
        if existing_subjects != subjects:
            raise Exception(f'学科数量不匹配: 现有 {existing_subjects}, 新数据 {subjects}')

        today = _today_start()
        total_days = len(homework_data)
        date_from = _add_days(today, -(total_days - 1))

        target = _parse_date(target_date)
        day_index = (target - date_from).days

        if day_index < 0:
            for _ in range(-day_index):
                homework_data.insert(0, [[0] * subjects for _ in range(actual_students)])
            day_index = 0
        elif day_index >= total_days:
            for _ in range(day_index - total_days + 1):
                homework_data.append([[0] * subjects for _ in range(actual_students)])
            day_index = total_days

        homework_data[day_index] = day_data
    else:
        homework_data.append(day_data)

    return await save_homework_data(class_store, homework_data, password)


# ========================================
# 查询
# ========================================

async def get_homework_data(class_store, password):
    data = await load_homework_data(class_store, password)
    if data is None:
        return {'exists': False, 'data': None}
    return {'exists': True, 'data': data}


async def get_student_homework(class_store, student_id, target_date, password=None):
    homework_data = await load_homework_data(class_store, password)
    if not homework_data:
        return None

    today = _today_start()
    total_days = len(homework_data)
    date_from = _add_days(today, -(total_days - 1))

    target = _parse_date(target_date)
    day_index = (target - date_from).days

    if day_index < 0 or day_index >= total_days:
        return None
    if student_id < 0 or student_id >= len(homework_data[day_index]):
        return None

    return homework_data[day_index][student_id]

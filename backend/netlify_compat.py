# ========================================
# OpenStu v0.46
# Author: github@qibaoseven, bilibili@七宝-Seven
# ========================================
# api.js 里的加密与数据辅助函数（1:1 移植）
# ========================================
#   deriveKey      HMAC-SHA256 派生密钥
#   hashPassword   sha256 十六进制
#   encryptData    AES-256-GCM，明文前置 "JSON:" 前缀
#   decryptData    解密并校验 "JSON:" 前缀
#   extractStudents 从整班数据抽出「学号 -> 姓名」
# ========================================
import base64
import hashlib
import hmac
import json
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

JSON_PREFIX = 'JSON:'
ALGORITHM = 'aes-256-gcm'


def derive_key(password):
    """对应 JS createHmac('sha256', password).digest()"""
    return hmac.new(str(password).encode('utf-8'), digestmod=hashlib.sha256).digest()


def hash_password(password):
    """对应 JS createHash('sha256').update(password).digest('hex')"""
    return hashlib.sha256(str(password).encode('utf-8')).hexdigest()


def encrypt_data(data, password):
    """
    AES-256-GCM 加密。
    明文 = 'JSON:' + JSON.stringify(data)
    输出 = base64(iv(12) ‖ authTag(16) ‖ ciphertext)
    """
    key = derive_key(password)
    iv = secrets.token_bytes(12)
    # 必须与 JS 的 JSON.stringify 输出逐字节一致：
    #   · 不转义非 ASCII（ensure_ascii=False）
    #   · 分隔符不带空格（separators=(',', ':')）
    # 否则密文会与 JS 产生的不一致。
    plaintext = (JSON_PREFIX + json.dumps(
        data, ensure_ascii=False, separators=(',', ':')
    )).encode('utf-8')

    ct_and_tag = AESGCM(key).encrypt(iv, plaintext, None)
    ciphertext = ct_and_tag[:-16]
    auth_tag = ct_and_tag[-16:]

    return base64.b64encode(iv + auth_tag + ciphertext).decode('ascii')


def decrypt_data(encoded, password):
    """解密，校验 JSON: 前缀后返回解析出的对象"""
    key = derive_key(password)
    buffer = base64.b64decode(encoded)

    iv = buffer[0:12]
    auth_tag = buffer[12:28]
    ciphertext = buffer[28:]

    decrypted = AESGCM(key).decrypt(iv, ciphertext + auth_tag, None)
    plaintext = decrypted.decode('utf-8')

    if not plaintext.startswith(JSON_PREFIX):
        raise Exception('数据格式错误')

    return json.loads(plaintext[len(JSON_PREFIX):])


def extract_students(data, include_teachers=False):
    """
    从整班数据里抽出「学号 -> 姓名」字典。
    兼容两种 scores 形态：
        { "1": ["方梦圆", 100] }            数组式
        { "1": {"name": "方梦圆", ...} }    对象式
    0 号机器人始终跳过。
    """
    students = {}
    scores = (data or {}).get('scores') or {}

    for sid in scores.keys():
        if str(sid) == '0':
            continue
        row = scores[sid]
        name = ''
        if isinstance(row, list):
            name = row[0] if row else ''
        elif isinstance(row, dict):
            name = row.get('name', '')
        if name is None or str(name).strip() == '':
            continue
        students[str(sid)] = str(name)

    if not include_teachers:
        users = (data or {}).get('users') or {}
        for u in users.values():
            if not isinstance(u, dict) or u.get('role') == 'user':
                continue
            sid = u.get('student_id')
            if sid is None:
                continue
            students.pop(str(sid), None)

    return students

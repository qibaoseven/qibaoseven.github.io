# ========================================
# OpenStu v0.46
# Author: github@qibaoseven, bilibili@七宝-Seven
# ========================================
# Journal 学生历程子系统 - 纯文本存储
# ========================================
# 设计要点
#   · 每份历程就是一个纯文本字符串，按学生分别存放在独立 key 上
#   · 只能追加（append），不提供任何删除/覆盖/清空的接口
#   · 存储 key 与班级数据同桶：journal_{学号}
#   · 接口不需要班级密码：班级密码本身已把整班数据加密封住，
#     历程内容若再加密会让"直接看文本"的诉求落空
# ========================================
#
# Python port of netlify/functions/journal.js (behavior-preserving).
# 依赖：cryptography（AESGCM）
# 接口与 JS 保持一致：classStore 由外部注入（具 get/set 两个 await 方法）。
import base64
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# 与 api.js 同款的 AES-256-GCM 加密（用于本地备份与云端快照）
ALGORITHM = 'aes-256-gcm'
JN_MAGIC = 'JNSF'

# 单份历程的文本长度上限（字符），防止 Blob 被写爆
JOURNAL_MAX_LEN = 200000

_STUDENT_ID_RE = re.compile(r'^[A-Za-z0-9_-]{1,32}$')

# JS: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
# Node 的 ICU zh-CN 简式输出形如 "2026/10/12 21:51:19"（月/日不补零，24 小时制）。
# 注意：iSH 上的 Node 因 ICU 精简可能给出 "10/12/2026, 21:51:19"；
# 下面的实现是「尽最大努力」对齐 Node 完整 ICU 的 zh-CN 输出：
#   年/月/日 月日不补零 + 空格 + 时:分:秒 全部补零 + 24 小时制。
_ZONE_SHANGHAI = ZoneInfo('Asia/Shanghai')


def _now_stamp(time_zone=_ZONE_SHANGHAI):
    """时间戳字符串，等价于 JS toLocaleString('zh-CN', {timeZone:'Asia/Shanghai', hour12:false})。"""
    now = datetime.now(timezone.utc).astimezone(time_zone)
    # %-m / %-d 为 glibc/musl 的「不补零」写法；若平台不支持则退回手动拼接。
    try:
        return now.strftime('%Y/%-m/%-d %H:%M:%S')
    except ValueError:
        return '%d/%d/%d %02d:%02d:%02d' % (
            now.year, now.month, now.day,
            now.hour, now.minute, now.second,
        )


def derive_key(password):
    """createHmac('sha256', password).digest() —— password 是 HMAC 的 key。"""
    if isinstance(password, (bytes, bytearray)):
        key = bytes(password)
    else:
        key = str(password).encode('utf-8')
    return hmac.new(key, digestmod=hashlib.sha256).digest()


def encrypt_blob(buffer, password):
    """等价于 JS encryptBlob：输出 iv(12) || authTag(16) || ciphertext 的 base64。

    注意：Python AESGCM.encrypt() 返回的是 ciphertext||tag，
    而 JS 的布局是 iv||tag||ciphertext，因此必须显式拆分重组。
    """
    key = derive_key(password)
    iv = secrets.token_bytes(12)
    payload = JN_MAGIC.encode('ascii') + bytes(buffer)
    ciphertext_with_tag = AESGCM(key).encrypt(iv, payload, None)
    ciphertext = ciphertext_with_tag[:-16]
    auth_tag = ciphertext_with_tag[-16:]
    return base64.b64encode(iv + auth_tag + ciphertext).decode('ascii')


def decrypt_blob(encoded, password):
    """等价于 JS decryptBlob：返回去掉 JNSF 魔数之后的明文 bytes。"""
    key = derive_key(password)
    buffer = base64.b64decode(encoded)

    iv = buffer[0:12]
    auth_tag = buffer[12:28]
    encrypted = buffer[28:]

    # AESGCM.decrypt 期望 ciphertext||tag，且会做恒定时间的认证校验；
    # 校验失败（含 authTag 长度异常）与 JS cipher.final() 抛错语义一致。
    decrypted = AESGCM(key).decrypt(iv, encrypted + auth_tag, None)

    if len(decrypted) < len(JN_MAGIC) or decrypted[:len(JN_MAGIC)].decode('latin-1') != JN_MAGIC:
        raise Exception('数据格式错误')

    return decrypted[len(JN_MAGIC):]


def normalize_student_id(student_id):
    """
    校验学号：只接受非空字符串/数字，拒绝 path 注入之类的内容
    """
    if student_id is None:
        return None
    sid = str(student_id).strip()
    if not _STUDENT_ID_RE.match(sid):
        return None
    return sid


def journal_key(student_id):
    return 'journal_%s' % student_id


async def get_journal(class_store, student_id):
    """
    读取单个学生的历程文本
    :returns: 不存在时返回空串
    """
    sid = normalize_student_id(student_id)
    if not sid:
        raise Exception('无效的学号')
    text = await class_store.get(journal_key(sid))
    return text if isinstance(text, str) else ''


async def get_journals(class_store, student_ids):
    """
    读取指定学生的历程
    :param student_ids: 学号列表，为空则返回空对象
    :returns: { 学号: 文本 }
    """
    result = {}
    for raw in (student_ids or []):
        sid = normalize_student_id(raw)
        if not sid:
            continue
        result[sid] = await get_journal(class_store, sid)
    return result


async def append_journal(class_store, student_id, content, meta=None):
    """
    追加一段文字到某学生的历程末尾。
    只能追加，永远不覆盖已有内容。
    :param class_store: 班级存储桶
    :param student_id: 学号
    :param content: 追加内容
    :param meta: 记录人信息 { operator, operator_role, operator_name }
    :returns: { journal, appended, length, lastUpdated }
    """
    if meta is None:
        meta = {}

    sid = normalize_student_id(student_id)
    if not sid:
        raise Exception('无效的学号')

    text = content if isinstance(content, str) else ''
    if text.strip() == '':
        raise Exception('追加内容不能为空')

    old = await get_journal(class_store, sid)
    if len(old) + len(text) > JOURNAL_MAX_LEN:
        raise Exception('历程内容超出上限（%d 字符）' % JOURNAL_MAX_LEN)

    # 时间戳 + 记录人 + 内容，直接用纯文本拼在末尾
    stamp = _now_stamp()
    who = meta.get('operator_name') or meta.get('operator') or '未知'
    tag = '' if meta.get('operator_role') == 'user' else '〔%s〕' % who
    block = '[%s]%s %s\n' % (stamp, tag, text)

    next_text = old + block
    await class_store.set(journal_key(sid), next_text)

    return {
        'journal': next_text,
        'appended': block,
        'length': len(next_text),
        'lastUpdated': stamp,
    }


async def export_journals(class_store, students, password=None):
    """
    班级历程快照（可整体导出为一个文本）
    """
    lines = []
    stamp = _now_stamp()
    lines.append('========================================')
    lines.append('学生历程导出')
    lines.append('导出时间：%s' % stamp)
    lines.append('学生人数：%d' % len(students))
    lines.append('========================================')
    lines.append('')

    for stu in students:
        sid = normalize_student_id(stu.get('id'))
        if not sid:
            continue
        text = await get_journal(class_store, sid)
        lines.append('---------- %s（学号 %s） ----------' % (stu.get('name') or '未知', sid))
        # JS: text.trim() === '' ? '（暂无历程记录）' : text.replace(/\n$/, '')
        lines.append('（暂无历程记录）' if text.strip() == '' else re.sub(r'\n$', '', text))
        lines.append('')

    full = '\n'.join(lines)
    if password:
        # 需要密码时返回加密快照，可由管理端自行解密
        return {
            'text': None,
            'encrypted': encrypt_blob(full.encode('utf-8'), password),
            'length': len(full),
        }
    return {'text': full, 'encrypted': None, 'length': len(full)}


def decrypt_journal_snapshot(encoded, password):
    """
    解密历程快照（备用）
    """
    return decrypt_blob(encoded, password).decode('utf-8')


__all__ = [
    'get_journal',
    'get_journals',
    'append_journal',
    'export_journals',
    'decrypt_journal_snapshot',
    'normalize_student_id',
    'JOURNAL_MAX_LEN',
]

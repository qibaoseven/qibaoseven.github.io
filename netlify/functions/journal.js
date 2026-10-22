// ========================================
// StudentOS v0.46
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// Journal 学生历程子系统 - 纯文本存储
// ========================================
// 设计要点
//   · 每份历程就是一个纯文本字符串，按学生分别存放在独立 key 上
//   · 只能追加（append），不提供任何删除/覆盖/清空的接口
//   · 存储 key 与班级数据同桶：journal_{学号}
//   · 接口不需要班级密码：班级密码本身已把整班数据加密封住，
//     历程内容若再加密会让"直接看文本"的诉求落空
// ========================================
const { createHmac, randomBytes, createCipheriv, createDecipheriv } = require('crypto');

// 与 api.js 同款的 AES-256-GCM 加密（用于本地备份与云端快照）
const ALGORITHM = 'aes-256-gcm';
const JN_MAGIC = 'JNSF';

// 单份历程的文本长度上限（字符），防止 Blob 被写爆
const JOURNAL_MAX_LEN = 200000;

function deriveKey(password) {
    return createHmac('sha256', password).digest();
}

function encryptBlob(buffer, password) {
    const key = deriveKey(password);
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const payload = Buffer.concat([Buffer.from(JN_MAGIC), buffer]);
    const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptBlob(encoded, password) {
    const key = deriveKey(password);
    const buffer = Buffer.from(encoded, 'base64');

    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    if (decrypted.length < JN_MAGIC.length ||
        decrypted.subarray(0, JN_MAGIC.length).toString() !== JN_MAGIC) {
        throw new Error('数据格式错误');
    }

    return decrypted.subarray(JN_MAGIC.length);
}

/**
 * 校验学号：只接受非空字符串/数字，拒绝 path 注入之类的内容
 */
function normalizeStudentId(studentId) {
    if (studentId === null || studentId === undefined) return null;
    const id = String(studentId).trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return null;
    return id;
}

function journalKey(studentId) {
    return `journal_${studentId}`;
}

/**
 * 读取单个学生的历程文本
 * @returns {Promise<string>} 不存在时返回空串
 */
async function getJournal(classStore, studentId) {
    const id = normalizeStudentId(studentId);
    if (!id) throw new Error('无效的学号');
    const text = await classStore.get(journalKey(id));
    return typeof text === 'string' ? text : '';
}

/**
 * 读取指定学生的历程
 * @param {Array<string>} studentIds 学号列表，为空则返回空对象
 * @returns {Promise<Object>} { 学号: 文本 }
 */
async function getJournals(classStore, studentIds) {
    const result = {};
    for (const raw of studentIds || []) {
        const id = normalizeStudentId(raw);
        if (!id) continue;
        result[id] = await getJournal(classStore, id);
    }
    return result;
}

/**
 * 追加一段文字到某学生的历程末尾。
 * 只能追加，永远不覆盖已有内容。
 * @param {Object} classStore 班级存储桶
 * @param {string} studentId 学号
 * @param {string} content 追加内容
 * @param {Object} meta 记录人信息 { operator, operator_role, operator_name }
 * @returns {Promise<Object>} { journal, appended, length }
 */
async function appendJournal(classStore, studentId, content, meta = {}) {
    const id = normalizeStudentId(studentId);
    if (!id) throw new Error('无效的学号');

    const text = typeof content === 'string' ? content : '';
    if (text.trim() === '') {
        throw new Error('追加内容不能为空');
    }

    const old = await getJournal(classStore, id);
    if (old.length + text.length > JOURNAL_MAX_LEN) {
        throw new Error(`历程内容超出上限（${JOURNAL_MAX_LEN} 字符）`);
    }

    // 时间戳 + 记录人 + 内容，直接用纯文本拼在末尾
    const stamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const who = meta.operator_name || meta.operator || '未知';
    const tag = meta.operator_role === 'user' ? '' : `〔${who}〕`;
    const block = `[${stamp}]${tag} ${text}\n`;

    const next = old + block;
    await classStore.set(journalKey(id), next);

    return {
        journal: next,
        appended: block,
        length: next.length,
        lastUpdated: stamp
    };
}

/**
 * 班级历程快照（可整体导出为一个文本）
 */
async function exportJournals(classStore, students, password = null) {
    const lines = [];
    const stamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    lines.push('========================================');
    lines.push('学生历程导出');
    lines.push(`导出时间：${stamp}`);
    lines.push(`学生人数：${students.length}`);
    lines.push('========================================');
    lines.push('');

    for (const stu of students) {
        const id = normalizeStudentId(stu.id);
        if (!id) continue;
        const text = await getJournal(classStore, id);
        lines.push(`---------- ${stu.name || '未知'}（学号 ${id}） ----------`);
        lines.push(text.trim() === '' ? '（暂无历程记录）' : text.replace(/\n$/, ''));
        lines.push('');
    }

    const full = lines.join('\n');
    if (password) {
        // 需要密码时返回加密快照，可由管理端自行解密
        return {
            text: null,
            encrypted: encryptBlob(Buffer.from(full, 'utf8'), password),
            length: full.length
        };
    }
    return { text: full, encrypted: null, length: full.length };
}

/**
 * 解密历程快照（备用）
 */
function decryptJournalSnapshot(encoded, password) {
    return decryptBlob(encoded, password).toString('utf8');
}

module.exports = {
    getJournal,
    getJournals,
    appendJournal,
    exportJournals,
    decryptJournalSnapshot,
    normalizeStudentId,
    JOURNAL_MAX_LEN
};

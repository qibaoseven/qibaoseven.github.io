// ========================================
// OpenStu v0.46
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// UUID 子系统 - 学号 -> 卡片原生 UID(7 字节)
//
// 说明：
//   校园卡(MIFARE Classic / CUID)每张卡出厂都有一个 4 或 7 字节的
//   唯一 UID，普通工具刷不干净，正好拿来当"物理身份"。这里只用
//   学号做 key，值是定长 7 字节（其他长度自动左补 0x00）。
//
// 存储形态：班级桶里 key = 'uuids'，内容为 JSON 字符串，形如
//   { "1": [0x12,0x34,0x56,0x78,0x9a,0xbc,0xde], "2": [...] }
// 即 int -> byte[7]，按班级加密体系里的「整班数据」之外独立一份，
// 只存在于作业子系统，仅通过下面三个 API 读写。
// ========================================

const UUID_KEY = 'uuids';
const UID_LENGTH = 7;

/**
 * 学号规范化：接受数字或数字字符串，返回正整数；非法返回 null。
 */
function normalizeUuidStudentId(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) return null;
    return n;
}

/**
 * 把 API 传来的各种写法统一成 7 字节数组(Buffer)。
 * 支持：
 *   - 纯数组 [0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE]
 *   - 十六进制字符串 '12:34:56:78:9A:BC:DE' / '123456789ABCDE' / '0x12 0x34 ...'
 *   - base64 字符串（解码后恰好 7 字节）
 *   - { hex: '...' } / { bytes: [...] }
 * @returns {Buffer|null} 非法返回 null
 */
function parseUid(value) {
    let buf = null;

    if (value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)) {
        if (value.hex !== undefined) return parseUid(value.hex);
        if (value.bytes !== undefined) return parseUid(value.bytes);
        // 非数组对象形式 {0:18,1:52,...} 也接受
        const idx = Object.keys(value).map(Number).sort((a, b) => a - b);
        if (idx.length && idx.every((k, i) => k === i)) {
            return parseUid(idx.map(k => value[k]));
        }
        return null;
    }

    if (Array.isArray(value)) {
        if (value.length === 0 || value.length > UID_LENGTH) return null;
        for (const b of value) {
            const n = Number(b);
            if (!Number.isInteger(n) || n < 0 || n > 255) return null;
        }
        buf = Buffer.from(value.map(Number));
    } else if (typeof value === 'string') {
        const s = value.trim();
        if (!s) return null;
        // 十六进制写法：'12:34:56:78:9A:BC:DE' / '123456789ABCDE' / '0x12 0x34 ...'
        const compact = s.replace(/(^|\s)0x/gi, ' ').replace(/[\s:,_\-]/g, '');
        if (/^[0-9a-fA-F]+$/.test(compact) && compact.length <= UID_LENGTH * 2) {
            const hex = compact.length % 2 ? '0' + compact : compact;
            buf = Buffer.from(hex, 'hex');
        } else {
            // 退而求其次当 base64
            try {
                const b = Buffer.from(s, 'base64');
                if (b.length > 0 && b.length <= UID_LENGTH) buf = b;
            } catch (e) {
                buf = null;
            }
        }
    }

    if (!buf || buf.length === 0 || buf.length > UID_LENGTH) return null;

    // 左补 0x00 到 7 字节，保证定长
    if (buf.length < UID_LENGTH) {
        buf = Buffer.concat([Buffer.alloc(UID_LENGTH - buf.length), buf]);
    }
    return buf;
}

/**
 * 读取整个 uuids 字典。
 * @returns {Promise<Object>} { 学号(int): [7 个字节] }
 */
async function getUuids(classStore) {
    const raw = await classStore.get(UUID_KEY);
    if (!raw) return {};
    let parsed;
    try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        return {};
    }
    if (!parsed || typeof parsed !== 'object') return {};

    const result = {};
    Object.keys(parsed).forEach(key => {
        const sid = normalizeUuidStudentId(key);
        if (sid === null) return;
        const bytes = parseUid(parsed[key]);
        if (bytes) result[String(sid)] = Array.from(bytes);
    });
    return result;
}

/**
 * 整份覆盖写入 uuids 字典。
 * @param {Object} classStore 存储桶实例
 * @param {Object} map { 学号: UID(数组/hex/base64) }
 * @returns {Promise<{uuids: Object, count: number}>}
 */
async function saveUuids(classStore, map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
        throw new Error('uuids 必须是一个 dict（学号 -> UID）');
    }
    const normalized = {};
    const conflicts = new Set();

    Object.keys(map).forEach(key => {
        const sid = normalizeUuidStudentId(key);
        if (sid === null) {
            throw new Error(`非法学号: ${key}`);
        }
        const bytes = parseUid(map[key]);
        if (!bytes) {
            throw new Error(`学号 ${sid} 的 UID 非法（需要 1~7 字节）`);
        }
        normalized[String(sid)] = Array.from(bytes);
        conflicts.add(bytes.toString('hex'));
    });

    // 同一个 UID 只能绑一个学号，否则刷卡会歧义
    if (conflicts.size !== Object.keys(normalized).length) {
        throw new Error('存在重复的 UID，同一张卡不能绑定多个学号');
    }

    await classStore.set(UUID_KEY, JSON.stringify(normalized));
    return { uuids: normalized, count: Object.keys(normalized).length };
}

/**
 * 在原有字典基础上追加 / 更新单个学号的 UID（绝不删除其他条目）。
 * @returns {Promise<{uuids: Object, count: number, added: boolean}>}
 */
async function addUuid(classStore, studentId, uid) {
    const sid = normalizeUuidStudentId(studentId);
    if (sid === null) {
        throw new Error('缺少或非法的 student_id');
    }
    const bytes = parseUid(uid);
    if (!bytes) {
        throw new Error('缺少或非法的 uid（1~7 字节）');
    }

    const current = await getUuids(classStore);
    const hex = bytes.toString('hex');

    // 该 UID 已经绑在别人身上 -> 拒绝
    const occupiedBy = Object.keys(current).find(k => Buffer.from(current[k]).toString('hex') === hex && k !== String(sid));
    if (occupiedBy) {
        throw new Error(`该 UID 已绑定学号 ${occupiedBy}`);
    }

    const added = current[String(sid)] === undefined;
    current[String(sid)] = Array.from(bytes);
    await classStore.set(UUID_KEY, JSON.stringify(current));

    return { uuids: current, count: Object.keys(current).length, added };
}

module.exports = {
    UUID_KEY,
    UID_LENGTH,
    parseUid,
    normalizeUuidStudentId,
    getUuids,
    saveUuids,
    addUuid
};

// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// Homework 子系统 - 基于位压缩存储
// ========================================
const { createHmac, randomBytes, createCipheriv, createDecipheriv } = require('crypto');

// 与 api.js 同款的 AES-256-GCM 加密
const ALGORITHM = 'aes-256-gcm';
const HW_MAGIC = 'HWSF';

function deriveKey(password) {
    return createHmac('sha256', password).digest();
}

// 加密二进制数据，使用魔数(HW_MAGIC)内嵌用于完整性验证，不加 JSON 前缀
function encryptBlob(buffer, password) {
    const key = deriveKey(password);
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const payload = Buffer.concat([Buffer.from(HW_MAGIC), buffer]);
    const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const result = Buffer.concat([iv, authTag, encrypted]);
    return result.toString('base64');
}

// 解密二进制数据，返回原始 buffer；校验魔数与 GCM 认证
function decryptBlob(encoded, password) {
    const key = deriveKey(password);
    const buffer = Buffer.from(encoded, 'base64');

    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    // 校验魔数，确保解密成功且数据格式正确
    if (decrypted.length < HW_MAGIC.length || decrypted.subarray(0, HW_MAGIC.length).toString() !== HW_MAGIC) {
        throw new Error('数据格式错误');
    }

    return decrypted.subarray(HW_MAGIC.length);
}

/**
 * 将字节数组转换为位数组(从高位到低位)
 */
function toBitarray(bytes) {
    const bits = [];
    for (const byte of bytes) {
        for (let i = 7; i >= 0; i--) {
            bits.push((byte >> i) & 1);
        }
    }
    return bits;
}

/**
 * 将位数组转换回字节数组
 */
function fromBitarray(bits) {
    const result = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
            if (i + j < bits.length) {
                byte = (byte << 1) | bits[i + j];
            }
        }
        result.push(byte);
    }
    return Buffer.from(result);
}

/**
 * 加载班级作业数据
 * @param {Object} classStore 存储桶实例
 * @param {string} password 班级密码（解密必需）
 */
/**
 * 加载班级作业数据（必须是加密格式）。
 * 数据不存在时返回 null；数据存在但密码错误 / 格式非法时抛出错误。
 * @param {Object} classStore 存储桶实例
 * @param {string} password 班级密码（解密必需）
 */
async function loadHomeworkData(classStore, password) {
    if (!password) {
        throw new Error('读取作业数据需要密码');
    }
    const raw = await classStore.get('homework_data');
    if (!raw) return null;

    // 解密（解密失败或魔数校验不通过会抛错，向上传播以拒绝错误密码）
    const buffer = decryptBlob(raw, password);
    let offset = 0;
    
    // 读取头部
    const magic = buffer.subarray(offset, offset + 4).toString();
    offset += 4;
    if (magic !== 'HWSF') {
        throw new Error('无效的数据格式');
    }
    
    const students = buffer.readUInt16LE(offset);
    offset += 2;
    
    const daysSince1970 = buffer.readUInt32LE(offset);
    offset += 4;
    const dateFrom = new Date(1970, 0, 1);
    dateFrom.setDate(dateFrom.getDate() + daysSince1970);
    
    const subjects = buffer.readUInt8(offset);
    offset += 1;
    
    // 读取数据部分
    const dataBytes = buffer.subarray(offset);
    const bitList = toBitarray(dataBytes);
    
    // 实际学生数量 = 读取的学生数 + 1(0号机器人)
    const actualStudents = students + 1;
    
    // 计算总天数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalDays = Math.floor((today - dateFrom) / (24 * 60 * 60 * 1000)) + 1;
    
    // 每个学生每天的作业数据占 subjects 个 bit
    const bitsPerDay = subjects * actualStudents;
    
    // 三维列表:[天数][学生ID][科目]
    const homeworkData = [];
    
    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
        const startBit = dayOffset * bitsPerDay;
        const endBit = startBit + bitsPerDay;
        
        if (endBit > bitList.length) break;
        
        const dayStudents = [];
        for (let studentIdx = 0; studentIdx < actualStudents; studentIdx++) {
            const studentStart = startBit + studentIdx * subjects;
            const studentHomework = bitList.slice(studentStart, studentStart + subjects);
            dayStudents.push(studentHomework);
        }
        homeworkData.push(dayStudents);
    }
    
    return homeworkData;
}

/**
 * 保存班级作业数据
 * @param {Object} classStore 存储桶实例
 * @param {Array} homeworkData 三维作业数据
 * @param {string} password 班级密码（用于加密）
 */
async function saveHomeworkData(classStore, homeworkData, password = null) {
    try {
        if (!homeworkData || homeworkData.length === 0) {
            throw new Error('没有数据可保存');
        }
        if (!password) {
            throw new Error('保存作业数据需要密码');
        }
        
        // 从三维列表获取参数
        const totalDays = homeworkData.length;
        const actualStudents = homeworkData[0].length;
        const students = actualStudents - 1; // 减去0号机器人
        const subjects = homeworkData[0][0].length;
        
        // 计算起始日期(从今天往前推 totalDays - 1 天)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateFrom = new Date(today);
        dateFrom.setDate(dateFrom.getDate() - (totalDays - 1));
        const daysSince1970 = Math.floor((dateFrom - new Date(1970, 0, 1)) / (24 * 60 * 60 * 1000));
        
        // 将三维列表转换为位列表
        const bitList = [];
        for (let day = 0; day < totalDays; day++) {
            for (let student = 0; student < actualStudents; student++) {
                bitList.push(...homeworkData[day][student]);
            }
        }
        
        // 补齐到8的倍数
        while (bitList.length % 8 !== 0) {
            bitList.push(0);
        }
        
        // 转换为字节
        const dataBytes = fromBitarray(bitList);
        
        // 构建完整数据
        const headerSize = 4 + 2 + 4 + 1; // HWSF + students + date + subjects
        const totalSize = headerSize + dataBytes.length;
        const buffer = Buffer.alloc(totalSize);
        let offset = 0;
        
        // 写入头部
        buffer.write('HWSF', offset, 4);
        offset += 4;
        buffer.writeUInt16LE(students, offset);
        offset += 2;
        buffer.writeUInt32LE(daysSince1970, offset);
        offset += 4;
        buffer.writeUInt8(subjects, offset);
        offset += 1;
        
        // 写入数据
        dataBytes.copy(buffer, offset);
        
        // 加密后保存到存储桶(base64编码)
        const encrypted = encryptBlob(buffer, password);
        await classStore.set('homework_data', encrypted);
        
        return true;
    } catch (error) {
        console.error('保存作业数据失败:', error);
        return false;
    }
}

/**
 * 获取当前数据的日期范围
 */
function getDateRange(homeworkData) {
    if (!homeworkData || homeworkData.length === 0) {
        return { dateFrom: null, dateTo: null, totalDays: 0 };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalDays = homeworkData.length;
    const dateFrom = new Date(today);
    dateFrom.setDate(dateFrom.getDate() - (totalDays - 1));
    
    return { dateFrom, dateTo: today, totalDays };
}

/**
 * 初始化班级作业系统
 */
async function initHomeworkSystem(classStore, config, password = null) {
    const { studentCount, subjectCount, subjectNames, startDate = null } = config;
    if (!password) {
        throw new Error('初始化作业系统需要密码');
    }
    
    // 参数验证
    if (studentCount === undefined || studentCount < 1) {
        throw new Error('学生数量必须大于0');
    }
    if (subjectCount === undefined || subjectCount < 1) {
        throw new Error('学科数量必须大于0');
    }
    if (!subjectNames || typeof subjectNames !== 'object') {
        throw new Error('请提供学科名称映射');
    }
    
    // 验证学科名称是否完整
    const nameKeys = Object.keys(subjectNames).map(Number).sort();
    const expectedKeys = Array.from({ length: subjectCount }, (_, i) => i);
    if (JSON.stringify(nameKeys) !== JSON.stringify(expectedKeys)) {
        throw new Error(`学科名称映射不完整,需要包含 0 到 ${subjectCount - 1} 的所有学科`);
    }
    
    // 检查是否有空名称
    for (let i = 0; i < subjectCount; i++) {
        if (!subjectNames[i] || subjectNames[i].trim() === '') {
            throw new Error(`学科 ${i} 的名称不能为空`);
        }
    }
    
    // 检查是否已存在数据
    const existing = await classStore.get('homework_meta');
    if (existing) {
        throw new Error('该班级已初始化作业系统,如需重新初始化请先删除数据');
    }
    
    // 计算起始日期
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = startDate ? new Date(startDate) : today;
    start.setHours(0, 0, 0, 0);
    
    // 实际学生数 = 学生数量 + 1(0号机器人)
    const actualStudents = studentCount + 1;
    
    // 创建第一天数据(全0)
    const firstDay = Array(actualStudents).fill(null).map(() => Array(subjectCount).fill(0));
    const homeworkData = [firstDay];
    
    // 保存作业数据
    const saveResult = await saveHomeworkData(classStore, homeworkData, password);
    if (!saveResult) {
        throw new Error('保存作业数据失败');
    }
    
    // 保存元数据(学科名称等)
    const meta = {
        studentCount,
        subjectCount,
        subjectNames,
        initializedAt: new Date().toISOString(),
        startDate: start.toISOString().split('T')[0]
    };
    await classStore.set('homework_meta', JSON.stringify(meta));
    
    return {
        success: true,
        message: '作业系统初始化成功',
        meta: {
            studentCount,
            subjectCount,
            subjectNames,
            actualStudents,
            startDate: start.toISOString().split('T')[0]
        }
    };
}

/**
 * 获取作业系统元数据
 */
async function getHomeworkMeta(classStore) {
    const metaRaw = await classStore.get('homework_meta');
    if (!metaRaw) return null;
    return JSON.parse(metaRaw);
}

/**
 * 检查作业系统是否已初始化
 */
async function isHomeworkInitialized(classStore) {
    const meta = await getHomeworkMeta(classStore);
    return meta !== null;
}

/**
 * 更新某个学生在某天某学科的作业提交情况
 */
async function updateHomework(classStore, studentId, targetDate, subjectId, password = null) {
    if (!password) {
        throw new Error('更新作业需要密码');
    }
    // 加载现有数据
    let homeworkData = await loadHomeworkData(classStore, password);
    if (!homeworkData) {
        // 如果数据不存在,创建新的数据结构:默认从今天开始,1个学生,1个学科
        homeworkData = [[[0], [0]]]; // 0号机器人 + 1号学生
    }
    
    // 获取当前数据参数
    let actualStudents = homeworkData[0].length;
    let subjects = homeworkData[0][0].length;
    let totalDays = homeworkData.length;
    
    // 计算当前数据的起始日期
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateFrom = new Date(today);
    dateFrom.setDate(dateFrom.getDate() - (totalDays - 1));
    
    // 计算目标日期的索引
    const targetDateObj = new Date(targetDate);
    targetDateObj.setHours(0, 0, 0, 0);
    let dayIndex = Math.floor((targetDateObj - dateFrom) / (24 * 60 * 60 * 1000));
    
    // 如果目标日期在数据范围之外,需要扩展
    if (dayIndex < 0) {
        // 目标日期在起始日期之前,在前面插入天数
        const daysToAdd = -dayIndex;
        for (let i = 0; i < daysToAdd; i++) {
            const newDay = Array(actualStudents).fill(null).map(() => Array(subjects).fill(0));
            homeworkData.unshift(newDay);
        }
        dayIndex = 0;
    } else if (dayIndex >= totalDays) {
        // 目标日期在最后一天之后,需要在后面追加天数
        const daysToAdd = dayIndex - totalDays + 1;
        for (let i = 0; i < daysToAdd; i++) {
            const newDay = Array(actualStudents).fill(null).map(() => Array(subjects).fill(0));
            homeworkData.push(newDay);
        }
        dayIndex = totalDays;
    }
    
    // 更新实际学生数和学科数(可能已变化)
    actualStudents = homeworkData[0].length;
    subjects = homeworkData[0][0].length;
    
    // 检查学生ID是否有效(应该大于0,小于实际学生数)
    if (studentId <= 0 || studentId >= actualStudents) {
        throw new Error(`无效的学生ID: ${studentId}`);
    }
    
    // 检查学科ID是否有效
    if (subjectId < 0 || subjectId >= subjects) {
        throw new Error(`无效的学科ID: ${subjectId}`);
    }
    
    // 更新数据(将对应位置设为1表示已提交)
    homeworkData[dayIndex][studentId][subjectId] = 1;
    
    // 保存数据
    return await saveHomeworkData(classStore, homeworkData, password);
}

/**
 * 添加一整天的数据
 */
async function addDayData(classStore, dayData, targetDate = null, password = null) {
    if (!password) {
        throw new Error('添加作业数据需要密码');
    }
    if (targetDate === null) {
        targetDate = new Date();
    }
    
    // 加载现有数据
    let homeworkData = await loadHomeworkData(classStore, password);
    if (!homeworkData) {
        homeworkData = [];
    }
    
    // 检查数据格式
    if (!Array.isArray(dayData) || dayData.length === 0) {
        throw new Error('无效的数据格式');
    }
    
    const actualStudents = dayData.length;
    const subjects = dayData[0].length;
    
    // 检查所有学生数据长度是否一致
    for (const student of dayData) {
        if (!Array.isArray(student) || student.length !== subjects) {
            throw new Error('学生数据长度不一致');
        }
    }
    
    // 如果已有数据,需要保持学生数量和学科数量一致
    if (homeworkData.length > 0) {
        const existingStudents = homeworkData[0].length;
        const existingSubjects = homeworkData[0][0].length;
        
        if (existingStudents !== actualStudents) {
            throw new Error(`学生数量不匹配: 现有 ${existingStudents}, 新数据 ${actualStudents}`);
        }
        if (existingSubjects !== subjects) {
            throw new Error(`学科数量不匹配: 现有 ${existingSubjects}, 新数据 ${subjects}`);
        }
        
        // 计算当前数据的起始日期
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const totalDays = homeworkData.length;
        const dateFrom = new Date(today);
        dateFrom.setDate(dateFrom.getDate() - (totalDays - 1));
        
        // 计算目标日期的索引
        const targetDateObj = new Date(targetDate);
        targetDateObj.setHours(0, 0, 0, 0);
        let dayIndex = Math.floor((targetDateObj - dateFrom) / (24 * 60 * 60 * 1000));
        
        // 如果目标日期在数据范围之外,需要扩展
        if (dayIndex < 0) {
            const daysToAdd = -dayIndex;
            for (let i = 0; i < daysToAdd; i++) {
                const newDay = Array(actualStudents).fill(null).map(() => Array(subjects).fill(0));
                homeworkData.unshift(newDay);
            }
            dayIndex = 0;
        } else if (dayIndex >= totalDays) {
            const daysToAdd = dayIndex - totalDays + 1;
            for (let i = 0; i < daysToAdd; i++) {
                const newDay = Array(actualStudents).fill(null).map(() => Array(subjects).fill(0));
                homeworkData.push(newDay);
            }
            dayIndex = totalDays;
        }
        
        // 替换对应日期的数据
        homeworkData[dayIndex] = dayData;
    } else {
        // 如果没有现有数据,直接添加
        homeworkData.push(dayData);
    }
    
    // 保存数据
    return await saveHomeworkData(classStore, homeworkData, password);
}

/**
 * 获取作业数据(用于查询)
 * @param {Object} classStore 存储桶实例
 * @param {string} password 班级密码（用于解密）
 */
async function getHomeworkData(classStore, password = null) {
    const data = await loadHomeworkData(classStore, password);
    if (!data) {
        return { exists: false, data: null };
    }
    return { exists: true, data };
}

/**
 * 获取指定学生在某天的作业状态
 */
async function getStudentHomework(classStore, studentId, targetDate, password = null) {
    const homeworkData = await loadHomeworkData(classStore, password);
    if (!homeworkData) {
        return null;
    }
    
    // 计算日期索引
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalDays = homeworkData.length;
    const dateFrom = new Date(today);
    dateFrom.setDate(dateFrom.getDate() - (totalDays - 1));
    
    const targetDateObj = new Date(targetDate);
    targetDateObj.setHours(0, 0, 0, 0);
    const dayIndex = Math.floor((targetDateObj - dateFrom) / (24 * 60 * 60 * 1000));
    
    if (dayIndex < 0 || dayIndex >= totalDays) {
        return null;
    }
    
    if (studentId < 0 || studentId >= homeworkData[dayIndex].length) {
        return null;
    }
    
    return homeworkData[dayIndex][studentId];
}

module.exports = {
    toBitarray,
    fromBitarray,
    loadHomeworkData,
    saveHomeworkData,
    getDateRange,
    initHomeworkSystem,
    getHomeworkMeta,
    isHomeworkInitialized,
    updateHomework,
    addDayData,
    getHomeworkData,
    getStudentHomework
};

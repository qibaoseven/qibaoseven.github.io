// homework.js
const { encryptData, decryptData } = require('./api');
const { getStoreForClass } = require('./blobs');

const MAGIC = 'HWSF';
const VERSION = 1;
const SUBJECT_NAME_LEN = 12;

// ==================== 位操作 ====================
function toBitarray(bytes) {
    const bits = [];
    for (const byte of bytes) {
        for (let i = 7; i >= 0; i--) {
            bits.push((byte >> i) & 1);
        }
    }
    return bits;
}

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

// ==================== 编解码 ====================
function encodeHeader(students, dateFrom, subjectNames) {
    const nameBuffer = Buffer.alloc(subjectNames.length * SUBJECT_NAME_LEN);
    subjectNames.forEach((name, i) => {
        const bytes = Buffer.from(name, 'utf8');
        if (bytes.length > SUBJECT_NAME_LEN) {
            bytes.copy(nameBuffer, i * SUBJECT_NAME_LEN, 0, SUBJECT_NAME_LEN);
        } else {
            bytes.copy(nameBuffer, i * SUBJECT_NAME_LEN);
        }
    });

    const header = Buffer.alloc(4 + 2 + 2 + 4 + 1);
    let offset = 0;
    header.write(MAGIC, offset, 4, 'utf8');
    offset += 4;
    header.writeUInt16LE(VERSION, offset);
    offset += 2;
    header.writeUInt16LE(students, offset);
    offset += 2;
    header.writeUInt32LE(dateFrom, offset);
    offset += 4;
    header.writeUInt8(subjectNames.length, offset);
    offset += 1;

    return Buffer.concat([header, nameBuffer]);
}

function decodeHeader(buffer) {
    let offset = 0;
    const magic = buffer.subarray(offset, offset + 4).toString('utf8');
    offset += 4;
    if (magic !== MAGIC) throw new Error('无效的作业文件格式');

    const version = buffer.readUInt16LE(offset);
    offset += 2;
    if (version !== VERSION) throw new Error(`不支持的版本: ${version}`);

    const students = buffer.readUInt16LE(offset);
    offset += 2;

    const dateFrom = buffer.readUInt32LE(offset);
    offset += 4;

    const subjectCount = buffer.readUInt8(offset);
    offset += 1;

    const subjectNames = [];
    for (let i = 0; i < subjectCount; i++) {
        const slice = buffer.subarray(offset, offset + SUBJECT_NAME_LEN);
        const name = slice.toString('utf8').replace(/\0/g, '').trim();
        subjectNames.push(name || `学科${i}`);
        offset += SUBJECT_NAME_LEN;
    }

    const bitData = buffer.subarray(offset);
    return { version, students, dateFrom, subjectNames, bitData };
}

// ==================== 存储操作 ====================
async function saveHomework(classId, homeworkData, password) {
    // homeworkData: { students, dateFrom, subjectNames, bitData }
    const header = encodeHeader(
        homeworkData.students,
        homeworkData.dateFrom,
        homeworkData.subjectNames
    );
    const full = Buffer.concat([header, homeworkData.bitData]);
    const encoded = full.toString('base64');
    const encrypted = encryptData(encoded, password);
    const store = await getStoreForClass(classId);
    await store.set('homework', encrypted);
    return true;
}

async function loadHomework(classId, password) {
    const store = await getStoreForClass(classId);
    const encrypted = await store.get('homework');
    if (!encrypted) return null;

    try {
        const decoded = decryptData(encrypted, password);
        const buffer = Buffer.from(decoded, 'base64');
        return decodeHeader(buffer);
    } catch (e) {
        console.error('加载作业失败:', e);
        return null;
    }
}

// ==================== 业务操作 ====================
async function getHomeworkData(classId, password) {
    const data = await loadHomework(classId, password);
    if (!data) return null;
    return data;
}

async function updateHomework(classId, studentId, targetDate, subjectId, password) {
    // 加载数据
    let data = await loadHomework(classId, password);
    
    // 如果不存在,创建默认数据
    if (!data) {
        const today = Math.floor(Date.now() / 86400000);
        const subjectNames = ['语文', '数学', '英语', '物理', '化学'];
        const students = 50;
        const bitsPerDay = students * subjectNames.length;
        const bytesNeeded = Math.ceil(bitsPerDay / 8);
        const bitData = Buffer.alloc(bytesNeeded, 0);
        
        data = {
            students,
            dateFrom: today,
            subjectNames,
            bitData
        };
    }

    // 验证参数
    if (studentId < 0 || studentId >= data.students) {
        throw new Error(`学生ID无效: ${studentId}`);
    }
    if (subjectId < 0 || subjectId >= data.subjectNames.length) {
        throw new Error(`学科ID无效: ${subjectId}`);
    }

    // 计算日期偏移
    const today = Math.floor(Date.now() / 86400000);
    let dayOffset = targetDate - data.dateFrom;
    
    // 如果目标日期在起始日期之前,需要扩展数据
    if (dayOffset < 0) {
        // 在前面补零
        const daysToAdd = -dayOffset;
        const bitsPerDay = data.students * data.subjectNames.length;
        const bytesPerDay = Math.ceil(bitsPerDay / 8);
        const newSize = data.bitData.length + daysToAdd * bytesPerDay;
        const newBitData = Buffer.alloc(newSize, 0);
        // 复制旧数据到后面
        data.bitData.copy(newBitData, daysToAdd * bytesPerDay);
        data.bitData = newBitData;
        data.dateFrom = targetDate;
        dayOffset = 0;
    }
    
    // 如果目标日期在最后一天之后,需要扩展
    const bitsPerDay = data.students * data.subjectNames.length;
    const bytesPerDay = Math.ceil(bitsPerDay / 8);
    const maxDays = Math.floor(data.bitData.length / bytesPerDay);
    if (dayOffset >= maxDays) {
        const daysToAdd = dayOffset - maxDays + 1;
        const newSize = data.bitData.length + daysToAdd * bytesPerDay;
        const newBitData = Buffer.alloc(newSize, 0);
        data.bitData.copy(newBitData);
        data.bitData = newBitData;
    }

    // 定位并设置 bit
    const startBit = dayOffset * bitsPerDay + studentId * data.subjectNames.length + subjectId;
    const byteIndex = Math.floor(startBit / 8);
    const bitIndex = startBit % 8;
    data.bitData[byteIndex] |= (1 << (7 - bitIndex));

    // 保存
    await saveHomework(classId, data, password);
    return true;
}

async function addHomeworkDay(classId, dayData, targetDate, password) {
    // dayData: [student0_homework_bits, student1_homework_bits, ...]
    // 每个 student_homework_bits 是一个数组,[1,0,1,0,1,0,1,0]
    
    let data = await loadHomework(classId, password);
    if (!data) {
        // 创建默认数据
        const today = Math.floor(Date.now() / 86400000);
        const subjectNames = Array(dayData[0].length).fill(0).map((_, i) => `学科${i}`);
        const students = dayData.length;
        data = {
            students,
            dateFrom: today,
            subjectNames,
            bitData: Buffer.alloc(0)
        };
    }

    // 验证
    if (dayData.length !== data.students) {
        throw new Error(`学生数量不匹配: 期望 ${data.students}, 实际 ${dayData.length}`);
    }
    for (const student of dayData) {
        if (student.length !== data.subjectNames.length) {
            throw new Error(`学科数量不匹配: 期望 ${data.subjectNames.length}, 实际 ${student.length}`);
        }
    }

    // 转换 dayData 为 bit 列表
    const bitList = [];
    for (const student of dayData) {
        bitList.push(...student);
    }

    // 计算日期偏移
    let dayOffset = targetDate - data.dateFrom;
    const bitsPerDay = data.students * data.subjectNames.length;
    const bytesPerDay = Math.ceil(bitsPerDay / 8);

    // 扩展数据
    if (dayOffset < 0) {
        const daysToAdd = -dayOffset;
        const newSize = data.bitData.length + daysToAdd * bytesPerDay;
        const newBitData = Buffer.alloc(newSize, 0);
        data.bitData.copy(newBitData, daysToAdd * bytesPerDay);
        data.bitData = newBitData;
        data.dateFrom = targetDate;
        dayOffset = 0;
    }

    const maxDays = Math.floor(data.bitData.length / bytesPerDay);
    if (dayOffset >= maxDays) {
        const daysToAdd = dayOffset - maxDays + 1;
        const newSize = data.bitData.length + daysToAdd * bytesPerDay;
        const newBitData = Buffer.alloc(newSize, 0);
        data.bitData.copy(newBitData);
        data.bitData = newBitData;
    }

    // 写入位数据
    const startBit = dayOffset * bitsPerDay;
    const bitBytes = fromBitarray(bitList);
    bitBytes.copy(data.bitData, Math.floor(startBit / 8));

    await saveHomework(classId, data, password);
    return true;
}

async function exportHomework(classId, password) {
    const data = await loadHomework(classId, password);
    if (!data) return null;

    const bitsPerDay = data.students * data.subjectNames.length;
    const bytesPerDay = Math.ceil(bitsPerDay / 8);
    const totalDays = Math.floor(data.bitData.length / bytesPerDay);

    const result = [];
    for (let day = 0; day < totalDays; day++) {
        const startByte = day * bytesPerDay;
        const dayBytes = data.bitData.subarray(startByte, startByte + bytesPerDay);
        const bits = toBitarray(dayBytes);
        const dayStudents = [];
        for (let student = 0; student < data.students; student++) {
            const startBit = student * data.subjectNames.length;
            const studentBits = bits.slice(startBit, startBit + data.subjectNames.length);
            dayStudents.push(studentBits);
        }
        result.push(dayStudents);
    }

    return {
        students: data.students,
        dateFrom: data.dateFrom,
        subjectNames: data.subjectNames,
        data: result
    };
}

module.exports = {
    saveHomework,
    loadHomework,
    getHomeworkData,
    updateHomework,
    addHomeworkDay,
    exportHomework,
    toBitarray,
    fromBitarray
};

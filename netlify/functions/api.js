// ========================================
// StudentOS v0.43 (build v1)
// ========================================
const { createHmac, createHash, randomBytes, createCipheriv, createDecipheriv } = require('crypto');
const { initBlobs, getStoreForClass, getClassesList, saveClassesList, getTokens, saveTokens } = require('./blobs');
const homework = require('./homework');

const JSON_PREFIX = 'JSON:';
const ALGORITHM = 'aes-256-gcm';

function deriveKey(password) {
    return createHmac('sha256', password).digest();
}

function hashPassword(password) {
    return createHash('sha256').update(password).digest('hex');
}

function encryptData(data, password) {
    const key = deriveKey(password);
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    
    const plaintext = JSON_PREFIX + JSON.stringify(data);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    const result = Buffer.concat([iv, authTag, encrypted]);
    return result.toString('base64');
}

function decryptData(encoded, password) {
    const key = deriveKey(password);
    const buffer = Buffer.from(encoded, 'base64');
    
    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const plaintext = decrypted.toString('utf8');
    
    if (!plaintext.startsWith(JSON_PREFIX)) {
        throw new Error('数据格式错误');
    }
    
    return JSON.parse(plaintext.substring(JSON_PREFIX.length));
}

async function verifyToken(token) {
    const tokens = await getTokens();
    const index = tokens.tokens.indexOf(token);
    
    if (index !== -1) {
        tokens.tokens.splice(index, 1);
        tokens.used.push(token);
        await saveTokens(tokens);
        return true;
    }
    
    return !tokens.used.includes(token);
}

exports.handler = async (event) => {
    initBlobs(event);
    
    const { httpMethod, path: requestPath, headers, body } = event;
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-Password, X-Password-Hash',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    
    if (httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }
    
    const handleResponse = (statusCode, data) => ({
        statusCode,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify(data)
    });
    
    try {
        // ============================================
        // 班级管理接口
        // ============================================
        
        // GET /api/classes
        if (httpMethod === 'GET' && requestPath.includes('/api/classes')) {
            const classes = await getClassesList();
            const list = classes.map(c => ({
                id: c.id,
                name: c.name,
                created_at: c.created_at
            }));
            return handleResponse(200, list);
        }
        
        // POST /api/classes/import
        if (httpMethod === 'POST' && requestPath.includes('/api/classes/import')) {
            const { bin_id, master_key, class_name, class_password } = JSON.parse(body);
            
            if (!bin_id || !master_key || !class_name || !class_password) {
                return handleResponse(400, { error: '缺少必要字段' });
            }
            
            const jsonbinUrl = `https://api.jsonbin.io/v3/b/${bin_id}`;
            const jsonbinResp = await fetch(jsonbinUrl, {
                headers: { 'X-Master-Key': master_key }
            });
            
            if (!jsonbinResp.ok) {
                return handleResponse(401, { error: 'JsonBin验证失败' });
            }
            
            const jsonbinData = await jsonbinResp.json();
            const record = jsonbinData.record;
            
            const classId = `class_${Date.now()}`;
            const encrypted = encryptData(record, class_password);
            const passwordHash = hashPassword(class_password);
            
            const classStore = await getStoreForClass(classId);
            await classStore.set('data', encrypted);
            await classStore.set('password_hash', passwordHash);
            
            const classes = await getClassesList();
            classes.push({
                id: classId,
                name: class_name,
                created_at: new Date().toISOString()
            });
            await saveClassesList(classes);
            
            return handleResponse(201, { id: classId, name: class_name, message: '导入成功' });
        }
        
        // POST /api/classes/create
        if (httpMethod === 'POST' && requestPath.includes('/api/classes/create')) {
            const { class_name, class_password, token, json_data } = JSON.parse(body);
            
            if (!class_name || !class_password || !token || !json_data) {
                return handleResponse(400, { error: '缺少必要字段' });
            }
            
            const isValid = await verifyToken(token);
            if (!isValid) {
                return handleResponse(401, { error: 'Token无效或已使用' });
            }
            
            const classId = `class_${Date.now()}`;
            const encrypted = encryptData(JSON.parse(json_data), class_password);
            const passwordHash = hashPassword(class_password);
            
            const classStore = await getStoreForClass(classId);
            await classStore.set('data', encrypted);
            await classStore.set('password_hash', passwordHash);
            
            const classes = await getClassesList();
            classes.push({
                id: classId,
                name: class_name,
                created_at: new Date().toISOString()
            });
            await saveClassesList(classes);
            
            return handleResponse(201, { id: classId, name: class_name, message: '创建成功' });
        }
        
        // GET /api/class/{id}
        if (httpMethod === 'GET' && requestPath.includes('/api/class/') && !requestPath.includes('/homework')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            
            if (!password) {
                return handleResponse(400, { error: '缺少密码参数' });
            }
            if (!passwordHash) {
                return handleResponse(400, { error: '缺少密码哈希参数' });
            }
            
            const classStore = await getStoreForClass(classId);
            const encrypted = await classStore.get('data');
            const storedHash = await classStore.get('password_hash');
            
            if (!encrypted) {
                return handleResponse(404, { error: '班级不存在' });
            }
            
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            try {
                const data = decryptData(encrypted, password);
                return handleResponse(200, { data });
            } catch (e) {
                if (e.message.includes('Unsupported state') || e.message.includes('bad') || e.message === '数据格式错误') {
                    return handleResponse(401, { error: '密码错误' });
                }
                return handleResponse(500, { error: `解密失败: ${e.message}` });
            }
        }
        
        // POST /api/class/{id}
        if (httpMethod === 'POST' && requestPath.includes('/api/class/') && !requestPath.includes('/homework')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            const { data } = JSON.parse(body);
            
            if (!password) {
                return handleResponse(400, { error: '缺少密码参数' });
            }
            if (!passwordHash) {
                return handleResponse(400, { error: '缺少密码哈希参数' });
            }
            
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            const encrypted = encryptData(data, password);
            await classStore.set('data', encrypted);
            
            return handleResponse(200, { message: '保存成功' });
        }
        
        // ============================================
        // 作业管理接口
        // ============================================
        
        // GET /api/class/{id}/homework/raw - 下载原始二进制文件
        if (httpMethod === 'GET' && requestPath.includes('/api/class/') && requestPath.includes('/homework/raw')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            
            if (!password || !passwordHash) {
                return handleResponse(400, { error: '缺少密码参数' });
            }
            
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            try {
                const encrypted = await classStore.get('homework');
                if (!encrypted) {
                    return handleResponse(404, { error: '作业文件不存在' });
                }
                
                const decoded = decryptData(encrypted, password);
                const buffer = Buffer.from(decoded, 'base64');
                
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Disposition': `attachment; filename="homework_${classId}.hw"`,
                        ...corsHeaders
                    },
                    body: buffer.toString('base64'),
                    isBase64Encoded: true
                };
            } catch (e) {
                return handleResponse(500, { error: `下载失败: ${e.message}` });
            }
        }
        
        // GET /api/class/{id}/homework - 获取作业数据(带日期参数返回某天,不带返回全部)
        if (httpMethod === 'GET' && requestPath.includes('/api/class/') && requestPath.includes('/homework') && !requestPath.includes('/raw')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            
            // 解析查询参数
            const url = new URL(requestPath, 'http://localhost');
            const dateParam = url.searchParams.get('date');
            
            if (!password || !passwordHash) {
                return handleResponse(400, { error: '缺少密码参数' });
            }
            
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            try {
                const data = await homework.loadHomework(classId, password);
                if (!data) {
                    return handleResponse(404, { error: '暂无作业数据' });
                }
                
                // 如果没有指定日期,返回全部数据
                if (!dateParam) {
                    const exportData = await homework.exportHomework(classId, password);
                    return handleResponse(200, exportData);
                }
                
                // 指定日期,返回当天的数据
                const targetDate = new Date(dateParam);
                const days = Math.floor(targetDate.getTime() / 86400000);
                const dayOffset = days - data.dateFrom;
                
                if (dayOffset < 0) {
                    return handleResponse(200, {
                        date: dateParam,
                        exists: false,
                        message: '该日期在记录起始日期之前',
                        data: null
                    });
                }
                
                const bitsPerDay = data.students * data.subjectNames.length;
                const bytesPerDay = Math.ceil(bitsPerDay / 8);
                const maxDays = Math.floor(data.bitData.length / bytesPerDay);
                
                if (dayOffset >= maxDays) {
                    return handleResponse(200, {
                        date: dateParam,
                        exists: false,
                        message: '该日期暂无数据',
                        data: null
                    });
                }
                
                const startByte = dayOffset * bytesPerDay;
                const dayBytes = data.bitData.subarray(startByte, startByte + bytesPerDay);
                const bits = homework.toBitarray(dayBytes);
                
                const dayStudents = [];
                for (let student = 0; student < data.students; student++) {
                    const startBit = student * data.subjectNames.length;
                    const studentBits = bits.slice(startBit, startBit + data.subjectNames.length);
                    dayStudents.push(studentBits);
                }
                
                return handleResponse(200, {
                    date: dateParam,
                    exists: true,
                    students: data.students,
                    subjectNames: data.subjectNames,
                    data: dayStudents
                });
                
            } catch (e) {
                return handleResponse(500, { error: `加载失败: ${e.message}` });
            }
        }
        
        // POST /api/class/{id}/homework/update - 更新单个作业提交
        if (httpMethod === 'POST' && requestPath.includes('/api/class/') && requestPath.includes('/homework/update')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            const { student_id, date, subject_id } = JSON.parse(body);
            
            if (!password || !passwordHash) {
                return handleResponse(400, { error: '缺少密码参数' });
            }
            if (student_id === undefined || !date || subject_id === undefined) {
                return handleResponse(400, { error: '缺少必要参数: student_id, date, subject_id' });
            }
            
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            try {
                const targetDate = new Date(date);
                const days = Math.floor(targetDate.getTime() / 86400000);
                await homework.updateHomework(classId, student_id, days, subject_id, password);
                return handleResponse(200, { message: '更新成功' });
            } catch (e) {
                return handleResponse(500, { error: `更新失败: ${e.message}` });
            }
        }
        
        // POST /api/class/{id}/homework/day - 添加一整天的数据
        if (httpMethod === 'POST' && requestPath.includes('/api/class/') && requestPath.includes('/homework/day')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            const { data: dayData, date } = JSON.parse(body);
            
            if (!password || !passwordHash) {
                return handleResponse(400, { error: '缺少密码参数' });
            }
            if (!dayData || !Array.isArray(dayData) || dayData.length === 0) {
                return handleResponse(400, { error: '无效的dayData格式,需要非空数组' });
            }
            if (!Array.isArray(dayData[0])) {
                return handleResponse(400, { error: 'dayData格式错误,需要二维数组' });
            }
            
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            try {
                const targetDate = date ? new Date(date) : new Date();
                const days = Math.floor(targetDate.getTime() / 86400000);
                await homework.addHomeworkDay(classId, dayData, days, password);
                return handleResponse(200, { message: '添加成功' });
            } catch (e) {
                return handleResponse(500, { error: `添加失败: ${e.message}` });
            }
        }
        
        // GET /api/template
        if (httpMethod === 'GET' && requestPath.includes('/api/template')) {
            const template = `# 班级数据收集指令

你是一个班级管理系统的数据收集助手。用户需要创建一个新的班级,请你按照以下步骤向用户提问,收集必要信息,最终生成符合 StudentOS 系统格式的 JSON 数据。

## 完整 JSON 模板

以下是系统要求的完整 JSON 格式,请参考这个结构收集数据:

\`\`\`json
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
\`\`\`

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

请逐项向用户提问,收集完毕后生成完整 JSON。`;
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/markdown; charset=utf-8',
                    'Content-Disposition': 'attachment; filename="班级数据收集指令.md"',
                    ...corsHeaders
                },
                body: template
            };
        }
        
        console.log('404 Not Found:', requestPath);
        return handleResponse(404, { error: 'Not Found', path: requestPath });
        
    } catch (error) {
        console.error('Error:', error);
        return handleResponse(500, { error: '服务器内部错误: ' + error.message, path: requestPath });
    }
};

// ========================================
// StudentOS v0.43 (build v1)
// ========================================
const { createHmac, createHash, randomBytes, createCipheriv, createDecipheriv } = require('crypto');
const { initBlobs, getStoreForClass, getClassesList, saveClassesList, getTokens, saveTokens } = require('./blobs');
const {
    initHomeworkSystem,
    getHomeworkMeta,
    isHomeworkInitialized,
    updateHomework,
    addDayData,
    getHomeworkData,
    getStudentHomework
} = require('./homework');

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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE'
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

        // ============================================
        // 作业管理接口
        // ============================================
        
        // POST /api/class/{id}/homework/init
        // 初始化班级作业系统
        if (httpMethod === 'POST' && requestPath.includes('/api/class/') && requestPath.includes('/homework/init')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            
            const { student_count, subject_count, subject_names, start_date } = JSON.parse(body);
            
            if (student_count === undefined || student_count < 1) {
                return handleResponse(400, { error: '学生数量必须大于0' });
            }
            if (subject_count === undefined || subject_count < 1) {
                return handleResponse(400, { error: '学科数量必须大于0' });
            }
            if (!subject_names || typeof subject_names !== 'object') {
                return handleResponse(400, { error: '请提供学科名称映射,格式: { "0": "语文", "1": "数学" }' });
            }
            
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            if (!password || !passwordHash) {
                return handleResponse(401, { error: '需要密码验证' });
            }
            
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            try {
                const result = await initHomeworkSystem(classStore, {
                    studentCount: student_count,
                    subjectCount: subject_count,
                    subjectNames: subject_names,
                    startDate: start_date || null
                }, password);
                return handleResponse(200, result);
            } catch (error) {
                return handleResponse(400, { error: error.message });
            }
        }
        
        // GET /api/class/{id}/homework/meta
        // 获取作业系统元数据
        if (httpMethod === 'GET' && requestPath.includes('/api/class/') && requestPath.includes('/homework/meta')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            
            const classStore = await getStoreForClass(classId);
            const meta = await getHomeworkMeta(classStore);
            
            if (!meta) {
                return handleResponse(404, { error: '作业系统未初始化' });
            }
            
            return handleResponse(200, meta);
        }
        
        // GET /api/class/{id}/homework/status
        // 检查作业系统是否已初始化
        if (httpMethod === 'GET' && requestPath.includes('/api/class/') && requestPath.includes('/homework/status')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            
            const classStore = await getStoreForClass(classId);
            const initialized = await isHomeworkInitialized(classStore);
            
            return handleResponse(200, {
                initialized,
                message: initialized ? '作业系统已初始化' : '作业系统未初始化'
            });
        }
        
        // GET /api/class/{id}/homework
        // 获取班级所有作业数据
        if (httpMethod === 'GET' && requestPath.includes('/api/class/') && requestPath.includes('/homework') && 
            !requestPath.includes('/meta') && !requestPath.includes('/status') && !requestPath.includes('/student') &&
            !requestPath.includes('/raw')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            if (!password || !passwordHash) {
                return handleResponse(401, { error: '需要密码验证' });
            }
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            let result;
            try {
                result = await getHomeworkData(classStore, password);
            } catch (e) {
                if (e.message.includes('Unsupported state') || e.message.includes('数据格式错误')) {
                    return handleResponse(401, { error: '密码错误' });
                }
                throw e;
            }
            
            if (!result.exists) {
                return handleResponse(404, { error: '作业数据不存在' });
            }
            
            const { dateFrom, dateTo, totalDays } = require('./homework').getDateRange(result.data);
            
            return handleResponse(200, {
                data: result.data,
                dateFrom: dateFrom ? dateFrom.toISOString().split('T')[0] : null,
                dateTo: dateTo ? dateTo.toISOString().split('T')[0] : null,
                totalDays
            });
        }
        
        // GET /api/class/{id}/homework/raw
        // 获取原始二进制数据
        if (httpMethod === 'GET' && requestPath.includes('/api/class/') && requestPath.includes('/homework/raw') &&
            !requestPath.includes('/download')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            
            const classStore = await getStoreForClass(classId);
            const raw = await classStore.get('homework_data');
            
            if (!raw) {
                return handleResponse(404, { error: '作业数据不存在' });
            }
            
            const meta = await getHomeworkMeta(classStore);
            
            return handleResponse(200, {
                data: raw,
                meta: meta || null,
                encoding: 'base64',
                size: Buffer.from(raw, 'base64').length
            });
        }
        
        // DELETE /api/class/{id}/homework
        // 删除作业数据
        if (httpMethod === 'DELETE' && requestPath.includes('/api/class/') && requestPath.includes('/homework')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            if (!password || !passwordHash) {
                return handleResponse(401, { error: '需要密码验证' });
            }
            
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            await classStore.delete('homework_data');
            await classStore.delete('homework_meta');
            
            return handleResponse(200, { message: '作业数据已删除' });
        }
        
        // GET /api/class/{id}/homework/student/{studentId}
        // 获取指定学生的作业数据
        if (httpMethod === 'GET' && requestPath.includes('/api/class/') && requestPath.includes('/homework/student/')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            
            const studentIdMatch = requestPath.match(/\/student\/(\d+)/);
            const studentId = studentIdMatch ? parseInt(studentIdMatch[1]) : -1;
            
            if (studentId <= 0) {
                return handleResponse(400, { error: '无效的学生ID' });
            }
            
            const url = new URL(requestPath, 'http://localhost');
            const targetDate = url.searchParams.get('date');
            
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            if (!password || !passwordHash) {
                return handleResponse(401, { error: '需要密码验证' });
            }
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            try {
                if (targetDate) {
                    const data = await getStudentHomework(classStore, studentId, targetDate, password);
                    if (data === null) {
                        return handleResponse(404, { error: '未找到数据' });
                    }
                    return handleResponse(200, { date: targetDate, studentId, homework: data });
                } else {
                    const result = await getHomeworkData(classStore, password);
                    if (!result.exists) {
                        return handleResponse(404, { error: '作业数据不存在' });
                    }
                    
                    const studentData = [];
                    const { dateFrom, totalDays } = require('./homework').getDateRange(result.data);
                    
                    for (let day = 0; day < result.data.length; day++) {
                        if (studentId < result.data[day].length) {
                            const currentDate = new Date(dateFrom);
                            currentDate.setDate(currentDate.getDate() + day);
                            studentData.push({
                                date: currentDate.toISOString().split('T')[0],
                                homework: result.data[day][studentId]
                            });
                        }
                    }
                    
                    return handleResponse(200, { studentId, data: studentData });
                }
            } catch (e) {
                if (e.message.includes('Unsupported state') || e.message.includes('数据格式错误')) {
                    return handleResponse(401, { error: '密码错误' });
                }
                throw e;
            }
        }
        
        // POST /api/class/{id}/homework/update
        // 更新某个学生的作业提交
        if (httpMethod === 'POST' && requestPath.includes('/api/class/') && requestPath.includes('/homework/update')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            
            const { student_id, target_date, subject_id } = JSON.parse(body);
            
            if (student_id === undefined || !target_date || subject_id === undefined) {
                return handleResponse(400, { error: '缺少必要参数: student_id, target_date, subject_id' });
            }
            
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            if (!password || !passwordHash) {
                return handleResponse(401, { error: '需要密码验证' });
            }
            
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            try {
                const result = await updateHomework(classStore, student_id, target_date, subject_id, password);
                if (result) {
                    return handleResponse(200, { message: '更新成功', student_id, target_date, subject_id });
                } else {
                    return handleResponse(500, { error: '保存失败' });
                }
            } catch (error) {
                if (error.message.includes('Unsupported state') || error.message.includes('数据格式错误')) {
                    return handleResponse(401, { error: '密码错误' });
                }
                return handleResponse(400, { error: error.message });
            }
        }
        
        // POST /api/class/{id}/homework/day
        // 添加一整天的作业数据
        if (httpMethod === 'POST' && requestPath.includes('/api/class/') && requestPath.includes('/homework/day')) {
            const classIdMatch = requestPath.match(/class_\d+/);
            const classId = classIdMatch ? classIdMatch[0] : '';
            
            const { day_data, target_date } = JSON.parse(body);
            
            if (!day_data || !Array.isArray(day_data)) {
                return handleResponse(400, { error: '缺少必要参数: day_data' });
            }
            
            const password = headers['x-password'];
            const passwordHash = headers['x-password-hash'];
            if (!password || !passwordHash) {
                return handleResponse(401, { error: '需要密码验证' });
            }
            
            const classStore = await getStoreForClass(classId);
            const storedHash = await classStore.get('password_hash');
            if (storedHash && passwordHash !== storedHash) {
                return handleResponse(401, { error: '密码错误' });
            }
            
            try {
                const result = await addDayData(classStore, day_data, target_date, password);
                if (result) {
                    return handleResponse(200, {
                        message: '添加成功',
                        target_date: target_date || new Date().toISOString().split('T')[0]
                    });
                } else {
                    return handleResponse(500, { error: '保存失败' });
                }
            } catch (error) {
                if (error.message.includes('Unsupported state') || error.message.includes('数据格式错误')) {
                    return handleResponse(401, { error: '密码错误' });
                }
                return handleResponse(400, { error: error.message });
            }
        }
        
        console.log('Error: requests invalid');
        return handleResponse(404, { error: 'Not Found', 'path': requestPath });
        
    } catch (error) {
        console.error('Error:', error);
        return handleResponse(500, { error: '服务器内部错误: ' + error.message, 'path': requestPath });
    }
};

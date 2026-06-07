import { getClassesList, saveClassesList, getClassData, saveClassData, getTokens, saveTokens } from './blobs.js';
import { createHmac, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import fs from 'fs';
import path from 'path';

const JSON_PREFIX = 'JSON:';
const ALGORITHM = 'aes-256-gcm';

function deriveKey(password) { return createHmac('sha256', password).digest(); }

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
    if (!plaintext.startsWith(JSON_PREFIX)) throw new Error('数据格式错误');
    return JSON.parse(plaintext.substring(JSON_PREFIX.length));
}

async function verifyToken(token) {
    const tokens = await getTokens();
    const idx = tokens.tokens.indexOf(token);
    if (idx !== -1) {
        tokens.tokens.splice(idx, 1);
        tokens.used.push(token);
        await saveTokens(tokens);
        return true;
    }
    return !tokens.used.includes(token);
}

export default async function handler(req, res) {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Password', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', '*'); return res.status(204).end(); }
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    try {
        // GET /api/classes
        if (req.method === 'GET' && pathname === '/api/classes') {
            const classes = await getClassesList();
            const list = classes.map(c => ({ id: c.id, name: c.name, created_at: c.created_at }));
            res.setHeader('Content-Type', 'application/json');
            Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
            return res.status(200).json(list);
        }
        
        // POST /api/classes/import
        if (req.method === 'POST' && pathname === '/api/classes/import') {
            const { bin_id, master_key, class_name, class_password } = req.body;
            if (!bin_id || !master_key || !class_name || !class_password) return res.status(400).json({ error: '缺少字段' });
            const jsonbinRes = await fetch(`https://api.jsonbin.io/v3/b/${bin_id}`, { headers: { 'X-Master-Key': master_key } });
            if (!jsonbinRes.ok) return res.status(401).json({ error: 'JsonBin验证失败' });
            const jsonbinData = await jsonbinRes.json();
            const classId = `class_${Date.now()}`;
            const encrypted = encryptData(jsonbinData.record, class_password);
            await saveClassData(classId, encrypted, class_password);
            const classes = await getClassesList();
            classes.push({ id: classId, name: class_name, created_at: new Date().toISOString() });
            await saveClassesList(classes);
            res.setHeader('Content-Type', 'application/json');
            Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
            return res.status(201).json({ id: classId, name: class_name });
        }
        
        // POST /api/classes/create
        if (req.method === 'POST' && pathname === '/api/classes/create') {
            const { class_name, class_password, token, json_data } = req.body;
            if (!class_name || !class_password || !token || !json_data) return res.status(400).json({ error: '缺少字段' });
            const isValid = await verifyToken(token);
            if (!isValid) return res.status(401).json({ error: 'Token无效' });
            const classId = `class_${Date.now()}`;
            const encrypted = encryptData(JSON.parse(json_data), class_password);
            await saveClassData(classId, encrypted, class_password);
            const classes = await getClassesList();
            classes.push({ id: classId, name: class_name, created_at: new Date().toISOString() });
            await saveClassesList(classes);
            res.setHeader('Content-Type', 'application/json');
            Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
            return res.status(201).json({ id: classId, name: class_name });
        }
        
        // GET /api/class/{id}
        if (req.method === 'GET' && pathname.startsWith('/api/class/')) {
            const classId = pathname.substring(11);
            const password = req.headers['x-password'];
            if (!password) return res.status(400).json({ error: '缺少密码' });
            const encrypted = await getClassData(classId, password);
            if (!encrypted) return res.status(404).json({ error: '班级不存在' });
            try {
                const data = decryptData(encrypted, password);
                res.setHeader('Content-Type', 'application/json');
                Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
                return res.status(200).json({ data });
            } catch(e) { return res.status(401).json({ error: '密码错误' }); }
        }
        
        // POST /api/class/{id}
        if (req.method === 'POST' && pathname.startsWith('/api/class/')) {
            const classId = pathname.substring(11);
            const password = req.headers['x-password'];
            const { data } = req.body;
            if (!password) return res.status(400).json({ error: '缺少密码' });
            const encrypted = encryptData(data, password);
            await saveClassData(classId, encrypted, password);
            res.setHeader('Content-Type', 'application/json');
            Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
            return res.status(200).json({ message: '保存成功' });
        }
        
        // GET /api/template - 从 docs 目录读取文件
        if (req.method === 'GET' && pathname === '/api/template') {
            const templatePath = path.join(process.cwd(), 'docs', '班级数据收集指令.md');
            let templateContent = '';
            try {
                templateContent = fs.readFileSync(templatePath, 'utf8');
            } catch(e) {
                templateContent = '# 班级数据收集指令\n\n请按照以下步骤收集班级信息...';
            }
            res.setHeader('Content-Type', 'text/markdown');
            res.setHeader('Content-Disposition', 'attachment; filename="班级数据收集指令.md"');
            Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
            return res.status(200).send(templateContent);
        }
        
        return res.status(404).json({ error: 'Not Found' });
    } catch(error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
}

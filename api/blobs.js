import { put, get, del, list } from '@vercel/blob';

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export async function getClassesList() {
    try {
        const blob = await get('classes.json', { token: TOKEN });
        if (!blob) return [];
        const text = await blob.text();
        return JSON.parse(text);
    } catch { return []; }
}

export async function saveClassesList(classes) {
    await put('classes.json', JSON.stringify(classes), { token: TOKEN, access: 'public' });
}

export async function getClassData(classId, password) {
    const key = `class_${classId}.encrypted`;
    const blob = await get(key, { token: TOKEN });
    if (!blob) return null;
    const encrypted = await blob.text();
    return decryptData(encrypted, password);
}

export async function saveClassData(classId, data, password) {
    const key = `class_${classId}.encrypted`;
    const encrypted = encryptData(data, password);
    await put(key, encrypted, { token: TOKEN, access: 'public' });
}

export async function getTokens() {
    try {
        const blob = await get('tokens.json', { token: TOKEN });
        if (!blob) {
            const defaultTokens = { tokens: ['CLASS-TOKEN-7B8F3D','CLASS-TOKEN-9K2M5P','CLASS-TOKEN-4R6T8W','CLASS-TOKEN-1A3C5E','CLASS-TOKEN-2B4D6F'], used: [] };
            await put('tokens.json', JSON.stringify(defaultTokens), { token: TOKEN, access: 'public' });
            return defaultTokens;
        }
        const text = await blob.text();
        return JSON.parse(text);
    } catch { return { tokens: [], used: [] }; }
}

export async function saveTokens(tokens) {
    await put('tokens.json', JSON.stringify(tokens), { token: TOKEN, access: 'public' });
}

import { createHmac, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

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

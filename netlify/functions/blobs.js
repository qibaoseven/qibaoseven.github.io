// ========================================
// StudentOS v0.43 (build v1)
// ========================================
const { connectLambda, getStore: getBlobStore } = require('@netlify/blobs');
const fs = require('fs');
const path = require('path');

// 全局存储桶名称
const MAIN_STORE = 'studentos-main';

function initBlobs(event) {
    connectLambda(event);
}

// 获取主存储桶实例
async function getMainStore() {
    return getBlobStore(MAIN_STORE);
}

// 获取班级专属存储桶 (每个班级一个独立 bucket)
async function getStoreForClass(classId) {
    return getBlobStore(`class-${classId}`);
}

// 获取班级列表 (存储在 main store 的 'classes' key)
async function getClassesList() {
    const store = await getMainStore();
    const data = await store.get('classes');
    if (!data) return [];
    return JSON.parse(data);
}

async function saveClassesList(classes) {
    const store = await getMainStore();
    await store.set('classes', JSON.stringify(classes));
}

// 获取 tokens 列表（自动初始化）
async function getTokens() {
    const store = await getMainStore();
    let data = await store.get('tokens');
    if (!data) {
        // 尝试从本地 tokens.json 读取默认值
        try {
            // tokens.json 位于项目根目录，函数运行时路径为 netlify/functions/
            const tokensPath = path.join(__dirname, '..', '..', 'tokens.json');
            const fileContent = fs.readFileSync(tokensPath, 'utf8');
            const defaultTokens = JSON.parse(fileContent);
            data = defaultTokens;
            await store.set('tokens', JSON.stringify(data));
            console.log('✅ tokens 已从本地文件自动初始化');
        } catch (err) {
            console.warn('⚠️ 无法读取 tokens.json，使用空配置', err);
            data = { tokens: [], used: [] };
            await store.set('tokens', JSON.stringify(data));
        }
    } else {
        // 如果 data 是字符串则解析，否则直接使用
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
    }
    return data;
}

async function saveTokens(tokens) {
    const store = await getMainStore();
    await store.set('tokens', JSON.stringify(tokens));
}

module.exports = {
    initBlobs,
    getMainStore,
    getStoreForClass,
    getClassesList,
    saveClassesList,
    getTokens,
    saveTokens
};

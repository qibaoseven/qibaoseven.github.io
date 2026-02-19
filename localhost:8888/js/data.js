// ==================== 云端配置 ====================
const CLOUD_CONFIG = {
    binId: "6975bf17d0ea881f4083a3af",
    masterKey: "$2a$10$jC76j4CEGgqz842YvvDucuoWG6emHsBbdqNr56rj8..53SEVCpp/u"
};

// ==================== 数据存储键（仅用于本地缓存）====================
const STORAGE_KEYS = {
    USERS: 'studentos_users',
    SCORES: 'studentos_scores',
    GROUPS: 'studentos_groups',
    RULES: 'studentos_rules',
    LOGS: 'studentos_logs',
    REWARDS: 'studentos_rewards',
    PUNISHMENTS: 'studentos_punishments',
    USER_PUNISHMENTS: 'studentos_user_punishments',
    GOLD: 'studentos_gold',
    EXCHANGE_RATE: 'studentos_exchange_rate',
    EMOJI: 'studentos_emoji',
    DAILY_REPORT: 'studentos_daily_report',
    CLOUD_META: 'studentos_cloud_meta'
};

// ==================== 全局状态 ====================
window.appData = {
    users: {},
    scores: {},
    groups: {},
    rules: {},
    logs: [],
    rewards: {},
    punishments: {},
    userPunishments: { active: {}, completed: {} },
    gold: {},
    exchangeRate: {},
    emoji: '',
    dailyReport: {},
    cloudMeta: { updated: 0, lastSync: null }
};

// ==================== 数据缓存函数 ====================

// 保存数据到本地缓存
function saveData(key) {
    const storageKey = STORAGE_KEYS[key.toUpperCase()];
    if (storageKey && window.appData[key] !== undefined) {
        localStorage.setItem(storageKey, JSON.stringify(window.appData[key]));
    }
}

// 保存所有数据到本地缓存
function saveAllData() {
    Object.keys(STORAGE_KEYS).forEach(key => {
        const dataKey = key.toLowerCase();
        if (window.appData[dataKey] !== undefined) {
            localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(window.appData[dataKey]));
        }
    });
}

// 从本地缓存加载
function loadFromStorage() {
    let hasData = false;
    for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            try {
                window.appData[key.toLowerCase()] = JSON.parse(stored);
                hasData = true;
            } catch (e) {
                console.error(`解析 ${key} 失败:`, e);
            }
        }
    }
    return hasData;
}

// 清空本地缓存
function clearLocalCache() {
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
}

// ==================== 云端同步函数 ====================

// 上传到云端
async function uploadToCloud(data) {
    const url = `https://api.jsonbin.io/v3/b/${CLOUD_CONFIG.binId}`;
    
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            "Content-Type": "application/json",
            "X-Master-Key": CLOUD_CONFIG.masterKey
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        throw new Error(`上传失败: HTTP ${response.status}`);
    }
    
    return await response.json();
}

// 从云端下载
async function downloadFromCloud() {
    const url = `https://api.jsonbin.io/v3/b/${CLOUD_CONFIG.binId}/latest`;
    
    const response = await fetch(url, {
        headers: { "X-Master-Key": CLOUD_CONFIG.masterKey }
    });
    
    if (!response.ok) {
        throw new Error(`下载失败: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.record || data;
}

// 从云端加载数据（主函数）
async function loadFromCloud() {
    try {
        const cloudData = await downloadFromCloud();
        
        // 更新 appData
        if (cloudData.users) window.appData.users = cloudData.users;
        if (cloudData.scores) window.appData.scores = cloudData.scores;
        if (cloudData.groups) window.appData.groups = cloudData.groups;
        if (cloudData.rules) window.appData.rules = cloudData.rules;
        if (cloudData.logs) window.appData.logs = cloudData.logs;
        if (cloudData.rewards) window.appData.rewards = cloudData.rewards;
        if (cloudData.punishments) window.appData.punishments = cloudData.punishments;
        if (cloudData.userPunishments) window.appData.userPunishments = cloudData.userPunishments;
        if (cloudData.gold) window.appData.gold = cloudData.gold;
        if (cloudData.exchangeRate) window.appData.exchangeRate = cloudData.exchangeRate;
        if (cloudData.emoji) window.appData.emoji = cloudData.emoji;
        if (cloudData.dailyReport) window.appData.dailyReport = cloudData.dailyReport;
        
        // 更新云端元数据
        window.appData.cloudMeta = cloudData.cloudMeta || {
            updated: 1,
            lastSync: new Date().toISOString(),
            version: '1.0'
        };
        
        // 保存到本地缓存
        saveAllData();
        
        return { success: true, data: cloudData };
    } catch (error) {
        console.error('从云端加载失败:', error);
        return { success: false, error: error.message };
    }
}

// 保存到云端（主函数）
async function saveToCloud() {
    try {
        const uploadData = {
            users: window.appData.users,
            scores: window.appData.scores,
            groups: window.appData.groups,
            rules: window.appData.rules,
            logs: window.appData.logs,
            rewards: window.appData.rewards,
            punishments: window.appData.punishments,
            userPunishments: window.appData.userPunishments,
            gold: window.appData.gold,
            exchangeRate: window.appData.exchangeRate,
            emoji: window.appData.emoji,
            dailyReport: window.appData.dailyReport,
            cloudMeta: {
                updated: (window.appData.cloudMeta?.updated || 0) + 1,
                lastSync: new Date().toISOString(),
                version: '1.0'
            },
            timestamp: new Date().toISOString()
        };
        
        const result = await uploadToCloud(uploadData);
        
        // 更新本地元数据
        window.appData.cloudMeta = uploadData.cloudMeta;
        saveData('cloudMeta');
        
        return { success: true, data: result };
    } catch (error) {
        console.error('保存到云端失败:', error);
        return { success: false, error: error.message };
    }
}

// 测试云端连接
async function testCloudConnection() {
    try {
        const data = await downloadFromCloud();
        return { 
            success: true, 
            version: data.cloudMeta?.updated || '未知',
            lastSync: data.cloudMeta?.lastSync || '未知'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 导出数据函数到全局
window.dataManager = {
    saveData,
    saveAllData,
    loadFromStorage,
    clearLocalCache,
    uploadToCloud,
    downloadFromCloud,
    loadFromCloud,
    saveToCloud,
    testCloudConnection,
    STORAGE_KEYS
};
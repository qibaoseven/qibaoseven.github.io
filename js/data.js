// ==================== 云端配置 ====================
const CLOUD_CONFIG = {
    binId: "6975bf17d0ea881f4083a3af",
    masterKey: "$2a$10$jC76j4CEGgqz842YvvDucuoWG6emHsBbdqNr56rj8..53SEVCpp/u"
};

// ==================== 数据存储键 ====================
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
    AUTO_EVENTS: 'studentos_auto_events',
    POSITIONS: 'studentos_positions',
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
    autoEvents: [],
    positions: { list: {}, defaultSalary: 5, lastPayDate: null },
    cloudMeta: { updated: 0, lastSync: null }
};

// ==================== 数据缓存函数 ====================

function saveData(key) {
    const storageKey = STORAGE_KEYS[key.toUpperCase()];
    if (storageKey && window.appData[key] !== undefined) {
        localStorage.setItem(storageKey, JSON.stringify(window.appData[key]));
    }
}

function saveAllData() {
    Object.keys(STORAGE_KEYS).forEach(key => {
        const dataKey = key.toLowerCase();
        if (window.appData[dataKey] !== undefined) {
            localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(window.appData[dataKey]));
        }
    });
}

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

function clearLocalCache() {
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
}

// ==================== 批量导入数据 ====================

function batchImportData(importedData) {
    const results = {
        success: [],
        failed: [],
        total: 0
    };
    
    Object.entries(importedData).forEach(([dataKey, dataValue]) => {
        if (window.appData.hasOwnProperty(dataKey)) {
            try {
                if (dataKey === 'logs' && Array.isArray(dataValue)) {
                    const allLogs = [...dataValue, ...window.appData.logs];
                    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    window.appData.logs = allLogs.slice(0, 100);
                } else if (dataKey === 'userPunishments') {
                    if (!window.appData.userPunishments) {
                        window.appData.userPunishments = { active: {}, completed: {} };
                    }
                    
                    if (dataValue.active) {
                        Object.entries(dataValue.active).forEach(([userId, puns]) => {
                            if (!window.appData.userPunishments.active[userId]) {
                                window.appData.userPunishments.active[userId] = [];
                            }
                            window.appData.userPunishments.active[userId] = [
                                ...window.appData.userPunishments.active[userId],
                                ...puns
                            ];
                        });
                    }
                    
                    if (dataValue.completed) {
                        Object.entries(dataValue.completed).forEach(([userId, puns]) => {
                            if (!window.appData.userPunishments.completed[userId]) {
                                window.appData.userPunishments.completed[userId] = [];
                            }
                            window.appData.userPunishments.completed[userId] = [
                                ...window.appData.userPunishments.completed[userId],
                                ...puns
                            ];
                        });
                    }
                } else if (typeof dataValue === 'object' && dataValue !== null) {
                    window.appData[dataKey] = {
                        ...window.appData[dataKey],
                        ...dataValue
                    };
                } else {
                    window.appData[dataKey] = dataValue;
                }
                
                results.success.push(dataKey);
            } catch (error) {
                console.error(`导入 ${dataKey} 失败:`, error);
                results.failed.push(dataKey);
            }
        } else {
            results.failed.push(dataKey);
        }
        results.total++;
    });
    
    saveAllData();
    return results;
}

// ==================== 云端同步函数 ====================

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
        const errorBody = await response.text();
        console.error('错误详情:', errorBody);
        throw new Error(`上传失败: HTTP ${response.status} - ${errorBody}`);
    }

    return await response.json();
}

async function downloadFromCloud() {
    const url = `https://api.jsonbin.io/v3/b/${CLOUD_CONFIG.binId}/latest`;
    
    // 修复：添加必要的请求头
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            "X-Master-Key": CLOUD_CONFIG.masterKey,
            "X-Bin-Meta": "false"
        }
    });
    
    if (!response.ok) {
        throw new Error(`下载失败: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.record || data;
}

async function loadFromCloud() {
    try {
        const cloudData = await downloadFromCloud();
        
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
        if (cloudData.autoEvents) window.appData.autoEvents = cloudData.autoEvents;
        if (cloudData.positions) window.appData.positions = cloudData.positions;
        
        window.appData.cloudMeta = cloudData.cloudMeta || {
            updated: 1,
            lastSync: new Date().toISOString(),
            version: '1.0'
        };
        
        saveAllData();
        return { success: true, data: cloudData };
    } catch (error) {
        console.error('从云端加载失败:', error);
        return { success: false, error: error.message };
    }
}

async function saveToCloud() {
    const uploadData = {
        users: window.appData.users,
        scores: window.appData.scores,
        groups: window.appData.groups,
        rules: window.appData.rules,
        logs: (window.appData.logs || []).slice(0, 100),
        rewards: window.appData.rewards,
        punishments: window.appData.punishments,
        userPunishments: window.appData.userPunishments,
        gold: window.appData.gold,
        exchangeRate: window.appData.exchangeRate,
        emoji: window.appData.emoji,
        dailyReport: window.appData.dailyReport,
        autoEvents: window.appData.autoEvents,
        positions: window.appData.positions,
        cloudMeta: {
            updated: (window.appData.cloudMeta?.updated || 0) + 1,
            lastSync: new Date().toISOString(),
            version: '1.0'
        },
        timestamp: new Date().toISOString()
    };
    
    const result = await uploadToCloud(uploadData);
    
    window.appData.cloudMeta = uploadData.cloudMeta;
    saveData('cloudMeta');
    
    return { success: true, data: result };
}

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

// ==================== 自动事件 ====================

async function runAutoEvents() {
    // ===== 首先检查并迁移旧格式密码 =====
    try {
        if (window.utils.hasLegacyPasswords()) {
            console.log('检测到旧格式密码，开始自动迁移...');
            const result = await window.utils.migrateAllPasswordsToHash();
            console.log(`密码迁移完成: 成功 ${result.migratedCount} 个`);
            
            // 添加系统通知（可选）
            if (window.modal && result.migratedCount > 0) {
                // 不阻塞主流程，静默迁移
            }
        }
    } catch (error) {
        console.error('密码迁移失败:', error);
    }
    
    const events = window.appData.autoEvents || [];
    const today = new Date();
    const todayStr = window.utils.getBeijingDate();
    
    for (const event of events) {
        let shouldRun = false;
        
        switch (event.frequency) {
            case 'daily':
                shouldRun = true;
                break;
            case 'weekly':
                shouldRun = today.getDay() === event.dayOfWeek;
                break;
            case 'monthly':
                shouldRun = today.getDate() === event.dayOfMonth;
                break;
        }
        
        if (!shouldRun) continue;
        
        const lastRun = event.lastRun || {};
        if (lastRun[todayStr]) continue;
        
        const targets = event.targets || [];
        
        for (const target of targets) {
            let targetIds = [];
            
            if (target === 'all') {
                targetIds = Object.keys(window.appData.scores || {});
            } else if (target.startsWith('group:')) {
                const groupName = target.replace('group:', '');
                targetIds = window.appData.groups[groupName] || [];
            } else {
                targetIds = [target];
            }
            
            targetIds.forEach(id => {
                if (id === '0') return;
                try {
                    if (window.appData.scores && window.appData.scores[id]) {
                        window.appData.scores[id][1] = (window.appData.scores[id][1] || 0) + event.change;
                        window.utils.addLog('自动事件', id, event.change, window.appData.scores[id][1], event.reason || '自动事件');
                    }
                } catch (e) {
                    console.warn(`自动事件执行失败: ${id}`, e);
                }
            });
        }
        
        if (!event.lastRun) event.lastRun = {};
        event.lastRun[todayStr] = true;
    }
    
    saveData('autoEvents');
    await saveToCloud();
}

// ==================== 导出 ====================
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
    STORAGE_KEYS,
    batchImportData,
    runAutoEvents
};

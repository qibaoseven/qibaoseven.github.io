// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
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
    exchangeRate: { score_to_gold: 0.1, gold_to_score: 1, last_updated: null },
    emoji: { emojis: '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘' },
    dailyReport: {},
    dailyDiscipline: {},
    positions: { list: {}, defaultSalary: 5, lastPayDate: null }
};

function saveData(key) {
    if (window.saveAllDataToCloud) window.saveAllDataToCloud().catch(e => console.warn('保存失败', e));
}

function saveAllData() {
    if (window.saveAllDataToCloud) window.saveAllDataToCloud().catch(e => console.warn('保存失败', e));
}

function clearLocalCache() {
    window.appData = {
        users: {}, scores: {}, groups: {}, rules: {}, logs: [],
        rewards: {}, punishments: {}, userPunishments: { active: {}, completed: {} },
        gold: {}, exchangeRate: { score_to_gold: 0.1, gold_to_score: 1, last_updated: null },
        emoji: { emojis: '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘' },
        dailyReport: {},
        dailyDiscipline: {},
        positions: { list: {}, defaultSalary: 5, lastPayDate: null }
    };
}

function batchImportData(importedData) {
    const results = { success: [], failed: [], total: 0 };
    Object.entries(importedData).forEach(([dataKey, dataValue]) => {
        if (window.appData.hasOwnProperty(dataKey)) {
            try {
                if (dataKey === 'logs' && Array.isArray(dataValue)) {
                    const allLogs = [...dataValue, ...window.appData.logs];
                    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    window.appData.logs = allLogs;
                } else if (dataKey === 'userPunishments') {
                    if (!window.appData.userPunishments) window.appData.userPunishments = { active: {}, completed: {} };
                    if (dataValue.active) {
                        Object.entries(dataValue.active).forEach(([userId, puns]) => {
                            if (!window.appData.userPunishments.active[userId]) window.appData.userPunishments.active[userId] = [];
                            window.appData.userPunishments.active[userId] = [...window.appData.userPunishments.active[userId], ...puns];
                        });
                    }
                    if (dataValue.completed) {
                        Object.entries(dataValue.completed).forEach(([userId, puns]) => {
                            if (!window.appData.userPunishments.completed[userId]) window.appData.userPunishments.completed[userId] = [];
                            window.appData.userPunishments.completed[userId] = [...window.appData.userPunishments.completed[userId], ...puns];
                        });
                    }
                } else if (typeof dataValue === 'object' && dataValue !== null) {
                    window.appData[dataKey] = { ...window.appData[dataKey], ...dataValue };
                } else {
                    window.appData[dataKey] = dataValue;
                }
                results.success.push(dataKey);
            } catch (error) {
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

window.dataManager = {
    saveData, saveAllData, clearLocalCache,
    batchImportData
};

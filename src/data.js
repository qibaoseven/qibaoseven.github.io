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
    autoEvents: [],
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
        dailyReport: {}, autoEvents: [],
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
                    window.appData.logs = allLogs.slice(0, 100);
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

async function runAutoEvents() {
    try {
        if (window.utils.hasLegacyPasswords()) {
            const result = await window.utils.migrateAllPasswordsToHash();
            console.log(`密码迁移完成: 成功 ${result.migratedCount} 个`);
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
            case 'daily': shouldRun = true; break;
            case 'weekly': shouldRun = today.getDay() === event.dayOfWeek; break;
            case 'monthly': shouldRun = today.getDate() === event.dayOfMonth; break;
        }
        if (!shouldRun) continue;
        const lastRun = event.lastRun || {};
        if (lastRun[todayStr]) continue;
        const targets = event.targets || [];
        for (const target of targets) {
            let targetIds = [];
            if (target === 'all') targetIds = Object.keys(window.appData.scores || {});
            else if (target.startsWith('group:')) {
                const groupName = target.replace('group:', '');
                targetIds = window.appData.groups[groupName] || [];
            } else targetIds = [target];
            targetIds.forEach(id => {
                if (id === '0') return;
                try {
                    if (window.appData.scores && window.appData.scores[id]) {
                        const oldScore = window.appData.scores[id][1] || 0;
                        window.appData.scores[id][1] = (window.appData.scores[id][1] || 0) + event.change;
                        window.utils.addLog('自动事件', id, event.change, window.appData.scores[id][1], event.reason || '自动事件');
                    }
                } catch (e) {}
            });
        }
        if (!event.lastRun) event.lastRun = {};
        event.lastRun[todayStr] = true;
    }
    saveAllData();
}

window.dataManager = {
    saveData, saveAllData, clearLocalCache,
    batchImportData, runAutoEvents
};

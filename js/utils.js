// ==================== 工具函数 ====================

// 格式化日期
function formatDate(date = new Date()) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

// 获取北京时间
function getBeijingDate(date = new Date()) {
    const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return beijingTime.toISOString().split('T')[0];
}

// 判断是否是周五下午
function isFridayAfternoon() {
    const now = new Date();
    return now.getDay() === 5 && now.getHours() >= 12;
}

// 获取学生分数
function getStudentScore(studentId) {
    return window.appData?.scores?.[studentId]?.[1] || 0;
}

// 获取学生金币
function getStudentGold(studentId) {
    return window.appData?.gold?.[studentId]?.amount || 0;
}

// 获取学生排名
function getStudentRank(studentId) {
    const scores = Object.entries(window.appData?.scores || {})
        .filter(([id]) => id !== '0')
        .map(([id, data]) => ({ id, score: data[1] }))
        .sort((a, b) => b.score - a.score);
    
    const rank = scores.findIndex(s => s.id === studentId) + 1;
    return rank > 0 ? `第${rank}名 / 共${scores.length}人` : '未找到';
}

// 获取金币排名
function getGoldRanking(limit = 999) {
    const rankings = [];
    Object.entries(window.appData?.gold || {}).forEach(([id, data]) => {
        if (id !== '0' && window.appData?.scores?.[id]) {
            rankings.push({
                id,
                name: window.appData.scores[id][0],
                gold: data.amount || 0
            });
        }
    });
    return rankings.sort((a, b) => b.gold - a.gold).slice(0, limit);
}

// 获取分数排名
function getTopRanking(limit = 999) {
    return Object.entries(window.appData?.scores || {})
        .filter(([id]) => id !== '0')
        .map(([id, [name, score]]) => ({ id, name, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

// 更新学生分数
function updateStudentScore(studentId, change, reason = '') {
    if (!window.appData?.scores?.[studentId]) return false;
    const oldScore = window.appData.scores[studentId][1];
    window.appData.scores[studentId][1] = oldScore + change;
    saveData('scores');
    addLog('分数调整', studentId, change, window.appData.scores[studentId][1], reason);
    return true;
}

// 更新学生金币
function updateStudentGold(studentId, change) {
    if (!window.appData?.gold) window.appData.gold = {};
    if (!window.appData.gold[studentId]) {
        window.appData.gold[studentId] = { amount: 0, last_updated: formatDate() };
    }
    window.appData.gold[studentId].amount += change;
    window.appData.gold[studentId].last_updated = formatDate();
    saveData('gold');
    return true;
}

// 添加日志
function addLog(action, studentId, scoreChange, currentScore, reason = '') {
    const studentName = window.appData?.scores?.[studentId]?.[0] || '未知';
    const log = {
        timestamp: formatDate(),
        action,
        student_id: studentId,
        student_name: studentName,
        score_change: scoreChange,
        current_score: currentScore,
        reason
    };
    if (!window.appData.logs) window.appData.logs = [];
    window.appData.logs.unshift(log);
    if (window.appData.logs.length > 200) window.appData.logs.pop();
    saveData('logs');
}

// 更新汇率
function updateExchangeRate() {
    const rate = window.appData.exchangeRate;
    rate.score_to_gold = rate.score_to_gold * (0.95 + Math.random() * 0.1);
    rate.gold_to_score = rate.gold_to_score * (0.95 + Math.random() * 0.1);
    rate.last_updated = formatDate();
    saveData('exchangeRate');
}

// 抽取奖励
function drawReward() {
    const rewards = [];
    Object.entries(window.appData?.rewards || {}).forEach(([rarity, list]) => {
        if (Array.isArray(list)) {
            (list || []).forEach(reward => {
                for (let i = 0; i < (reward.probability || 1); i++) {
                    rewards.push({ ...reward, rarity });
                }
            });
        }
    });
    
    const hiddenRewards = window.appData?.rewards?.hidden_rewards || [];
    hiddenRewards.forEach(reward => {
        for (let i = 0; i < (reward.probability || 1); i++) {
            rewards.push({ ...reward, rarity: 'SP' });
        }
    });
    
    if (rewards.length === 0) return { name: '谢谢参与', type: '虚拟', description: '下次好运！', rarity: 'N' };
    return rewards[Math.floor(Math.random() * rewards.length)];
}

// 过滤学生
function filterStudents(keyword, tableId = 'scoreTable') {
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    rows.forEach(row => {
        const name = row.getAttribute('data-name') || '';
        row.style.display = name.includes(keyword) ? '' : 'none';
    });
}

// 切换全选
function toggleAllStudents(checkbox) {
    document.querySelectorAll('.batch-student').forEach(cb => cb.checked = checkbox.checked);
}

function toggleAllReasonStudents(checkbox) {
    document.querySelectorAll('.batch-reason-student').forEach(cb => cb.checked = checkbox.checked);
}

// ==================== 新增：文件读取工具函数 ====================

// 读取文件夹中的JSON文件
async function readJSONFilesFromDirectory(files) {
    const results = {
        success: [],
        failed: [],
        data: {}
    };
    
    const filePromises = [];
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('.json')) {
            const promise = new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const jsonData = JSON.parse(e.target.result);
                        const fileName = file.name.replace('.json', '');
                        results.data[fileName] = jsonData;
                        results.success.push(file.name);
                        resolve({ success: true, file: file.name });
                    } catch (error) {
                        console.error(`解析文件 ${file.name} 失败:`, error);
                        results.failed.push(file.name);
                        resolve({ success: false, file: file.name, error });
                    }
                };
                reader.onerror = function() {
                    results.failed.push(file.name);
                    resolve({ success: false, file: file.name });
                };
                reader.readAsText(file);
            });
            filePromises.push(promise);
        }
    }
    
    await Promise.all(filePromises);
    return results;
}

// 文件映射配置（文件名 -> 数据键名）
const FILE_TO_DATA_KEY = {
    'user': 'users',
    'score': 'scores',
    'gold_data': 'gold',
    'rewards': 'rewards',
    'punishment': 'punishments',
    'usr_pun': 'userPunishments',
    'log': 'logs',
    'score_rules': 'rules',
    'exchange_rate': 'exchangeRate',
    'emoji': 'emoji',
    'daily_report': 'dailyReport'
};

// 导入文件夹数据
async function importFolderData(files) {
    const readResult = await readJSONFilesFromDirectory(files);
    
    if (readResult.success.length === 0) {
        return {
            success: false,
            message: '没有找到有效的JSON文件',
            details: readResult
        };
    }
    
    // 映射数据到appData
    const imported = {};
    const mapping = {};
    
    Object.entries(readResult.data).forEach(([fileName, fileData]) => {
        // 尝试直接匹配文件名
        if (FILE_TO_DATA_KEY[fileName]) {
            const dataKey = FILE_TO_DATA_KEY[fileName];
            imported[dataKey] = fileData;
            mapping[fileName] = dataKey;
        } 
        // 尝试匹配存储键
        else {
            const upperFileName = fileName.toUpperCase();
            for (const [key, storageKey] of Object.entries(window.dataManager.STORAGE_KEYS)) {
                const dataKey = key.toLowerCase();
                if (storageKey.includes(fileName) || fileName.includes(dataKey)) {
                    imported[dataKey] = fileData;
                    mapping[fileName] = dataKey;
                    break;
                }
            }
        }
    });
    
    return {
        success: true,
        imported,
        mapping,
        details: readResult
    };
}

// 导出工具函数到全局
window.utils = {
    formatDate,
    getBeijingDate,
    isFridayAfternoon,
    getStudentScore,
    getStudentGold,
    getStudentRank,
    getGoldRanking,
    getTopRanking,
    updateStudentScore,
    updateStudentGold,
    addLog,
    updateExchangeRate,
    drawReward,
    filterStudents,
    toggleAllStudents,
    toggleAllReasonStudents,
    // 新增
    readJSONFilesFromDirectory,
    importFolderData,
    FILE_TO_DATA_KEY
};
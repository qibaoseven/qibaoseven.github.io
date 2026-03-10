// ==================== 工具函数 ====================

// 格式化日期（yy.mm.dd hh:mm:ss.xxx）
function formatDateWithMs(date = new Date()) {
    const yy = date.getFullYear().toString().slice(2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const hh = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${yy}.${mm}.${dd} ${hh}:${min}:${ss}.${ms}`;
}

// 格式化日期（用于文件名）
function formatDateForFile(date = new Date()) {
    const yy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const hh = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    return `${yy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

// 获取北京时间（yyyy-mm-dd）
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
    if (!window.appData?.scores?.[studentId]) return 0;
    const data = window.appData.scores[studentId];
    
    if (Array.isArray(data)) {
        return typeof data[1] === 'number' ? data[1] : 0;
    } else if (data && typeof data === 'object') {
        return typeof data.score === 'number' ? data.score : 0;
    }
    return 0;
}

// 获取学生金币
function getStudentGold(studentId) {
    return window.appData?.gold?.[studentId]?.amount || 0;
}

// 获取学生排名
function getStudentRank(studentId) {
    const scores = Object.entries(window.appData?.scores || {})
        .filter(([id]) => id !== '0')
        .map(([id, data]) => {
            let score = 0;
            if (Array.isArray(data)) {
                score = typeof data[1] === 'number' ? data[1] : 0;
            } else if (data && typeof data === 'object') {
                score = typeof data.score === 'number' ? data.score : 0;
            }
            return { id, score };
        })
        .sort((a, b) => b.score - a.score);
    
    const rank = scores.findIndex(s => s.id === studentId) + 1;
    return rank > 0 ? `第${rank}名 / 共${scores.length}人` : '未找到';
}

// 获取金币排名
function getGoldRanking(limit = 999) {
    const rankings = [];
    
    Object.entries(window.appData?.gold || {}).forEach(([id, data]) => {
        let studentName = '未知';
        const studentData = window.appData?.scores?.[id];
        
        if (Array.isArray(studentData)) {
            studentName = studentData[0] || '未知';
        } else if (studentData && typeof studentData === 'object') {
            studentName = studentData.name || '未知';
        }
        
        rankings.push({
            id,
            name: studentName,
            gold: data?.amount || 0
        });
    });
    
    return rankings.sort((a, b) => b.gold - a.gold).slice(0, limit);
}

// 获取分数排名
function getTopRanking(limit = 999) {
    const students = [];
    
    Object.entries(window.appData?.scores || {}).forEach(([id, data]) => {
        if (id !== '0') {
            let name = '未知';
            let score = 0;
            
            if (Array.isArray(data)) {
                name = data[0] || '未知';
                score = typeof data[1] === 'number' ? data[1] : 0;
            } else if (data && typeof data === 'object') {
                name = data.name || '未知';
                score = typeof data.score === 'number' ? data.score : 0;
            }
            
            students.push({
                id: id,
                name: name,
                score: score
            });
        }
    });
    
    return students.sort((a, b) => b.score - a.score).slice(0, limit);
}

// 更新学生分数（自动记录日志 + 上传）
function updateStudentScore(studentId, change, reason = '') {
    if (!window.appData?.scores?.[studentId]) return false;
    
    const oldScore = getStudentScore(studentId);
    const newScore = oldScore + change;
    
    // 更新分数
    const data = window.appData.scores[studentId];
    if (Array.isArray(data)) {
        data[1] = newScore;
    } else if (data && typeof data === 'object') {
        data.score = newScore;
    }
    
    window.dataManager.saveData('scores');
    addLog('分数调整', studentId, change, newScore, reason);
    
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    return true;
}

// 更新学生金币
function updateStudentGold(studentId, change) {
    if (!window.appData?.gold) window.appData.gold = {};
    if (!window.appData.gold[studentId]) {
        window.appData.gold[studentId] = { amount: 0, last_updated: formatDateWithMs() };
    }
    window.appData.gold[studentId].amount += change;
    window.appData.gold[studentId].last_updated = formatDateWithMs();
    window.dataManager.saveData('gold');
    
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    return true;
}

// 添加日志（超详细版）
function addLog(action, studentId, scoreChange, currentScore, reason = '') {
    const studentData = window.appData?.scores?.[studentId];
    let studentName = '未知';
    
    if (Array.isArray(studentData)) {
        studentName = studentData[0] || '未知';
    } else if (studentData && typeof studentData === 'object') {
        studentName = studentData.name || '未知';
    }
    
    const log = {
        timestamp: formatDateWithMs(),
        action,
        student_id: studentId,
        student_name: studentName,
        score_change: scoreChange,
        current_score: currentScore,
        reason,
        page: window.currentPage || 'unknown',
        user_role: window.currentUser?.role || 'unknown'
    };
    
    if (!window.appData.logs) window.appData.logs = [];
    window.appData.logs.unshift(log);
    if (window.appData.logs.length > 200) window.appData.logs.pop();
    window.dataManager.saveData('logs');
}

// 添加纯浏览日志
function addViewLog(action, detail = '') {
    if (!window.currentUser) return;
    
    const log = {
        timestamp: formatDateWithMs(),
        action: '浏览_' + action,
        student_id: window.currentUser.student_id,
        student_name: window.currentUser.display_name,
        score_change: 0,
        current_score: getStudentScore(window.currentUser.student_id),
        reason: detail,
        page: window.currentPage || 'unknown',
        user_role: window.currentUser.role
    };
    
    if (!window.appData.logs) window.appData.logs = [];
    window.appData.logs.unshift(log);
    if (window.appData.logs.length > 200) window.appData.logs.pop();
    window.dataManager.saveData('logs');
}

// 更新汇率
function updateExchangeRate() {
    const rate = window.appData.exchangeRate;
    rate.score_to_gold = rate.score_to_gold * (0.95 + Math.random() * 0.1);
    rate.gold_to_score = rate.gold_to_score * (0.95 + Math.random() * 0.1);
    rate.last_updated = formatDateWithMs();
    window.dataManager.saveData('exchangeRate');
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

// 读取JSON文件
async function readJSONFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                resolve(data);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = e => reject(e.target.error);
        reader.readAsText(file);
    });
}

// 文件映射配置
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
    'daily_report': 'dailyReport',
    'daily_check': 'dailyCheck',
    'auto_events': 'autoEvents'
};

// 获取所有学生列表
function getAllStudents() {
    const students = [];
    Object.entries(window.appData?.scores || {}).forEach(([id, data]) => {
        if (id !== '0') {
            let name = '未知';
            let score = 0;
            
            if (Array.isArray(data)) {
                name = data[0] || '未知';
                score = typeof data[1] === 'number' ? data[1] : 0;
            } else if (data && typeof data === 'object') {
                name = data.name || '未知';
                score = typeof data.score === 'number' ? data.score : 0;
            }
            
            students.push({
                id: id,
                name: name,
                score: score
            });
        }
    });
    return students;
}

function getStudentData(studentId) {
    if (!window.appData?.scores?.[studentId]) return null;
    const data = window.appData.scores[studentId];
    
    if (Array.isArray(data)) {
        return {
            name: data[0] || '未知',
            score: typeof data[1] === 'number' ? data[1] : 0
        };
    } else if (data && typeof data === 'object') {
        return {
            name: data.name || '未知',
            score: typeof data.score === 'number' ? data.score : 0
        };
    }
    return null;
}

function getStudentName(studentId) {
    const student = getStudentData(studentId);
    return student?.name || '未知';
}

// 系统检测
function getOS() {
    const ua = navigator.userAgent;
    const platform = navigator.platform;
    
    if (/Windows NT/.test(ua)) return 'windows';
    
    const isIPad = /iPad/.test(ua) || 
                  (/Mac/.test(platform) && navigator.maxTouchPoints > 1) ||
                  (/Mac/.test(platform) && /Safari/.test(ua) && /Mobile/.test(ua));
    
    if (isIPad) return 'macos';
    if (/Mac/.test(platform)) return 'macos';
    if (/Linux/.test(platform) && !/Android/.test(ua)) return 'linux';
    if (/Android/.test(ua)) return 'android';
    if (/iPhone|iPod/.test(ua)) return 'ios';
    
    return 'unknown';
}

function shouldUseLandscapeMode() {
    const os = getOS();
    const isLandscape = window.innerWidth > window.innerHeight;
    
    if (os === 'macos') return true;
    return isLandscape;
}

// ==================== 导出 ====================
window.utils = {
    formatDateWithMs,
    formatDateForFile,
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
    addViewLog,
    updateExchangeRate,
    drawReward,
    filterStudents,
    toggleAllStudents,
    toggleAllReasonStudents,
    readJSONFile,
    FILE_TO_DATA_KEY,
    getAllStudents,
    getStudentData,
    getStudentName,
    getOS,
    shouldUseLandscapeMode
};navigator.platform;
    
    // Windows
    if (/Windows NT/.test(ua)) return 'windows';
    
    // 检测是否为 iPad（包括 Safari 伪装的情况）
    const isIPad = /iPad/.test(ua) || 
                  (/Mac/.test(platform) && navigator.maxTouchPoints > 1) ||
                  (/Mac/.test(platform) && /Safari/.test(ua) && /Mobile/.test(ua));
    
    // 如果是 iPad，统一返回 'macos'（因为要用桌面版）
    if (isIPad) return 'macos';
    
    // 真实 macOS
    if (/Mac/.test(platform)) return 'macos';
    
    // Linux
    if (/Linux/.test(platform) && !/Android/.test(ua)) return 'linux';
    
    // Android
    if (/Android/.test(ua)) return 'android';
    
    // iOS (iPhone/iPod)
    if (/iPhone|iPod/.test(ua)) return 'ios';
    
    return 'unknown';
}

// 判断是否应该用横屏模式
function shouldUseLandscapeMode() {
    const os = getOS();
    const isLandscape = window.innerWidth > window.innerHeight;
    
    // macOS（包括 iPad）永远用横屏模式（桌面版）
    if (os === 'macos') return true;
    
    // 其他系统按实际方向
    return isLandscape;
}

// ==================== 导出 ====================
window.utils = {
    formatDateWithMs,
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
    addViewLog,
    updateExchangeRate,
    drawReward,
    filterStudents,
    toggleAllStudents,
    toggleAllReasonStudents,
    readJSONFilesFromDirectory,
    importFolderData,
    FILE_TO_DATA_KEY,
    getAllStudents,
    getStudentData,
    getStudentName,
    checkFontLoaded,
    getOS,
    shouldUseLandscapeMode
};
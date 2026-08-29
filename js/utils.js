// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
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

function formatDateForFile(date = new Date()) {
    const yy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const hh = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    return `${yy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

function getBeijingDate(date = new Date()) {
    const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return beijingTime.toISOString().split('T')[0];
}

function isFridayAfternoon() {
    const now = new Date();
    return now.getDay() === 5 && now.getHours() >= 12;
}

function getStudentScore(studentId) {
    if (!window.appData?.scores?.[studentId]) return 0;
    const data = window.appData.scores[studentId];
    if (Array.isArray(data)) return typeof data[1] === 'number' ? data[1] : 0;
    else if (data && typeof data === 'object') return typeof data.score === 'number' ? data.score : 0;
    return 0;
}

function getStudentGold(studentId) {
    return window.appData?.gold?.[studentId]?.amount || 0;
}

function getStudentRank(studentId) {
    const scores = Object.entries(window.appData?.scores || {})
        .filter(([id]) => id !== '0')
        .map(([id, data]) => {
            let score = 0;
            if (Array.isArray(data)) score = typeof data[1] === 'number' ? data[1] : 0;
            else if (data && typeof data === 'object') score = typeof data.score === 'number' ? data.score : 0;
            return { id, score };
        })
        .sort((a, b) => b.score - a.score);
    const rank = scores.findIndex(s => s.id === studentId) + 1;
    return rank > 0 ? `第${rank}名 / 共${scores.length}人` : '未找到';
}

function getGoldRanking(limit = 999) {
    const rankings = [];
    Object.entries(window.appData?.gold || {}).forEach(([id, data]) => {
        let studentName = '未知';
        const studentData = window.appData?.scores?.[id];
        if (Array.isArray(studentData)) studentName = studentData[0] || '未知';
        else if (studentData && typeof studentData === 'object') studentName = studentData.name || '未知';
        rankings.push({ id, name: studentName, gold: data?.amount || 0 });
    });
    return rankings.sort((a, b) => b.gold - a.gold).slice(0, limit);
}

function getTopRanking(limit = 999) {
    const students = [];
    Object.entries(window.appData?.scores || {}).forEach(([id, data]) => {
        if (id !== '0') {
            let name = '未知', score = 0;
            if (Array.isArray(data)) { name = data[0] || '未知'; score = typeof data[1] === 'number' ? data[1] : 0; }
            else if (data && typeof data === 'object') { name = data.name || '未知'; score = typeof data.score === 'number' ? data.score : 0; }
            students.push({ id, name, score });
        }
    });
    return students.sort((a, b) => b.score - a.score).slice(0, limit);
}

function updateStudentScore(studentId, change, reason = '', save = true) {
    if (!window.appData?.scores?.[studentId]) return false;
    const oldScore = getStudentScore(studentId);
    const newScore = oldScore + change;
    const data = window.appData.scores[studentId];
    if (Array.isArray(data)) data[1] = newScore;
    else if (data && typeof data === 'object') data.score = newScore;
    addLog('分数调整', studentId, change, newScore, reason);
    if (save && window.saveAllDataToCloud) window.saveAllDataToCloud().catch(e => console.warn('保存失败', e));
    return true;
}

function updateStudentGold(studentId, change) {
    if (!window.appData?.gold) window.appData.gold = {};
    if (!window.appData.gold[studentId]) window.appData.gold[studentId] = { amount: 0, last_updated: formatDateWithMs() };
    window.appData.gold[studentId].amount += change;
    window.appData.gold[studentId].last_updated = formatDateWithMs();
    if (window.saveAllDataToCloud) window.saveAllDataToCloud().catch(e => console.warn('保存失败', e));
    return true;
}

function addLog(action, studentId, scoreChange, currentScore, reason = '') {
    const studentData = window.appData?.scores?.[studentId];
    let studentName = '未知';
    if (Array.isArray(studentData)) studentName = studentData[0] || '未知';
    else if (studentData && typeof studentData === 'object') studentName = studentData.name || '未知';
    const log = { timestamp: formatDateWithMs(), action, student_id: studentId, student_name: studentName, score_change: scoreChange, current_score: currentScore, reason, page: window.currentPage || 'unknown', user_role: window.currentUser?.role || 'unknown' };
    if (!window.appData.logs) window.appData.logs = [];
    window.appData.logs.unshift(log);
    if (window.saveAllDataToCloud) window.saveAllDataToCloud();
}

function addViewLog(action, detail = '') {
    if (!window.currentUser) return;
    const log = { timestamp: formatDateWithMs(), action: '浏览_' + action, student_id: window.currentUser.student_id, student_name: window.currentUser.display_name, score_change: 0, current_score: getStudentScore(window.currentUser.student_id), reason: detail, page: window.currentPage || 'unknown', user_role: window.currentUser.role };
    if (!window.appData.logs) window.appData.logs = [];
    window.appData.logs.unshift(log);
    if (window.saveAllDataToCloud) window.saveAllDataToCloud();
}

function updateExchangeRate() {
    const rate = window.appData.exchangeRate;
    rate.score_to_gold = rate.score_to_gold * (0.95 + Math.random() * 0.1);
    rate.gold_to_score = rate.gold_to_score * (0.95 + Math.random() * 0.1);
    rate.last_updated = formatDateWithMs();
}

function drawReward() {
    const rewards = [];
    Object.entries(window.appData?.rewards || {}).forEach(([rarity, list]) => {
        if (Array.isArray(list)) (list || []).forEach(reward => { for (let i = 0; i < (reward.probability || 1); i++) rewards.push({ ...reward, rarity }); });
    });
    const hiddenRewards = window.appData?.rewards?.hidden_rewards || [];
    hiddenRewards.forEach(reward => { for (let i = 0; i < (reward.probability || 1); i++) rewards.push({ ...reward, rarity: 'SP' }); });
    if (rewards.length === 0) return { name: '谢谢参与', type: '虚拟', description: '下次好运！', rarity: 'N' };
    return rewards[Math.floor(Math.random() * rewards.length)];
}

function filterStudents(keyword, tableId = 'scoreTable') {
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    rows.forEach(row => { const name = row.getAttribute('data-name') || ''; row.style.display = name.includes(keyword) ? '' : 'none'; });
}

function toggleAllStudents(checkbox) { document.querySelectorAll('.batch-student').forEach(cb => cb.checked = checkbox.checked); }
function toggleAllReasonStudents(checkbox) { document.querySelectorAll('.batch-reason-student').forEach(cb => cb.checked = checkbox.checked); }

async function readJSONFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => { try { resolve(JSON.parse(e.target.result)); } catch(err) { reject(err); } };
        reader.onerror = e => reject(e.target.error);
        reader.readAsText(file);
    });
}

const FILE_TO_DATA_KEY = { 'user': 'users', 'score': 'scores', 'gold_data': 'gold', 'rewards': 'rewards', 'punishment': 'punishments', 'usr_pun': 'userPunishments', 'log': 'logs', 'score_rules': 'rules', 'exchange_rate': 'exchangeRate', 'emoji': 'emoji', 'daily_report': 'dailyReport', 'daily_check': 'dailyCheck', 'auto_events': 'autoEvents' };

function getAllStudents() {
    const students = [];
    Object.entries(window.appData?.scores || {}).forEach(([id, data]) => {
        if (id !== '0') {
            let name = '未知', score = 0;
            if (Array.isArray(data)) { name = data[0] || '未知'; score = typeof data[1] === 'number' ? data[1] : 0; }
            else if (data && typeof data === 'object') { name = data.name || '未知'; score = typeof data.score === 'number' ? data.score : 0; }
            students.push({ id, name, score });
        }
    });
    return students;
}

function getStudentData(studentId) {
    if (!window.appData?.scores?.[studentId]) return null;
    const data = window.appData.scores[studentId];
    if (Array.isArray(data)) return { name: data[0] || '未知', score: typeof data[1] === 'number' ? data[1] : 0 };
    else if (data && typeof data === 'object') return { name: data.name || '未知', score: typeof data.score === 'number' ? data.score : 0 };
    return null;
}

function getStudentName(studentId) { const student = getStudentData(studentId); return student?.name || '未知'; }

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(inputPassword, storedHash) {
    if (!storedHash) return false;
    if (storedHash.startsWith('hashed:')) {
        const hashValue = storedHash.substring(7);
        const inputHash = await hashPassword(inputPassword);
        return inputHash === hashValue;
    }
    return inputPassword === storedHash;
}

async function createPasswordHash(password) {
    const hash = await hashPassword(password);
    return `hashed:${hash}`;
}

function isPasswordLegacy(storedPassword) {
    return storedPassword && typeof storedPassword === 'string' && !storedPassword.startsWith('hashed:');
}

async function migrateAllPasswordsToHash() {
    let migratedCount = 0, failedCount = 0;
    for (const [username, user] of Object.entries(window.appData.users)) {
        if (user.password && isPasswordLegacy(user.password)) {
            try {
                const hashedPassword = await createPasswordHash(user.password);
                user.password = hashedPassword;
                migratedCount++;
            } catch (error) { failedCount++; }
        }
    }
    if (migratedCount > 0 || failedCount > 0) {
        if (window.saveAllDataToCloud) window.saveAllDataToCloud().catch(e => console.warn('保存失败', e));
        addLog('密码迁移', 'system', 0, 0, `批量密码哈希迁移: 成功 ${migratedCount} 个, 失败 ${failedCount} 个`);
    }
    return { migratedCount, failedCount };
}

function hasLegacyPasswords() {
    for (const user of Object.values(window.appData.users)) {
        if (user.password && isPasswordLegacy(user.password)) return true;
    }
    return false;
}

window.utils = {
    formatDateWithMs, formatDateForFile, getBeijingDate, isFridayAfternoon,
    getStudentScore, getStudentGold, getStudentRank, getGoldRanking, getTopRanking,
    updateStudentScore, updateStudentGold, addLog, addViewLog, updateExchangeRate, drawReward,
    filterStudents, toggleAllStudents, toggleAllReasonStudents, readJSONFile, FILE_TO_DATA_KEY,
    getAllStudents, getStudentData, getStudentName,
    hashPassword, verifyPassword, createPasswordHash, isPasswordLegacy, migrateAllPasswordsToHash, hasLegacyPasswords
};

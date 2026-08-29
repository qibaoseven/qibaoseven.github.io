// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
function showBackup() {
    if (!window.auth.hasPermission('数据备份')) {
        alert('权限不足');
        return;
    }
    
    const students = window.utils.getAllStudents();
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">💾 数据备份</h2>
            
            <div class="btn-grid" style="max-width: 300px;">
                <button class="btn btn-primary" onclick="window.backup.exportData()">📤 导出数据</button>
            </div>
            
            <div class="stats-grid" style="margin-top: 30px;">
                <div class="stat-card">
                    <div class="stat-value">${Object.keys(window.appData.users).length}</div>
                    <div class="stat-label">用户数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${students.length}</div>
                    <div class="stat-label">学生数</div>
                </div>
            </div>
        </div>
    `;
}

function exportData() {
    try {
        const exportData = {
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
            autoEvents: window.appData.autoEvents,
            positions: window.appData.positions,
            METADATA: {
                exportTime: new Date().toISOString(),
                version: '2.0',
                user: window.currentUser?.username || 'unknown'
            }
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        a.download = `studentos_backup_${dateStr}_${timeStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        window.utils.addLog('导出数据', 'system', 0, 0, `导出完整数据备份`);
        window.modal.notify('✅ 数据导出成功！', 'success');
    } catch (error) {
        console.error('导出失败:', error);
        alert('❌ 导出失败：' + error.message);
    }
}

window.backup = {
    showBackup,
    exportData
};

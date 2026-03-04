// ==================== 操作日志页面 ====================

function showLogs() {
    //document.getElementById('contentArea').setAttribute('data-page', 'logs');
    if (!window.auth.hasPermission('操作日志')) {
        alert('权限不足');
        return;
    }
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">📋 操作日志</h2>
            
            <div style="margin-bottom: 20px;">
                <input type="text" placeholder="搜索日志..." style="width: 100%; padding: 10px; border: 2px solid #ffd1b8; border-radius: 8px; color: #ff6b4a;" 
                       onkeyup="window.logs.filterLogs(this.value)">
            </div>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.logs.exportLogs()">📤 导出日志</button>
                <button class="btn btn-danger" onclick="window.logs.clearLogs()">🗑️ 清空日志</button>
            </div>
            
            <div id="logsList" style="max-height: 500px; overflow-y: auto;">
                ${(window.appData.logs || []).map(log => `
                    <div class="log-item" data-content="${log.student_name || ''} ${log.action || ''} ${log.reason || ''}" 
                         style="padding: 15px; margin: 10px 0; background: #fff6f0; border-radius: 8px; border-left: 3px solid ${log.score_change > 0 ? '#ff9f4e' : '#ff4e4e'};">
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #ff6b4a;">📅 ${log.timestamp || ''}</span>
                            <span style="color: ${log.score_change > 0 ? '#ff9f4e' : '#ff4e4e'}; font-weight: bold;">
                                ${log.score_change > 0 ? '+' : ''}${log.score_change}
                            </span>
                        </div>
                        <div style="margin-top: 5px; color: #ff6b4a;">
                            <strong>${log.student_name || '未知'}</strong> ${log.action || ''}
                            ${log.reason ? `- ${log.reason}` : ''}
                        </div>
                        <div style="margin-top: 5px; color: #ff8f4e;">
                            ｜ 当前分数: ${log.current_score || 0}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function exportLogs() {
    const logs = window.appData.logs || [];
    const dataStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${window.utils.formatDate().replace(/[: ]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function clearLogs() {
    if (confirm('确定要清空所有操作日志吗？')) {
        window.appData.logs = [];
        window.dataManager.saveData('logs');
        showLogs();
        window.modal.notify('日志已清空', 'success');
    }
}

function filterLogs(keyword) {
    const logs = document.querySelectorAll('.log-item');
    logs.forEach(log => {
        const content = log.getAttribute('data-content') || '';
        log.style.display = content.includes(keyword) ? '' : 'none';
    });
}

// 导出到全局
window.logs = {
    showLogs,
    exportLogs,
    clearLogs,
    filterLogs
};
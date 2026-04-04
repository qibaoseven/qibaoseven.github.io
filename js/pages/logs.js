// ==================== 操作日志页面 ====================

function showLogs() {
    if (!window.auth.hasPermission('操作日志')) {
        alert('权限不足');
        return;
    }
    
    const logs = window.appData.logs || [];
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">📋 操作日志</h2>
            
            <div style="margin-bottom: 20px;">
                <input type="text" id="logSearchInput" placeholder="搜索日志（姓名、操作、原因）..." 
                       style="width: 100%; padding: 10px; border: 2px solid #ffd1b8; border-radius: 8px; color: #ff6b4a;" 
                       onkeyup="window.logs.filterLogs(this.value)">
            </div>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.logs.exportLogs()">📤 导出日志</button>
                <button class="btn btn-danger" onclick="window.logs.clearLogs()">🗑️ 清空日志</button>
                <button class="btn btn-primary" onclick="window.logs.showLogStats()">📊 统计信息</button>
            </div>
            
            <div style="margin-top: 20px; color: #ff8f4e;">
                共 ${logs.length} 条日志，显示最新50条
            </div>
            
            <div id="logsList" style="max-height: 500px; overflow-y: auto;">
                ${logs.slice(0, 50).map(log => {
                    const scoreChange = log.score_change || 0;
                    return `
                        <div class="log-item" data-content="${(log.student_name || '')} ${(log.action || '')} ${(log.reason || '')}" 
                             style="padding: 15px; margin: 10px 0; background: #fff6f0; border-radius: 8px; border-left: 3px solid ${scoreChange > 0 ? '#ff9f4e' : scoreChange < 0 ? '#ff4e4e' : '#ffb84e'};">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #ff6b4a;">📅 ${log.timestamp || ''}</span>
                                <span style="color: ${scoreChange > 0 ? '#ff9f4e' : scoreChange < 0 ? '#ff4e4e' : '#ffb84e'}; font-weight: bold;">
                                    ${scoreChange > 0 ? '+' : ''}${scoreChange}
                                </span>
                            </div>
                            <div style="margin-top: 5px; color: #ff6b4a;">
                                <strong>${log.student_name || '未知'}</strong> ${log.action || ''}
                                ${log.reason ? `- ${log.reason}` : ''}
                            </div>
                            <div style="margin-top: 5px; color: #ff8f4e; display: flex; justify-content: space-between;">
                                <span>🎓 当前分数: ${log.current_score || 0}</span>
                                <span>👤 ${log.user_role || 'unknown'}</span>
                            </div>
                            <div style="margin-top: 5px; font-size: 0.9em; color: #ffb84e;">
                                📄 页面: ${log.page || 'unknown'}
                            </div>
                        </div>
                    `;
                }).join('')}
                ${logs.length === 0 ? '<p style="color: #ff8f4e; text-align: center;">暂无日志记录</p>' : ''}
            </div>
        </div>
    `;
}

// ==================== 修复：导出日志 ====================
function exportLogs() {
    try {
        const logs = window.appData.logs || [];
        
        if (logs.length === 0) {
            alert('没有日志可导出');
            return;
        }
        
        // 构建导出数据
        const exportData = {
            logs: logs,
            metadata: {
                exportTime: new Date().toISOString(),
                totalCount: logs.length,
                user: window.currentUser?.username || 'unknown',
                dateRange: logs.length > 0 ? {
                    from: logs[logs.length - 1]?.timestamp,
                    to: logs[0]?.timestamp
                } : null
            }
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 生成文件名：logs_2026-03-07_14-30-25.json
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        a.download = `logs_${dateStr}_${timeStr}.json`;
        
        a.click();
        URL.revokeObjectURL(url);
        
        window.utils.addLog('导出日志', 'system', 0, 0, `导出 ${logs.length} 条日志`);
        window.modal.notify(`✅ 成功导出 ${logs.length} 条日志`, 'success');
    } catch (error) {
        console.error('导出日志失败:', error);
        alert('❌ 导出失败：' + error.message);
    }
}

function clearLogs() {
    if (confirm('确定要清空所有操作日志吗？')) {
        window.appData.logs = [];
        window.dataManager.saveData('logs');
        window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
        showLogs();
        window.modal.notify('日志已清空', 'success');
    }
}

function filterLogs(keyword) {
    const logs = document.querySelectorAll('.log-item');
    const keywordLower = keyword.toLowerCase();
    
    logs.forEach(log => {
        const content = log.getAttribute('data-content') || '';
        if (content.toLowerCase().includes(keywordLower)) {
            log.style.display = '';
        } else {
            log.style.display = 'none';
        }
    });
}

function showLogStats() {
    const logs = window.appData.logs || [];
    
    // 统计各类型操作
    const actionStats = {};
    const userStats = {};
    const pageStats = {};
    let totalAdd = 0;
    let totalDeduct = 0;
    
    logs.forEach(log => {
        const action = log.action || '未知';
        actionStats[action] = (actionStats[action] || 0) + 1;
        
        const user = log.student_name || '未知';
        userStats[user] = (userStats[user] || 0) + 1;
        
        const page = log.page || '未知';
        pageStats[page] = (pageStats[page] || 0) + 1;
        
        const change = log.score_change || 0;
        if (change > 0) totalAdd += change;
        if (change < 0) totalDeduct += Math.abs(change);
    });
    
    // 排序
    const topActions = Object.entries(actionStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    const topUsers = Object.entries(userStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    window.modal.show('日志统计信息', `
        <div style="max-height: 400px; overflow-y: auto;">
            <h4 style="color: #ff4e4e;">📊 总体统计</h4>
            <div style="background: #fff6f0; padding: 15px; border-radius: 8px;">
                <p>总日志数: ${logs.length} 条</p>
                <p>总加分: +${totalAdd} 分</p>
                <p>总扣分: -${totalDeduct} 分</p>
                <p>净变化: ${totalAdd - totalDeduct} 分</p>
            </div>
            
            <h4 style="margin-top: 20px; color: #ff4e4e;">🔥 热门操作 TOP10</h4>
            <div style="background: #fff6f0; padding: 15px; border-radius: 8px;">
                ${topActions.map(([action, count]) => `
                    <p>${action}: ${count} 次</p>
                `).join('')}
            </div>
            
            <h4 style="margin-top: 20px; color: #ff4e4e;">👤 活跃用户 TOP10</h4>
            <div style="background: #fff6f0; padding: 15px; border-radius: 8px;">
                ${topUsers.map(([user, count]) => `
                    <p>${user}: ${count} 次</p>
                `).join('')}
            </div>
            
            <h4 style="margin-top: 20px; color: #ff4e4e;">📄 页面访问统计</h4>
            <div style="background: #fff6f0; padding: 15px; border-radius: 8px;">
                ${Object.entries(pageStats).map(([page, count]) => `
                    <p>${page}: ${count} 次</p>
                `).join('')}
            </div>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

// 导出到全局
window.logs = {
    showLogs,
    exportLogs,
    clearLogs,
    filterLogs,
    showLogStats
};
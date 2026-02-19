// ==================== 数据备份页面 ====================

function showBackup() {
    if (!window.auth.hasPermission('数据备份')) {
        alert('权限不足');
        return;
    }
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">💾 数据备份</h2>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.backup.exportData()">📤 导出数据</button>
                <button class="btn btn-primary" onclick="window.backup.importData()">📂 导入数据</button>
                <button class="btn btn-danger" onclick="window.backup.resetToDefault()">🔄 恢复默认</button>
                <button class="btn btn-primary" onclick="window.backup.syncToExcel()">📊 同步到Excel</button>
            </div>
            
            <div class="stats-grid" style="margin-top: 30px;">
                <div class="stat-card">
                    <div class="stat-value">${(JSON.stringify(localStorage).length / 1024).toFixed(2)}</div>
                    <div class="stat-label">本地存储 (KB)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${Object.keys(window.appData.users).length}</div>
                    <div class="stat-label">用户数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${Object.keys(window.appData.scores).length}</div>
                    <div class="stat-label">学生数</div>
                </div>
            </div>
            
            <div style="margin-top: 30px;">
                <h3 style="color: #ff4e4e;">📋 备份文件列表</h3>
                <div style="background: #fff6f0; padding: 20px; border-radius: 10px;">
                    <p style="color: #ff6b4a;">本地存储中的数据：</p>
                    <ul style="margin-top: 10px; list-style: none;">
                        ${Object.keys(window.dataManager.STORAGE_KEYS).map(key => {
                            const size = localStorage.getItem(window.dataManager.STORAGE_KEYS[key])?.length || 0;
                            return `
                                <li style="margin: 5px 0; padding: 5px; border-bottom: 1px solid #ffd1b8;">
                                    <span style="color: #ff4e4e;">📁 ${key}</span>
                                    <span style="color: #ff8f4e; float: right;">${size} 字节</span>
                                </li>
                            `;
                        }).join('')}
                    </ul>
                </div>
            </div>
        </div>
    `;
}

function syncToExcel() {
    window.modal.show('Excel同步', `
        <div style="padding: 20px; text-align: center;">
            <p style="color: #ff6b4a;">Excel同步功能需要与后端配合使用</p>
            <p style="color: #ff8f4e;">当前版本支持JSON数据导出</p>
            <div style="margin-top: 20px;">
                <button class="btn btn-primary" onclick="window.backup.exportData()">📤 导出JSON</button>
            </div>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function exportData() {
    const data = {};
    Object.keys(window.dataManager.STORAGE_KEYS).forEach(key => {
        data[key] = window.appData[key.toLowerCase()];
    });
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studentos_backup_${window.utils.formatDate().replace(/[: ]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    window.modal.notify('数据导出成功！', 'success');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const imported = JSON.parse(e.target.result);
                let count = 0;
                Object.keys(window.dataManager.STORAGE_KEYS).forEach(key => {
                    const dataKey = key.toLowerCase();
                    if (imported[key]) {
                        localStorage.setItem(window.dataManager.STORAGE_KEYS[key], JSON.stringify(imported[key]));
                        window.appData[dataKey] = imported[key];
                        count++;
                    }
                });
                alert(`✅ 成功导入 ${count} 个数据文件`);
                window.modal.notify('数据导入成功！页面即将刷新', 'success');
                setTimeout(() => location.reload(), 1500);
            } catch (err) {
                alert('❌ 导入失败：无效的数据文件');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function resetToDefault() {
    window.modal.show('恢复默认数据', `
        <div style="padding: 20px;">
            <div class="warning-box">
                ⚠️ 确定要恢复默认数据吗？当前所有数据将被覆盖！
            </div>
            <div style="margin-top: 20px;">
                <label style="color: #ff6b4a;">
                    <input type="checkbox" id="confirmReset"> 我确认要恢复默认数据
                </label>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认恢复', onclick: 'window.backup.handleResetToDefault()', className: 'btn-danger' }
    ]);
}

function handleResetToDefault() {
    const confirm = document.getElementById('confirmReset')?.checked;
    if (!confirm) {
        alert('请先确认恢复操作');
        return;
    }
    
    window.appData.users = { ...window.dataManager.DEFAULT_DATA.users };
    window.appData.scores = { ...window.dataManager.DEFAULT_DATA.scores };
    window.appData.groups = { ...window.dataManager.DEFAULT_DATA.groups };
    window.appData.rules = { ...window.dataManager.DEFAULT_DATA.rules };
    window.appData.rewards = { ...window.dataManager.DEFAULT_DATA.rewards };
    window.appData.punishments = { ...window.dataManager.DEFAULT_DATA.punishments };
    window.appData.exchangeRate = { ...window.dataManager.DEFAULT_DATA.exchangeRate };
    window.appData.emoji = window.dataManager.DEFAULT_DATA.emoji;
    window.appData.userPunishments = { ...window.dataManager.DEFAULT_DATA.userPunishments };
    window.appData.gold = { ...window.dataManager.DEFAULT_DATA.gold };
    window.appData.dailyReport = { ...window.dataManager.DEFAULT_DATA.dailyReport };
    
    window.dataManager.saveAllData();
    
    window.modal.close();
    alert('✅ 已恢复默认数据，页面即将刷新');
    setTimeout(() => location.reload(), 1500);
}

// 导出到全局
window.backup = {
    showBackup,
    syncToExcel,
    exportData,
    importData,
    resetToDefault,
    handleResetToDefault
};
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
                <button class="btn btn-primary" onclick="window.backup.importData()">📂 导入单个文件</button>
                <button class="btn btn-success" onclick="window.backup.showImportFolder()">📁 导入文件夹</button>
                <button class="btn btn-danger" onclick="window.backup.resetToDefault()">🔄 恢复默认</button>
                <button class="btn btn-primary" onclick="window.backup.syncToExcel()">📊 同步到Excel</button>
            </div>
            
            <div class="stats-grid" style="margin-top: 30px;">
                <div class="stat-card">
                    <div class="stat-value">${(JSON.stringify(localStorage).length / 1024).toFixed(2)}</div>
                    <div class="stat-label">本地缓存 (KB)</div>
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
                <h3 style="color: #ff4e4e;">📋 数据文件映射</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>文件名</th>
                            <th>数据键</th>
                            <th>说明</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>user.json</td><td>users</td><td>用户数据</td></tr>
                        <tr><td>score.json</td><td>scores</td><td>分数数据</td></tr>
                        <tr><td>gold_data.json</td><td>gold</td><td>金币数据</td></tr>
                        <tr><td>rewards.json</td><td>rewards</td><td>奖励数据</td></tr>
                        <tr><td>punishment.json</td><td>punishments</td><td>惩罚数据</td></tr>
                        <tr><td>usr_pun.json</td><td>userPunishments</td><td>用户惩罚数据</td></tr>
                        <tr><td>log.json</td><td>logs</td><td>操作日志</td></tr>
                        <tr><td>score_rules.json</td><td>rules</td><td>积分规则</td></tr>
                        <tr><td>exchange_rate.json</td><td>exchangeRate</td><td>汇率数据</td></tr>
                        <tr><td>emoji.json</td><td>emoji</td><td>表情数据</td></tr>
                        <tr><td>daily_report.json</td><td>dailyReport</td><td>每日汇报</td></tr>
                    </tbody>
                </table>
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

// ==================== 新增：文件夹导入功能 ====================

function showImportFolder() {
    window.modal.show('导入文件夹', `
        <div style="padding: 20px;">
            <div class="info-box">
                <strong style="color: #ff4e4e;">📁 文件夹导入说明：</strong><br>
                • 选择包含JSON数据文件的文件夹<br>
                • 系统会自动识别并导入所有匹配的文件<br>
                • 支持的文件名：user.json, score.json, rewards.json 等<br>
                • 导入后会合并到现有数据中
            </div>
            
            <div class="folder-input-container" style="margin: 20px 0;">
                <input type="file" id="folderInput" webkitdirectory directory multiple style="display: none;">
                <label for="folderInput" class="folder-label" id="folderLabel">
                    📂 点击选择文件夹<br>
                    <span class="small">支持批量导入多个JSON文件</span>
                </label>
            </div>
            
            <div id="importPreview" style="display: none; margin-top: 20px;">
                <h4 style="color: #ff4e4e;">📋 文件列表</h4>
                <div id="fileList" class="file-list"></div>
                
                <div style="margin-top: 20px;">
                    <label style="color: #ff6b4a;">
                        <input type="checkbox" id="confirmImport"> 我确认要导入这些数据
                    </label>
                </div>
            </div>
            
            <div id="importResult" style="margin-top: 20px;"></div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '开始导入', onclick: 'window.backup.handleFolderImport()', className: 'btn-success' }
    ]);
    
    // 监听文件夹选择
    document.getElementById('folderInput').onchange = function(e) {
        window.backup.previewFolderFiles(e.target.files);
    };
}

function previewFolderFiles(files) {
    const fileList = document.getElementById('fileList');
    const importPreview = document.getElementById('importPreview');
    
    if (!fileList || !importPreview) return;
    
    const jsonFiles = Array.from(files).filter(f => f.name.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
        fileList.innerHTML = '<p style="color: #ff4e4e;">未找到JSON文件</p>';
        return;
    }
    
    // 按文件名分组
    const fileGroups = {};
    jsonFiles.forEach(file => {
        const baseName = file.name.replace('.json', '');
        fileGroups[baseName] = fileGroups[baseName] || [];
        fileGroups[baseName].push(file);
    });
    
    let html = '';
    jsonFiles.forEach(file => {
        const dataKey = window.utils.FILE_TO_DATA_KEY[file.name.replace('.json', '')] || '未知';
        html += `
            <div class="file-item" style="display: flex; justify-content: space-between;">
                <span>📄 ${file.name}</span>
                <span style="color: ${dataKey !== '未知' ? '#ff9f4e' : '#ff4e4e'};">${dataKey}</span>
            </div>
        `;
    });
    
    fileList.innerHTML = html;
    importPreview.style.display = 'block';
    
    // 保存文件列表供后续使用
    window.backup.selectedFiles = jsonFiles;
}

async function handleFolderImport() {
    const confirm = document.getElementById('confirmImport')?.checked;
    if (!confirm) {
        alert('请先确认导入操作');
        return;
    }
    
    if (!window.backup.selectedFiles || window.backup.selectedFiles.length === 0) {
        alert('请先选择文件夹');
        return;
    }
    
    const importResult = document.getElementById('importResult');
    importResult.innerHTML = '<div class="info-box">⏳ 正在导入数据...</div>';
    
    try {
        // 导入文件夹数据
        const result = await window.utils.importFolderData(window.backup.selectedFiles);
        
        if (!result.success) {
            importResult.innerHTML = `<div class="warning-box">❌ 导入失败：${result.message}</div>`;
            return;
        }
        
        // 批量导入到appData
        const importResults = window.dataManager.batchImportData(result.imported);
        
        // 显示导入结果
        importResult.innerHTML = `
            <div class="success-box">
                ✅ 导入成功！<br>
                成功导入: ${importResults.success.length} 个数据文件<br>
                失败: ${importResults.failed.length} 个<br>
                总文件数: ${result.details.success.length} 个
            </div>
        `;
        
        // 显示详细映射
        if (Object.keys(result.mapping).length > 0) {
            let mappingHtml = '<div style="margin-top: 15px;"><h5 style="color: #ff4e4e;">📊 文件映射结果：</h5>';
            Object.entries(result.mapping).forEach(([file, dataKey]) => {
                mappingHtml += `<p style="color: #ff6b4a;">📄 ${file}.json → ${dataKey}</p>`;
            });
            mappingHtml += '</div>';
            importResult.innerHTML += mappingHtml;
        }
        
        if (result.details.failed.length > 0) {
            importResult.innerHTML += `
                <div class="warning-box" style="margin-top: 15px;">
                    ⚠️ 以下文件解析失败：<br>
                    ${result.details.failed.map(f => `📄 ${f}`).join('<br>')}
                </div>
            `;
        }
        
        window.modal.notify('数据导入成功！', 'success');
        
    } catch (error) {
        console.error('导入失败:', error);
        importResult.innerHTML = `<div class="warning-box">❌ 导入失败：${error.message}</div>`;
    }
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
    
    window.modal.show('需要云端数据', `
        <div style="padding: 20px;">
            <p style="color: #ff6b4a;">恢复默认数据需要从云端获取初始数据。</p>
            <p style="color: #ff8f4e;">请确保网络连接正常，然后点击下方按钮。</p>
            <button class="btn btn-primary" onclick="window.backup.loadDefaultFromCloud()">☁️ 从云端加载默认数据</button>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' }
    ]);
}

async function loadDefaultFromCloud() {
    window.modal.close();
    
    // 这里可以设置一个默认的云端Bin ID，或者让用户输入
    // 暂时使用现有的云端数据作为"默认"
    const result = await window.dataManager.loadFromCloud();
    
    if (result.success) {
        alert('✅ 已从云端加载最新数据作为默认');
        window.modal.notify('数据加载成功！', 'success');
        setTimeout(() => location.reload(), 1500);
    } else {
        alert('❌ 从云端加载失败：' + result.error);
    }
}

// 导出到全局
window.backup = {
    showBackup,
    syncToExcel,
    exportData,
    importData,
    resetToDefault,
    handleResetToDefault,
    loadDefaultFromCloud,
    // 新增
    showImportFolder,
    previewFolderFiles,
    handleFolderImport,
    selectedFiles: []
};
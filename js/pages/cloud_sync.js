// ==================== 云端同步页面 ====================

function showCloudSync() {
    if (!window.auth.hasPermission('云端同步')) {
        alert('权限不足');
        return;
    }
    
    const lastSync = window.appData.cloudMeta?.lastSync ? new Date(window.appData.cloudMeta.lastSync).toLocaleString() : '从未同步';
    const isConfigured = window.CLOUD_CONFIG?.binId && window.CLOUD_CONFIG?.masterKey;
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">☁️ 云端同步</h2>
            
            <div class="info-box">
                <strong style="color: #ff4e4e;">📌 云端状态：</strong><br>
                • 最后同步时间：${lastSync}<br>
                • 本地数据版本：${window.appData.cloudMeta?.updated || 0}<br>
                • 同步模式：<strong>完全云端模式</strong><br>
                • 连接状态：${navigator.onLine ? '✅ 在线' : '❌ 离线'}<br>
                • 配置状态：${isConfigured ? '✅ 已配置' : '❌ 未配置'}<br>
                • Bin ID: ${window.CLOUD_CONFIG?.binId || '未设置'}
            </div>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.cloudSync.showCloudUpload()">
                    📤 上传到云端
                </button>
                <button class="btn btn-primary" onclick="window.cloudSync.showCloudDownload()">
                    📥 从云端下载
                </button>
                <button class="btn btn-primary" onclick="window.cloudSync.testCloudConnection()">
                    📡 测试连接
                </button>
                <button class="btn btn-primary" onclick="window.cloudSync.showCloudConfig()">
                    ⚙️ 重新配置
                </button>
                <button class="btn btn-danger" onclick="window.cloudSync.clearLocalCache()">
                    🗑️ 清除缓存
                </button>
            </div>
            
            <div class="info-box" style="background: #fff6f0;">
                <strong style="color: #ff4e4e;">📢 说明：</strong><br>
                • 本系统使用<strong>完全云端模式</strong><br>
                • 所有数据都存储在云端服务器<br>
                • 本地仅作为缓存，用于离线访问<br>
                • 每次打开页面都会自动从云端加载最新数据
            </div>
            
            <div id="cloudSyncStatus" style="margin-top: 20px;"></div>
        </div>
    `;
}

async function testCloudConnection() {
    const statusDiv = document.getElementById('cloudSyncStatus');
    if (statusDiv) {
        statusDiv.innerHTML = '<div class="info-box">⏳ 正在测试云端连接...</div>';
    }
    
    try {
        const result = await window.dataManager.testCloudConnection();
        
        if (result.success) {
            statusDiv.innerHTML = `
                <div class="success-box">
                    ✅ 云端连接正常！<br>
                    数据版本：${result.version}<br>
                    最后同步：${result.lastSync ? new Date(result.lastSync).toLocaleString() : '未知'}
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <div class="warning-box">
                    ❌ 云端连接失败：${result.error}
                </div>
            `;
        }
    } catch (error) {
        statusDiv.innerHTML = `
            <div class="warning-box">
                ❌ 测试失败：${error.message}
            </div>
        `;
    }
}

function clearLocalCache() {
    if (confirm('确定要清除本地缓存吗？下次打开页面时会重新从云端加载。')) {
        window.dataManager.clearLocalCache();
        window.modal.notify('本地缓存已清除', 'success');
        updateCloudStatus(false);
    }
}

function updateCloudStatus(isOnline) {
    const cloudIcon = document.getElementById('cloudIcon');
    const cloudText = document.getElementById('cloudText');
    const cloudStatus = document.getElementById('cloudStatus');
    
    if (cloudIcon) cloudIcon.textContent = isOnline ? '☁️✅' : '☁️⚠️';
    if (cloudText) cloudText.textContent = isOnline ? '云端在线' : '离线模式';
    if (cloudStatus) {
        cloudStatus.className = isOnline ? 'cloud-status online' : 'cloud-status offline';
    }
}

// ==================== 上传/下载相关函数 ====================

function showCloudUpload() {
    window.modal.show('上传到云端', `
        <div style="margin: 20px 0;">
            <p style="color: #ff6b4a;">将当前所有本地数据上传到云端，会覆盖云端现有数据。</p>
            
            <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
                <div class="stat-card">
                    <div class="stat-value">${Object.keys(window.appData.users).length}</div>
                    <div class="stat-label">用户数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${Object.keys(window.appData.scores).length}</div>
                    <div class="stat-label">学生数</div>
                </div>
            </div>
            
            <div style="margin-top: 20px;">
                <label style="color: #ff6b4a;">
                    <input type="checkbox" id="confirmUpload"> 我确认要上传数据到云端
                </label>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '开始上传', onclick: 'window.cloudSync.handleCloudUpload()', className: 'btn-primary' }
    ]);
}

async function handleCloudUpload() {
    const confirm = document.getElementById('confirmUpload')?.checked;
    if (!confirm) {
        alert('请先确认上传操作');
        return;
    }
    
    window.modal.close();
    
    const statusDiv = document.getElementById('cloudSyncStatus');
    if (statusDiv) {
        statusDiv.innerHTML = '<div class="info-box">⏳ 正在上传数据到云端...</div>';
    }
    
    try {
        const result = await window.dataManager.saveToCloud();
        
        if (result.success) {
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <div class="success-box">
                        ✅ 上传成功！<br>
                        版本号：${window.appData.cloudMeta.updated}<br>
                        时间：${new Date().toLocaleString()}
                    </div>
                `;
            }
            
            alert('✅ 数据上传成功！');
            
            // 更新云端状态
            const cloudIcon = document.getElementById('cloudIcon');
            const cloudText = document.getElementById('cloudText');
            const cloudStatus = document.getElementById('cloudStatus');
            
            if (cloudIcon) cloudIcon.textContent = '☁️✅';
            if (cloudText) cloudText.textContent = '云端已同步';
            if (cloudStatus) cloudStatus.className = 'cloud-status online';
            
        } else {
            if (statusDiv) {
                statusDiv.innerHTML = `<div class="warning-box">❌ 上传失败：${result.error}</div>`;
            }
            alert('❌ 上传失败：' + result.error);
        }
    } catch (error) {
        console.error('上传失败:', error);
        if (statusDiv) {
            statusDiv.innerHTML = `<div class="warning-box">❌ 上传失败：${error.message}</div>`;
        }
        alert('❌ 上传失败：' + error.message);
    }
}

function showCloudDownload() {
    window.modal.show('从云端下载', `
        <div style="margin: 20px 0;">
            <p style="color: #ff6b4a;">从云端下载最新数据，会覆盖当前所有本地数据。</p>
            
            <div class="warning-box">
                ⚠️ 此操作将用云端数据替换本地数据，请确认已备份重要数据。
            </div>
            
            <div style="margin-top: 20px;">
                <label style="color: #ff6b4a;">
                    <input type="checkbox" id="confirmDownload"> 我确认要下载并覆盖本地数据
                </label>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '开始下载', onclick: 'window.cloudSync.handleCloudDownload()', className: 'btn-primary' }
    ]);
}

async function handleCloudDownload() {
    const confirm = document.getElementById('confirmDownload')?.checked;
    if (!confirm) {
        alert('请先确认下载操作');
        return;
    }
    
    window.modal.close();
    
    const statusDiv = document.getElementById('cloudSyncStatus');
    if (statusDiv) {
        statusDiv.innerHTML = '<div class="info-box">⏳ 正在从云端下载数据...</div>';
    }
    
    try {
        const result = await window.dataManager.loadFromCloud();
        
        if (result.success) {
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <div class="success-box">
                        ✅ 下载成功！<br>
                        版本号：${window.appData.cloudMeta.updated}<br>
                        时间：${new Date().toLocaleString()}
                    </div>
                `;
            }
            
            alert('✅ 数据下载成功！');
            
            // 更新云端状态
            updateCloudStatus(true);
            
            // 刷新当前页面显示
            if (window.currentUser) {
                window.dashboard.showDashboard();
            }
            
        } else {
            if (statusDiv) {
                statusDiv.innerHTML = `<div class="warning-box">❌ 下载失败：${result.error}</div>`;
            }
            alert('❌ 下载失败：' + result.error);
        }
    } catch (error) {
        console.error('下载失败:', error);
        if (statusDiv) {
            statusDiv.innerHTML = `<div class="warning-box">❌ 下载失败：${error.message}</div>`;
        }
        alert('❌ 下载失败：' + error.message);
    }
}

function showCloudConfig() {
    window.modal.show('云端配置', `
        <div style="margin: 20px 0;">
            <p style="color: #ff6b4a;">当前配置的 Bin ID:</p>
            <p style="background: #fff6f0; padding: 10px; border-radius: 8px; font-family: monospace; color: #ff4e4e;">${window.CLOUD_CONFIG?.binId || '未设置'}</p>
            
            <p style="color: #ff8f4e;">如需修改配置，请直接修改代码中的 CLOUD_CONFIG 变量。</p>
            
            <div class="info-box">
                <strong style="color: #ff4e4e;">如何获取 Bin ID?</strong><br>
                1. 访问 https://jsonbin.io/<br>
                2. 注册/登录账号<br>
                3. 创建新的 Bin<br>
                4. 复制 Bin ID 和 Master Key
            </div>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

// 导出到全局
window.cloudSync = {
    showCloudSync,
    testCloudConnection,
    clearLocalCache,
    showCloudUpload,
    handleCloudUpload,
    showCloudDownload,
    handleCloudDownload,
    showCloudConfig
}; = await window.dataManager.downloadFromCloud();
        
        if (cloudData.users) window.appData.users = cloudData.users;
        if (cloudData.scores) window.appData.scores = cloudData.scores;
        if (cloudData.groups) window.appData.groups = cloudData.groups;
        if (cloudData.rules) window.appData.rules = cloudData.rules;
        if (cloudData.logs) window.appData.logs = cloudData.logs;
        if (cloudData.rewards) window.appData.rewards = cloudData.rewards;
        if (cloudData.punishments) window.appData.punishments = cloudData.punishments;
        if (cloudData.userPunishments) window.appData.userPunishments = cloudData.userPunishments;
        if (cloudData.gold) window.appData.gold = cloudData.gold;
        if (cloudData.exchangeRate) window.appData.exchangeRate = cloudData.exchangeRate;
        if (cloudData.emoji) window.appData.emoji = cloudData.emoji;
        if (cloudData.dailyReport) window.appData.dailyReport = cloudData.dailyReport;
        
        if (cloudData.cloudMeta) {
            window.appData.cloudMeta = cloudData.cloudMeta;
        } else {
            window.appData.cloudMeta = {
                updated: 1,
                lastSync: new Date().toISOString(),
                version: '1.0'
            };
        }
        
        window.dataManager.saveAllData();
        
        if (statusDiv) {
            statusDiv.innerHTML = `
                <div class="success-box">
                    ✅ 下载成功！<br>
                    版本号：${window.appData.cloudMeta.updated}<br>
                    时间：${new Date().toLocaleString()}
                </div>
            `;
        }
        
        alert('✅ 数据下载成功！页面即将刷新...');
        setTimeout(() => location.reload(), 1500);
        
    } catch (error) {
        console.error('下载失败:', error);
        if (statusDiv) {
            statusDiv.innerHTML = `<div class="warning-box">❌ 下载失败：${error.message}</div>`;
        }
        alert('❌ 下载失败：' + error.message);
    }
}

function showCloudConfig() {
    window.modal.show('云端配置', `
        <div style="margin: 20px 0;">
            <p style="color: #ff6b4a;">当前配置的 Bin ID:</p>
            <p style="background: #fff6f0; padding: 10px; border-radius: 8px; font-family: monospace; color: #ff4e4e;">${window.CLOUD_CONFIG?.binId || '未设置'}</p>
            
            <p style="color: #ff8f4e;">如需修改配置，请直接修改代码中的 CLOUD_CONFIG 变量。</p>
            
            <div class="info-box">
                <strong style="color: #ff4e4e;">如何获取 Bin ID?</strong><br>
                1. 访问 https://jsonbin.io/<br>
                2. 注册/登录账号<br>
                3. 创建新的 Bin<br>
                4. 复制 Bin ID 和 Master Key
            </div>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

// 导出到全局
window.cloudSync = {
    showCloudSync,
    refreshFromCloud,
    saveToCloud,
    testCloudConnection,
    clearLocalCache,
    showCloudUpload,
    handleCloudUpload,
    showCloudDownload,
    handleCloudDownload,
    showCloudConfig
};nnection,
    clearLocalCache,
    showCloudUpload,
    handleCloudUpload,
    showCloudDownload,
    handleCloudDownload,
    showCloudConfig
};
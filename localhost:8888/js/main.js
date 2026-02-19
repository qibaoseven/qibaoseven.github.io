// ==================== 主初始化文件 ====================

// 页面加载初始化
window.onload = async function() {
    // 显示加载界面
    const loadingScreen = document.getElementById('loadingScreen');
    const progressFill = document.getElementById('progressFill');
    const syncStatus = document.getElementById('syncStatus');
    const loadingAnimation = document.getElementById('loadingAnimation');
    
    // 更新加载状态
    function updateProgress(percent, message, emoji = '☁️') {
        progressFill.style.width = percent + '%';
        syncStatus.textContent = message;
        loadingAnimation.textContent = emoji;
    }
    
    try {
        // 步骤1: 尝试从本地存储加载
        updateProgress(20, '正在读取本地数据...', '💾');
        const hasData = window.dataManager.loadFromStorage();
        
        // 步骤2: 尝试从云端下载
        updateProgress(40, '正在连接云端...', '☁️');
        
        let cloudData = null;
        let cloudSuccess = false;
        
        try {
            cloudData = await window.dataManager.downloadFromCloud();
            cloudSuccess = true;
            updateProgress(60, '云端连接成功，正在同步...', '✅');
        } catch (cloudError) {
            console.warn('云端连接失败，使用本地模式:', cloudError);
            updateProgress(60, '云端连接失败，使用本地模式', '⚠️');
        }
        
        // 步骤3: 合并云端数据
        if (cloudSuccess && cloudData) {
            updateProgress(70, '正在合并云端数据...', '🔄');
            
            // 合并用户数据
            if (cloudData.users) {
                window.appData.users = { ...window.appData.users, ...cloudData.users };
            }
            
            // 合并分数数据
            if (cloudData.scores) {
                window.appData.scores = { ...window.appData.scores, ...cloudData.scores };
            }
            
            // 合并分组数据
            if (cloudData.groups) {
                Object.entries(cloudData.groups).forEach(([groupName, members]) => {
                    if (!window.appData.groups[groupName]) {
                        window.appData.groups[groupName] = [];
                    }
                    members.forEach(member => {
                        if (!window.appData.groups[groupName].includes(member)) {
                            window.appData.groups[groupName].push(member);
                        }
                    });
                });
            }
            
            // 合并规则数据
            if (cloudData.rules) window.appData.rules = cloudData.rules;
            
            // 合并日志数据（保留最新200条）
            if (cloudData.logs && Array.isArray(cloudData.logs)) {
                const allLogs = [...cloudData.logs, ...(window.appData.logs || [])];
                allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                window.appData.logs = allLogs.slice(0, 200);
            }
            
            // 合并奖励数据
            if (cloudData.rewards) window.appData.rewards = cloudData.rewards;
            
            // 合并惩罚数据
            if (cloudData.punishments) window.appData.punishments = cloudData.punishments;
            
            // 合并用户惩罚数据
            if (cloudData.userPunishments) {
                if (!window.appData.userPunishments) {
                    window.appData.userPunishments = { active: {}, completed: {} };
                }
                
                if (cloudData.userPunishments.active) {
                    Object.entries(cloudData.userPunishments.active).forEach(([userId, puns]) => {
                        if (!window.appData.userPunishments.active[userId]) {
                            window.appData.userPunishments.active[userId] = [];
                        }
                        window.appData.userPunishments.active[userId] = [
                            ...window.appData.userPunishments.active[userId],
                            ...puns
                        ];
                    });
                }
                
                if (cloudData.userPunishments.completed) {
                    Object.entries(cloudData.userPunishments.completed).forEach(([userId, puns]) => {
                        if (!window.appData.userPunishments.completed[userId]) {
                            window.appData.userPunishments.completed[userId] = [];
                        }
                        window.appData.userPunishments.completed[userId] = [
                            ...window.appData.userPunishments.completed[userId],
                            ...puns
                        ];
                    });
                }
            }
            
            // 合并金币数据
            if (cloudData.gold) {
                Object.entries(cloudData.gold).forEach(([userId, goldData]) => {
                    if (!window.appData.gold[userId] || window.appData.gold[userId].amount < goldData.amount) {
                        window.appData.gold[userId] = goldData;
                    }
                });
            }
            
            // 合并汇率数据
            if (cloudData.exchangeRate) window.appData.exchangeRate = cloudData.exchangeRate;
            
            // 合并每日汇报数据
            if (cloudData.dailyReport) {
                window.appData.dailyReport = { ...window.appData.dailyReport, ...cloudData.dailyReport };
            }
            
            // 更新云端元数据
            if (cloudData.cloudMeta) {
                window.appData.cloudMeta = {
                    ...cloudData.cloudMeta,
                    lastSync: new Date().toISOString(),
                    autoSync: true
                };
            } else {
                window.appData.cloudMeta = {
                    updated: 1,
                    lastSync: new Date().toISOString(),
                    autoSync: true
                };
            }
            
            updateProgress(85, '云端数据合并完成', '🎉');
        } else if (!hasData) {
            // 既没有本地数据也没有云端数据，使用默认数据
            updateProgress(70, '正在加载默认数据...', '📦');
            
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
            
            window.appData.cloudMeta = {
                updated: 0,
                lastSync: null,
                autoSync: false
            };
        }
        
        // 步骤4: 保存所有数据到本地
        updateProgress(95, '正在保存数据...', '💿');
        window.dataManager.saveAllData();
        
        // 步骤5: 完成，显示登录界面
        updateProgress(100, '加载完成！', '✨');
        
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            document.getElementById('loginScreen').style.display = 'block';
            window.auth.renderUserSelect();
            
            // 显示云端同步状态
            const cloudStatus = document.getElementById('cloudStatus');
            if (cloudStatus) {
                const cloudIcon = document.getElementById('cloudIcon');
                const cloudText = document.getElementById('cloudText');
                
                if (cloudSuccess) {
                    cloudIcon.textContent = '☁️✅';
                    cloudText.textContent = '云端已同步';
                    cloudStatus.className = 'cloud-status online';
                } else {
                    cloudIcon.textContent = '☁️⚠️';
                    cloudText.textContent = '本地模式';
                    cloudStatus.className = 'cloud-status offline';
                }
            }
        }, 500);
        
    } catch (error) {
        console.error('初始化失败:', error);
        
        // 出错时使用默认数据
        updateProgress(100, '加载失败，使用默认数据', '❌');
        
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
        
        window.dataManager.saveAllData();
        
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            document.getElementById('loginScreen').style.display = 'block';
            window.auth.renderUserSelect();
            
            alert('⚠️ 云端同步失败，已使用本地数据。错误：' + error.message);
        }, 1000);
    }
};
// ==================== 主初始化文件 ====================

window.onload = async function() {
    const loadingScreen = document.getElementById('loadingScreen');
    const progressFill = document.getElementById('progressFill');
    const syncStatus = document.getElementById('syncStatus');
    const loadingAnimation = document.getElementById('loadingAnimation');
    
    function updateProgress(percent, message, emoji = '☁️') {
        progressFill.style.width = percent + '%';
        syncStatus.textContent = message;
        loadingAnimation.textContent = emoji;
    }
    
    try {
        updateProgress(20, '正在读取本地数据...', '💾');
        const hasData = window.dataManager.loadFromStorage();
        
        updateProgress(40, '正在连接云端...', '☁️');
        
        let cloudSuccess = false;
        
        try {
            await window.dataManager.loadFromCloud();
            cloudSuccess = true;
            updateProgress(60, '云端连接成功，正在同步...', '✅');
        } catch (cloudError) {
            console.warn('云端连接失败，使用本地模式:', cloudError);
            updateProgress(60, '云端连接失败，使用本地模式', '⚠️');
        }
        
        updateProgress(70, '正在执行每日检查...', '🔍');
        await window.dataManager.checkDailyReports();
        
        updateProgress(80, '正在执行自动事件...', '⚡');
        await window.dataManager.runAutoEvents();
        
        updateProgress(95, '正在保存数据...', '💿');
        window.dataManager.saveAllData();
        
        // ===== 不加任何类名 =====
        console.log('永远桌面版');
        // =======================
        
        updateProgress(100, '加载完成！', '✨');
        
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            document.getElementById('loginScreen').style.display = 'block';
            window.auth.renderUserSelect();
            
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
        
        updateProgress(100, '加载失败，使用默认数据', '❌');
        
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            document.getElementById('loginScreen').style.display = 'block';
            window.auth.renderUserSelect();
            alert('⚠️ 初始化失败：' + error.message);
        }, 1000);
    }
};

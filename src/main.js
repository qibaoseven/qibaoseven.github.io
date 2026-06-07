window.appData = null;
window.currentUser = null;
window.currentClassId = null;
window.classPassword = null;
window.currentPage = 'unknown';
window.autoSaveInterval = null;

window.saveAllDataToCloud = async function() {
    if (!window.currentClassId || !window.classPassword) return;
    if (!window.appData) return;
    
    try {
        const response = await fetch(`/api/class/${window.currentClassId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Password': window.classPassword
            },
            body: JSON.stringify({ data: window.appData })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                console.warn('密码错误，保存失败');
            } else {
                console.warn('保存失败');
            }
        }
    } catch (error) {
        console.warn('保存失败:', error);
    }
};

async function initApp() {
    document.getElementById('classSelectScreen').style.display = 'flex';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'none';
}

window.initApp = initApp;

document.addEventListener('DOMContentLoaded', async () => {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingScreen';
    loadingDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#ff4e4e,#ff9f4e);display:flex;justify-content:center;align-items:center;z-index:9999;color:white;font-size:1.5em;flex-direction:column;gap:20px;';
    loadingDiv.innerHTML = '<div>🏫 StudentOS</div><div style="font-size:0.8em;">加载中...</div>';
    document.body.appendChild(loadingDiv);
    
    try {
        const hasLocalData = false;
        
        if (window.currentClassId && window.classPassword) {
            try {
                const response = await fetch(`/api/class/${window.currentClassId}`, {
                    headers: { 'X-Password': window.classPassword }
                });
                if (response.ok) {
                    const result = await response.json();
                    window.appData = result.data;
                }
            } catch (e) {}
        }
        
        if (!window.appData) {
            window.appData = {
                users: {},
                scores: {},
                groups: {},
                rules: {},
                logs: [],
                rewards: {},
                punishments: {},
                userPunishments: { active: {}, completed: {} },
                gold: {},
                exchangeRate: { score_to_gold: 0.1, gold_to_score: 1, last_updated: null },
                emoji: { emojis: '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘' },
                dailyReport: {},
                autoEvents: [],
                positions: { list: {}, defaultSalary: 5, lastPayDate: null }
            };
        }
        
        loadingDiv.remove();
        initApp();
    } catch (error) {
        loadingDiv.innerHTML = '<div>❌ 加载失败</div><div style="font-size:0.8em;">请刷新页面重试</div>';
        console.error(error);
    }
});

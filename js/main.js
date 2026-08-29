// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
window.appData = null;
window.currentUser = null;
window.currentClassId = null;
window.classPassword = null;
window.classPasswordHash = null;
window.currentPage = 'unknown';
window.autoSaveInterval = null;

async function initApp() {
    document.getElementById('classSelectScreen').style.display = 'flex';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'none';
}

async function saveAllDataToCloud() {
    if (!window.currentClassId || !window.classPassword) return;
    if (!window.appData) return;
    
    if (!window.classPasswordHash) {
        window.classPasswordHash = await window.utils.hashPassword(window.classPassword);
    }
    
    try {
        const response = await fetch(`/.netlify/functions/api/class/${window.currentClassId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Password': window.classPassword,
                'X-Password-Hash': window.classPasswordHash
            },
            body: JSON.stringify({ data: window.appData })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                console.warn('密码错误，保存失败');
            } else {
                const errText = await response.text().catch(() => '');
                console.warn('保存失败:', response.status, errText);
            }
        }
    } catch (error) {
        console.warn('保存失败:', error);
    }
}

window.saveAllDataToCloud = saveAllDataToCloud;
window.initApp = initApp;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

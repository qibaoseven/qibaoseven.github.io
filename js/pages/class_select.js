// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// ==================== 班级选择页面 ====================
let selectedClassId = null;

// 清空 localStorage
function clearLocalStorage() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith('studentos_')) {
            localStorage.removeItem(key);
        }
    });
}

// API 基础路径
const API_BASE = '/.netlify/functions/api';

// 加载班级列表
async function loadClasses() {
    try {
        const response = await fetch(`${API_BASE}/classes`);
        if (!response.ok) throw new Error('加载失败');
        const classes = await response.json();
        
        const container = document.getElementById('classSlider');
        if (!container) return;
        
        if (classes.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #ff8f4e; padding: 40px;">暂无班级，请创建或导入</div>';
            return;
        }
        
        container.innerHTML = classes.map(cls => `
            <div class="class-card" data-id="${cls.id}" onclick="selectClass('${cls.id}')">
                <div class="class-icon">🏫</div>
                <div class="class-name">${escapeHtml(cls.name)}</div>
                <div class="class-date">创建于 ${new Date(cls.created_at).toLocaleDateString()}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载班级列表失败:', error);
        document.getElementById('classSlider').innerHTML = '<div style="text-align: center; color: #ff4e4e; padding: 40px;">加载失败，请刷新页面重试</div>';
    }
}

function selectClass(classId) {
    selectedClassId = classId;
    document.querySelectorAll('.class-card').forEach(card => {
        if (card.dataset.id === classId) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

// 进入班级
async function enterClass() {
    const password = document.getElementById('classPassword').value;
    if (!selectedClassId) {
        alert('请选择一个班级');
        return;
    }
    if (!password) {
        alert('请输入班级密码');
        return;
    }
    
    const passwordHash = await window.utils.hashPassword(password);
    
    try {
        const response = await fetch(`${API_BASE}/class/${selectedClassId}?_=${Date.now()}`, {
            headers: {
                'X-Password': password,
                'X-Password-Hash': passwordHash
            }
        });
        
        if (response.status === 401) {
            alert('密码错误');
            return;
        }
        if (!response.ok) {
            throw new Error('加载失败');
        }
        
        const result = await response.json();
        window.appData = result.data;
        
        window.currentClassId = selectedClassId;
        window.classPassword = password;
        window.classPasswordHash = passwordHash;
        
        document.getElementById('classSelectScreen').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'block';
        
        window.auth.renderUserSelect();
        
        if (window.autoSaveInterval) clearInterval(window.autoSaveInterval);
        window.autoSaveInterval = setInterval(() => {
            if (window.saveAllDataToCloud) window.saveAllDataToCloud();
        }, 30000);
        
    } catch (error) {
        console.error('进入班级失败:', error);
        alert('加载失败：' + error.message);
    }
}

// 从 JsonBin 导入
function showImportModal() {
    window.modal.show('从 JsonBin 导入班级', `
        <div style="margin: 20px 0;">
            <label>班级名称：</label>
            <input type="text" id="importClassName" class="class-password-input" style="width: 100%;">
            
            <label>班级密码：</label>
            <input type="password" id="importClassPassword" class="class-password-input" style="width: 100%;">
            
            <label>Bin ID：</label>
            <input type="text" id="importBinId" class="class-password-input" style="width: 100%;" placeholder="例如: 6975bf17d0ea881f4083a3af">
            
            <label>Master Key：</label>
            <input type="password" id="importMasterKey" class="class-password-input" style="width: 100%;" placeholder="$2a$10$xxx">
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '导入', onclick: 'handleImport()', className: 'btn-primary' }
    ]);
}

async function handleImport() {
    const className = document.getElementById('importClassName').value;
    const classPassword = document.getElementById('importClassPassword').value;
    const binId = document.getElementById('importBinId').value;
    const masterKey = document.getElementById('importMasterKey').value;
    
    if (!className || !classPassword || !binId || !masterKey) {
        alert('请填写所有字段');
        return;
    }
    
    window.modal.close();
    
    try {
        const response = await fetch(`${API_BASE}/classes/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bin_id: binId,
                master_key: masterKey,
                class_name: className,
                class_password: classPassword
            })
        });
        
        const result = await response.json();
        
        if (response.status === 401) {
            alert('JsonBin验证失败，请检查 Bin ID 和 Master Key');
            return;
        }
        if (!response.ok) {
            throw new Error(result.error || '导入失败');
        }
        
        alert('导入成功！');
        await loadClasses();
        selectClass(result.id);
        document.getElementById('classPassword').value = classPassword;
        
    } catch (error) {
        console.error('导入失败:', error);
        alert('导入失败：' + error.message);
    }
}

// 手动创建班级
function showCreateModal() {
    window.modal.show('手动创建班级', `
        <div style="margin: 20px 0;">
            <label>班级名称：</label>
            <input type="text" id="createClassName" class="class-password-input" style="width: 100%;">
            
            <label>班级密码：</label>
            <input type="password" id="createClassPassword" class="class-password-input" style="width: 100%;">
            
            <label>Token：</label>
            <input type="text" id="createToken" class="class-password-input" style="width: 100%;" placeholder="CLASS-TOKEN-XXXXXX">
            
            <div style="margin: 20px 0;">
                <button class="btn btn-primary" onclick="downloadTemplate()">📥 下载模板文件</button>
            </div>
            
            <label>班级数据 JSON：</label>
            <textarea id="createJsonData" class="large-textarea" placeholder='{"users":{},"scores":{},"groups":{},"rules":{},"logs":[],"rewards":{},"punishments":{},"userPunishments":{"active":{},"completed":{}},"gold":{},"exchangeRate":{"score_to_gold":0.1,"gold_to_score":1,"last_updated":null},"emoji":"","dailyReport":{},"autoEvents":[],"positions":{"list":{},"defaultSalary":5,"lastPayDate":null}}'></textarea>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认创建', onclick: 'handleCreate()', className: 'btn-primary' }
    ]);
}

function downloadTemplate() {
    window.open(`${API_BASE}/template`, '_blank');
}

async function handleCreate() {
    const className = document.getElementById('createClassName').value;
    const classPassword = document.getElementById('createClassPassword').value;
    const token = document.getElementById('createToken').value;
    const jsonData = document.getElementById('createJsonData').value;
    
    if (!className || !classPassword || !token) {
        alert('请填写班级名称、密码和 Token');
        return;
    }
    
    let parsedData;
    try {
        parsedData = JSON.parse(jsonData);
    } catch (e) {
        alert('JSON 格式错误：' + e.message);
        return;
    }
    
    if (!confirm(`请再次确认班级密码：${classPassword}\n班级名称：${className}\n确认创建吗？`)) return;
    
    window.modal.close();
    
    try {
        const response = await fetch(`${API_BASE}/classes/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                class_name: className,
                class_password: classPassword,
                token: token,
                json_data: JSON.stringify(parsedData)
            })
        });
        
        const result = await response.json();
        
        if (response.status === 401) {
            alert('Token无效或已使用');
            return;
        }
        if (!response.ok) {
            throw new Error(result.error || '创建失败');
        }
        
        alert('创建成功！');
        await loadClasses();
        selectClass(result.id);
        document.getElementById('classPassword').value = classPassword;
        
    } catch (error) {
        console.error('创建失败:', error);
        alert('创建失败：' + error.message);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    clearLocalStorage();
    loadClasses();
    
    document.getElementById('enterClassBtn').onclick = enterClass;
    document.getElementById('importFromJsonBinBtn').onclick = showImportModal;
    document.getElementById('createEmptyClassBtn').onclick = showCreateModal;
});

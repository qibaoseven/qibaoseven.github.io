// ========================================
// StudentOS v0.45 bb2
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// ==================== 账号管理页面 ====================

function showAccountManagement() {
    //document.getElementById('contentArea').setAttribute('data-page', 'account');
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">👤 账号管理</h2>
            
            <div style="text-align: center; margin: 30px 0;">
                <span style="font-size: 5em; cursor: pointer; display: inline-block; padding: 20px; background: linear-gradient(135deg, #ff4e4e20, #ff9f4e20); border-radius: 50%;" onclick="window.account.showAvatarSelector()">${window.currentUser.avatar || '👤'}</span>
            </div>
            
            <table class="data-table" style="max-width: 500px; margin: 0 auto;">
                <tr><td style="color: #ff6b4a;"><strong>用户名</strong></td><td>${window.currentUser.username}</td></tr>
                <tr><td style="color: #ff6b4a;"><strong>显示名称</strong></td><td>${window.currentUser.display_name}</td></tr>
                <tr><td style="color: #ff6b4a;"><strong>身份</strong></td><td><span class="reward-rarity-${window.currentUser.role === 'root' ? 'SSR' : window.currentUser.role === 'admin' ? 'SR' : 'R'}" style="padding: 3px 10px; border-radius: 15px; color: white;">${window.currentUser.role}</span></td></tr>
                <tr><td style="color: #ff6b4a;"><strong>学号</strong></td><td>${window.currentUser.student_id || '无'}</td></tr>
                <tr><td style="color: #ff6b4a;"><strong>最后登录</strong></td><td>${window.currentUser.last_login || '首次登录'}</td></tr>
            </table>
            
            <div class="btn-grid" style="margin-top: 30px; max-width: 500px; margin-left: auto; margin-right: auto;">
                ${window.currentUser.role === 'user' ? '<button class="btn btn-primary" onclick="window.account.showManageGroupMembers()">👥 修改小组人员</button>' : ''}
                <button class="btn btn-primary" onclick="window.account.showChangePassword()">🔑 修改密码</button>
                <button class="btn btn-primary" onclick="window.account.showChangeDisplayName()">📝 修改显示名称</button>
                <button class="btn btn-primary" onclick="window.account.showAvatarSelector()">🖼️ 修改头像</button>
            </div>
        </div>
    `;
}

function showChangePassword() {
    window.modal.show('修改密码', `
        <div style="margin: 20px 0;">
            <label style="color: #ff6b4a;">当前密码：</label>
            <input type="password" id="oldPassword" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
            
            <label style="color: #ff6b4a;">新密码：</label>
            <input type="password" id="newPassword" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
            
            <label style="color: #ff6b4a;">确认新密码：</label>
            <input type="password" id="confirmPassword" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认修改', onclick: 'window.account.handleChangePassword()', className: 'btn-primary' }
    ]);
}

async function handleChangePassword() {
    const oldPass = document.getElementById('oldPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    
    if (newPass !== confirm) {
        alert('两次输入的新密码不一致');
        return;
    }
    
    if (newPass.length < 4) {
        alert('新密码长度不能少于4位');
        return;
    }
    
    // 验证旧密码
    const isValid = await window.utils.verifyPassword(oldPass, window.currentUser.password);
    if (!isValid) {
        alert('当前密码错误');
        return;
    }
    
    // 创建新密码哈希
    const newHashedPassword = await window.utils.createPasswordHash(newPass);
    
    // 更新内存中的数据
    window.currentUser.password = newHashedPassword;
    window.appData.users[window.currentUser.username].password = newHashedPassword;
    window.dataManager.saveData('users');
    
    alert('密码修改成功！');
    window.modal.close();
    showAccountManagement();
}

function showChangeDisplayName() {
    window.modal.show('修改显示名称', `
        <div style="margin: 20px 0;">
            <label style="color: #ff6b4a;">新显示名称：</label>
            <input type="text" id="newDisplayName" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" value="${window.currentUser.display_name}">
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认修改', onclick: 'window.account.handleChangeDisplayName()', className: 'btn-primary' }
    ]);
}

function handleChangeDisplayName() {
    const newName = document.getElementById('newDisplayName').value.trim();
    if (!newName) {
        alert('显示名称不能为空');
        return;
    }
    
    window.currentUser.display_name = newName;
    window.appData.users[window.currentUser.username].display_name = newName;
    window.dataManager.saveData('users');
    
    document.getElementById('userDisplayName').textContent = newName;
    alert('显示名称修改成功！');
    window.modal.close();
    showAccountManagement();
}

function showAvatarSelector() {
    const emojis = Array.from(window.appData.emoji?.emojis || '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘');
    const pageSize = 50;
    let currentPage = 0;
    
    function renderAvatarPage(page) {
        const start = page * pageSize;
        const end = Math.min(start + pageSize, emojis.length);
        const pageEmojis = emojis.slice(start, end);
        
        return `
            <div style="margin: 20px 0;">
                <div style="display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px;">
                    ${pageEmojis.map(emoji => `
                        <div onclick="window.account.selectAvatar('${emoji}')" style="font-size: 1.5em; text-align: center; padding: 8px; cursor: pointer; border-radius: 8px; background: #fff6f0; border: 2px solid transparent; transition: all 0.3s;"
                             onmouseover="this.style.borderColor='#ff9f4e'" onmouseout="this.style.borderColor='transparent'">
                            ${emoji}
                        </div>
                    `).join('')}
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    ${page > 0 ? '<button class="btn btn-sm btn-primary" onclick="window.account.changeAvatarPage(-1)">⬅️ 上一页</button>' : ''}
                    <span style="margin: 0 20px; color: #ff6b4a;">第 ${page + 1}/${Math.ceil(emojis.length / pageSize)} 页</span>
                    ${end < emojis.length ? '<button class="btn btn-sm btn-primary" onclick="window.account.changeAvatarPage(1)">下一页 ➡️</button>' : ''}
                </div>
            </div>
        `;
    }
    
    window.account.changeAvatarPage = function(delta) {
        currentPage += delta;
        document.getElementById('avatarGrid').innerHTML = renderAvatarPage(currentPage);
    };
    
    window.account.selectAvatar = function(emoji) {
        window.currentUser.avatar = emoji;
        window.appData.users[window.currentUser.username].avatar = emoji;
        window.dataManager.saveData('users');
        document.getElementById('userAvatar').textContent = emoji;
        window.modal.notify('头像修改成功！', 'success');
        window.modal.close();
    };
    
    window.modal.show('选择头像', `
        <div id="avatarGrid">
            ${renderAvatarPage(0)}
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' }
    ]);
}

// v0.45 bb2: 修改小组人员 —— 仅 role=user 账号编辑自己的 group_ids 字典 {学号(int): 姓名(str)}
function showManageGroupMembers() {
    if (window.currentUser.role !== 'user') return;
    const user = window.appData.users[window.currentUser.username];
    const dict = (user && user.group_ids && typeof user.group_ids === 'object' && !Array.isArray(user.group_ids))
                ? user.group_ids : {};

    // 现有条目(带序号行), 另加一行空的以便新填
    const rows = Object.entries(dict).map(([id, name]) =>
        `<div class="gb-member-row" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <input type="number" min="1" step="1" class="gb-id" placeholder="学号/ID"
                style="flex:0 0 110px;padding:8px;border:1px solid #ffd1b8;border-radius:6px;"
                value="${id}">
            <input type="text" class="gb-name" placeholder="姓名"
                style="flex:1;padding:8px;border:1px solid #ffd1b8;border-radius:6px;"
                value="${String(name).replace(/"/g, '&quot;')}">
            <button class="btn btn-sm" onclick="this.closest('.gb-member-row').remove()" title="删除此条"
                style="flex:0 0 42px;padding:5px 0;">✕</button>
        </div>`).join('') +
        `<div class="gb-member-row" style="display:flex;align-items:center;gap:8px;">
            <input type="number" min="1" step="1" class="gb-id" placeholder="学号/ID"
                style="flex:0 0 110px;padding:8px;border:1px solid #ffd1b8;border-radius:6px;">
            <input type="text" class="gb-name" placeholder="姓名"
                style="flex:1;padding:8px;border:1px solid #ffd1b8;border-radius:6px;">
            <button class="btn btn-sm" onclick="this.closest('.gb-member-row').remove()" title="删除此条"
                style="flex:0 0 42px;padding:5px 0;">✕</button>
        </div>`;

    window.modal.show(`👥 修改小组人员 ${window.currentUser.display_name || window.currentUser.username}`, `
        <div style="margin: 16px 0;">
            <div style="color:#ff6b4a;font-size:.9em;margin-bottom:10px;">左边填学号(ID, 整数)，右边填姓名，改动后点「保存」自动提交。</div>
            <div id="gbRows">${rows}</div>
            <div style="text-align:center;margin-top:10px;">
                <button class="btn btn-primary" onclick="window.account.addMemberRow()">＋ 添加一行</button>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '保存并提交', onclick: 'window.account.saveManageGroupMembers()', className: 'btn-primary' }
    ]);
}

// 追加一行输入
function addMemberRow() {
    const cont = document.getElementById('gbRows');
    if (!cont) return;
    const row = document.createElement('div');
    row.className = 'gb-member-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    row.innerHTML = `
        <input type="number" min="1" step="1" class="gb-id" placeholder="学号/ID"
            style="flex:0 0 110px;padding:8px;border:1px solid #ffd1b8;border-radius:6px;">
        <input type="text" class="gb-name" placeholder="姓名"
            style="flex:1;padding:8px;border:1px solid #ffd1b8;border-radius:6px;">
        <button class="btn btn-sm" onclick="this.closest('.gb-member-row').remove()"
            style="flex:0 0 42px;padding:5px 0;">✕</button>`;
    cont.appendChild(row);
    row.querySelector('.gb-id').focus();
}

// 保存: 收集所有行 -> group_ids 字典 {学号(id,整数数字字符串): 姓名}, 写回并提交
function saveManageGroupMembers() {
    if (window.currentUser.role !== 'user') { alert('无权限'); return; }
    const rows = Array.from(document.querySelectorAll('#gbRows .gb-member-row'));
    const result = {};
    let badCount = 0, kept = 0;

    rows.forEach(row => {
        const idInput = row.querySelector('.gb-id');
        const nameInput = row.querySelector('.gb-name');
        const idRaw = idInput ? idInput.value.trim() : '';
        const name = nameInput ? nameInput.value.trim() : '';
        if (idRaw === '' && name === '') return;               // 完全空行忽略
        const id = parseInt(idRaw, 10);
        if (isNaN(id) || id <= 0) { badCount++; return; }       // ID 非法
        if (name === '') { badCount++; return; }                // 名字为空
        if (result[id] === undefined) { result[id] = name; kept++; }
    });

    if (badCount > 0) {
        const ok = confirm(`有 ${badCount} 行填写不完整(缺学号/姓名或学号非法)，将跳过这些行。\n可保留的 ${kept} 条会正常保存。\n\n仍然继续吗？`);
        if (!ok) return;
    }

    const user = window.appData.users[window.currentUser.username];
    user.group_ids = result;
    window.dataManager.saveData('users');
    window.modal.close();
    window.modal.notify(`小组人员已更新，共 ${kept} 人`, 'success');
}

// 导出到全局
window.account = {
    showAccountManagement,
    showChangePassword,
    handleChangePassword,
    showChangeDisplayName,
    handleChangeDisplayName,
    showAvatarSelector,
    showManageGroupMembers,
    addMemberRow,
    saveManageGroupMembers
};
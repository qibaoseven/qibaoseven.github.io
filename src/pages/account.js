function showAccountManagement() {
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>👤 账号管理</h2><div style="text-align:center;"><span style="font-size:5em;cursor:pointer;" onclick="window.account.showAvatarSelector()">${window.currentUser.avatar||'👤'}</span></div><table class="data-table"><tr><td>用户名</td><td>${window.currentUser.username}</td></tr><tr><td>显示名称</td><td>${window.currentUser.display_name}</td></tr><tr><td>身份</td><td><span class="reward-rarity-${window.currentUser.role==='root'?'SSR':window.currentUser.role==='admin'?'SR':'R'}">${window.currentUser.role}</span></td></tr><tr><td>学号</td><td>${window.currentUser.student_id||'无'}</td></tr></table><div class="btn-grid"><button class="btn btn-primary" onclick="window.account.showChangePassword()">🔑 修改密码</button><button class="btn btn-primary" onclick="window.account.showChangeDisplayName()">📝 修改显示名</button><button class="btn btn-primary" onclick="window.account.showAvatarSelector()">🖼️ 修改头像</button></div></div>`;
}

function showChangePassword() {
    window.modal.show('修改密码', `<input type="password" id="oldPassword" placeholder="当前密码" class="password-input"><input type="password" id="newPassword" placeholder="新密码" class="password-input"><input type="password" id="confirmPassword" placeholder="确认新密码" class="password-input">`, [{text:'取消',onclick:'window.modal.close'},{text:'确认',onclick:'window.account.handleChangePassword',className:'btn-primary'}]);
}

async function handleChangePassword() {
    const oldPass=document.getElementById('oldPassword').value, newPass=document.getElementById('newPassword').value, confirm=document.getElementById('confirmPassword').value;
    if(newPass!==confirm){ alert('两次新密码不一致'); return; }
    if(newPass.length<4){ alert('密码至少4位'); return; }
    const isValid=await window.utils.verifyPassword(oldPass, window.currentUser.password);
    if(!isValid){ alert('当前密码错误'); return; }
    const newHash=await window.utils.createPasswordHash(newPass);
    window.currentUser.password=newHash;
    window.appData.users[window.currentUser.username].password=newHash;
    window.dataManager.saveData('users');
    alert('修改成功');
    window.modal.close();
    showAccountManagement();
}

function showChangeDisplayName() {
    window.modal.show('修改显示名', `<input type="text" id="newDisplayName" value="${window.currentUser.display_name}" class="password-input">`, [{text:'取消',onclick:'window.modal.close'},{text:'确认',onclick:'window.account.handleChangeDisplayName',className:'btn-primary'}]);
}

function handleChangeDisplayName() {
    const newName=document.getElementById('newDisplayName').value.trim();
    if(!newName){ alert('不能为空'); return; }
    window.currentUser.display_name=newName;
    window.appData.users[window.currentUser.username].display_name=newName;
    window.dataManager.saveData('users');
    document.getElementById('userDisplayName').textContent=newName;
    alert('修改成功');
    window.modal.close();
    showAccountManagement();
}

function showAvatarSelector() {
    const emojis=Array.from(window.appData.emoji?.emojis||'😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘');
    let page=0, pageSize=50;
    function render(p){ const start=p*pageSize, end=Math.min(start+pageSize,emojis.length); return `<div style="display:grid;grid-template-columns:repeat(10,1fr);gap:5px;">${emojis.slice(start,end).map(e=>`<div onclick="window.account.selectAvatar('${e}')" style="font-size:1.5em;text-align:center;padding:8px;cursor:pointer;">${e}</div>`).join('')}</div><div>${p>0?`<button class="btn btn-sm" onclick="window.account.changeAvatarPage(-1)">⬅️</button>`:''}<span>${p+1}/${Math.ceil(emojis.length/pageSize)}</span>${end<emojis.length?`<button class="btn btn-sm" onclick="window.account.changeAvatarPage(1)">➡️</button>`:''}</div>`; }
    window.account.changeAvatarPage=function(delta){ page+=delta; document.getElementById('avatarGrid').innerHTML=render(page); };
    window.account.selectAvatar=function(emoji){ window.currentUser.avatar=emoji; window.appData.users[window.currentUser.username].avatar=emoji; window.dataManager.saveData('users'); document.getElementById('userAvatar').textContent=emoji; window.modal.notify('头像已修改','success'); window.modal.close(); };
    window.modal.show('选择头像', `<div id="avatarGrid">${render(0)}</div>`, [{text:'取消',onclick:'window.modal.close'}]);
}

window.account = { showAccountManagement, showChangePassword, handleChangePassword, showChangeDisplayName, handleChangeDisplayName, showAvatarSelector };

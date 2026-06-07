function showGroupManagement() {
    const groups = window.appData.groups || {};
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>👥 分组管理</h2><div class="btn-grid"><button class="btn btn-primary" onclick="window.group.showGroupCreate()">🆕 创建</button><button class="btn btn-primary" onclick="window.group.showGroupAddMember()">➕ 添加成员</button><button class="btn btn-primary" onclick="window.group.showGroupRemoveMember()">➖ 移除成员</button><button class="btn btn-primary" onclick="window.group.showGroupList()">📋 列表</button><button class="btn btn-primary" onclick="window.group.showGroupAll()">👥 全部详情</button><button class="btn btn-danger" onclick="window.group.showGroupDelete()">🗑️ 删除</button></div><div><h3>📊 分组概览</h3><div class="stats-grid"><div class="stat-card"><div class="stat-value">${Object.keys(groups).length}</div><div class="stat-label">分组数</div></div><div class="stat-card"><div class="stat-value">${Object.values(groups).reduce((s,g)=>s+g.length,0)}</div><div class="stat-label">成员数</div></div></div><table class="data-table"><thead><tr><th>分组</th><th>成员数</th><th>平均分</th><th>操作</th></tr></thead><tbody>${Object.entries(groups).map(([name, members]) => { const valid = members.filter(id=>window.appData.scores[id]&&id!=='0'); const avg = valid.length? (valid.reduce((s,id)=>s+window.appData.scores[id][1],0)/valid.length).toFixed(1):0; return `<tr><td>${name}</td><td>${valid.length}</td><td>${avg}</td><td><button class="btn btn-sm btn-primary" onclick="window.group.viewGroupDetails('${name}')">查看</button></td></tr>`; }).join('')}</tbody></table></div></div>`;
}

function viewGroupDetails(groupName) {
    const members = (window.appData.groups[groupName] || []).filter(id=>window.appData.scores[id]&&id!=='0');
    window.modal.show(`${groupName}详情`, `<table class="data-table"><thead><tr><th>学号</th><th>姓名</th><th>分数</th></tr></thead><tbody>${members.map(id=>`<tr><td>${id}</td><td>${window.appData.scores[id][0]}</td><td>${window.appData.scores[id][1]}</td></tr>`).join('')}</tbody></table>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function showGroupCreate() {
    window.modal.show('创建分组', '<input type="text" id="groupName" placeholder="分组名称" class="password-input">', [{text:'取消',onclick:'window.modal.close'},{text:'创建',onclick:'window.group.handleGroupCreate',className:'btn-primary'}]);
}

function handleGroupCreate() {
    const name = document.getElementById('groupName').value.trim();
    if (!name) { alert('请输入名称'); return; }
    if (window.appData.groups[name]) { alert('已存在'); return; }
    window.appData.groups[name] = [];
    window.dataManager.saveData('groups');
    alert('创建成功');
    window.modal.close();
    showGroupManagement();
}

function showGroupDelete() {
    const groups = Object.keys(window.appData.groups || {});
    if (groups.length === 0) { alert('暂无分组'); return; }
    window.modal.show('删除分组', `<select id="deleteGroupSelect">${groups.map(n=>`<option value="${n}">${n}</option>`).join('')}</select>`, [{text:'取消',onclick:'window.modal.close'},{text:'删除',onclick:'window.group.handleGroupDelete',className:'btn-danger'}]);
}

function handleGroupDelete() {
    const name = document.getElementById('deleteGroupSelect').value;
    if (confirm(`删除"${name}"？`)) { delete window.appData.groups[name]; window.dataManager.saveData('groups'); alert('已删除'); window.modal.close(); showGroupManagement(); }
}

function showGroupAddMember() {
    const groups = Object.keys(window.appData.groups || {});
    if (groups.length === 0) { alert('请先创建分组'); return; }
    const students = window.utils.getAllStudents();
    window.modal.show('添加成员', `<select id="addGroupSelect" onchange="window.group.updateAddMemberList(this.value)">${groups.map(g=>`<option value="${g}">${g}</option>`).join('')}</select><div id="addMembersList"></div><label><input type="checkbox" onclick="window.group.toggleAllAddMembers(this)"> 全选</label>`, [{text:'取消',onclick:'window.modal.close'},{text:'添加',onclick:'window.group.handleGroupAddMember',className:'btn-primary'}]);
    updateAddMemberList(groups[0]);
}

function updateAddMemberList(groupName) {
    const members = window.appData.groups[groupName] || [];
    const students = window.utils.getAllStudents();
    document.getElementById('addMembersList').innerHTML = `<div style="max-height:200px;overflow:auto;">${students.map(s=>`<label style="display:block;${members.includes(s.id)?'opacity:0.5;':''}"><input type="checkbox" value="${s.id}" class="add-member" ${members.includes(s.id)?'disabled':''}> ${s.id} - ${s.name} (${s.score}分) ${members.includes(s.id)?'(已在组中)':''}</label>`).join('')}</div>`;
}

function toggleAllAddMembers(checkbox) {
    document.querySelectorAll('.add-member:not(:disabled)').forEach(cb => cb.checked = checkbox.checked);
}

function handleGroupAddMember() {
    const groupName = document.getElementById('addGroupSelect').value;
    const checkboxes = document.querySelectorAll('.add-member:checked');
    if (checkboxes.length === 0) { alert('请选择学生'); return; }
    let added = 0;
    checkboxes.forEach(cb => { if (!window.appData.groups[groupName].includes(cb.value)) { window.appData.groups[groupName].push(cb.value); added++; } });
    window.dataManager.saveData('groups');
    alert(`添加 ${added} 人`);
    window.modal.close();
    showGroupManagement();
}

function showGroupRemoveMember() {
    const groups = Object.keys(window.appData.groups || {});
    if (groups.length === 0) { alert('暂无分组'); return; }
    window.modal.show('移除成员', `<select id="removeGroupSelect" onchange="window.group.showGroupMembers(this.value)">${groups.map(g=>`<option value="${g}">${g}</option>`).join('')}</select><div id="removeMembersList"></div><label><input type="checkbox" onclick="window.group.toggleAllRemoveMembers(this)"> 全选</label>`, [{text:'取消',onclick:'window.modal.close'},{text:'移除',onclick:'window.group.handleGroupRemoveMember',className:'btn-danger'}]);
    setTimeout(()=>showGroupMembers(groups[0]),100);
}

function toggleAllRemoveMembers(checkbox) { document.querySelectorAll('.remove-member').forEach(cb=>cb.checked=checkbox.checked); }

function showGroupMembers(groupName) {
    const members = (window.appData.groups[groupName] || []).filter(id=>window.appData.scores[id]&&id!=='0');
    document.getElementById('removeMembersList').innerHTML = `<div style="max-height:200px;overflow:auto;">${members.map(id=>`<label><input type="checkbox" value="${id}" class="remove-member"> ${id} - ${window.appData.scores[id][0]} (${window.appData.scores[id][1]}分)</label>`).join('')||'<p>暂无成员</p>'}</div>`;
}

function handleGroupRemoveMember() {
    const groupName = document.getElementById('removeGroupSelect').value;
    const checkboxes = document.querySelectorAll('.remove-member:checked');
    if (checkboxes.length === 0) { alert('请选择成员'); return; }
    let removed = 0;
    checkboxes.forEach(cb => { const idx = window.appData.groups[groupName].indexOf(cb.value); if (idx>-1) { window.appData.groups[groupName].splice(idx,1); removed++; } });
    window.dataManager.saveData('groups');
    alert(`移除 ${removed} 人`);
    window.modal.close();
    showGroupManagement();
}

function showGroupList() {
    const groups = window.appData.groups || {};
    window.modal.show('分组列表', `<div>${Object.entries(groups).map(([n,m])=>`<div><strong>${n}</strong>: ${m.filter(id=>window.appData.scores[id]).map(id=>window.appData.scores[id][0]).join(', ')||'无'}</div>`).join('')}</div>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function showGroupAll() {
    const allStudents = new Set(); Object.values(window.appData.groups||{}).forEach(m=>m.forEach(id=>allStudents.add(id)));
    const ungrouped = Object.keys(window.appData.scores||{}).filter(id=>id!=='0' && !allStudents.has(id));
    window.modal.show('全部详情', `<div><h4>已分组</h4>${Object.entries(window.appData.groups||{}).map(([n,m])=>`<div><strong>${n}</strong>: ${m.filter(id=>window.appData.scores[id]).map(id=>`${window.appData.scores[id][0]}(${id})`).join(', ')}</div>`).join('')}<h4>未分组</h4><div>${ungrouped.map(id=>`${window.appData.scores[id][0]}(${id})`).join(', ')||'无'}</div><div>总计:${Object.keys(window.appData.scores).filter(id=>id!=='0').length} 已分组:${allStudents.size} 未分组:${ungrouped.length}</div></div>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function showGroupScore() {
    const groups = Object.keys(window.appData.groups || {});
    if (groups.length===0) { alert('暂无分组'); return; }
    window.modal.show('分组加分', `<select id="scoreGroupSelect">${groups.map(g=>`<option value="${g}">${g}</option>`).join('')}</select><input type="number" id="groupScoreChange" placeholder="分数变化" class="password-input"><input type="text" id="groupScoreReason" placeholder="原因" class="password-input">`, [{text:'取消',onclick:'window.modal.close'},{text:'确认',onclick:'window.score.handleGroupScore',className:'btn-primary'}]);
}

window.group = { showGroupManagement, viewGroupDetails, showGroupCreate, handleGroupCreate, showGroupDelete, handleGroupDelete, showGroupAddMember, updateAddMemberList, handleGroupAddMember, toggleAllAddMembers, showGroupRemoveMember, showGroupMembers, handleGroupRemoveMember, toggleAllRemoveMembers, showGroupList, showGroupAll, showGroupScore };

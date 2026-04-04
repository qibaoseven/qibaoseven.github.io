// ==================== 分组管理页面 ====================

function showGroupManagement() {
    const groups = window.appData.groups || {};
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">👥 分组管理</h2>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.group.showGroupCreate()">🆕 创建分组</button>
                <button class="btn btn-primary" onclick="window.group.showGroupAddMember()">➕ 添加成员</button>
                <button class="btn btn-primary" onclick="window.group.showGroupRemoveMember()">➖ 移除成员</button>
                <button class="btn btn-primary" onclick="window.group.showGroupList()">📋 查看分组</button>
                <button class="btn btn-primary" onclick="window.group.showGroupAll()">👥 全部详情</button>
                <button class="btn btn-primary" onclick="window.group.showGroupScore()">🎯 分组加分</button>
                <button class="btn btn-danger" onclick="window.group.showGroupDelete()">🗑️ 删除分组</button>
            </div>
            
            <div style="margin-top: 30px;">
                <h3 style="color: #ff4e4e;">📊 分组概览</h3>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${Object.keys(groups).length}</div>
                        <div class="stat-label">总分组数</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${Object.values(groups).reduce((sum, g) => sum + g.length, 0)}</div>
                        <div class="stat-label">总成员数</div>
                    </div>
                </div>
                
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>分组名称</th>
                            <th>成员数</th>
                            <th>平均分</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(groups).map(([name, members]) => {
                            const validMembers = members.filter(id => window.appData.scores[id] && id !== '0');
                            const avgScore = validMembers.length > 0 
                                ? (validMembers.reduce((sum, id) => sum + window.appData.scores[id][1], 0) / validMembers.length).toFixed(1)
                                : 0;
                            return `
                                <tr>
                                    <td>${name}</td>
                                    <td>${validMembers.length}</td>
                                    <td>${avgScore}</td>
                                    <td>
                                        <button class="btn btn-sm btn-primary" onclick="window.group.viewGroupDetails('${name}')">查看</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function viewGroupDetails(groupName) {
    const members = window.appData.groups[groupName] || [];
    const validMembers = members.filter(id => window.appData.scores[id] && id !== '0');
    
    window.modal.show(`分组详情 - ${groupName}`, `
        <div style="max-height: 400px; overflow-y: auto;">
            <p><strong>成员列表 (${validMembers.length}人):</strong></p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>学号</th>
                        <th>姓名</th>
                        <th>分数</th>
                    </tr>
                </thead>
                <tbody>
                    ${validMembers.map(id => `
                        <tr>
                            <td>${id}</td>
                            <td>${window.appData.scores[id][0]}</td>
                            <td>${window.appData.scores[id][1]}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showGroupCreate() {
    window.modal.show('创建分组', `
        <div style="margin: 20px 0;">
            <label>分组名称：</label>
            <input type="text" id="groupName" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '创建', onclick: 'window.group.handleGroupCreate()', className: 'btn-primary' }
    ]);
}

function handleGroupCreate() {
    const name = document.getElementById('groupName').value.trim();
    if (!name) {
        alert('请输入分组名称');
        return;
    }
    
    if (!window.appData.groups) window.appData.groups = {};
    if (window.appData.groups[name]) {
        alert('分组已存在');
        return;
    }
    
    window.appData.groups[name] = [];
    window.dataManager.saveData('groups');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    alert('创建成功');
    window.modal.close();
    showGroupManagement();
}

function showGroupDelete() {
    const groups = Object.keys(window.appData.groups || {});
    if (groups.length === 0) {
        alert('暂无分组');
        return;
    }
    
    window.modal.show('删除分组', `
        <div style="margin: 20px 0;">
            <label>选择要删除的分组：</label>
            <select id="deleteGroupSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${groups.map(name => `<option value="${name}">${name}</option>`).join('')}
            </select>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '删除', onclick: 'window.group.handleGroupDelete()', className: 'btn-danger' }
    ]);
}

function handleGroupDelete() {
    const name = document.getElementById('deleteGroupSelect').value;
    if (confirm(`确定要删除分组"${name}"吗？`)) {
        delete window.appData.groups[name];
        window.dataManager.saveData('groups');
        window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
        alert('分组已删除');
        window.modal.close();
        showGroupManagement();
    }
}

// ==================== 修复：添加成员 ====================
function showGroupAddMember() {
    const groupNames = Object.keys(window.appData.groups || {});
    
    if (groupNames.length === 0) {
        alert('请先创建分组');
        return;
    }
    
    // 获取所有学生
    const allStudents = [];
    Object.entries(window.appData.scores || {}).forEach(([id, data]) => {
        if (id === '0') return;
        
        let name = '未知';
        let score = 0;
        
        if (Array.isArray(data)) {
            name = data[0] || '未知';
            score = typeof data[1] === 'number' ? data[1] : 0;
        } else if (data && typeof data === 'object') {
            name = data.name || '未知';
            score = typeof data.score === 'number' ? data.score : 0;
        }
        
        allStudents.push({
            id: id,
            name: name,
            score: score,
            display: `${id} - ${name} (${score}分)`
        });
    });
    
    window.modal.show('添加成员', `
        <div style="margin: 20px 0;">
            <label>选择分组：</label>
            <select id="addGroupSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" onchange="window.group.updateAddMemberList(this.value)">
                ${groupNames.map(name => `<option value="${name}">${name}</option>`).join('')}
            </select>
            
            <div id="addMembersList" style="margin-top: 20px;">
                <label>选择学生：</label>
                <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ffd1b8; padding: 10px; border-radius: 8px;">
                    ${allStudents.map(s => {
                        const isInGroup = window.appData.groups[groupNames[0]]?.includes(s.id);
                        return `
                            <label style="display: block; margin: 5px; ${isInGroup ? 'opacity: 0.5;' : ''}">
                                <input type="checkbox" value="${s.id}" class="add-member" ${isInGroup ? 'disabled' : ''}> 
                                ${s.display} ${isInGroup ? '(已在分组中)' : ''}
                            </label>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <div style="margin-top: 15px;">
                <label>
                    <input type="checkbox" onclick="window.group.toggleAllAddMembers(this)"> 全选（只选未加入的）
                </label>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '添加', onclick: 'window.group.handleGroupAddMember()', className: 'btn-primary' }
    ]);
}

function toggleAllAddMembers(checkbox) {
    const checkboxes = document.querySelectorAll('.add-member:not(:disabled)');
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
}

function updateAddMemberList(groupName) {
    const members = window.appData.groups[groupName] || [];
    
    const allStudents = [];
    Object.entries(window.appData.scores || {}).forEach(([id, data]) => {
        if (id === '0') return;
        
        let name = '未知';
        let score = 0;
        
        if (Array.isArray(data)) {
            name = data[0] || '未知';
            score = typeof data[1] === 'number' ? data[1] : 0;
        } else if (data && typeof data === 'object') {
            name = data.name || '未知';
            score = typeof data.score === 'number' ? data.score : 0;
        }
        
        allStudents.push({
            id: id,
            name: name,
            score: score,
            display: `${id} - ${name} (${score}分)`
        });
    });
    
    const listDiv = document.getElementById('addMembersList');
    if (listDiv) {
        listDiv.innerHTML = `
            <label>选择学生：</label>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ffd1b8; padding: 10px; border-radius: 8px;">
                ${allStudents.map(s => {
                    const isInGroup = members.includes(s.id);
                    return `
                        <label style="display: block; margin: 5px; ${isInGroup ? 'opacity: 0.5;' : ''}">
                            <input type="checkbox" value="${s.id}" class="add-member" ${isInGroup ? 'disabled' : ''}> 
                            ${s.display} ${isInGroup ? '(已在分组中)' : ''}
                        </label>
                    `;
                }).join('')}
            </div>
        `;
    }
}

function handleGroupAddMember() {
    const groupName = document.getElementById('addGroupSelect').value;
    const checkboxes = document.querySelectorAll('.add-member:checked');
    
    if (checkboxes.length === 0) {
        alert('请选择学生');
        return;
    }
    
    if (!window.appData.groups[groupName]) window.appData.groups[groupName] = [];
    
    let added = 0;
    checkboxes.forEach(cb => {
        const studentId = cb.value;
        if (!window.appData.groups[groupName].includes(studentId)) {
            window.appData.groups[groupName].push(studentId);
            added++;
        }
    });
    
    window.dataManager.saveData('groups');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    alert(`✅ 成功添加 ${added} 名学生`);
    window.modal.close();
    showGroupManagement();
}

// ==================== 移除成员 ====================
function showGroupRemoveMember() {
    const groupNames = Object.keys(window.appData.groups || {});
    
    if (groupNames.length === 0) {
        alert('暂无分组');
        return;
    }
    
    window.modal.show('移除成员', `
        <div style="margin: 20px 0;">
            <label>选择分组：</label>
            <select id="removeGroupSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" onchange="window.group.showGroupMembers(this.value)">
                ${groupNames.map(name => `<option value="${name}">${name}</option>`).join('')}
            </select>
            
            <div id="removeMembersList" style="margin-top: 20px;"></div>
            
            <div style="margin-top: 15px;">
                <label>
                    <input type="checkbox" onclick="window.group.toggleAllRemoveMembers(this)"> 全选
                </label>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '移除', onclick: 'window.group.handleGroupRemoveMember()', className: 'btn-danger' }
    ]);
    
    setTimeout(() => showGroupMembers(groupNames[0]), 100);
}

function toggleAllRemoveMembers(checkbox) {
    const checkboxes = document.querySelectorAll('.remove-member');
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
}

function showGroupMembers(groupName) {
    const members = window.appData.groups[groupName] || [];
    const validMembers = members.filter(id => window.appData.scores[id] && id !== '0');
    
    const membersList = validMembers.map(id => {
        let name = '未知';
        let score = 0;
        
        const data = window.appData.scores[id];
        if (Array.isArray(data)) {
            name = data[0] || '未知';
            score = typeof data[1] === 'number' ? data[1] : 0;
        } else if (data && typeof data === 'object') {
            name = data.name || '未知';
            score = typeof data.score === 'number' ? data.score : 0;
        }
        
        return { id, name, score };
    });
    
    document.getElementById('removeMembersList').innerHTML = `
        <label>选择成员：</label>
        <div style="max-height: 200px; overflow-y: auto; border: 1px solid #ffd1b8; padding: 10px; border-radius: 8px;">
            ${membersList.map(m => `
                <label style="display: block; margin: 5px;">
                    <input type="checkbox" value="${m.id}" class="remove-member"> ${m.id} - ${m.name} (${m.score}分)
                </label>
            `).join('')}
            ${membersList.length === 0 ? '<p style="color: #ff8f4e;">该分组暂无成员</p>' : ''}
        </div>
    `;
}

function handleGroupRemoveMember() {
    const groupName = document.getElementById('removeGroupSelect').value;
    const checkboxes = document.querySelectorAll('.remove-member:checked');
    
    if (checkboxes.length === 0) {
        alert('请选择要移除的学生');
        return;
    }
    
    let removed = 0;
    checkboxes.forEach(cb => {
        const studentId = cb.value;
        const index = window.appData.groups[groupName].indexOf(studentId);
        if (index > -1) {
            window.appData.groups[groupName].splice(index, 1);
            removed++;
        }
    });
    
    window.dataManager.saveData('groups');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    alert(`✅ 成功移除 ${removed} 名学生`);
    window.modal.close();
    showGroupManagement();
}

function showGroupList() {
    const groups = window.appData.groups || {};
    
    window.modal.show('分组列表', `
        <div style="max-height: 400px; overflow-y: auto;">
            ${Object.entries(groups).map(([name, members]) => {
                const validMembers = members.filter(id => window.appData.scores[id] && id !== '0');
                const names = validMembers.map(id => {
                    const data = window.appData.scores[id];
                    if (Array.isArray(data)) return data[0] || '未知';
                    if (data && typeof data === 'object') return data.name || '未知';
                    return '未知';
                }).join(', ');
                return `
                    <div style="margin-bottom: 20px; padding: 15px; background: #fff6f0; border-radius: 10px; border-left: 3px solid #ff4e4e;">
                        <h4 style="margin-bottom: 10px; color: #ff4e4e;">🔹 ${name} (${validMembers.length}人)</h4>
                        <p style="color: #ff8f4e;">${names || '暂无成员'}</p>
                    </div>
                `;
            }).join('')}
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showGroupAll() {
    const allStudents = new Set();
    Object.values(window.appData.groups || {}).forEach(members => {
        members.forEach(id => allStudents.add(id));
    });
    
    const ungrouped = Object.keys(window.appData.scores || {})
        .filter(id => id !== '0' && !allStudents.has(id));
    
    window.modal.show('全部分组详情', `
        <div style="max-height: 400px; overflow-y: auto;">
            <h4 style="color: #ff4e4e;">📁 已分组学生</h4>
            ${Object.entries(window.appData.groups || {}).map(([name, members]) => {
                const validMembers = members.filter(id => window.appData.scores[id] && id !== '0');
                if (validMembers.length === 0) return '';
                
                const names = validMembers.map(id => {
                    const data = window.appData.scores[id];
                    if (Array.isArray(data)) return `${data[0]}(${id})`;
                    if (data && typeof data === 'object') return `${data.name || '未知'}(${id})`;
                    return `未知(${id})`;
                }).join(' ');
                return `
                    <div style="margin: 10px 0; padding: 10px; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff9f4e;">
                        <strong style="color: #ff6b4a;">${name}:</strong> <span style="color: #ff8f4e;">${names}</span>
                    </div>
                `;
            }).join('')}
            
            <h4 style="margin-top: 20px; color: #ff4e4e;">📋 未分组学生</h4>
            <div style="background: #fff6f0; padding: 15px; border-radius: 8px; border-left: 3px solid #ffb84e;">
                ${ungrouped.length > 0 
                    ? ungrouped.map(id => {
                        const data = window.appData.scores[id];
                        if (Array.isArray(data)) return `${data[0]}(${id})`;
                        if (data && typeof data === 'object') return `${data.name || '未知'}(${id})`;
                        return `未知(${id})`;
                    }).join(' ')
                    : '所有学生都已分组'}
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, #ff4e4e10, #ff9f4e10); border-radius: 8px;">
                <p>总计: ${Object.keys(window.appData.scores || {}).filter(id => id !== '0').length}人</p>
                <p>已分组: ${allStudents.size}人</p>
                <p>未分组: ${ungrouped.length}人</p>
            </div>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showGroupScore() {
    const groupNames = Object.keys(window.appData.groups || {});
    
    if (groupNames.length === 0) {
        alert('暂无分组');
        return;
    }
    
    window.modal.show('分组加分', `
        <div style="margin: 20px 0;">
            <label>选择分组：</label>
            <select id="scoreGroupSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${groupNames.map(name => `<option value="${name}">${name}</option>`).join('')}
            </select>
            
            <label>加分/扣分数值：</label>
            <input type="number" id="groupScoreChange" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" 
                   placeholder="正数为加分，负数为扣分" step="1" min="-999" max="999">
            <small style="color: #ff8f4e;">建议范围：-50 到 50</small>
            
            <label>原因（可选）：</label>
            <input type="text" id="groupScoreReason" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" 
                   placeholder="请输入原因" maxlength="100">
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: 'window.score.handleGroupScore()', className: 'btn-primary' }
    ]);
}

// 导出到全局
window.group = {
    showGroupManagement,
    viewGroupDetails,
    showGroupCreate,
    handleGroupCreate,
    showGroupDelete,
    handleGroupDelete,
    showGroupAddMember,
    updateAddMemberList,
    handleGroupAddMember,
    toggleAllAddMembers,
    showGroupRemoveMember,
    showGroupMembers,
    handleGroupRemoveMember,
    toggleAllRemoveMembers,
    showGroupList,
    showGroupAll,
    showGroupScore
};
// ==================== 职位系统页面 ====================
// 权限：rw-rw-rwx（所有人可看，user/admin可登记，root可管理工资和添加职位）

function showPositions() {
    // 初始化职位数据
    if (!window.appData.positions) {
        window.appData.positions = {
            list: {},      // 职位列表 { 职位名: { salary: 5, members: [] } }
            defaultSalary: 5,
            lastPayDate: null
        };
        window.dataManager.saveData('positions');
    }
    
    const positions = window.appData.positions.list || {};
    const defaultSalary = window.appData.positions.defaultSalary || 5;
    const userRole = window.currentUser?.role;
    const studentId = window.currentUser?.student_id;
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">👔 职位系统</h2>
                <span style="background: #ff4e4e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em;">rw-rw-rwx</span>
            </div>
            
            ${userRole === 'root' ? `
                <div class="btn-grid" style="margin-bottom: 20px;">
                    <button class="btn btn-success" onclick="window.positions.showPaySalaries()">💰 发放工资</button>
                    <button class="btn btn-primary" onclick="window.positions.showAddPosition()">➕ 添加职位</button>
                    <button class="btn btn-primary" onclick="window.positions.showJoinPosition()">📝 登记职位</button>
                </div>
            ` : `
                <div class="btn-grid" style="margin-bottom: 20px;">
                    <button class="btn btn-primary" onclick="window.positions.showJoinPosition()">📝 登记为班干</button>
                </div>
            `}
            
            <div class="info-box" style="margin-bottom: 20px;">
                💡 说明：每个人可以担任多个职位，工资叠加发放，每人每月无上限。
            </div>
            
            <div id="positionsList">
                ${renderPositionsList(positions, userRole, studentId)}
            </div>
        </div>
    `;
}

function renderPositionsList(positions, userRole, currentStudentId) {
    if (Object.keys(positions).length === 0) {
        return `
            <div class="warning-box" style="text-align: center; padding: 40px;">
                <p style="font-size: 1.2em;">📭 暂无职位</p>
                <p style="color: #ff8f4e; margin-top: 10px;">${userRole === 'root' ? '点击"添加职位"开始创建' : '请联系管理员添加职位'}</p>
            </div>
        `;
    }
    
    let html = '<div style="display: flex; flex-direction: column; gap: 20px;">';
    
    Object.entries(positions).forEach(([positionName, data]) => {
        const salary = data.salary || 5;
        const members = data.members || [];
        
        html += `
            <div style="background: #fff6f0; border-radius: 12px; overflow: hidden; border: 1px solid #ffd1b8;">
                <div style="background: linear-gradient(135deg, #ff4e4e20, #ff9f4e20); padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ffd1b8;">
                    <div>
                        <span style="font-size: 1.2em; font-weight: bold; color: #ff4e4e;">${escapeHtml(positionName)}</span>
                        <span style="margin-left: 10px; background: #ff9f4e; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;">💰 ${salary}学分/月</span>
                    </div>
                    ${userRole === 'root' ? `
                        <div>
                            <button class="btn btn-sm btn-primary" onclick="window.positions.showSetSalary('${escapeHtml(positionName)}')">⚙️ 设置工资</button>
                            <button class="btn btn-sm btn-danger" onclick="window.positions.showDeletePosition('${escapeHtml(positionName)}')">🗑️ 删除</button>
                        </div>
                    ` : ''}
                </div>
                <div style="padding: 15px;">
                    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        ${members.length > 0 ? members.map(member => {
                            const memberData = window.utils.getStudentData(member);
                            const memberName = memberData?.name || member;
                            const isCurrentUser = member === currentStudentId;
                            return `
                                <div style="background: ${isCurrentUser ? '#ff9f4e' : 'white'}; padding: 8px 15px; border-radius: 20px; border: 1px solid #ffd1b8; display: inline-flex; align-items: center; gap: 8px;">
                                    <span style="color: ${isCurrentUser ? 'white' : '#ff6b4a'};">${escapeHtml(memberName)}</span>
                                    ${userRole === 'root' ? `
                                        <button class="btn btn-sm" style="padding: 2px 6px; font-size: 0.7em; background: #ff4e4e; color: white;" onclick="window.positions.removeMember('${escapeHtml(positionName)}', '${member}')">✖️</button>
                                    ` : ''}
                                    ${!isCurrentUser && userRole !== 'root' ? `
                                        <span style="font-size: 0.7em; color: #ff8f4e;">👤</span>
                                    ` : ''}
                                </div>
                            `;
                        }).join('') : `
                            <div style="color: #ff8f4e; padding: 8px;">暂无成员</div>
                        `}
                    </div>
                    ${userRole === 'root' ? `
                        <div style="margin-top: 12px;">
                            <button class="btn btn-sm btn-primary" onclick="window.positions.showAddMember('${escapeHtml(positionName)}')">➕ 添加成员</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

// ==================== 登记职位（所有人可用）====================

function showJoinPosition() {
    const positions = window.appData.positions?.list || {};
    const positionNames = Object.keys(positions);
    
    if (positionNames.length === 0) {
        alert('暂无职位可登记，请联系管理员添加');
        return;
    }
    
    const currentStudentId = window.currentUser.student_id;
    const currentName = window.utils.getStudentName(currentStudentId);
    
    // 获取当前已担任的职位
    const currentPositions = [];
    Object.entries(positions).forEach(([name, data]) => {
        if (data.members && data.members.includes(currentStudentId)) {
            currentPositions.push(name);
        }
    });
    
    window.modal.show('登记职位', `
        <div style="margin: 20px 0;">
            <p style="color: #ff6b4a; margin-bottom: 15px;">👤 ${currentName} (${currentStudentId})</p>
            
            ${currentPositions.length > 0 ? `
                <div class="info-box" style="margin-bottom: 15px;">
                    📋 你当前担任的职位：${currentPositions.join('、')}
                </div>
            ` : ''}
            
            <label style="color: #ff6b4a;">选择要登记的职位：</label>
            <select id="joinPositionSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${positionNames.map(name => {
                    const isAlready = currentPositions.includes(name);
                    return `<option value="${escapeHtml(name)}" ${isAlready ? 'disabled' : ''}>
                        ${name} (💰${positions[name].salary || 5}学分/月) ${isAlready ? ' - 已担任' : ''}
                    </option>`;
                }).join('')}
            </select>
            
            <div style="margin-top: 20px; color: #ff8f4e; font-size: 0.9em;">
                💡 提示：一个人可以担任多个职位，工资会叠加发放
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认登记', onclick: 'window.positions.handleJoinPosition()', className: 'btn-primary' }
    ]);
}

function handleJoinPosition() {
    const positionName = document.getElementById('joinPositionSelect').value;
    const studentId = window.currentUser.student_id;
    
    if (!window.appData.positions.list[positionName]) {
        alert('职位不存在');
        return;
    }
    
    const members = window.appData.positions.list[positionName].members || [];
    if (members.includes(studentId)) {
        alert('你已经担任这个职位了');
        return;
    }
    
    members.push(studentId);
    window.appData.positions.list[positionName].members = members;
    window.dataManager.saveData('positions');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    window.utils.addLog('登记职位', studentId, 0, 0, `登记为 ${positionName}`);
    
    window.modal.close();
    showPositions();
    window.modal.notify(`✅ 成功登记为 ${positionName}`, 'success');
}

// ==================== 添加职位（仅 root）====================

function showAddPosition() {
    window.modal.show('添加职位', `
        <div style="margin: 20px 0;">
            <label style="color: #ff6b4a;">职位名称：</label>
            <input type="text" id="newPositionName" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" placeholder="例如：班长、学习委员、劳动委员">
            
            <label style="color: #ff6b4a;">默认工资（学分/月）：</label>
            <input type="number" id="newPositionSalary" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" value="5" min="1" max="10">
            <small style="color: #ff8f4e;">范围：1-10学分，发放时会按此标准发工资</small>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '添加', onclick: 'window.positions.handleAddPosition()', className: 'btn-primary' }
    ]);
}

function handleAddPosition() {
    const name = document.getElementById('newPositionName').value.trim();
    const salary = parseInt(document.getElementById('newPositionSalary').value);
    
    if (!name) {
        alert('请输入职位名称');
        return;
    }
    
    if (isNaN(salary) || salary < 1 || salary > 10) {
        alert('工资范围应为 1-10 学分');
        return;
    }
    
    if (window.appData.positions.list[name]) {
        alert('职位已存在');
        return;
    }
    
    window.appData.positions.list[name] = {
        salary: salary,
        members: []
    };
    
    window.dataManager.saveData('positions');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    window.utils.addLog('添加职位', 'system', 0, 0, `添加职位: ${name} (工资${salary})`);
    
    window.modal.close();
    showPositions();
    window.modal.notify(`✅ 成功添加职位: ${name}`, 'success');
}

// ==================== 设置职位工资（仅 root）====================

function showSetSalary(positionName) {
    const position = window.appData.positions.list[positionName];
    if (!position) return;
    
    window.modal.show(`设置工资 - ${positionName}`, `
        <div style="margin: 20px 0;">
            <label style="color: #ff6b4a;">月工资（学分）：</label>
            <input type="number" id="setSalaryValue" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" value="${position.salary}" min="1" max="10">
            <small style="color: #ff8f4e;">范围：1-10学分，下个月发放工资时生效</small>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: `window.positions.handleSetSalary('${escapeHtml(positionName)}')`, className: 'btn-primary' }
    ]);
}

function handleSetSalary(positionName) {
    const newSalary = parseInt(document.getElementById('setSalaryValue').value);
    
    if (isNaN(newSalary) || newSalary < 1 || newSalary > 10) {
        alert('工资范围应为 1-10 学分');
        return;
    }
    
    window.appData.positions.list[positionName].salary = newSalary;
    window.dataManager.saveData('positions');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    window.utils.addLog('修改工资', 'system', 0, 0, `职位 ${positionName} 工资改为 ${newSalary}`);
    
    window.modal.close();
    showPositions();
    window.modal.notify(`✅ ${positionName} 工资已改为 ${newSalary} 学分/月`, 'success');
}

// ==================== 删除职位（仅 root）====================

function showDeletePosition(positionName) {
    const position = window.appData.positions.list[positionName];
    const memberCount = position?.members?.length || 0;
    
    window.modal.show('删除职位', `
        <div style="padding: 20px;">
            <div class="warning-box">
                ⚠️ 确定要删除职位 "${positionName}" 吗？<br>
                该职位现有 ${memberCount} 名成员，删除后这些同学的工资将不再发放。
            </div>
            <div style="margin-top: 20px;">
                <label>
                    <input type="checkbox" id="confirmDelete"> 我确认要删除此职位
                </label>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '删除', onclick: `window.positions.handleDeletePosition('${escapeHtml(positionName)}')`, className: 'btn-danger' }
    ]);
}

function handleDeletePosition(positionName) {
    const confirm = document.getElementById('confirmDelete')?.checked;
    if (!confirm) {
        alert('请确认删除操作');
        return;
    }
    
    delete window.appData.positions.list[positionName];
    window.dataManager.saveData('positions');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    window.utils.addLog('删除职位', 'system', 0, 0, `删除职位: ${positionName}`);
    
    window.modal.close();
    showPositions();
    window.modal.notify(`✅ 已删除职位: ${positionName}`, 'success');
}

// ==================== 添加成员（仅 root）====================

function showAddMember(positionName) {
    const allStudents = window.utils.getAllStudents();
    const currentMembers = window.appData.positions.list[positionName]?.members || [];
    const availableStudents = allStudents.filter(s => !currentMembers.includes(s.id));
    
    if (availableStudents.length === 0) {
        alert('所有学生都已担任此职位');
        return;
    }
    
    window.modal.show(`添加成员 - ${positionName}`, `
        <div style="margin: 20px 0;">
            <label style="color: #ff6b4a;">选择学生：</label>
            <select id="addMemberSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${availableStudents.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join('')}
            </select>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '添加', onclick: `window.positions.handleAddMember('${escapeHtml(positionName)}')`, className: 'btn-primary' }
    ]);
}

function handleAddMember(positionName) {
    const studentId = document.getElementById('addMemberSelect').value;
    const members = window.appData.positions.list[positionName].members;
    
    if (!members.includes(studentId)) {
        members.push(studentId);
        window.dataManager.saveData('positions');
        window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
        window.utils.addLog('添加成员', studentId, 0, 0, `加入职位: ${positionName}`);
    }
    
    window.modal.close();
    showPositions();
    window.modal.notify(`✅ 已添加成员`, 'success');
}

function removeMember(positionName, studentId) {
    if (!confirm(`确定要将 ${window.utils.getStudentName(studentId)} 移出 ${positionName} 吗？`)) return;
    
    const members = window.appData.positions.list[positionName].members;
    const index = members.indexOf(studentId);
    if (index !== -1) {
        members.splice(index, 1);
        window.dataManager.saveData('positions');
        window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
        window.utils.addLog('移除成员', studentId, 0, 0, `移出职位: ${positionName}`);
        showPositions();
        window.modal.notify(`✅ 已移除成员`, 'success');
    }
}

// ==================== 发放工资（仅 root）====================

function showPaySalaries() {
    const positions = window.appData.positions?.list || {};
    const lastPayDate = window.appData.positions?.lastPayDate;
    const today = window.utils.getBeijingDate();
    
    // 计算每个学生的总工资
    const salaryMap = {};
    Object.entries(positions).forEach(([name, data]) => {
        const salary = data.salary || 5;
        (data.members || []).forEach(memberId => {
            salaryMap[memberId] = (salaryMap[memberId] || 0) + salary;
        });
    });
    
    // 取消上限
    /*
    Object.keys(salaryMap).forEach(id => {
        if (salaryMap[id] > 10) salaryMap[id] = 10;
    });
    */
    
    const studentsWithSalary = Object.entries(salaryMap).filter(([_, salary]) => salary > 0);
    
    if (studentsWithSalary.length === 0) {
        alert('暂无需要发放工资的职位');
        return;
    }
    
    const canPayToday = lastPayDate !== today;
    
    window.modal.show('发放工资', `
        <div style="margin: 20px 0;">
            ${!canPayToday ? `
                <div class="warning-box" style="margin-bottom: 15px;">
                    ⚠️ 今天已经发放过工资了！每人每月只能领取一次工资。
                </div>
            ` : ''}
            
            <div class="info-box" style="margin-bottom: 15px;">
                📊 工资计算规则：每个职位单独计薪，每人每月工资<strong>无上限</strong>
            </div>
            
            <table class="data-table" style="margin-bottom: 15px;">
                <thead>
                    <tr>
                        <th>姓名</th>
                        <th>担任职位</th>
                        <th>应发工资</th>
                    </tr>
                </thead>
                <tbody>
                    ${studentsWithSalary.map(([id, totalSalary]) => {
                        const studentName = window.utils.getStudentName(id);
                        const studentPositions = Object.entries(positions)
                            .filter(([_, data]) => data.members?.includes(id))
                            .map(([name, data]) => `${name}(${data.salary || 5})`)
                            .join(', ');
                        return `
                            <tr>
                                <td>${escapeHtml(studentName)}</td>
                                <td style="font-size: 0.85em;">${studentPositions}</td>
                                <td style="color: #ff9f4e; font-weight: bold;">+${totalSalary}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            
            <div style="margin-top: 15px;">
                <label>
                    <input type="checkbox" id="confirmPay" ${!canPayToday ? 'disabled' : ''}> 
                    我确认发放本月工资（每人每月限领一次）
                </label>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认发放', onclick: 'window.positions.handlePaySalaries()', className: 'btn-success' }
    ]);
}

function handlePaySalaries() {
    const confirm = document.getElementById('confirmPay')?.checked;
    const lastPayDate = window.appData.positions?.lastPayDate;
    const today = window.utils.getBeijingDate();
    
    if (lastPayDate === today) {
        alert('今天已经发放过工资了！');
        return;
    }
    
    if (!confirm) {
        alert('请确认发放工资');
        return;
    }
    
    const positions = window.appData.positions.list;
    
    // 计算每个学生的总工资
    const salaryMap = {};
    Object.entries(positions).forEach(([name, data]) => {
        const salary = data.salary || 5;
        (data.members || []).forEach(memberId => {
            salaryMap[memberId] = (salaryMap[memberId] || 0) + salary;
        });
    });
    
    // （不）应用上限10分
    let totalPaid = 0;
    Object.entries(salaryMap).forEach(([id, totalSalary]) => {
        const finalSalary = Math.min(totalSalary, 2147483647);
        if (finalSalary > 0) {
            window.utils.updateStudentScore(id, finalSalary, `职位工资发放 (${finalSalary}学分)`, false);
            totalPaid += finalSalary;
        }
    });
    
    // 记录发放日期
    window.appData.positions.lastPayDate = today;
    window.dataManager.saveData('positions');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    window.utils.addLog('发放工资', 'system', totalPaid, 0, `本月工资发放，共发放 ${totalPaid} 学分`);
    
    window.modal.close();
    showPositions();
    window.modal.notify(`💰 工资发放完成！共发放 ${totalPaid} 学分`, 'success');
}

// 辅助函数
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== 导出 ====================
window.positions = {
    showPositions,
    showJoinPosition,
    handleJoinPosition,
    showAddPosition,
    handleAddPosition,
    showSetSalary,
    handleSetSalary,
    showDeletePosition,
    handleDeletePosition,
    showAddMember,
    handleAddMember,
    removeMember,
    showPaySalaries,
    handlePaySalaries
};
function showScoreManagement() {
    const students = window.utils.getAllStudents().sort((a, b) => parseInt(a.id) - parseInt(b.id));
    const rules = Object.entries(window.appData.rules || {});
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">📊 分数管理</h2>
                <span style="background: #ff4e4e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em;">---rwxrwx</span>
            </div>
            
            <div class="tab-container">
                <div class="tab active" onclick="window.score.showScoreTab('manage')">📝 分数操作</div>
                <div class="tab" onclick="window.score.showScoreTab('rules')">📋 积分规则</div>
                <div class="tab" onclick="window.score.showScoreTab('list')">📑 学生列表</div>
            </div>
            
            <div id="scoreManageTab" class="tab-content active">
                <div class="btn-grid">
                    <button class="btn btn-primary" onclick="window.score.showScoreAddSingle()">➕ 单个加分</button>
                    <button class="btn btn-primary" onclick="window.score.showScoreAddBatch()">🔢 批量加分</button>
                    <button class="btn btn-primary" onclick="window.score.showScoreByReason()">🎯 原因加分</button>
                    <button class="btn btn-primary" onclick="window.score.showScoreSet()">📝 设置分数</button>
                    <button class="btn btn-primary" onclick="window.score.showScoreGroupAdd()">👥 分组加分</button>
                    ${window.currentUser?.role === 'root' ? 
                        '<button class="btn btn-danger" onclick="window.score.showScoreReset()">🔄 一键还原</button>' : 
                        ''}
                </div>
                
                <div style="margin-top: 30px;">
                    <input type="text" placeholder="搜索学生..." style="width: 100%; padding: 10px; margin-bottom: 20px; border: 2px solid #ffd1b8; border-radius: 8px; color: #ff6b4a;" 
                           onkeyup="window.utils.filterStudents(this.value, 'scoreTable')">
                    
                    <table class="data-table" id="scoreTable">
                        <thead>
                            <tr>
                                <th>学号</th>
                                <th>姓名</th>
                                <th>分数</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${students.map(student => `
                                <tr data-name="${student.name}">
                                    <td>${student.id}</td>
                                    <td>${student.name}</td>
                                    <td>${student.score}</td>
                                    <td>
                                        <button class="btn btn-sm btn-success" onclick="window.score.quickAddScore('${student.id}', 2)">+2</button>
                                        <button class="btn btn-sm btn-danger" onclick="window.score.quickAddScore('${student.id}', -2)">-2</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div id="scoreRulesTab" class="tab-content">
                <h3 style="margin-bottom: 15px; color: #ff4e4e;">📋 当前积分规则</h3>
                <table class="data-table">
                    <thead>
                        <tr><th>规则名称</th><th>分值</th><th>类型</th><th>Excel列</th></tr>
                    </thead>
                    <tbody>
                        ${rules.map(([name, rule]) => `
                            <tr><td>${name}</td><td style="color: ${rule.value > 0 ? '#ff9f4e' : '#ff4e4e'}">${rule.value > 0 ? '+' : ''}${rule.value}</td><td>${rule.type}</td><td>${rule.column}</td></tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="btn-grid" style="margin-top: 20px;">
                    <button class="btn btn-primary" onclick="window.score.showAddRule()">➕ 添加规则</button>
                    <button class="btn btn-danger" onclick="window.score.showDeleteRule()">🗑️ 删除规则</button>
                </div>
            </div>
            
            <div id="scoreListTab" class="tab-content">
                <table class="data-table"><thead><tr><th>学号</th><th>姓名</th><th>分数</th></tr></thead>
                <tbody>${students.map(s => `<tr><td>${s.id}</td><td>${s.name}</td><td>${s.score}</td></tr>`).join('')}</tbody></table>
            </div>
        </div>
    `;
}

function showScoreTab(tabName) {
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    if (tabName === 'manage') {
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.getElementById('scoreManageTab').classList.add('active');
    } else if (tabName === 'rules') {
        document.querySelectorAll('.tab')[1].classList.add('active');
        document.getElementById('scoreRulesTab').classList.add('active');
    } else if (tabName === 'list') {
        document.querySelectorAll('.tab')[2].classList.add('active');
        document.getElementById('scoreListTab').classList.add('active');
    }
}

function quickAddScore(studentId, change) {
    if (window.utils.updateStudentScore(studentId, change, '快速调整')) showScoreManagement();
}

function showAddRule() {
    window.modal.show('添加积分规则', `<div><label>规则名称：</label><input type="text" id="ruleName" class="password-input"><label>分值：</label><input type="number" id="ruleValue" class="password-input"><label>类型：</label><select id="ruleType" class="password-input"><option value="加分">加分</option><option value="扣分">扣分</option></select><label>Excel列：</label><input type="text" id="ruleColumn" class="password-input"></div>`, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '添加', onclick: 'window.score.handleAddRule()', className: 'btn-primary' }
    ]);
}

function handleAddRule() {
    const name = document.getElementById('ruleName').value.trim();
    const value = parseFloat(document.getElementById('ruleValue').value);
    const type = document.getElementById('ruleType').value;
    const column = document.getElementById('ruleColumn').value.toUpperCase();
    if (!name || isNaN(value) || !column) { alert('请填写完整信息'); return; }
    window.appData.rules[name] = { value, type, column };
    window.dataManager.saveData('rules');
    alert('规则添加成功');
    window.modal.close();
    showScoreManagement();
}

function showDeleteRule() {
    const rules = Object.keys(window.appData.rules || {});
    if (rules.length === 0) { alert('暂无规则'); return; }
    window.modal.show('删除规则', `<select id="deleteRuleSelect">${rules.map(n => `<option value="${n}">${n}</option>`).join('')}</select>`, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '删除', onclick: 'window.score.handleDeleteRule()', className: 'btn-danger' }
    ]);
}

function handleDeleteRule() {
    const name = document.getElementById('deleteRuleSelect').value;
    if (confirm(`确定删除"${name}"吗？`)) { delete window.appData.rules[name]; window.dataManager.saveData('rules'); alert('已删除'); window.modal.close(); showScoreManagement(); }
}

function showScoreAddSingle() {
    const students = window.utils.getAllStudents();
    if (students.length === 0) { alert('暂无学生'); return; }
    window.modal.show('单个加分', `<select id="scoreStudentSelect">${students.map(s => `<option value="${s.id}">${s.id} - ${s.name} (${s.score}分)</option>`).join('')}</select><input type="number" id="scoreChangeValue" placeholder="分数变化（正加负扣）" class="password-input"><input type="text" id="scoreChangeReason" placeholder="原因" class="password-input">`, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: 'window.score.handleScoreAddSingle()', className: 'btn-primary' }
    ]);
}

function handleScoreAddSingle() {
    const studentId = document.getElementById('scoreStudentSelect').value;
    const change = parseFloat(document.getElementById('scoreChangeValue').value);
    const reason = document.getElementById('scoreChangeReason').value;
    if (isNaN(change) || change === 0) { alert('请输入有效分数'); return; }
    if (window.utils.updateStudentScore(studentId, change, reason)) { window.modal.close(); showScoreManagement(); }
}

function showScoreAddBatch() {
    const students = window.utils.getAllStudents();
    if (students.length === 0) { alert('暂无学生'); return; }
    window.modal.show('批量加分', `<div style="max-height:200px;overflow:auto;">${students.map(s => `<label><input type="checkbox" value="${s.id}" class="batch-student"> ${s.id} - ${s.name} (${s.score}分)</label>`).join('')}</div><label><input type="checkbox" onclick="window.utils.toggleAllStudents(this)"> 全选</label><input type="number" id="batchScoreChange" placeholder="分数变化" class="password-input"><input type="text" id="batchScoreReason" placeholder="原因" class="password-input">`, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: 'window.score.handleScoreAddBatch()', className: 'btn-primary' }
    ]);
}

function handleScoreAddBatch() {
    const checkboxes = document.querySelectorAll('.batch-student:checked');
    const change = parseFloat(document.getElementById('batchScoreChange').value);
    const reason = document.getElementById('batchScoreReason').value;
    if (checkboxes.length === 0) { alert('请选择学生'); return; }
    if (isNaN(change) || change === 0) { alert('请输入有效分数'); return; }
    let success = 0;
    checkboxes.forEach(cb => { if (window.utils.updateStudentScore(cb.value, change, reason)) success++; });
    alert(`成功为 ${success} 名学生${change>0?'加':'减'}分`);
    window.modal.close();
    showScoreManagement();
}

function showScoreByReason() {
    const rules = Object.entries(window.appData.rules || {});
    if (rules.length === 0) { alert('暂无规则'); return; }
    window.modal.show('原因加分', `<select id="reasonSelect">${rules.map(([n,r]) => `<option value="${n}" data-value="${r.value}">${n} (${r.value>0?'+':''}${r.value}分)</option>`).join('')}</select><div><label><input type="radio" name="reasonMode" value="single" checked> 单个</label><label><input type="radio" name="reasonMode" value="batch"> 批量</label></div><div id="reasonStudentSelect"></div>`, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: 'window.score.handleScoreByReason()', className: 'btn-primary' }
    ]);
    document.querySelectorAll('input[name="reasonMode"]').forEach(radio => { radio.onclick = () => { if (radio.value === 'batch') renderBatchStudentSelect(); else renderSingleStudentSelect(); }; });
    renderSingleStudentSelect();
}

function renderSingleStudentSelect() {
    const students = window.utils.getAllStudents();
    document.getElementById('reasonStudentSelect').innerHTML = `<select id="singleStudent">${students.map(s => `<option value="${s.id}">${s.id} - ${s.name} (${s.score}分)</option>`).join('')}</select>`;
}

function renderBatchStudentSelect() {
    const students = window.utils.getAllStudents();
    document.getElementById('reasonStudentSelect').innerHTML = `<div style="max-height:200px;overflow:auto;">${students.map(s => `<label><input type="checkbox" value="${s.id}" class="batch-reason-student"> ${s.id} - ${s.name} (${s.score}分)</label>`).join('')}</div><label><input type="checkbox" onclick="window.utils.toggleAllReasonStudents(this)"> 全选</label>`;
}

function handleScoreByReason() {
    const reason = document.getElementById('reasonSelect').value;
    const rule = window.appData.rules[reason];
    const mode = document.querySelector('input[name="reasonMode"]:checked').value;
    let studentIds = [];
    if (mode === 'single') { const id = document.getElementById('singleStudent')?.value; if (id) studentIds.push(id); }
    else { studentIds = Array.from(document.querySelectorAll('.batch-reason-student:checked')).map(cb => cb.value); }
    if (studentIds.length === 0) { alert('请选择学生'); return; }
    let success = 0;
    studentIds.forEach(id => { if (window.utils.updateStudentScore(id, rule.value, reason)) success++; });
    alert(`成功为 ${success} 名学生执行"${reason}"`);
    window.modal.close();
    showScoreManagement();
}

function showScoreSet() {
    const students = window.utils.getAllStudents();
    window.modal.show('设置分数', `<select id="setStudentSelect">${students.map(s => `<option value="${s.id}">${s.id} - ${s.name} (${s.score}分)</option>`).join('')}</select><input type="number" id="setScoreValue" value="100" class="password-input">`, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: 'window.score.handleScoreSet()', className: 'btn-primary' }
    ]);
}

function handleScoreSet() {
    const studentId = document.getElementById('setStudentSelect').value;
    const newScore = parseFloat(document.getElementById('setScoreValue').value);
    if (isNaN(newScore) || newScore < 0) { alert('请输入有效分数'); return; }
    const oldScore = window.utils.getStudentScore(studentId);
    window.appData.scores[studentId][1] = newScore;
    window.dataManager.saveData('scores');
    window.utils.addLog('设置分数', studentId, newScore - oldScore, newScore, `从${oldScore}设置为${newScore}`);
    alert('设置成功');
    window.modal.close();
    showScoreManagement();
}

function showScoreGroupAdd() {
    const groups = Object.keys(window.appData.groups || {});
    if (groups.length === 0) { alert('请先创建分组'); return; }
    window.modal.show('分组加分', `<select id="scoreGroupSelect">${groups.map(g => `<option value="${g}">${g}</option>`).join('')}</select><input type="number" id="groupScoreChange" placeholder="分数变化" class="password-input"><input type="text" id="groupScoreReason" placeholder="原因" class="password-input">`, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: 'window.score.handleGroupScore()', className: 'btn-primary' }
    ]);
}

function handleGroupScore() {
    const groupName = document.getElementById('scoreGroupSelect').value;
    const change = parseFloat(document.getElementById('groupScoreChange').value);
    const reason = document.getElementById('groupScoreReason').value;
    if (isNaN(change) || change === 0) { alert('请输入有效分数'); return; }
    const members = window.appData.groups[groupName] || [];
    let success = 0;
    members.forEach(id => { if (id !== '0' && window.appData.scores[id] && window.utils.updateStudentScore(id, change, reason)) success++; });
    alert(`成功为 ${success} 名学生${change>0?'加':'减'}分`);
    window.modal.close();
    showScoreManagement();
}

function showScoreReset() {
    window.modal.show('一键还原', `<div class="warning-box">⚠️ 此操作会将所有学生分数重置为100分！仅root可执行</div><label><input type="checkbox" id="confirmReset"> 我确认重置</label>`, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认重置', onclick: 'window.score.handleScoreReset()', className: 'btn-danger' }
    ]);
}

function handleScoreReset() {
    if (!document.getElementById('confirmReset')?.checked) { alert('请确认操作'); return; }
    Object.keys(window.appData.scores || {}).forEach(id => { if (id !== '0') { window.appData.scores[id][1] = 100; } });
    window.dataManager.saveData('scores');
    window.modal.close();
    window.modal.notify('✅ 所有分数已重置为100分', 'success');
    showScoreManagement();
}

window.score = { showScoreManagement, showScoreTab, quickAddScore, showAddRule, handleAddRule, showDeleteRule, handleDeleteRule, showScoreAddSingle, handleScoreAddSingle, showScoreAddBatch, handleScoreAddBatch, showScoreByReason, handleScoreByReason, showScoreSet, handleScoreSet, showScoreGroupAdd, handleGroupScore, showScoreReset, handleScoreReset };

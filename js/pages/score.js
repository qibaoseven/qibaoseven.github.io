// ==================== 分数管理页面 ====================

function showScoreManagement() {
    //document.getElementById('contentArea').setAttribute('data-page', 'score');
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
                        <tr>
                            <th>规则名称</th>
                            <th>分值</th>
                            <th>类型</th>
                            <th>Excel列</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rules.map(([name, rule]) => `
                            <tr>
                                <td>${name}</td>
                                <td style="color: ${rule.value > 0 ? '#ff9f4e' : '#ff4e4e'}">${rule.value > 0 ? '+' : ''}${rule.value}</td>
                                <td>${rule.type}</td>
                                <td>${rule.column}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <div class="btn-grid" style="margin-top: 20px;">
                    <button class="btn btn-primary" onclick="window.score.showAddRule()">➕ 添加规则</button>
                    <button class="btn btn-danger" onclick="window.score.showDeleteRule()">🗑️ 删除规则</button>
                </div>
            </div>
            
            <div id="scoreListTab" class="tab-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>学号</th>
                            <th>姓名</th>
                            <th>分数</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(student => `
                            <tr>
                                <td>${student.id}</td>
                                <td>${student.name}</td>
                                <td>${student.score}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// 切换选项卡
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

// 快速加减分
function quickAddScore(studentId, change) {
    if (window.utils.updateStudentScore(studentId, change, '快速调整')) {
        showScoreManagement();
    }
}

// 显示添加规则
function showAddRule() {
    window.modal.show('添加积分规则', `
        <div style="margin: 20px 0;">
            <label>规则名称：</label>
            <input type="text" id="ruleName" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
            
            <label>分值（正数加分，负数扣分）：</label>
            <input type="number" id="ruleValue" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
            
            <label>类型：</label>
            <select id="ruleType" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                <option value="加分">加分</option>
                <option value="扣分">扣分</option>
            </select>
            
            <label>Excel列（C-V）：</label>
            <input type="text" id="ruleColumn" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" placeholder="例如: C, D, E...">
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '添加', onclick: 'window.score.handleAddRule()', className: 'btn-primary' }
    ]);
}

// 处理添加规则
function handleAddRule() {
    const name = document.getElementById('ruleName').value.trim();
    const value = parseFloat(document.getElementById('ruleValue').value);
    const type = document.getElementById('ruleType').value;
    const column = document.getElementById('ruleColumn').value.toUpperCase();
    
    if (!name || isNaN(value) || !column) {
        alert('请填写完整信息');
        return;
    }
    
    window.appData.rules[name] = { value, type, column };
    window.dataManager.saveData('rules');
    alert('规则添加成功');
    window.modal.close();
    showScoreManagement();
}

// 显示删除规则
function showDeleteRule() {
    const rules = Object.keys(window.appData.rules || {});
    if (rules.length === 0) {
        alert('暂无规则可删除');
        return;
    }
    
    window.modal.show('删除规则', `
        <div style="margin: 20px 0;">
            <label>选择要删除的规则：</label>
            <select id="deleteRuleSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${rules.map(name => `<option value="${name}">${name}</option>`).join('')}
            </select>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '删除', onclick: 'window.score.handleDeleteRule()', className: 'btn-danger' }
    ]);
}

// 处理删除规则
function handleDeleteRule() {
    const name = document.getElementById('deleteRuleSelect').value;
    if (confirm(`确定要删除规则"${name}"吗？`)) {
        delete window.appData.rules[name];
        window.dataManager.saveData('rules');
        alert('规则已删除');
        window.modal.close();
        showScoreManagement();
    }
}

// ==================== 修复：单个加分 ====================
function showScoreAddSingle() {
    // 安全地获取学生数据
    const students = [];
    
    Object.entries(window.appData.scores || {}).forEach(([id, data]) => {
        if (id === '0') return;
        
        let name = '未知';
        let score = 0;
        
        // 兼容不同数据格式
        if (Array.isArray(data)) {
            name = data[0] || '未知';
            score = typeof data[1] === 'number' ? data[1] : 0;
        } else if (data && typeof data === 'object') {
            name = data.name || '未知';
            score = typeof data.score === 'number' ? data.score : 0;
        }
        
        students.push({
            id: id,
            display: `${id} - ${name} (${score}分)`
        });
    });
    
    if (students.length === 0) {
        alert('暂无学生数据，请先导入学生信息');
        return;
    }
    
    window.modal.show('单个加分', `
        <div style="margin: 20px 0;">
            <label>选择学生：</label>
            <select id="scoreStudentSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${students.map(s => `<option value="${s.id}">${s.display}</option>`).join('')}
            </select>
            
            <label>加分/扣分数值：</label>
            <input type="number" id="scoreChangeValue" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" 
                   placeholder="正数为加分，负数为扣分" step="1" min="-999" max="999">
            <small style="color: #ff8f4e;">建议范围：-50 到 50</small>
            
            <label>原因（可选）：</label>
            <input type="text" id="scoreChangeReason" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" 
                   placeholder="请输入原因" maxlength="100">
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: 'window.score.handleScoreAddSingle()', className: 'btn-primary' }
    ]);
}

// 处理单个加分
function handleScoreAddSingle() {
    const studentId = document.getElementById('scoreStudentSelect').value;
    const change = parseFloat(document.getElementById('scoreChangeValue').value);
    const reason = document.getElementById('scoreChangeReason').value;
    
    if (isNaN(change) || change === 0) {
        alert('请输入有效的分数（不能为0）');
        return;
    }
    
    if (Math.abs(change) > 999) {
        alert('分数变动不能超过999分');
        return;
    }
    
    if (window.utils.updateStudentScore(studentId, change, reason)) {
        window.modal.close();
        showScoreManagement();
    } else {
        alert('操作失败：学生不存在或数据错误');
    }
}

// ==================== 修复：批量加分 ====================
function showScoreAddBatch() {
    // 安全地获取学生数据
    const students = [];
    
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
        
        students.push({
            id: id,
            name: name,
            score: score,
            display: `${id} - ${name} (${score}分)`
        });
    });
    
    if (students.length === 0) {
        alert('暂无学生数据');
        return;
    }
    
    window.modal.show('批量加分', `
        <div style="margin: 20px 0;">
            <label>选择学生：</label>
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #ffd1b8; padding: 10px; border-radius: 8px;">
                ${students.map(s => `
                    <label style="display: block; margin: 5px;">
                        <input type="checkbox" value="${s.id}" class="batch-student"> ${s.display}
                    </label>
                `).join('')}
            </div>
            
            <label style="margin-top: 15px; display: block;">
                <input type="checkbox" onclick="window.utils.toggleAllStudents(this)"> 全选
            </label>
            
            <label style="margin-top: 15px; display: block;">加分/扣分数值：</label>
            <input type="number" id="batchScoreChange" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" 
                   placeholder="正数为加分，负数为扣分" step="1" min="-999" max="999">
            <small style="color: #ff8f4e;">建议范围：-50 到 50</small>
            
            <label>原因（可选）：</label>
            <input type="text" id="batchScoreReason" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" 
                   placeholder="请输入原因" maxlength="100">
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: 'window.score.handleScoreAddBatch()', className: 'btn-primary' }
    ]);
}

// 处理批量加分
function handleScoreAddBatch() {
    const checkboxes = document.querySelectorAll('.batch-student:checked');
    const change = parseFloat(document.getElementById('batchScoreChange').value);
    const reason = document.getElementById('batchScoreReason').value;
    
    if (checkboxes.length === 0) {
        alert('请选择至少一个学生');
        return;
    }
    
    if (isNaN(change) || change === 0) {
        alert('请输入有效的分数（不能为0）');
        return;
    }
    
    if (Math.abs(change) > 999) {
        alert('分数变动不能超过999分');
        return;
    }
    
    let success = 0;
    let failed = [];
    
    checkboxes.forEach(cb => {
        const id = cb.value;
        if (window.appData.scores && window.appData.scores[id]) {
            window.utils.updateStudentScore(id, change, reason);
            success++;
        } else {
            failed.push(id);
        }
    });
    
    let message = `✅ 成功为 ${success} 名学生${change > 0 ? '加' : '减'}分`;
    if (failed.length > 0) {
        message += `\n❌ 以下学生不存在：${failed.join(', ')}`;
    }
    alert(message);
    
    window.modal.close();
    showScoreManagement();
}

// ==================== 修复：原因加分 ====================
function showScoreByReason() {
    // 每次打开都重新读取最新的规则
    const rules = Object.entries(window.appData.rules || {});
    
    if (rules.length === 0) {
        alert('暂无积分规则，请先添加规则');
        return;
    }
    
    window.modal.show('原因加分', `
        <div style="margin: 20px 0;">
            <label>选择原因：</label>
            <select id="reasonSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${rules.map(([name, rule]) => `
                    <option value="${name}" data-value="${rule.value}">${name} (${rule.value > 0 ? '+' : ''}${rule.value}分)</option>
                `).join('')}
            </select>
            
            <label>选择模式：</label>
            <div style="margin: 10px 0;">
                <label><input type="radio" name="reasonMode" value="single" checked> 单个学生</label>
                <label style="margin-left: 20px;"><input type="radio" name="reasonMode" value="batch"> 批量学生</label>
            </div>
            
            <div id="reasonStudentSelect" style="margin-top: 15px;"></div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: 'window.score.handleScoreByReason()', className: 'btn-primary' }
    ]);
    
    // 初始化单个学生选择
    renderSingleStudentSelect();
    
    // 监听模式切换
    document.querySelectorAll('input[name="reasonMode"]').forEach(radio => {
        radio.onclick = function() {
            if (this.value === 'batch') {
                renderBatchStudentSelect();
            } else {
                renderSingleStudentSelect();
            }
        };
    });
}

// 渲染单个学生选择
function renderSingleStudentSelect() {
    const students = [];
    
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
        
        students.push({
            id: id,
            display: `${id} - ${name} (${score}分)`
        });
    });
    
    const selectDiv = document.getElementById('reasonStudentSelect');
    if (selectDiv) {
        selectDiv.innerHTML = `
            <label>选择学生：</label>
            <select id="singleStudent" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${students.map(s => `<option value="${s.id}">${s.display}</option>`).join('')}
            </select>
        `;
    }
}

// 渲染批量学生选择
function renderBatchStudentSelect() {
    const students = [];
    
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
        
        students.push({
            id: id,
            name: name,
            score: score,
            display: `${id} - ${name} (${score}分)`
        });
    });
    
    const selectDiv = document.getElementById('reasonStudentSelect');
    if (selectDiv) {
        selectDiv.innerHTML = `
            <label>选择学生：</label>
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #ffd1b8; padding: 10px; border-radius: 8px;">
                ${students.map(s => `
                    <label style="display: block; margin: 5px;">
                        <input type="checkbox" value="${s.id}" class="batch-reason-student"> ${s.display}
                    </label>
                `).join('')}
            </div>
            <label style="margin-top: 10px;">
                <input type="checkbox" onclick="window.utils.toggleAllReasonStudents(this)"> 全选
            </label>
        `;
    }
}

// 处理原因加分
function handleScoreByReason() {
    const reason = document.getElementById('reasonSelect').value;
    const rule = window.appData.rules[reason];
    const mode = document.querySelector('input[name="reasonMode"]:checked').value;
    
    if (!rule) {
        alert('规则不存在，请重新选择');
        return;
    }
    
    let studentIds = [];
    if (mode === 'single') {
        const studentId = document.getElementById('singleStudent')?.value;
        if (studentId) studentIds.push(studentId);
    } else {
        studentIds = Array.from(document.querySelectorAll('.batch-reason-student:checked')).map(cb => cb.value);
    }
    
    if (studentIds.length === 0) {
        alert('请选择学生');
        return;
    }
    
    let success = 0;
    let failed = [];
    
    studentIds.forEach(id => {
        if (window.appData.scores && window.appData.scores[id]) {
            window.utils.updateStudentScore(id, rule.value, reason);
            success++;
        } else {
            failed.push(id);
        }
    });
    
    let message = `✅ 成功为 ${success} 名学生执行 "${reason}"`;
    if (failed.length > 0) {
        message += `\n❌ 以下学生不存在：${failed.join(', ')}`;
    }
    alert(message);
    
    window.modal.close();
    showScoreManagement();
}

// 显示设置分数
function showScoreSet() {
    const students = [];
    
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
        
        students.push({
            id: id,
            display: `${id} - ${name} (${score}分)`
        });
    });
    
    if (students.length === 0) {
        alert('暂无学生数据');
        return;
    }
    
    window.modal.show('设置分数', `
        <div style="margin: 20px 0;">
            <label>选择学生：</label>
            <select id="setStudentSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${students.map(s => `<option value="${s.id}">${s.display}</option>`).join('')}
            </select>
            
            <label>新分数：</label>
            <input type="number" id="setScoreValue" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" 
                   min="0" max="999" step="1" value="100">
            <small style="color: #ff8f4e;">范围：0-999分</small>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认', onclick: 'window.score.handleScoreSet()', className: 'btn-primary' }
    ]);
}

// 处理设置分数
function handleScoreSet() {
    const studentId = document.getElementById('setStudentSelect').value;
    const newScore = parseFloat(document.getElementById('setScoreValue').value);
    
    if (isNaN(newScore) || newScore < 0 || newScore > 999) {
        alert('请输入有效的分数（0-999之间）');
        return;
    }
    
    if (!window.appData.scores[studentId]) {
        alert('学生不存在');
        return;
    }
    
    const oldScore = window.utils.getStudentScore(studentId);
    window.appData.scores[studentId][1] = newScore;
    window.dataManager.saveData('scores');
    window.utils.addLog('设置分数', studentId, newScore - oldScore, newScore, `从${oldScore}设置为${newScore}`);
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    alert('设置成功');
    window.modal.close();
    showScoreManagement();
}

// 显示分组加分
function showScoreGroupAdd() {
    const groups = Object.keys(window.appData.groups || {});
    if (groups.length === 0) {
        alert('请先创建分组');
        return;
    }
    
    window.modal.show('分组加分', `
        <div style="margin: 20px 0;">
            <label>选择分组：</label>
            <select id="scoreGroupSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${groups.map(name => `<option value="${name}">${name}</option>`).join('')}
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

// 处理分组加分
function handleGroupScore() {
    const groupName = document.getElementById('scoreGroupSelect').value;
    const change = parseFloat(document.getElementById('groupScoreChange').value);
    const reason = document.getElementById('groupScoreReason').value || '分组操作';
    
    if (isNaN(change) || change === 0) {
        alert('请输入有效的分数（不能为0）');
        return;
    }
    
    if (Math.abs(change) > 999) {
        alert('分数变动不能超过999分');
        return;
    }
    
    const members = window.appData.groups[groupName] || [];
    const validMembers = members.filter(id => window.appData.scores[id] && id !== '0');
    
    if (validMembers.length === 0) {
        alert('该分组没有有效成员');
        return;
    }
    
    let success = 0;
    let failed = [];
    
    validMembers.forEach(id => {
        if (window.appData.scores[id]) {
            window.utils.updateStudentScore(id, change, reason);
            success++;
        } else {
            failed.push(id);
        }
    });
    
    let message = `✅ 成功为 ${success} 名学生${change > 0 ? '加' : '减'}分`;
    if (failed.length > 0) {
        message += `\n❌ 以下学生不存在：${failed.join(', ')}`;
    }
    alert(message);
    
    window.modal.close();
    showScoreManagement();
}

// ==================== 一键还原 ====================

function showScoreReset() {
    window.modal.show('⚠️ 一键还原', `
        <div style="padding: 20px;">
            <div class="warning-box">
                <strong>⚠️ 危险操作</strong><br>
                此操作会将所有学生的分数重置为默认值（100分）。<br>
                <strong>只有 root 可执行，admin 无权限！</strong>
            </div>
            
            <div style="margin: 20px 0;">
                <p style="color: #ff6b4a;">当前分数分布：</p>
                ${window.utils.getAllStudents().map(s => 
                    `<div>${s.name}: ${s.score}分</div>`
                ).join('')}
            </div>
            
            <div style="margin: 20px 0;">
                <label style="color: #ff6b4a;">
                    <input type="checkbox" id="confirmReset"> 我确认要重置所有分数为 100 分
                </label>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认重置', onclick: 'window.score.handleScoreReset()', className: 'btn-danger' }
    ]);
}

function handleScoreReset() {
    const confirm = document.getElementById('confirmReset')?.checked;
    if (!confirm) {
        alert('请先确认重置操作');
        return;
    }
    
    Object.keys(window.appData.scores || {}).forEach(id => {
        if (id !== '0') {
            const oldScore = window.appData.scores[id][1];
            window.appData.scores[id][1] = 100;
            window.utils.addLog('一键还原', id, 100 - oldScore, 100, '分数重置为100');
        }
    });
    
    window.dataManager.saveData('scores');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    window.modal.close();
    window.modal.notify('✅ 所有分数已重置为 100 分', 'success');
    window.score.showScoreManagement();
}

// ==================== 导出 ====================
window.score = {
    showScoreManagement,
    showScoreTab,
    quickAddScore,
    showAddRule,
    handleAddRule,
    showDeleteRule,
    handleDeleteRule,
    showScoreAddSingle,
    handleScoreAddSingle,
    showScoreAddBatch,
    handleScoreAddBatch,
    showScoreByReason,
    handleScoreByReason,
    showScoreSet,
    handleScoreSet,
    showScoreGroupAdd,
    handleGroupScore,
    showScoreReset,
    handleScoreReset
};
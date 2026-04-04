// ==================== 自动事件管理页面 ====================
// 权限：r--r--rwx（只有 root 可修改）

function showAutoEvents() {
    document.getElementById('contentArea').setAttribute('data-page', 'autoEvents');
    
    if (window.currentUser?.role !== 'root') {
        alert('权限不足');
        return;
    }
    
    const events = window.appData.autoEvents || [];
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">⚡ 自动事件管理</h2>
                <span style="background: #ff4e4e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em;">r--r--rwx</span>
            </div>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.autoEvents.showAddEvent()">➕ 添加事件</button>
                <button class="btn btn-primary" onclick="window.autoEvents.runNow()">▶️ 立即执行</button>
                <button class="btn btn-primary" onclick="window.autoEvents.showHistory()">📋 执行历史</button>
            </div>
            
            <div style="margin-top: 30px;">
                <h3 style="color: #ff4e4e;">📋 事件列表</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>名称</th>
                            <th>频率</th>
                            <th>目标</th>
                            <th>分值</th>
                            <th>最后执行</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${events.map((event, index) => {
                            const lastRun = event.lastRun || {};
                            const lastRunDate = Object.keys(lastRun).sort().pop() || '从未';
                            return `
                                <tr>
                                    <td>${event.name || '未命名'}</td>
                                    <td>${event.frequency || 'daily'} ${event.dayOfWeek !== undefined ? `(周${event.dayOfWeek})` : ''} ${event.dayOfMonth ? `(${event.dayOfMonth}日)` : ''}</td>
                                    <td>${Array.isArray(event.targets) ? event.targets.join(', ') : '无'}</td>
                                    <td style="color: ${event.change > 0 ? '#ff9f4e' : '#ff4e4e'}">${event.change > 0 ? '+' : ''}${event.change}</td>
                                    <td>${lastRunDate}</td>
                                    <td>
                                        <button class="btn btn-sm btn-primary" onclick="window.autoEvents.editEvent(${index})">✏️</button>
                                        <button class="btn btn-sm btn-danger" onclick="window.autoEvents.deleteEvent(${index})">🗑️</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                        ${events.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: #ff8f4e;">暂无自动事件</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    window.utils.addViewLog('浏览', '进入自动事件管理');
}

function showAddEvent() {
    const groups = Object.keys(window.appData.groups || {});
    const allStudents = window.utils.getAllStudents();
    
    window.modal.show('添加自动事件', `
        <div style="margin: 20px 0; max-height: 500px; overflow-y: auto;">
            <label style="color: #ff6b4a;">事件名称：</label>
            <input type="text" id="eventName" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
            
            <label style="color: #ff6b4a;">频率：</label>
            <select id="eventFrequency" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" onchange="window.autoEvents.toggleFrequencyOptions()">
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
            </select>
            
            <div id="weeklyOption" style="display: none;">
                <label style="color: #ff6b4a;">星期几：</label>
                <select id="eventDayOfWeek" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                    <option value="0">周日</option>
                    <option value="1">周一</option>
                    <option value="2">周二</option>
                    <option value="3">周三</option>
                    <option value="4">周四</option>
                    <option value="5">周五</option>
                    <option value="6">周六</option>
                </select>
            </div>
            
            <div id="monthlyOption" style="display: none;">
                <label style="color: #ff6b4a;">日期：</label>
                <input type="number" id="eventDayOfMonth" min="1" max="31" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
            </div>
            
            <label style="color: #ff6b4a;">目标（支持 all, 学号, group:分组名）：</label>
            <div style="max-height: 150px; overflow-y: auto; border: 1px solid #ffd1b8; padding: 10px; border-radius: 8px; margin: 10px 0;">
                <label style="display: block;"><input type="checkbox" value="all"> 所有学生</label>
                ${groups.map(g => `<label style="display: block;"><input type="checkbox" value="group:${g}"> 分组: ${g}</label>`).join('')}
                <hr>
                ${allStudents.map(s => 
                    `<label style="display: block;"><input type="checkbox" value="${s.id}"> ${s.name} (${s.id})</label>`
                ).join('')}
            </div>
            
            <label style="color: #ff6b4a;">分值（正数加分，负数扣分）：</label>
            <input type="number" id="eventChange" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
            
            <label style="color: #ff6b4a;">原因（可选）：</label>
            <input type="text" id="eventReason" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '添加', onclick: 'window.autoEvents.handleAddEvent()', className: 'btn-primary' }
    ]);
    
    window.autoEvents.toggleFrequencyOptions();
}

function toggleFrequencyOptions() {
    const freq = document.getElementById('eventFrequency').value;
    document.getElementById('weeklyOption').style.display = freq === 'weekly' ? 'block' : 'none';
    document.getElementById('monthlyOption').style.display = freq === 'monthly' ? 'block' : 'none';
}

function handleAddEvent() {
    const name = document.getElementById('eventName').value.trim();
    const frequency = document.getElementById('eventFrequency').value;
    const change = parseFloat(document.getElementById('eventChange').value);
    const reason = document.getElementById('eventReason').value.trim();
    
    if (!name || isNaN(change)) {
        alert('请填写完整信息');
        return;
    }
    
    const targets = [];
    document.querySelectorAll('.modal-content input[type="checkbox"]:checked').forEach(cb => {
        targets.push(cb.value);
    });
    
    if (targets.length === 0) {
        alert('请至少选择一个目标');
        return;
    }
    
    const event = {
        name,
        frequency,
        targets,
        change,
        reason: reason || '自动事件',
        lastRun: {}
    };
    
    if (frequency === 'weekly') {
        event.dayOfWeek = parseInt(document.getElementById('eventDayOfWeek').value);
    }
    if (frequency === 'monthly') {
        event.dayOfMonth = parseInt(document.getElementById('eventDayOfMonth').value);
    }
    
    if (!window.appData.autoEvents) window.appData.autoEvents = [];
    window.appData.autoEvents.push(event);
    
    window.dataManager.saveData('autoEvents');
    window.utils.addLog('添加自动事件', 'system', 0, 0, `添加事件: ${name}`);
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    window.modal.close();
    showAutoEvents();
}

function editEvent(index) {
    const event = window.appData.autoEvents[index];
    if (!event) return;
    
    const groups = Object.keys(window.appData.groups || {});
    const allStudents = window.utils.getAllStudents();
    
    window.modal.show('编辑自动事件', `
        <div style="margin: 20px 0; max-height: 500px; overflow-y: auto;">
            <label style="color: #ff6b4a;">事件名称：</label>
            <input type="text" id="editEventName" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" value="${event.name}">
            
            <label style="color: #ff6b4a;">频率：</label>
            <select id="editEventFrequency" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" onchange="window.autoEvents.toggleEditFrequencyOptions()">
                <option value="daily" ${event.frequency === 'daily' ? 'selected' : ''}>每天</option>
                <option value="weekly" ${event.frequency === 'weekly' ? 'selected' : ''}>每周</option>
                <option value="monthly" ${event.frequency === 'monthly' ? 'selected' : ''}>每月</option>
            </select>
            
            <div id="editWeeklyOption" style="display: ${event.frequency === 'weekly' ? 'block' : 'none'};">
                <label style="color: #ff6b4a;">星期几：</label>
                <select id="editEventDayOfWeek" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                    <option value="0" ${event.dayOfWeek === 0 ? 'selected' : ''}>周日</option>
                    <option value="1" ${event.dayOfWeek === 1 ? 'selected' : ''}>周一</option>
                    <option value="2" ${event.dayOfWeek === 2 ? 'selected' : ''}>周二</option>
                    <option value="3" ${event.dayOfWeek === 3 ? 'selected' : ''}>周三</option>
                    <option value="4" ${event.dayOfWeek === 4 ? 'selected' : ''}>周四</option>
                    <option value="5" ${event.dayOfWeek === 5 ? 'selected' : ''}>周五</option>
                    <option value="6" ${event.dayOfWeek === 6 ? 'selected' : ''}>周六</option>
                </select>
            </div>
            
            <div id="editMonthlyOption" style="display: ${event.frequency === 'monthly' ? 'block' : 'none'};">
                <label style="color: #ff6b4a;">日期：</label>
                <input type="number" id="editEventDayOfMonth" min="1" max="31" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" value="${event.dayOfMonth || ''}">
            </div>
            
            <label style="color: #ff6b4a;">目标：</label>
            <div style="max-height: 150px; overflow-y: auto; border: 1px solid #ffd1b8; padding: 10px; border-radius: 8px; margin: 10px 0;">
                <label style="display: block;"><input type="checkbox" value="all" ${event.targets.includes('all') ? 'checked' : ''}> 所有学生</label>
                ${groups.map(g => `<label style="display: block;"><input type="checkbox" value="group:${g}" ${event.targets.includes(`group:${g}`) ? 'checked' : ''}> 分组: ${g}</label>`).join('')}
                <hr>
                ${allStudents.map(s => 
                    `<label style="display: block;"><input type="checkbox" value="${s.id}" ${event.targets.includes(s.id) ? 'checked' : ''}> ${s.name} (${s.id})</label>`
                ).join('')}
            </div>
            
            <label style="color: #ff6b4a;">分值：</label>
            <input type="number" id="editEventChange" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" value="${event.change}">
            
            <label style="color: #ff6b4a;">原因：</label>
            <input type="text" id="editEventReason" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" value="${event.reason || ''}">
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '保存', onclick: `window.autoEvents.handleEditEvent(${index})`, className: 'btn-primary' }
    ]);
}

function handleEditEvent(index) {
    const name = document.getElementById('editEventName').value.trim();
    const frequency = document.getElementById('editEventFrequency').value;
    const change = parseFloat(document.getElementById('editEventChange').value);
    const reason = document.getElementById('editEventReason').value.trim();
    
    if (!name || isNaN(change)) {
        alert('请填写完整信息');
        return;
    }
    
    const targets = [];
    document.querySelectorAll('.modal-content input[type="checkbox"]:checked').forEach(cb => {
        targets.push(cb.value);
    });
    
    if (targets.length === 0) {
        alert('请至少选择一个目标');
        return;
    }
    
    const event = window.appData.autoEvents[index];
    event.name = name;
    event.frequency = frequency;
    event.targets = targets;
    event.change = change;
    event.reason = reason || '自动事件';
    
    if (frequency === 'weekly') {
        event.dayOfWeek = parseInt(document.getElementById('editEventDayOfWeek').value);
        delete event.dayOfMonth;
    } else if (frequency === 'monthly') {
        event.dayOfMonth = parseInt(document.getElementById('editEventDayOfMonth').value);
        delete event.dayOfWeek;
    } else {
        delete event.dayOfWeek;
        delete event.dayOfMonth;
    }
    
    window.dataManager.saveData('autoEvents');
    window.utils.addLog('编辑自动事件', 'system', 0, 0, `编辑事件: ${name}`);
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    window.modal.close();
    showAutoEvents();
}

function deleteEvent(index) {
    if (!confirm('确定要删除这个自动事件吗？')) return;
    
    const name = window.appData.autoEvents[index].name;
    window.appData.autoEvents.splice(index, 1);
    window.dataManager.saveData('autoEvents');
    window.utils.addLog('删除自动事件', 'system', 0, 0, `删除事件: ${name}`);
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    showAutoEvents();
}

async function runNow() {
    if (!confirm('确定要立即执行所有自动事件吗？')) return;
    
    await window.dataManager.runAutoEvents();
    alert('自动事件执行完成！');
    showAutoEvents();
}

function showHistory() {
    const logs = (window.appData.logs || [])
        .filter(log => log.action === '自动事件')
        .slice(0, 50);
    
    window.modal.show('自动事件执行历史', `
        <div style="max-height: 400px; overflow-y: auto;">
            ${logs.map(log => `
                <div style="padding: 10px; margin: 5px 0; background: #fff6f0; border-left: 3px solid #ff9f4e;">
                    <div style="color: #ff6b4a;">${log.timestamp}</div>
                    <div>${log.student_name} ${log.score_change > 0 ? '+' : ''}${log.score_change}分</div>
                    <div style="color: #ff8f4e;">${log.reason}</div>
                </div>
            `).join('')}
            ${logs.length === 0 ? '<p style="color: #ff8f4e;">暂无执行历史</p>' : ''}
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function toggleEditFrequencyOptions() {
    const freq = document.getElementById('editEventFrequency').value;
    document.getElementById('editWeeklyOption').style.display = freq === 'weekly' ? 'block' : 'none';
    document.getElementById('editMonthlyOption').style.display = freq === 'monthly' ? 'block' : 'none';
}

// ==================== 导出 ====================
window.autoEvents = {
    showAutoEvents,
    showAddEvent,
    toggleFrequencyOptions,
    handleAddEvent,
    editEvent,
    handleEditEvent,
    deleteEvent,
    runNow,
    showHistory,
    toggleEditFrequencyOptions
};
function showAutoEvents() {
    if(window.currentUser?.role!=='root'){ alert('权限不足'); return; }
    const events=window.appData.autoEvents||[];
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>⚡ 自动事件</h2><div class="btn-grid"><button class="btn btn-primary" onclick="window.autoEvents.showAddEvent()">➕ 添加</button><button class="btn btn-primary" onclick="window.autoEvents.runNow()">▶️ 立即执行</button><button class="btn" onclick="window.autoEvents.showHistory()">📋 历史</button></div><table class="data-table"><thead><tr><th>名称</th><th>频率</th><th>目标</th><th>分值</th><th>最后执行</th><th>操作</th></tr></thead><tbody>${events.map((e,i)=>{ const last=Object.keys(e.lastRun||{}).pop()||'从未'; return `<tr><td>${e.name}</td><td>${e.frequency}</td><td>${e.targets?.join(',')}</td><td style="color:${e.change>0?'#ff9f4e':'#ff4e4e'}">${e.change>0?'+':''}${e.change}</td><td>${last}</td><td><button class="btn btn-sm" onclick="window.autoEvents.editEvent(${i})">✏️</button><button class="btn btn-sm btn-danger" onclick="window.autoEvents.deleteEvent(${i})">🗑️</button></td></tr>`; }).join('')}${events.length===0?'<tr><td colspan="6">暂无</td></tr>':''}</tbody></table></div>`;
}

function showAddEvent() {
    const groups=Object.keys(window.appData.groups||{}), students=window.utils.getAllStudents();
    window.modal.show('添加事件', `<input type="text" id="eventName" placeholder="名称" class="password-input"><select id="eventFrequency" onchange="window.autoEvents.toggleFrequencyOptions()"><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select><div id="weeklyOption" style="display:none"><select id="eventDayOfWeek"><option value="0">周日</option><option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option></select></div><div id="monthlyOption" style="display:none"><input type="number" id="eventDayOfMonth" min="1" max="31" class="password-input"></div><div style="max-height:150px;overflow:auto;"><label><input type="checkbox" value="all"> 全部</label>${groups.map(g=>`<label><input type="checkbox" value="group:${g}"> 分组:${g}</label>`).join('')}<hr>${students.map(s=>`<label><input type="checkbox" value="${s.id}"> ${s.name}(${s.id})</label>`).join('')}</div><input type="number" id="eventChange" placeholder="分值(+/-)" class="password-input"><input type="text" id="eventReason" placeholder="原因" class="password-input">`, [{text:'取消',onclick:'window.modal.close'},{text:'添加',onclick:'window.autoEvents.handleAddEvent',className:'btn-primary'}]);
    window.autoEvents.toggleFrequencyOptions();
}

function toggleFrequencyOptions() {
    const f=document.getElementById('eventFrequency').value;
    document.getElementById('weeklyOption').style.display=f==='weekly'?'block':'none';
    document.getElementById('monthlyOption').style.display=f==='monthly'?'block':'none';
}

function handleAddEvent() {
    const name=document.getElementById('eventName').value.trim(), freq=document.getElementById('eventFrequency').value, change=parseFloat(document.getElementById('eventChange').value), reason=document.getElementById('eventReason').value.trim();
    if(!name||isNaN(change)){ alert('请填完整'); return; }
    const targets=[]; document.querySelectorAll('.modal-content input[type="checkbox"]:checked').forEach(cb=>targets.push(cb.value));
    if(targets.length===0){ alert('选择目标'); return; }
    const event={name,frequency:freq,targets,change,reason:reason||'自动事件',lastRun:{}};
    if(freq==='weekly') event.dayOfWeek=parseInt(document.getElementById('eventDayOfWeek').value);
    if(freq==='monthly') event.dayOfMonth=parseInt(document.getElementById('eventDayOfMonth').value);
    if(!window.appData.autoEvents) window.appData.autoEvents=[];
    window.appData.autoEvents.push(event);
    window.dataManager.saveData('autoEvents');
    window.modal.close();
    showAutoEvents();
}

function editEvent(i) {
    const e=window.appData.autoEvents[i], groups=Object.keys(window.appData.groups||{}), students=window.utils.getAllStudents();
    window.modal.show('编辑', `<input type="text" id="editEventName" value="${e.name}" class="password-input"><select id="editEventFrequency" onchange="window.autoEvents.toggleEditFrequencyOptions()"><option value="daily" ${e.frequency==='daily'?'selected':''}>每天</option><option value="weekly" ${e.frequency==='weekly'?'selected':''}>每周</option><option value="monthly" ${e.frequency==='monthly'?'selected':''}>每月</option></select><div id="editWeeklyOption" style="display:${e.frequency==='weekly'?'block':'none'}"><select id="editEventDayOfWeek"><option value="0" ${e.dayOfWeek===0?'selected':''}>周日</option><option value="1" ${e.dayOfWeek===1?'selected':''}>周一</option><option value="2" ${e.dayOfWeek===2?'selected':''}>周二</option><option value="3" ${e.dayOfWeek===3?'selected':''}>周三</option><option value="4" ${e.dayOfWeek===4?'selected':''}>周四</option><option value="5" ${e.dayOfWeek===5?'selected':''}>周五</option><option value="6" ${e.dayOfWeek===6?'selected':''}>周六</option></select></div><div id="editMonthlyOption" style="display:${e.frequency==='monthly'?'block':'none'}"><input type="number" id="editEventDayOfMonth" value="${e.dayOfMonth||''}" class="password-input"></div><div style="max-height:150px;overflow:auto;"><label><input type="checkbox" value="all" ${e.targets.includes('all')?'checked':''}> 全部</label>${groups.map(g=>`<label><input type="checkbox" value="group:${g}" ${e.targets.includes(`group:${g}`)?'checked':''}> 分组:${g}</label>`).join('')}<hr>${students.map(s=>`<label><input type="checkbox" value="${s.id}" ${e.targets.includes(s.id)?'checked':''}> ${s.name}(${s.id})</label>`).join('')}</div><input type="number" id="editEventChange" value="${e.change}" class="password-input"><input type="text" id="editEventReason" value="${e.reason||''}" class="password-input">`, [{text:'取消',onclick:'window.modal.close'},{text:'保存',onclick:`window.autoEvents.handleEditEvent(${i})`,className:'btn-primary'}]);
}

function handleEditEvent(i) {
    const name=document.getElementById('editEventName').value.trim(), freq=document.getElementById('editEventFrequency').value, change=parseFloat(document.getElementById('editEventChange').value), reason=document.getElementById('editEventReason').value.trim();
    if(!name||isNaN(change)){ alert('请填完整'); return; }
    const targets=[]; document.querySelectorAll('.modal-content input[type="checkbox"]:checked').forEach(cb=>targets.push(cb.value));
    if(targets.length===0){ alert('选择目标'); return; }
    const e=window.appData.autoEvents[i];
    e.name=name; e.frequency=freq; e.targets=targets; e.change=change; e.reason=reason||'自动事件';
    if(freq==='weekly'){ e.dayOfWeek=parseInt(document.getElementById('editEventDayOfWeek').value); delete e.dayOfMonth; }
    else if(freq==='monthly'){ e.dayOfMonth=parseInt(document.getElementById('editEventDayOfMonth').value); delete e.dayOfWeek; }
    else{ delete e.dayOfWeek; delete e.dayOfMonth; }
    window.dataManager.saveData('autoEvents');
    window.modal.close();
    showAutoEvents();
}

function deleteEvent(i){ if(confirm('确定删除？')){ window.appData.autoEvents.splice(i,1); window.dataManager.saveData('autoEvents'); showAutoEvents(); } }
async function runNow(){ if(confirm('立即执行所有事件？')){ await window.dataManager.runAutoEvents(); alert('完成'); showAutoEvents(); } }
function showHistory(){ const logs=(window.appData.logs||[]).filter(l=>l.action==='自动事件').slice(0,50); window.modal.show('执行历史', `<div>${logs.map(l=>`<div>${l.timestamp}<br>${l.student_name} ${l.score_change>0?'+':''}${l.score_change}分<br>${l.reason}</div><hr>`).join('')||'<p>暂无</p>'}</div>`, [{text:'关闭',onclick:'window.modal.close'}]); }
function toggleEditFrequencyOptions(){ const f=document.getElementById('editEventFrequency').value; document.getElementById('editWeeklyOption').style.display=f==='weekly'?'block':'none'; document.getElementById('editMonthlyOption').style.display=f==='monthly'?'block':'none'; }
window.autoEvents={ showAutoEvents, showAddEvent, toggleFrequencyOptions, handleAddEvent, editEvent, handleEditEvent, deleteEvent, runNow, showHistory, toggleEditFrequencyOptions };

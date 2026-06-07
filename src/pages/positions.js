function showPositions() {
    if(!window.appData.positions) window.appData.positions={list:{},defaultSalary:5,lastPayDate:null};
    const positions=window.appData.positions.list||{}, userRole=window.currentUser?.role, studentId=window.currentUser?.student_id;
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>👔 职位系统</h2>${userRole==='root'?`<div class="btn-grid"><button class="btn btn-success" onclick="window.positions.showPaySalaries()">💰 发放工资</button><button class="btn btn-primary" onclick="window.positions.showAddPosition()">➕ 添加职位</button><button class="btn btn-primary" onclick="window.positions.showJoinPosition()">📝 登记职位</button></div>`:`<div class="btn-grid"><button class="btn btn-primary" onclick="window.positions.showJoinPosition()">📝 登记班干</button></div>`}<div id="positionsList">${renderPositionsList(positions,userRole,studentId)}</div></div>`;
}

function renderPositionsList(positions,userRole,currentId) {
    if(Object.keys(positions).length===0) return '<div class="warning-box"><p>暂无职位</p></div>';
    let html='';
    Object.entries(positions).forEach(([name,data])=>{ const salary=data.salary||5, members=data.members||[]; html+=`<div style="background:#fff6f0;border-radius:12px;margin-bottom:15px;"><div style="padding:12px;background:linear-gradient(135deg,#ff4e4e20,#ff9f4e20);"><span>${name}</span><span style="float:right">💰 ${salary}分/月${userRole==='root'?`<button class="btn btn-sm" onclick="window.positions.showSetSalary('${name}')">⚙️</button><button class="btn btn-sm btn-danger" onclick="window.positions.showDeletePosition('${name}')">🗑️</button>`:''}</span></div><div style="padding:15px;"><div style="display:flex;flex-wrap:wrap;gap:10px;">${members.map(m=>{ const n=window.utils.getStudentName(m); return `<div style="background:${m===currentId?'#ff9f4e':'white'};padding:5px 12px;border-radius:20px;"><span>${n}</span>${userRole==='root'?`<button class="btn btn-sm" onclick="window.positions.removeMember('${name}','${m}')">✖️</button>`:''}</div>`; }).join('')||'<span>暂无成员</span>'}</div>${userRole==='root'?`<button class="btn btn-sm btn-primary" onclick="window.positions.showAddMember('${name}')">➕ 添加成员</button>`:''}</div></div>`; });
    return html;
}

function showJoinPosition() {
    const positions=window.appData.positions?.list||{}, names=Object.keys(positions);
    if(names.length===0){ alert('暂无职位'); return; }
    const studentId=window.currentUser.student_id, current=[]; Object.entries(positions).forEach(([n,d])=>{ if(d.members?.includes(studentId)) current.push(n); });
    window.modal.show('登记职位', `<select id="joinPositionSelect">${names.map(n=>`<option value="${n}" ${current.includes(n)?'disabled':''}>${n} (💰${positions[n].salary||5}分/月) ${current.includes(n)?'已担任':''}</option>`).join('')}</select><p class="info-box">💡 可担任多个职位，工资叠加</p>`, [{text:'取消',onclick:'window.modal.close'},{text:'确认',onclick:'window.positions.handleJoinPosition',className:'btn-primary'}]);
}

function handleJoinPosition() {
    const pn=document.getElementById('joinPositionSelect').value, sid=window.currentUser.student_id;
    if(window.appData.positions.list[pn].members.includes(sid)){ alert('已担任'); return; }
    window.appData.positions.list[pn].members.push(sid);
    window.dataManager.saveData('positions');
    window.utils.addLog('登记职位', sid, 0, 0, `登记为${pn}`);
    window.modal.close(); showPositions(); window.modal.notify(`✅ 已登记${pn}`,'success');
}

function showAddPosition() {
    window.modal.show('添加职位', `<input type="text" id="newPositionName" placeholder="职位名" class="password-input"><input type="number" id="newPositionSalary" value="5" min="1" max="10" class="password-input"><small>工资1-10分/月</small>`, [{text:'取消',onclick:'window.modal.close'},{text:'添加',onclick:'window.positions.handleAddPosition',className:'btn-primary'}]);
}

function handleAddPosition() {
    const name=document.getElementById('newPositionName').value.trim(), salary=parseInt(document.getElementById('newPositionSalary').value);
    if(!name){ alert('请输入名称'); return; }
    if(isNaN(salary)||salary<1||salary>10){ alert('工资1-10'); return; }
    if(window.appData.positions.list[name]){ alert('已存在'); return; }
    window.appData.positions.list[name]={salary, members:[]};
    window.dataManager.saveData('positions');
    window.utils.addLog('添加职位','system',0,0,`添加${name}`);
    window.modal.close(); showPositions();
}

function showSetSalary(pn) {
    window.modal.show(`设置工资 - ${pn}`, `<input type="number" id="setSalaryValue" value="${window.appData.positions.list[pn].salary}" min="1" max="10" class="password-input">`, [{text:'取消',onclick:'window.modal.close'},{text:'确认',onclick:`window.positions.handleSetSalary('${pn}')`,className:'btn-primary'}]);
}

function handleSetSalary(pn) {
    const ns=parseInt(document.getElementById('setSalaryValue').value);
    if(isNaN(ns)||ns<1||ns>10){ alert('工资1-10'); return; }
    window.appData.positions.list[pn].salary=ns;
    window.dataManager.saveData('positions');
    window.modal.close(); showPositions();
}

function showDeletePosition(pn) {
    window.modal.show('删除职位', `<div class="warning-box">删除"${pn}"？现有成员${window.appData.positions.list[pn].members?.length||0}人</div><label><input type="checkbox" id="confirmDelete"> 确认</label>`, [{text:'取消',onclick:'window.modal.close'},{text:'删除',onclick:`window.positions.handleDeletePosition('${pn}')`,className:'btn-danger'}]);
}

function handleDeletePosition(pn) {
    if(!document.getElementById('confirmDelete')?.checked){ alert('请确认'); return; }
    delete window.appData.positions.list[pn];
    window.dataManager.saveData('positions');
    window.modal.close(); showPositions();
}

function showAddMember(pn) {
    const students=window.utils.getAllStudents(), members=window.appData.positions.list[pn].members||[], available=students.filter(s=>!members.includes(s.id));
    if(available.length===0){ alert('所有学生已担任'); return; }
    window.modal.show(`添加成员-${pn}`, `<select id="addMemberSelect">${available.map(s=>`<option value="${s.id}">${s.name}(${s.id})</option>`).join('')}</select>`, [{text:'取消',onclick:'window.modal.close'},{text:'添加',onclick:`window.positions.handleAddMember('${pn}')`,className:'btn-primary'}]);
}

function handleAddMember(pn) {
    const sid=document.getElementById('addMemberSelect').value;
    if(!window.appData.positions.list[pn].members.includes(sid)) window.appData.positions.list[pn].members.push(sid);
    window.dataManager.saveData('positions');
    window.modal.close(); showPositions();
}

function removeMember(pn, sid) {
    if(!confirm(`移除${window.utils.getStudentName(sid)}？`)) return;
    const idx=window.appData.positions.list[pn].members.indexOf(sid);
    if(idx!==-1) window.appData.positions.list[pn].members.splice(idx,1);
    window.dataManager.saveData('positions');
    showPositions();
}

function showPaySalaries() {
    const positions=window.appData.positions?.list||{}, lastPay=window.appData.positions?.lastPayDate, today=window.utils.getBeijingDate(), salaryMap={};
    Object.entries(positions).forEach(([name,data])=>{ const salary=data.salary||5; (data.members||[]).forEach(m=>{ salaryMap[m]=(salaryMap[m]||0)+salary; }); });
    const studentsWith=Object.entries(salaryMap).filter(([,s])=>s>0);
    if(studentsWith.length===0){ alert('无职位成员'); return; }
    const canPay=lastPay!==today;
    window.modal.show('发放工资', `${!canPay?'<div class="warning-box">今日已发过！</div>':''}<table class="data-table"><thead><tr><th>姓名</th><th>职位</th><th>应发</th></tr></thead><tbody>${studentsWith.map(([id,total])=>{ const name=window.utils.getStudentName(id); const pos=Object.entries(positions).filter(([,d])=>d.members?.includes(id)).map(([n,d])=>`${n}(${d.salary||5})`).join(','); return `<tr><td>${name}</td><td>${pos}</td><td>+${total}</td></tr>`; }).join('')}</tbody></table><label><input type="checkbox" id="confirmPay" ${!canPay?'disabled':''}> 确认发放</label>`, [{text:'取消',onclick:'window.modal.close'},{text:'确认',onclick:'window.positions.handlePaySalaries',className:'btn-success'}]);
}

function handlePaySalaries() {
    const confirm=document.getElementById('confirmPay')?.checked, lastPay=window.appData.positions?.lastPayDate, today=window.utils.getBeijingDate();
    if(lastPay===today){ alert('今日已发过'); return; }
    if(!confirm){ alert('请确认'); return; }
    const positions=window.appData.positions.list, salaryMap={};
    Object.entries(positions).forEach(([name,data])=>{ const salary=data.salary||5; (data.members||[]).forEach(m=>{ salaryMap[m]=(salaryMap[m]||0)+salary; }); });
    let totalPaid=0;
    Object.entries(salaryMap).forEach(([id,total])=>{ if(total>0){ window.utils.updateStudentScore(id, total, `职位工资发放(${total}学分)`); totalPaid+=total; } });
    window.appData.positions.lastPayDate=today;
    window.dataManager.saveData('positions');
    window.utils.addLog('发放工资','system',totalPaid,0,`共发放${totalPaid}学分`);
    window.modal.close(); showPositions(); window.modal.notify(`💰 已发放${totalPaid}学分`,'success');
}

window.positions={ showPositions, showJoinPosition, handleJoinPosition, showAddPosition, handleAddPosition, showSetSalary, handleSetSalary, showDeletePosition, handleDeletePosition, showAddMember, handleAddMember, removeMember, showPaySalaries, handlePaySalaries };

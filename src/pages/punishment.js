function showPunishment() {
    const studentId = window.currentUser.student_id;
    const score = window.utils.getStudentScore(studentId);
    const active = (window.appData.userPunishments?.active?.[studentId]) || [];
    const completed = (window.appData.userPunishments?.completed?.[studentId]) || [];
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>🎯 惩罚管理</h2><div class="stats-grid"><div class="stat-card"><div class="stat-value">${score}</div><div class="stat-label">分数</div></div><div class="stat-card"><div class="stat-value">${active.length}</div><div class="stat-label">进行中</div></div><div class="stat-card"><div class="stat-value">${completed.length}</div><div class="stat-label">已完成</div></div></div>${score<100?'<div class="info-box">🎯 分数低于100，可抽惩罚</div>':'<div class="warning-box">⚠️ 需低于100分才能抽惩罚</div>'}<div class="btn-grid"><button class="btn btn-primary" onclick="window.punishment.handleDrawPunishment()" ${score>=100?'disabled':''}>🎲 抽取惩罚</button><button class="btn" onclick="window.punishment.showMyPunishments()">📋 我的惩罚</button><button class="btn" onclick="window.punishment.showCompletePunishment()">✅ 完成惩罚</button><button class="btn" onclick="window.punishment.showPunishmentPool()">📚 惩罚池</button></div>${active.length?`<h3>进行中</h3>${active.map(p=>`<div><strong>${p.name}</strong><br>${p.description}<br>⏰ 截止:${new Date(p.deadline).toLocaleString()}</div>`).join('')}`:''}</div>`;
}

function showPunishmentPool() {
    const puns = window.appData.punishments?.punishments || {};
    window.modal.show('惩罚池', `<div>${Object.entries(puns).map(([r,list])=>`<h4>${r}</h4>${list.map(p=>`<div><strong>${p.name}</strong> (${p.probability}%)<br>${p.description}<br>💰成功+${p.score[0]*10} 失败${p.score[1]*10}</div>`).join('')}`).join('')}</div>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function handleDrawPunishment() {
    const studentId = window.currentUser.student_id;
    if(window.utils.getStudentScore(studentId)>=100){ alert('分数需低于100分'); return; }
    const pool = [];
    Object.entries(window.appData.punishments?.punishments||{}).forEach(([rarity,list])=>{(list||[]).forEach(p=>{ for(let i=0;i<(p.probability||1);i++) pool.push({...p, rarity}); });});
    if(pool.length===0){ alert('暂无惩罚'); return; }
    const pun = pool[Math.floor(Math.random()*pool.length)];
    const deadline = new Date(); if(pun.time?.[0]?.endsWith('d')) deadline.setDate(deadline.getDate()+parseInt(pun.time[0])); else deadline.setHours(deadline.getHours()+1);
    const newPun = { id:Date.now().toString(), name:pun.name, description:pun.description, rarity:pun.rarity, time_limit:pun.time?.[0]||'', task_duration:pun.time?.[1]||'', success_gold:(pun.score?.[0]||0)*10, fail_gold:(pun.score?.[1]||0)*10, deadline:deadline.toISOString(), draw_time:new Date().toISOString(), status:'active' };
    if(!window.appData.userPunishments) window.appData.userPunishments={active:{},completed:{}};
    if(!window.appData.userPunishments.active[studentId]) window.appData.userPunishments.active[studentId]=[];
    window.appData.userPunishments.active[studentId].push(newPun);
    window.dataManager.saveData('userPunishments');
    window.utils.addLog('抽取惩罚', studentId, 0, window.utils.getStudentScore(studentId), `抽到:${pun.name}`);
    window.modal.show('抽到惩罚', `<div><h3>${pun.name}</h3><p>${pun.description}</p><p>⏰ ${pun.time?.[0]}</p><p>💰成功:+${(pun.score?.[0]||0)*10} 失败:${(pun.score?.[1]||0)*10}</p></div>`, [{text:'确定',onclick:'window.modal.close();window.punishment.showPunishment();'}]);
}

function showMyPunishments() {
    const studentId = window.currentUser.student_id;
    const active = window.appData.userPunishments?.active?.[studentId]||[];
    const completed = window.appData.userPunishments?.completed?.[studentId]||[];
    window.modal.show('我的惩罚', `<h4>进行中(${active.length})</h4>${active.map(p=>`<div><strong>${p.name}</strong><br>${p.description}<br>截止:${new Date(p.deadline).toLocaleString()}</div>`).join('')||'<p>无</p>'}<h4>已完成(${completed.length})</h4>${completed.map(p=>`<div><strong>${p.name}</strong><br>结果:${p.result} +${p.final_gold}金币</div>`).join('')||'<p>无</p>'}`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function showCompletePunishment() {
    const studentId = window.currentUser.student_id;
    const active = window.appData.userPunishments?.active?.[studentId]||[];
    if(active.length===0){ alert('无进行中的惩罚'); return; }
    const witnesses = Object.entries(window.appData.scores||{}).filter(([id])=>id!==studentId && id!=='0').map(([id,[name]])=>`${id}-${name}`);
    window.modal.show('完成惩罚', `<select id="completePunSelect">${active.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select><select id="witnessSelect">${witnesses.map(w=>`<option value="${w.split('-')[0]}">${w}</option>`).join('')}</select><div><label><input type="radio" name="punResult" value="success" checked> 成功</label><label><input type="radio" name="punResult" value="fail"> 失败</label></div>`, [{text:'取消',onclick:'window.modal.close'},{text:'确认',onclick:'window.punishment.handleCompletePunishment',className:'btn-primary'}]);
}

function handleCompletePunishment() {
    const studentId = window.currentUser.student_id;
    const punId = document.getElementById('completePunSelect').value;
    const witnessId = document.getElementById('witnessSelect').value;
    const result = document.querySelector('input[name="punResult"]:checked').value;
    const active = window.appData.userPunishments.active[studentId];
    const idx = active.findIndex(p=>p.id===punId);
    if(idx===-1) return;
    const pun = active[idx];
    const finalGold = result==='success' ? pun.success_gold : pun.fail_gold;
    window.utils.updateStudentGold(studentId, finalGold);
    pun.status='completed'; pun.completion_time=new Date().toISOString(); pun.result=result==='success'?'成功完成':'未能完成'; pun.final_gold=finalGold; pun.witness=window.appData.scores[witnessId]?.[0]||'未知'; pun.witness_id=witnessId;
    if(!window.appData.userPunishments.completed[studentId]) window.appData.userPunishments.completed[studentId]=[];
    window.appData.userPunishments.completed[studentId].push(pun);
    active.splice(idx,1);
    window.dataManager.saveData('userPunishments');
    alert(`完成！获得 ${finalGold} 金币`);
    window.modal.close();
    showPunishment();
}

window.punishment = { showPunishment, showPunishmentPool, handleDrawPunishment, showMyPunishments, showCompletePunishment, handleCompletePunishment };

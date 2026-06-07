function showGacha() {
    const studentId = window.currentUser.student_id;
    const gold = window.utils.getStudentGold(studentId);
    const score = window.utils.getStudentScore(studentId);
    const rewards = window.appData.rewards?.rewards || {};
    let rewardsHtml = '';
    Object.entries(rewards).slice(0,4).forEach(([rarity,list])=>{ if(Array.isArray(list)) list.slice(0,2).forEach(r=>{ rewardsHtml += `<div class="reward-card reward-rarity-${rarity}"><div>${r.name}</div><div>${r.description}</div><div>${r.probability}%</div></div>`; }); });
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>🎰 学分抽奖</h2><div class="stats-grid"><div class="stat-card"><div class="stat-value">${gold}</div><div class="stat-label">金币</div></div><div class="stat-card"><div class="stat-value">${score}</div><div class="stat-label">学分</div></div><div class="stat-card"><div class="stat-value">160</div><div class="stat-label">单抽</div></div><div class="stat-card"><div class="stat-value">1600</div><div class="stat-label">十连</div></div></div><div style="text-align:center;margin:20px;">${window.utils.isFridayAfternoon()?'<div style="color:#ff6b4a;">🎉 周五下午，可以抽奖！</div>':'<div style="color:#ff4e4e;">⏰ 仅周五12:00后开放</div>'}</div><div class="btn-grid"><button class="btn btn-primary" onclick="window.gacha.handleSingleGacha()" ${!window.utils.isFridayAfternoon()?'disabled':''}>🎯 单抽(160)</button><button class="btn btn-primary" onclick="window.gacha.handleMultiGacha()" ${!window.utils.isFridayAfternoon()?'disabled':''}>🎊 十连(1600)</button></div><div class="btn-grid"><button class="btn" onclick="window.gacha.showGachaHistory()">📋 记录</button><button class="btn" onclick="window.gacha.showRewardPool()">🎁 奖励池</button></div><div><h3>🎁 奖励预览</h3><div class="reward-grid">${rewardsHtml}</div></div></div>`;
}

function showGachaHistory() {
    const logs = (window.appData.logs||[]).filter(l=>l.student_id===window.currentUser.student_id && (l.action==='抽奖消耗'||l.action==='十连抽消耗'));
    window.modal.show('抽奖记录', `<div>${logs.map(l=>`<div>📅 ${l.timestamp}<br>${l.action}: ${l.reason}<br>💰 ${l.score_change}金币</div><hr>`).join('')||'<p>暂无记录</p>'}</div>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function showRewardPool() {
    const rewards = window.appData.rewards || {};
    let html='';
    Object.entries(rewards).forEach(([r,list])=>{ if(r!=='hidden_rewards' && Array.isArray(list)){ html+=`<h4>${r}</h4>`; list.forEach(item=>{ html+=`<div><strong>${item.name}</strong> (${item.probability}%)<br>${item.description}</div>`; }); } });
    if(rewards.hidden_rewards) html+=`<h4>🎁 隐藏</h4>${rewards.hidden_rewards.map(r=>`<div><strong>${r.name}</strong> (${r.probability}%)<br>${r.description}</div>`).join('')}`;
    window.modal.show('奖励池', `<div style="max-height:400px;overflow:auto;">${html||'<p>暂无</p>'}</div>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function handleSingleGacha() {
    const studentId = window.currentUser.student_id;
    if(window.utils.getStudentGold(studentId)<160){ alert('金币不足'); return; }
    if(!confirm('消耗160金币单抽？')) return;
    window.utils.updateStudentGold(studentId, -160);
    const reward = window.utils.drawReward();
    if(reward.name.includes('+')){ const m = reward.name.match(/(\d+)/); if(m) window.utils.updateStudentScore(studentId, parseInt(m[0]), `抽奖:${reward.name}`); }
    window.utils.addLog('抽奖消耗', studentId, -160, window.utils.getStudentGold(studentId), `获得:${reward.name}`);
    window.modal.show('抽奖结果', `<div class="reward-card reward-rarity-${reward.rarity}"><div>${reward.name}</div><div>${reward.description}</div></div><p>剩余金币:${window.utils.getStudentGold(studentId)}</p>`, [{text:'关闭',onclick:'window.modal.close();window.gacha.showGacha();'}]);
}

function handleMultiGacha() {
    const studentId = window.currentUser.student_id;
    if(window.utils.getStudentGold(studentId)<1600){ alert('金币不足'); return; }
    if(!confirm('消耗1600金币十连？')) return;
    window.utils.updateStudentGold(studentId, -1600);
    const rewards = []; for(let i=0;i<10;i++) rewards.push(window.utils.drawReward());
    const stats = {};
    rewards.forEach(r=>{ stats[r.rarity]=(stats[r.rarity]||0)+1; if(r.name.includes('+')){ const m=r.name.match(/(\d+)/); if(m) window.utils.updateStudentScore(studentId, parseInt(m[0]), `十连:${r.name}`); } });
    window.utils.addLog('十连抽消耗', studentId, -1600, window.utils.getStudentGold(studentId), `获得10个奖励`);
    window.modal.show('十连结果', `<h4>稀有度统计</h4>${Object.entries(stats).map(([r,c])=>`<p>${r}:${c}个</p>`).join('')}<h4>详细</h4>${rewards.map((r,i)=>`<div>${i+1}. ${r.name} - ${r.description}</div>`).join('')}<p>剩余金币:${window.utils.getStudentGold(studentId)}</p>`, [{text:'关闭',onclick:'window.modal.close();window.gacha.showGacha();'}]);
}

window.gacha = { showGacha, showGachaHistory, showRewardPool, handleSingleGacha, handleMultiGacha };

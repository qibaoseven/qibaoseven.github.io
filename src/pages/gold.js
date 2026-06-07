function showGoldSystem() {
    const studentId = window.currentUser.student_id;
    const score = window.utils.getStudentScore(studentId);
    const gold = window.utils.getStudentGold(studentId);
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>💰 金币系统</h2><div class="stats-grid"><div class="stat-card"><div class="stat-value">${score}</div><div class="stat-label">学分</div></div><div class="stat-card"><div class="stat-value">${gold}</div><div class="stat-label">金币</div></div></div><div style="background:linear-gradient(135deg,#ff4e4e,#ff9f4e);padding:20px;border-radius:10px;color:white;"><h3>今日汇率</h3><p>学分→金币:1:${window.appData.exchangeRate.score_to_gold?.toFixed(4)||0.1}</p><p>金币→学分:1:${window.appData.exchangeRate.gold_to_score?.toFixed(4)||1}</p></div><div class="btn-grid"><button class="btn btn-primary" onclick="window.gold.showScoreToGold()">学分换金币</button><button class="btn btn-primary" onclick="window.gold.showGoldToScore()">金币换学分</button><button class="btn" onclick="window.gold.showGoldTasks()">金币任务</button><button class="btn" onclick="window.gold.showGoldHistory()">金币历史</button><button class="btn" onclick="window.gold.showGoldRanking()">金币排名</button></div><div><h3>金币榜</h3><table class="data-table"><thead><tr><th>排名</th><th>姓名</th><th>金币</th></tr></thead><tbody>${window.utils.getGoldRanking(10).map((item,i)=>`<tr ${item.id===studentId?'style="background:#fff6f0;"':''}><td>${i+1}</td><td>${item.name}</td><td>${item.gold}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function showGoldRanking() {
    const rankings = window.utils.getGoldRanking();
    window.modal.show('金币榜', `<table class="data-table"><thead><tr><th>排名</th><th>姓名</th><th>金币</th></tr></thead><tbody>${rankings.map((r,i)=>`<tr><td>${i+1}</td><td>${r.name}</td><td>${r.gold}</td></tr>`).join('')}</tbody><tr>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function showScoreToGold() {
    const rate = window.appData.exchangeRate.score_to_gold||0.1;
    window.modal.show('学分换金币', `<p>当前学分:${window.utils.getStudentScore(window.currentUser.student_id)}</p><p>汇率:1学分=${rate.toFixed(4)}金币</p><input type="number" id="exchangeScore" placeholder="学分数量" class="password-input"><div id="exchangePreview">预计获得:0金币</div>`, [{text:'取消',onclick:'window.modal.close'},{text:'确认',onclick:'window.gold.handleScoreToGold',className:'btn-primary'}]);
    document.getElementById('exchangeScore').oninput=function(){ const s=parseFloat(this.value)||0; document.getElementById('exchangePreview').innerHTML=`预计获得:${(s*rate).toFixed(2)}金币`; };
}

function handleScoreToGold() {
    const studentId = window.currentUser.student_id;
    const score = parseFloat(document.getElementById('exchangeScore').value);
    const rate = window.appData.exchangeRate.score_to_gold||0.1;
    if(isNaN(score)||score<=0){ alert('请输入有效数量'); return; }
    if(score>window.utils.getStudentScore(studentId)){ alert('学分不足'); return; }
    const gold = score*rate;
    window.utils.updateStudentScore(studentId, -score, `兑换金币${gold.toFixed(2)}`);
    window.utils.updateStudentGold(studentId, gold);
    window.utils.updateExchangeRate();
    alert(`获得 ${gold.toFixed(2)} 金币`);
    window.modal.close();
    showGoldSystem();
}

function showGoldToScore() {
    const rate = window.appData.exchangeRate.gold_to_score||1;
    window.modal.show('金币换学分', `<p>当前金币:${window.utils.getStudentGold(window.currentUser.student_id)}</p><p>汇率:1金币=${rate.toFixed(4)}学分</p><input type="number" id="exchangeGold" placeholder="金币数量" class="password-input"><div id="exchangePreview2">预计获得:0学分</div>`, [{text:'取消',onclick:'window.modal.close'},{text:'确认',onclick:'window.gold.handleGoldToScore',className:'btn-primary'}]);
    document.getElementById('exchangeGold').oninput=function(){ const g=parseFloat(this.value)||0; document.getElementById('exchangePreview2').innerHTML=`预计获得:${(g*rate).toFixed(2)}学分`; };
}

function handleGoldToScore() {
    const studentId = window.currentUser.student_id;
    const gold = parseFloat(document.getElementById('exchangeGold').value);
    const rate = window.appData.exchangeRate.gold_to_score||1;
    if(isNaN(gold)||gold<=0){ alert('请输入有效数量'); return; }
    if(gold>window.utils.getStudentGold(studentId)){ alert('金币不足'); return; }
    const score = gold*rate;
    window.utils.updateStudentGold(studentId, -gold);
    window.utils.updateStudentScore(studentId, score, `用${gold}金币兑换`);
    window.utils.updateExchangeRate();
    alert(`获得 ${score.toFixed(2)} 学分`);
    window.modal.close();
    showGoldSystem();
}

function showGoldTasks() {
    window.modal.show('金币任务', `<div><h4>📚 每日任务</h4><p>作业完成:+5</p><p>表现优秀:+3</p><p>帮助同学:+2</p><h4>🏆 成绩任务</h4><p>进步10分:+10</p><p>班级前三:+15</p></div>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function showGoldHistory() {
    const goldData = window.appData.gold[window.currentUser.student_id]||{amount:0};
    window.modal.show('金币历史', `<p>当前:${goldData.amount.toFixed(2)}</p><p>最后更新:${goldData.last_updated||'未知'}</p><div>汇率信息:<br>学分→金币:${window.appData.exchangeRate.score_to_gold?.toFixed(4)}<br>金币→学分:${window.appData.exchangeRate.gold_to_score?.toFixed(4)}</div>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

window.gold = { showGoldSystem, showGoldRanking, showScoreToGold, handleScoreToGold, showGoldToScore, handleGoldToScore, showGoldTasks, showGoldHistory };

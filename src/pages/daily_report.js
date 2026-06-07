function showDailyReport() {
    const canModify = window.currentUser?.role === 'admin';
    if (!canModify) { showReadOnlyDailyReport(); return; }
    const students = window.utils.getAllStudents().sort((a,b)=>parseInt(a.id)-parseInt(b.id));
    const today = window.utils.getBeijingDate();
    const reportStatus = window.appData.dailyReport?.[today] || {};
    const allReported = reportStatus.allReported || false;
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>📋 每日汇报</h2><div class="stats-grid"><div class="stat-card"><div class="stat-value">${allReported?'✅':'⭕'}</div><div class="stat-label">今日状态</div></div><div class="stat-card"><div class="stat-value">${students.length}</div><div class="stat-label">学生数</div></div></div><div class="btn-grid"><button class="btn btn-success" onclick="window.dailyReport.handleAllReported()" ${allReported?'disabled':''}>✅ 一键全部汇报</button><button class="btn btn-primary" onclick="window.dailyReport.batchApplyScores()">💾 批量应用分数</button><button class="btn btn-primary" onclick="window.dailyReport.resetDailyReport()">🔄 重置今日状态</button></div><div class="info-box">使用+2/-2调整分数，点"批量应用分数"保存，最后点"一键全部汇报"</div><div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>学号</th><th>姓名</th><th>当前分数</th><th colspan="3">调整</th></tr></thead><tbody>${students.map(s=>`<tr><td>${s.id}</td><td>${s.name}</td><td class="current-score" id="score-${s.id}">${s.score}</td><td><button class="btn btn-sm" onclick="window.dailyReport.adjustInput('${s.id}',-2)">-2</button></td><td><input type="number" class="score-input" id="input-${s.id}" value="0" style="width:70px;"></td><td><button class="btn btn-sm btn-success" onclick="window.dailyReport.adjustInput('${s.id}',2)">+2</button></td></tr>`).join('')}</tbody></table></div></div>`;
}

function showReadOnlyDailyReport() {
    const today = window.utils.getBeijingDate();
    const reportStatus = window.appData.dailyReport?.[today] || {};
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>📋 每日汇报</h2><div class="stat-card"><div class="stat-value">${reportStatus.allReported?'✅ 已汇报':'⭕ 未汇报'}</div><div class="stat-label">今日状态</div></div>${reportStatus.lastReportTime?`<div class="info-box">最后汇报:${reportStatus.lastReportTime}</div>`:'<div class="warning-box">尚未汇报</div>'}</div>`;
}

function adjustInput(studentId, delta) { const input = document.getElementById(`input-${studentId}`); if(input) input.value = (parseInt(input.value)||0) + delta; }

function batchApplyScores() {
    let success=0, total=0, hasChanges=false;
    window.utils.getAllStudents().forEach(s=>{
        const input = document.getElementById(`input-${s.id}`);
        if(input){
            const change = parseInt(input.value)||0;
            if(change!==0){
                window.utils.updateStudentScore(s.id, change, '每日汇报分数调整', false);
                success++; total+=change; hasChanges=true;
                document.getElementById(`score-${s.id}`).textContent = window.utils.getStudentScore(s.id);
                input.value=0;
            }
        }
    });
    if(!hasChanges){ alert('无变动'); return; }
    window.dataManager.saveData('scores');
    alert(`✅ 为 ${success} 人调整分数，总变动 ${total} 分`);
}

function handleAllReported() {
    if(!confirm('确定今日所有学生都已汇报？')) return;
    const today = window.utils.getBeijingDate();
    window.appData.dailyReport[today] = { allReported: true, lastReportTime: window.utils.formatDateWithMs() };
    window.dataManager.saveData('dailyReport');
    window.utils.addLog('每日汇报', 'system', 0, 0, '今日全部汇报完成');
    showDailyReport();
}

function resetDailyReport() {
    if(!confirm('重置今日状态？')) return;
    const today = window.utils.getBeijingDate();
    if(window.appData.dailyReport?.[today]) delete window.appData.dailyReport[today];
    window.dataManager.saveData('dailyReport');
    showDailyReport();
}

window.dailyReport = { showDailyReport, adjustInput, batchApplyScores, handleAllReported, resetDailyReport };

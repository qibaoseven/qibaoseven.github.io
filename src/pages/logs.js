function showLogs() {
    if(!window.auth.hasPermission('操作日志')){ alert('权限不足'); return; }
    const logs = window.appData.logs||[];
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>📋 操作日志</h2><input type="text" id="logSearchInput" placeholder="搜索..." onkeyup="window.logs.filterLogs(this.value)" class="password-input"><div class="btn-grid"><button class="btn btn-primary" onclick="window.logs.exportLogs()">📤 导出</button><button class="btn btn-danger" onclick="window.logs.clearLogs()">🗑️ 清空</button><button class="btn" onclick="window.logs.showLogStats()">📊 统计</button></div><p>共${logs.length}条，显示最新50条</p><div id="logsList">${logs.slice(0,50).map(l=>`<div class="log-item" data-content="${(l.student_name||'')} ${l.action||''} ${l.reason||''}" style="padding:10px;margin:10px 0;background:#fff6f0;border-left:3px solid ${l.score_change>0?'#ff9f4e':l.score_change<0?'#ff4e4e':'#ffb84e'}"><div>📅 ${l.timestamp}<span style="float:right">${l.score_change>0?'+':''}${l.score_change}</span></div><div><strong>${l.student_name||'未知'}</strong> ${l.action} ${l.reason?`- ${l.reason}`:''}</div><div>🎓 ${l.current_score}分 👤 ${l.user_role}</div></div>`).join('')||'<p>暂无日志</p>'}</div></div>`;
}

function exportLogs() {
    const logs = window.appData.logs||[];
    if(logs.length===0){ alert('无日志'); return; }
    const blob = new Blob([JSON.stringify({logs, metadata:{exportTime:new Date().toISOString(), totalCount:logs.length}},null,2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`logs_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(a.href);
}

function clearLogs(){ if(confirm('清空所有日志？')){ window.appData.logs=[]; window.dataManager.saveData('logs'); showLogs(); } }

function filterLogs(kw){ document.querySelectorAll('.log-item').forEach(el=>{ el.style.display=el.getAttribute('data-content').toLowerCase().includes(kw.toLowerCase())?'': 'none'; }); }

function showLogStats(){
    const logs=window.appData.logs||[];
    const actions={}, users={}, pages={};
    logs.forEach(l=>{ actions[l.action]=(actions[l.action]||0)+1; users[l.student_name]=(users[l.student_name]||0)+1; pages[l.page]=(pages[l.page]||0)+1; });
    window.modal.show('统计', `<h4>总日志:${logs.length}</h4><h4>热门操作</h4>${Object.entries(actions).slice(0,10).map(([a,c])=>`<p>${a}:${c}</p>`).join('')}<h4>活跃用户</h4>${Object.entries(users).slice(0,10).map(([u,c])=>`<p>${u}:${c}</p>`).join('')}<h4>页面访问</h4>${Object.entries(pages).map(([p,c])=>`<p>${p}:${c}</p>`).join('')}`, [{text:'关闭',onclick:'window.modal.close'}]);
}

window.logs = { showLogs, exportLogs, clearLogs, filterLogs, showLogStats };

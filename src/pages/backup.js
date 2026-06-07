function showBackup() {
    if(!window.auth.hasPermission('数据备份')){ alert('权限不足'); return; }
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>💾 数据备份</h2><div class="btn-grid"><button class="btn btn-primary" onclick="window.backup.exportData()">📤 导出</button><button class="btn btn-primary" onclick="window.backup.importData()">📂 导入单文件</button><button class="btn btn-success" onclick="window.backup.showImportFolder()">📁 导入文件夹</button><button class="btn btn-danger" onclick="window.backup.resetToDefault()">🔄 重置</button></div><div class="stats-grid"><div class="stat-card"><div class="stat-value">${Object.keys(window.appData.users).length}</div><div class="stat-label">用户</div></div><div class="stat-card"><div class="stat-value">${window.utils.getAllStudents().length}</div><div class="stat-label">学生</div></div></div></div>`;
}

function exportData() {
    const exportData = { users:window.appData.users, scores:window.appData.scores, groups:window.appData.groups, rules:window.appData.rules, logs:window.appData.logs, rewards:window.appData.rewards, punishments:window.appData.punishments, userPunishments:window.appData.userPunishments, gold:window.appData.gold, exchangeRate:window.appData.exchangeRate, emoji:window.appData.emoji, dailyReport:window.appData.dailyReport, autoEvents:window.appData.autoEvents, positions:window.appData.positions, METADATA:{exportTime:new Date().toISOString(), version:'3.0'} };
    const blob=new Blob([JSON.stringify(exportData,null,2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`studentos_backup_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(a.href);
}

function importData() {
    const input=document.createElement('input'); input.type='file'; input.accept='.json';
    input.onchange=e=>{ const file=e.target.files[0]; const reader=new FileReader(); reader.onload=e=>{ try{ const imported=JSON.parse(e.target.result); let count=0; Object.entries(imported).forEach(([k,v])=>{ if(k==='METADATA') return; const dataKey=k.toLowerCase(); if(window.appData[dataKey]!==undefined){ if(dataKey==='logs' && Array.isArray(v)){ const all=[...v,...window.appData.logs]; all.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)); window.appData.logs=all.slice(0,200); }else if(typeof v==='object' && v!==null) window.appData[dataKey]={...window.appData[dataKey], ...v}; else window.appData[dataKey]=v; count++; } }); if(window.saveAllDataToCloud) window.saveAllDataToCloud(); alert(`✅ 导入${count}项`); if(window.currentUser) window.dashboard.showDashboard(); }catch(err){ alert('无效文件'); } }; reader.readAsText(file); }; input.click();
}

function showImportFolder() {
    window.modal.show('导入文件夹', `<input type="file" id="folderInput" webkitdirectory directory multiple style="display:none;"><label for="folderInput" style="display:block;padding:30px;background:#fff6f0;border:2px dashed #ffd1b8;text-align:center;cursor:pointer;">📂 选择文件夹</label><div id="importResult"></div>`, [{text:'关闭',onclick:'window.modal.close'}]);
    document.getElementById('folderInput').onchange=async function(e){
        const files=Array.from(e.target.files).filter(f=>f.name.endsWith('.json')); let success=0;
        for(const file of files){ try{ const content=await file.text(); const data=JSON.parse(content); const fn=file.name.toLowerCase(); if(fn.includes('user')) window.appData.users={...window.appData.users,...data}; else if(fn.includes('score')&&!fn.includes('rules')) window.appData.scores={...window.appData.scores,...data}; else if(fn.includes('group')) window.appData.groups={...window.appData.groups,...data}; else if(fn.includes('rules')) window.appData.rules={...window.appData.rules,...data}; else if(fn.includes('log')){ const all=[...data,...window.appData.logs]; all.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)); window.appData.logs=all.slice(0,200); }else if(fn.includes('reward')) window.appData.rewards={...window.appData.rewards,...data}; else if(fn.includes('punishment')) window.appData.punishments={...window.appData.punishments,...data}; else if(fn.includes('gold')) window.appData.gold={...window.appData.gold,...data}; else if(fn.includes('auto')) window.appData.autoEvents=data; else if(fn.includes('position')) window.appData.positions={...window.appData.positions,...data}; success++; }catch(err){ console.warn(file.name,err); } }
        if(window.saveAllDataToCloud) window.saveAllDataToCloud();
        document.getElementById('importResult').innerHTML=`<div class="success-box">✅ 成功${success}个文件</div>`;
        setTimeout(()=>window.modal.close(),1500);
    };
}

function resetToDefault() {
    if(confirm('重置所有数据？')){ window.appData={ users:{}, scores:{}, groups:{}, rules:{}, logs:[], rewards:{}, punishments:{}, userPunishments:{active:{},completed:{}}, gold:{}, exchangeRate:{score_to_gold:0.1,gold_to_score:1,last_updated:null}, emoji:{emojis:'😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘'}, dailyReport:{}, autoEvents:[], positions:{list:{},defaultSalary:5,lastPayDate:null} }; if(window.saveAllDataToCloud) window.saveAllDataToCloud(); alert('已重置'); if(window.currentUser) window.dashboard.showDashboard(); }
}

window.backup = { showBackup, exportData, importData, showImportFolder, resetToDefault };

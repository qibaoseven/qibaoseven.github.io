function showRanking() {
    const topStudents = window.utils.getTopRanking(10);
    document.getElementById('contentArea').innerHTML = `<div class="content-card"><h2>🏆 排名管理</h2><div class="btn-grid"><button class="btn btn-primary" onclick="window.rank.showIndividualRanking()">个人排名</button><button class="btn btn-primary" onclick="window.rank.showGroupRanking()">分组排名</button><button class="btn btn-primary" onclick="window.rank.showGroupMemberRanking()">组内排名</button><button class="btn btn-primary" onclick="window.rank.showScoreDistribution()">分数分布</button></div><div><h3>TOP 10</h3><table class="data-table"><thead><tr><th>排名</th><th>姓名</th><th>学号</th><th>分数</th></tr></thead><tbody>${topStudents.map((s,i)=>`<tr ${s.id===window.currentUser?.student_id?'style="background:#fff6f0;"':''}><td>${i+1}</td><td>${s.name}</td><td>${s.id}</td><td><strong>${s.score}</strong></td></tr>`).join('')}</tbody></table></div></div>`;
}

function showIndividualRanking() {
    const rankings = window.utils.getTopRanking();
    window.modal.show('个人排名', `<table class="data-table"><thead><tr><th>排名</th><th>姓名</th><th>学号</th><th>分数</th></tr></thead><tbody>${rankings.map((s,i)=>`<tr><td>${i+1}</td><td>${s.name}</td><td>${s.id}</td><td>${s.score}</td></tr>`).join('')}</tbody></table>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function showGroupRanking() {
    const groupScores = [];
    Object.entries(window.appData.groups||{}).forEach(([name,members])=> {
        const valid = members.filter(id=>window.appData.scores[id]&&id!=='0');
        if(valid.length) { const total = valid.reduce((s,id)=>s+window.appData.scores[id][1],0); groupScores.push({name, avgScore:total/valid.length, count:valid.length, totalScore:total}); }
    });
    groupScores.sort((a,b)=>b.avgScore - a.avgScore);
    window.modal.show('分组排名', `<table class="data-table"><thead><tr><th>排名</th><th>分组</th><th>平均分</th><th>成员数</th><th>总分</th></tr></thead><tbody>${groupScores.map((g,i)=>`<tr><td>${i+1}</td><td><strong>${g.name}</strong></td><td>${g.avgScore.toFixed(2)}</td><td>${g.count}</td><td>${g.totalScore}</td></tr>`).join('')}</tbody></table>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

function showGroupMemberRanking() {
    const groups = Object.keys(window.appData.groups||{});
    if(groups.length===0){alert('暂无分组');return;}
    window.modal.show('组内排名', `<select id="rankingGroupSelect" onchange="window.rank.showGroupRankingDetail(this.value)">${groups.map(g=>`<option value="${g}">${g}</option>`).join('')}</select><div id="groupRankingDetail"></div>`, [{text:'关闭',onclick:'window.modal.close'}]);
    setTimeout(()=>showGroupRankingDetail(groups[0]),100);
}

function showGroupRankingDetail(groupName) {
    const members = (window.appData.groups[groupName]||[]).filter(id=>window.appData.scores[id]&&id!=='0').map(id=>({id, name:window.appData.scores[id][0], score:window.appData.scores[id][1]})).sort((a,b)=>b.score-a.score);
    document.getElementById('groupRankingDetail').innerHTML = `<h4>${groupName}排名</h4><table class="data-table"><thead><tr><th>组内排名</th><th>姓名</th><th>学号</th><th>分数</th></tr></thead><tbody>${members.map((m,i)=>`<tr><td>${i+1}</td><td>${m.name}</td><td>${m.id}</td><td>${m.score}</td></tr>`).join('')}</tbody></table>`;
}

function showScoreDistribution() {
    const scores = Object.entries(window.appData.scores||{}).filter(([id])=>id!=='0').map(([,data])=>data[1]);
    const ranges = [{min:0,max:60,label:'0-60'},{min:60,max:80,label:'60-80'},{min:80,max:100,label:'80-100'},{min:100,max:120,label:'100-120'},{min:120,max:140,label:'120-140'},{min:140,max:160,label:'140-160'},{min:160,max:180,label:'160-180'},{min:180,max:200,label:'180-200'},{min:200,max:Infinity,label:'200+'}];
    const distribution = ranges.map(r=>({...r, count:scores.filter(s=>s>=r.min && s<r.max).length}));
    const maxCount = Math.max(...distribution.map(d=>d.count));
    window.modal.show('分数分布', `<div>${distribution.map(d=>`<div><span style="width:60px">${d.label}</span><span style="width:40px">${d.count}人</span><div style="flex:1;height:20px;background:#ffe4d6;border-radius:10px;"><div style="height:100%;width:${(d.count/maxCount)*100}%;background:linear-gradient(90deg,#ff4e4e,#ff9f4e);border-radius:10px;"></div></div></div>`).join('')}<p>平均分:${(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(2)}</p></div>`, [{text:'关闭',onclick:'window.modal.close'}]);
}

window.rank = { showRanking, showIndividualRanking, showGroupRanking, showGroupMemberRanking, showGroupRankingDetail, showScoreDistribution };

// ==================== 排名管理页面 ====================

function showRanking() {
    //document.getElementById('contentArea').setAttribute('data-page', 'rank');
    const topStudents = window.utils.getTopRanking(10);
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">🏆 排名管理</h2>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.rank.showIndividualRanking()">👤 个人排名</button>
                <button class="btn btn-primary" onclick="window.rank.showGroupRanking()">👥 分组排名</button>
                <button class="btn btn-primary" onclick="window.rank.showGroupMemberRanking()">🔍 组内排名</button>
                <button class="btn btn-primary" onclick="window.rank.showScoreDistribution()">📊 分数分布</button>
            </div>
            
            <div style="margin-top: 30px;">
                <h3 style="color: #ff4e4e;">📊 个人排名 TOP 10</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>排名</th>
                            <th>姓名</th>
                            <th>学号</th>
                            <th>分数</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${topStudents.map((student, index) => `
                            <tr ${student.id === window.currentUser?.student_id ? 'style="background: #fff6f0; border-left: 3px solid #ff4e4e;"' : ''}>
                                <td>${index + 1}</td>
                                <td>${student.name}</td>
                                <td>${student.id}</td>
                                <td><strong style="color: #ff4e4e;">${student.score}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function showIndividualRanking() {
    const rankings = window.utils.getTopRanking();
    
    window.modal.show('个人排名', `
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>排名</th>
                        <th>姓名</th>
                        <th>学号</th>
                        <th>分数</th>
                    </tr>
                </thead>
                <tbody>
                    ${rankings.map((student, index) => `
                        <tr ${student.id === window.currentUser?.student_id ? 'style="background: #fff6f0;"' : ''}>
                            <td>${index + 1}</td>
                            <td>${student.name}</td>
                            <td>${student.id}</td>
                            <td><strong style="color: ${student.id === window.currentUser?.student_id ? '#ff4e4e' : '#ff6b4a'};">${student.score}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showGroupRanking() {
    const groupScores = [];
    
    Object.entries(window.appData.groups || {}).forEach(([name, members]) => {
        const validMembers = members.filter(id => window.appData.scores[id] && id !== '0');
        if (validMembers.length > 0) {
            const totalScore = validMembers.reduce((sum, id) => sum + window.appData.scores[id][1], 0);
            const avgScore = totalScore / validMembers.length;
            groupScores.push({ name, avgScore, count: validMembers.length, totalScore });
        }
    });
    
    groupScores.sort((a, b) => b.avgScore - a.avgScore);
    
    window.modal.show('分组排名', `
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>排名</th>
                        <th>分组</th>
                        <th>平均分</th>
                        <th>成员数</th>
                        <th>总分</th>
                    </tr>
                </thead>
                <tbody>
                    ${groupScores.map((group, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td><strong style="color: #ff4e4e;">${group.name}</strong></td>
                            <td>${group.avgScore.toFixed(2)}</td>
                            <td>${group.count}</td>
                            <td>${group.totalScore}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showGroupMemberRanking() {
    const groupNames = Object.keys(window.appData.groups || {});
    
    if (groupNames.length === 0) {
        alert('暂无分组');
        return;
    }
    
    window.modal.show('组内排名', `
        <div style="margin: 20px 0;">
            <label>选择分组：</label>
            <select id="rankingGroupSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" onchange="window.rank.showGroupRankingDetail(this.value)">
                ${groupNames.map(name => `<option value="${name}">${name}</option>`).join('')}
            </select>
            
            <div id="groupRankingDetail" style="margin-top: 20px;"></div>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
    
    setTimeout(() => showGroupRankingDetail(groupNames[0]), 100);
}

function showGroupRankingDetail(groupName) {
    const members = window.appData.groups[groupName] || [];
    const validMembers = members
        .filter(id => window.appData.scores[id] && id !== '0')
        .map(id => ({
            id,
            name: window.appData.scores[id][0],
            score: window.appData.scores[id][1]
        }))
        .sort((a, b) => b.score - a.score);
    
    document.getElementById('groupRankingDetail').innerHTML = `
        <h4 style="color: #ff4e4e;">分组 "${groupName}" 成员排名</h4>
        <table class="data-table">
            <thead>
                <tr>
                    <th>组内排名</th>
                    <th>姓名</th>
                    <th>学号</th>
                    <th>分数</th>
                </tr>
            </thead>
            <tbody>
                ${validMembers.map((member, index) => `
                    <tr ${member.id === window.currentUser?.student_id ? 'style="background: #fff6f0;"' : ''}>
                        <td>${index + 1}</td>
                        <td>${member.name}</td>
                        <td>${member.id}</td>
                        <td style="color: ${member.id === window.currentUser?.student_id ? '#ff4e4e' : '#ff6b4a'};">${member.score}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function showScoreDistribution() {
    const scores = Object.entries(window.appData.scores || {})
        .filter(([id]) => id !== '0')
        .map(([, [, score]]) => score);
    
    const ranges = [
        { min: 0, max: 60, label: '0-60分', color: '#ffb84e' },
        { min: 60, max: 80, label: '60-80分', color: '#ff9f4e' },
        { min: 80, max: 100, label: '80-100分', color: '#ff8f4e' },
        { min: 100, max: 120, label: '100-120分', color: '#ff6b4a' },
        { min: 120, max: 140, label: '120-140分', color: '#ff4e4e' },
        { min: 140, max: 160, label: '140-160分', color: '#ff4e4e' },
        { min: 160, max: 180, label: '160-180分', color: '#ff4e4e' },
        { min: 180, max: 200, label: '180-200分', color: '#ff4e4e' },
        { min: 200, max: Infinity, label: '200分以上', color: '#ff4e4e' }
    ];
    
    const distribution = ranges.map(range => ({
        ...range,
        count: scores.filter(s => s >= range.min && s < range.max).length
    }));
    
    const maxCount = Math.max(...distribution.map(d => d.count));
    
    window.modal.show('分数分布统计', `
        <div style="padding: 10px;">
            <p><strong style="color: #ff4e4e;">📊 分数分布统计（共${scores.length}人）</strong></p>
            ${distribution.map(d => `
                <div style="margin: 10px 0;">
                    <div style="display: flex; align-items: center;">
                        <span style="width: 80px; color: #ff6b4a;">${d.label}</span>
                        <span style="width: 40px; color: #ff4e4e;">${d.count}人</span>
                        <div style="flex: 1; height: 20px; background: #ffe4d6; border-radius: 10px; margin-left: 10px;">
                            <div style="height: 100%; width: ${(d.count / maxCount) * 100}%; background: linear-gradient(90deg, #ff4e4e, #ff9f4e); border-radius: 10px;"></div>
                        </div>
                    </div>
                </div>
            `).join('')}
            
            <p style="margin-top: 20px; color: #ff8f4e;">📈 平均分: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)}分</p>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

// 导出到全局
window.rank = {
    showRanking,
    showIndividualRanking,
    showGroupRanking,
    showGroupMemberRanking,
    showGroupRankingDetail,
    showScoreDistribution
};
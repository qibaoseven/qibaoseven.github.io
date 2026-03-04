// ==================== 金币系统页面 ====================

function showGoldSystem() {
    //document.getElementById('contentArea').setAttribute('data-page', 'gold');
    if (!window.auth.hasPermission('金币系统')) {
        alert('权限不足');
        return;
    }
    
    const studentId = window.currentUser.student_id;
    const score = window.utils.getStudentScore(studentId);
    const gold = window.utils.getStudentGold(studentId);
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">💰 金币系统</h2>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${score}</div>
                    <div class="stat-label">学分</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${gold}</div>
                    <div class="stat-label">金币</div>
                </div>
            </div>
            
            <div style="background: linear-gradient(135deg, #ff4e4e 0%, #ff9f4e 100%); padding: 20px; border-radius: 10px; color: white; margin: 20px 0;">
                <h3>📈 今日汇率</h3>
                <p style="font-size: 1.2em; margin: 10px 0;">学分 → 金币: 1 : ${window.appData.exchangeRate.score_to_gold?.toFixed(4) || '0.1000'}</p>
                <p style="font-size: 1.2em; margin: 10px 0;">金币 → 学分: 1 : ${window.appData.exchangeRate.gold_to_score?.toFixed(4) || '1.0000'}</p>
                <p style="font-size: 0.9em; opacity: 0.9;">最后更新: ${window.appData.exchangeRate.last_updated || '未知'}</p>
            </div>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.gold.showScoreToGold()">🔄 学分兑换金币</button>
                <button class="btn btn-primary" onclick="window.gold.showGoldToScore()">🔄 金币兑换学分</button>
                <button class="btn btn-primary" onclick="window.gold.showGoldTasks()">🎯 金币任务</button>
                <button class="btn btn-primary" onclick="window.gold.showGoldHistory()">📋 金币历史</button>
                <button class="btn btn-primary" onclick="window.gold.showGoldRanking()">🏆 金币排名</button>
            </div>
            
            <div style="margin-top: 30px;">
                <h3 style="color: #ff4e4e;">📊 金币排行榜</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>排名</th>
                            <th>姓名</th>
                            <th>金币</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${window.utils.getGoldRanking(10).map((item, index) => `
                            <tr ${item.id === studentId ? 'style="background: #fff6f0; border-left: 3px solid #ff4e4e;"' : ''}>
                                <td>${index + 1}</td>
                                <td>${item.name}</td>
                                <td><strong style="color: ${item.id === studentId ? '#ff4e4e' : '#ff6b4a'};">${item.gold}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function showGoldRanking() {
    const rankings = window.utils.getGoldRanking();
    
    window.modal.show('金币排行榜', `
        <div style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>排名</th>
                        <th>姓名</th>
                        <th>金币</th>
                    </tr>
                </thead>
                <tbody>
                    ${rankings.map((item, index) => `
                        <tr ${item.id === window.currentUser.student_id ? 'style="background: #fff6f0;"' : ''}>
                            <td>${index + 1}</td>
                            <td>${item.name}</td>
                            <td style="color: ${item.id === window.currentUser.student_id ? '#ff4e4e' : '#ff6b4a'};">${item.gold}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showScoreToGold() {
    const studentId = window.currentUser.student_id;
    const score = window.utils.getStudentScore(studentId);
    const rate = parseFloat(window.appData.exchangeRate.score_to_gold || 0.1);
    
    window.modal.show('学分兑换金币', `
        <div style="margin: 20px 0;">
            <p style="color: #ff6b4a;">当前学分: ${score}</p>
            <p style="color: #ff8f4e;">当前汇率: 1学分 = ${rate.toFixed(4)}金币</p>
            
            <label style="color: #ff6b4a;">兑换学分数量：</label>
            <input type="number" id="exchangeScore" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" value="10">
            
            <div id="exchangePreview" style="margin: 20px 0; padding: 15px; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff9f4e;">
                预计获得: <span id="goldPreview" style="color: #ff4e4e; font-weight: bold;">0</span> 金币
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认兑换', onclick: 'window.gold.handleScoreToGold()', className: 'btn-primary' }
    ]);
    
    document.getElementById('exchangeScore').oninput = function() {
        const score = parseFloat(this.value) || 0;
        const gold = score * rate;
        document.getElementById('goldPreview').textContent = gold.toFixed(2);
    };
    
    document.getElementById('exchangeScore').oninput();
}

function handleScoreToGold() {
    const studentId = window.currentUser.student_id;
    const score = parseFloat(document.getElementById('exchangeScore').value);
    const rate = parseFloat(window.appData.exchangeRate.score_to_gold || 0.1);
    
    if (isNaN(score) || score <= 0) {
        alert('请输入有效的数量');
        return;
    }
    
    const currentScore = window.utils.getStudentScore(studentId);
    if (score > currentScore) {
        alert('学分不足');
        return;
    }
    
    const gold = score * rate;
    
    window.utils.updateStudentScore(studentId, -score, `兑换金币 ${gold.toFixed(2)}`);
    window.utils.updateStudentGold(studentId, gold);
    
    window.utils.updateExchangeRate();
    
    alert(`兑换成功！获得 ${gold.toFixed(2)} 金币`);
    window.modal.close();
    showGoldSystem();
}

function showGoldToScore() {
    const studentId = window.currentUser.student_id;
    const gold = window.utils.getStudentGold(studentId);
    const rate = parseFloat(window.appData.exchangeRate.gold_to_score || 1.0);
    
    window.modal.show('金币兑换学分', `
        <div style="margin: 20px 0;">
            <p style="color: #ff6b4a;">当前金币: ${gold}</p>
            <p style="color: #ff8f4e;">当前汇率: 1金币 = ${rate.toFixed(4)}学分</p>
            
            <label style="color: #ff6b4a;">兑换金币数量：</label>
            <input type="number" id="exchangeGold" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;" value="10">
            
            <div id="exchangePreview2" style="margin: 20px 0; padding: 15px; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff9f4e;">
                预计获得: <span id="scorePreview" style="color: #ff4e4e; font-weight: bold;">0</span> 学分
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认兑换', onclick: 'window.gold.handleGoldToScore()', className: 'btn-primary' }
    ]);
    
    document.getElementById('exchangeGold').oninput = function() {
        const gold = parseFloat(this.value) || 0;
        const score = gold * rate;
        document.getElementById('scorePreview').textContent = score.toFixed(2);
    };
    
    document.getElementById('exchangeGold').oninput();
}

function handleGoldToScore() {
    const studentId = window.currentUser.student_id;
    const gold = parseFloat(document.getElementById('exchangeGold').value);
    const rate = parseFloat(window.appData.exchangeRate.gold_to_score || 1.0);
    
    if (isNaN(gold) || gold <= 0) {
        alert('请输入有效的数量');
        return;
    }
    
    const currentGold = window.utils.getStudentGold(studentId);
    if (gold > currentGold) {
        alert('金币不足');
        return;
    }
    
    const score = gold * rate;
    
    window.utils.updateStudentGold(studentId, -gold);
    window.utils.updateStudentScore(studentId, score, `用 ${gold} 金币兑换`);
    
    window.utils.updateExchangeRate();
    
    alert(`兑换成功！获得 ${score.toFixed(2)} 学分`);
    window.modal.close();
    showGoldSystem();
}

function showGoldTasks() {
    window.modal.show('金币任务', `
        <div style="padding: 20px;">
            <h4 style="color: #ff4e4e;">📚 每日学习任务</h4>
            <div style="margin: 10px 0; padding: 10px; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff9f4e;">
                <p style="color: #ff6b4a;">• 完成作业: +5金币</p>
                <p style="color: #ff6b4a;">• 课堂表现优秀: +3金币</p>
                <p style="color: #ff6b4a;">• 帮助同学: +2金币</p>
            </div>
            
            <h4 style="margin-top: 20px; color: #ff4e4e;">🏆 成绩进步任务</h4>
            <div style="margin: 10px 0; padding: 10px; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff9f4e;">
                <p style="color: #ff6b4a;">• 考试成绩进步10分: +10金币</p>
                <p style="color: #ff6b4a;">• 单科成绩班级前3: +15金币</p>
                <p style="color: #ff6b4a;">• 全科及格: +8金币</p>
            </div>
            
            <h4 style="margin-top: 20px; color: #ff4e4e;">💡 创新贡献任务</h4>
            <div style="margin: 10px 0; padding: 10px; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff9f4e;">
                <p style="color: #ff6b4a;">• 提出改进建议: +5金币</p>
                <p style="color: #ff6b4a;">• 参与班级活动: +3金币</p>
                <p style="color: #ff6b4a;">• 完成特殊项目: +20金币</p>
            </div>
            
            <p style="margin-top: 20px; color: #ff8f4e;">🔔 请联系老师确认任务完成情况并领取金币！</p>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showGoldHistory() {
    const studentId = window.currentUser.student_id;
    const goldData = window.appData.gold[studentId] || { amount: 0, last_updated: window.utils.formatDate() };
    
    window.modal.show('金币历史', `
        <div style="padding: 20px;">
            <p style="color: #ff6b4a;"><strong>当前金币:</strong> ${goldData.amount.toFixed(2)}</p>
            <p style="color: #ff8f4e;"><strong>最后更新:</strong> ${goldData.last_updated ? new Date(goldData.last_updated).toLocaleString() : ''}</p>
            
            <div style="margin-top: 20px; padding: 15px; background: #fff6f0; border-radius: 8px;">
                <p style="color: #ff4e4e;"><strong>📈 汇率信息</strong></p>
                <p style="color: #ff6b4a;">学分 → 金币: 1 : ${window.appData.exchangeRate.score_to_gold?.toFixed(4) || '0.1000'}</p>
                <p style="color: #ff6b4a;">金币 → 学分: 1 : ${window.appData.exchangeRate.gold_to_score?.toFixed(4) || '1.0000'}</p>
                <p style="color: #ff8f4e;">最后更新: ${window.appData.exchangeRate.last_updated || '未知'}</p>
            </div>
            
            <p style="margin-top: 20px; color: #ff8f4e;">💡 汇率会每日波动，请把握兑换时机！</p>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

// 导出到全局
window.gold = {
    showGoldSystem,
    showGoldRanking,
    showScoreToGold,
    handleScoreToGold,
    showGoldToScore,
    handleGoldToScore,
    showGoldTasks,
    showGoldHistory
};
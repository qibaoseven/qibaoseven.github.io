// ==================== 控制台页面 ====================

function showDashboard() {
    //document.getElementById('contentArea').setAttribute('data-page', 'dashboard');
    const studentId = window.currentUser.student_id;
    const score = window.utils.getStudentScore(studentId);
    const gold = window.utils.getStudentGold(studentId);
    
    const studentCount = Object.keys(window.appData.scores).filter(id => id !== '0').length;
    const today = window.utils.getBeijingDate();
    const reportedToday = (window.appData.dailyReport[today] || []).length;
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">📊 系统控制台</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${score}</div>
                    <div class="stat-label">我的学分</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${gold}</div>
                    <div class="stat-label">我的金币</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${studentCount}</div>
                    <div class="stat-label">学生总数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${reportedToday}</div>
                    <div class="stat-label">今日已汇报</div>
                </div>
            </div>
            
            <h3>📢 系统公告</h3>
            <ul style="margin: 20px 0; list-style: none;">
                <li style="margin: 10px 0; padding: 10px; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff4e4e;">
                    🎉 学分抽奖只在周五下午开放
                </li>
                <li style="margin: 10px 0; padding: 10px; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff9f4e;">
                    🎯 惩罚抽取条件：分数低于100分
                </li>
                <li style="margin: 10px 0; padding: 10px; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ffb84e;">
                    💰 金币系统已上线，可以兑换学分！
                </li>
            </ul>
            
            <h3>📈 近期活动</h3>
            <div style="margin-top: 20px; max-height: 300px; overflow-y: auto;">
                ${(window.appData.logs || []).slice(0, 5).map(log => `
                    <div style="padding: 10px; border-left: 3px solid #ff4e4e; margin: 10px 0; background: #fff6f0; border-radius: 8px;">
                        <div>📅 ${log.timestamp}</div>
                        <div>${log.student_name || '未知'} ${log.action}: ${log.score_change > 0 ? '+' : ''}${log.score_change}分</div>
                        ${log.reason ? `<div style="color: #ff8f4e;">📝 ${log.reason}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// 导出到全局
window.dashboard = {
    showDashboard
};
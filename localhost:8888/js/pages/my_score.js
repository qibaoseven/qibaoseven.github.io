// ==================== 我的分数页面 ====================

function showMyScore() {
    const studentId = window.currentUser.student_id;
    const studentName = window.appData.scores[studentId]?.[0] || '未知';
    const score = window.utils.getStudentScore(studentId);
    
    const myLogs = (window.appData.logs || []).filter(log => log.student_id === studentId);
    
    let totalAdd = 0, totalDeduct = 0;
    myLogs.forEach(log => {
        if (log.score_change > 0) totalAdd += log.score_change;
        else totalDeduct += Math.abs(log.score_change);
    });
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">📊 我的分数</h2>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${score}</div>
                    <div class="stat-label">当前分数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">+${totalAdd}</div>
                    <div class="stat-label">总加分</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">-${totalDeduct}</div>
                    <div class="stat-label">总扣分</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${myLogs.length}</div>
                    <div class="stat-label">变化次数</div>
                </div>
            </div>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.myScore.showMyScoreDetail()">查看详细</button>
                <button class="btn btn-primary" onclick="window.myScore.showMyScoreHistory()">历史记录</button>
                <button class="btn btn-primary" onclick="window.myScore.showMyScoreAnalysis()">数据分析</button>
            </div>
            
            <h3 style="margin-top: 30px;">🕒 最近变化</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>时间</th>
                        <th>操作</th>
                        <th>变化</th>
                        <th>原因</th>
                    </tr>
                </thead>
                <tbody>
                    ${myLogs.slice(0, 10).map(log => `
                        <tr>
                            <td>${log.timestamp ? log.timestamp.split(' ')[1] : ''}</td>
                            <td>${log.action || ''}</td>
                            <td style="color: ${log.score_change > 0 ? '#ff9f4e' : '#ff4e4e'}">
                                ${log.score_change > 0 ? '+' : ''}${log.score_change}
                            </td>
                            <td>${log.reason || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function showMyScoreDetail() {
    const studentId = window.currentUser.student_id;
    const studentName = window.appData.scores[studentId]?.[0] || '未知';
    const score = window.utils.getStudentScore(studentId);
    
    window.modal.show('我的分数详情', `
        <div style="text-align: center; margin: 20px 0;">
            <div style="font-size: 3em; color: #ff4e4e;">${score}</div>
            <div style="color: #ff8f4e;">当前学分</div>
        </div>
        
        <div style="background: #fff6f0; padding: 20px; border-radius: 10px;">
            <p><strong>👤 姓名：</strong>${studentName}</p>
            <p><strong>🎓 学号：</strong>${studentId}</p>
            <p><strong>🏆 排名：</strong>${window.utils.getStudentRank(studentId)}</p>
            <p><strong>💰 金币：</strong>${window.utils.getStudentGold(studentId)}</p>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showMyScoreHistory() {
    const studentId = window.currentUser.student_id;
    const myLogs = (window.appData.logs || []).filter(log => log.student_id === studentId);
    
    window.modal.show('分数历史', `
        <div style="max-height: 400px; overflow-y: auto;">
            ${myLogs.map(log => `
                <div style="padding: 15px; border-bottom: 1px solid #ffd1b8;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>📅 ${log.timestamp}</span>
                        <span style="color: ${log.score_change > 0 ? '#ff9f4e' : '#ff4e4e'}; font-weight: bold;">
                            ${log.score_change > 0 ? '+' : ''}${log.score_change}
                        </span>
                    </div>
                    <div style="margin-top: 5px; color: #ff8f4e;">
                        ${log.action} ${log.reason ? `- ${log.reason}` : ''}
                    </div>
                    <div>➡️ 分数变为: ${log.current_score}</div>
                </div>
            `).join('')}
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showMyScoreAnalysis() {
    const studentId = window.currentUser.student_id;
    const myLogs = (window.appData.logs || []).filter(log => log.student_id === studentId);
    const score = window.utils.getStudentScore(studentId);
    
    let totalAdd = 0, totalDeduct = 0, addCount = 0, deductCount = 0;
    
    myLogs.forEach(log => {
        if (log.score_change > 0) {
            totalAdd += log.score_change;
            addCount++;
        } else if (log.score_change < 0) {
            totalDeduct += Math.abs(log.score_change);
            deductCount++;
        }
    });
    
    const avgChange = myLogs.length ? (totalAdd - totalDeduct) / myLogs.length : 0;
    
    window.modal.show('分数分析报告', `
        <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
            <div class="stat-card">
                <div class="stat-value">${totalAdd}</div>
                <div class="stat-label">总加分</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totalDeduct}</div>
                <div class="stat-label">总扣分</div>
            </div>
        </div>
        
        <div style="margin: 20px 0;">
            <p><strong>📊 统计信息</strong></p>
            <p>加分次数: ${addCount}次</p>
            <p>扣分次数: ${deductCount}次</p>
            <p>净变化: ${totalAdd - totalDeduct}分</p>
            <p>平均每次: ${avgChange.toFixed(1)}分</p>
        </div>
        
        <div style="margin: 20px 0;">
            <p><strong>🎯 分析建议</strong></p>
            ${totalAdd > totalDeduct * 2 ? '<p>✅ 表现优秀，继续保持！</p>' : ''}
            ${totalAdd > totalDeduct ? '<p>✅ 表现良好，继续努力！</p>' : ''}
            ${totalAdd === totalDeduct ? '<p>➡️ 表现稳定，争取更多加分！</p>' : ''}
            ${totalAdd < totalDeduct ? '<p>⚠️ 需注意改进表现！</p>' : ''}
            ${deductCount > addCount ? '<p>⚠️ 扣分次数较多，请注意遵守纪律</p>' : ''}
            ${score < 100 ? '<p>🎯 分数低于100分，可以抽取惩罚</p>' : ''}
            ${score >= 100 && score < 150 ? '<p>🎯 分数良好，可以参与抽奖</p>' : ''}
            ${score >= 150 ? '<p>🎯 分数优秀，继续保持！</p>' : ''}
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

// 导出到全局
window.myScore = {
    showMyScore,
    showMyScoreDetail,
    showMyScoreHistory,
    showMyScoreAnalysis
};
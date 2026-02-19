// ==================== 每日汇报页面 ====================

function showDailyReport() {
    if (!window.auth.hasPermission('每日汇报')) {
        alert('权限不足');
        return;
    }
    
    const students = Object.entries(window.appData.scores || {})
        .filter(([id]) => id !== '0')
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    
    const today = window.utils.getBeijingDate();
    const reportedToday = window.appData.dailyReport[today] || [];
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">📋 每日汇报</h2>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${reportedToday.length}</div>
                    <div class="stat-label">今日已汇报</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${students.length}</div>
                    <div class="stat-label">总学生数</div>
                </div>
            </div>
            
            <div class="info-box">
                <strong>⏰ 操作说明：</strong> 点击汇报状态切换，点击按钮快速加减分
            </div>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.dailyReport.selectAllReport()">✅ 全选今日汇报</button>
                <button class="btn btn-primary" onclick="window.dailyReport.clearAllReport()">🔄 清空今日汇报</button>
                <button class="btn btn-primary" onclick="window.dailyReport.showReportHistory()">📊 历史记录</button>
            </div>
            
            <div style="margin-top: 30px; overflow-x: auto;">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>学号</th>
                            <th>姓名</th>
                            <th>当前分数</th>
                            <th>今日汇报</th>
                            <th colspan="3">快速操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(([id, [name, score]]) => {
                            const isReported = reportedToday.includes(id);
                            return `
                                <tr data-id="${id}">
                                    <td>${id}</td>
                                    <td>${name}</td>
                                    <td class="current-score">${score}</td>
                                    <td>
                                        <span class="report-status ${isReported ? 'status-reported' : 'status-unreported'}" 
                                              onclick="window.dailyReport.toggleReport('${id}')">
                                            ${isReported ? '✓ 已汇报' : '⭕ 未汇报'}
                                        </span>
                                    </td>
                                    <td>
                                        <button class="action-btn btn-minus" onclick="window.dailyReport.quickAdjust('${id}', -2)">-2</button>
                                    </td>
                                    <td>
                                        <input type="number" class="score-input" id="input-${id}" value="-2" 
                                               onchange="window.dailyReport.customAdjust('${id}', this.value)">
                                    </td>
                                    <td>
                                        <button class="action-btn btn-plus" onclick="window.dailyReport.quickAdjust('${id}', 2)">+2</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function toggleReport(studentId) {
    const today = window.utils.getBeijingDate();
    if (!window.appData.dailyReport[today]) {
        window.appData.dailyReport[today] = [];
    }
    
    const index = window.appData.dailyReport[today].indexOf(studentId);
    if (index === -1) {
        window.appData.dailyReport[today].push(studentId);
    } else {
        window.appData.dailyReport[today].splice(index, 1);
    }
    
    window.dataManager.saveData('dailyReport');
    showDailyReport();
}

function quickAdjust(studentId, change) {
    const newScore = window.utils.getStudentScore(studentId) + change;
    window.appData.scores[studentId][1] = newScore;
    window.dataManager.saveData('scores');
    window.utils.addLog('每日汇报调整', studentId, change, newScore, `快速${change > 0 ? '+' : ''}${change}`);
    showDailyReport();
}

function customAdjust(studentId, value) {
    const change = parseFloat(value);
    if (isNaN(change)) return;
    
    const newScore = window.utils.getStudentScore(studentId) + change;
    window.appData.scores[studentId][1] = newScore;
    window.dataManager.saveData('scores');
    window.utils.addLog('每日汇报调整', studentId, change, newScore, `自定义${change > 0 ? '+' : ''}${change}`);
    showDailyReport();
}

function selectAllReport() {
    const today = window.utils.getBeijingDate();
    const students = Object.entries(window.appData.scores || {})
        .filter(([id]) => id !== '0')
        .map(([id]) => id);
    
    window.appData.dailyReport[today] = students;
    window.dataManager.saveData('dailyReport');
    showDailyReport();
}

function clearAllReport() {
    const today = window.utils.getBeijingDate();
    window.appData.dailyReport[today] = [];
    window.dataManager.saveData('dailyReport');
    showDailyReport();
}

function showReportHistory() {
    const dates = Object.keys(window.appData.dailyReport || {}).sort().reverse();
    
    window.modal.show('汇报历史记录', `
        <div style="max-height: 400px; overflow-y: auto;">
            ${dates.map(date => `
                <div style="margin: 15px 0; padding: 15px; background: #fff6f0; border-radius: 10px; border-left: 3px solid #ff4e4e;">
                    <h4 style="color: #ff4e4e;">📅 ${date}</h4>
                    <p style="color: #ff6b4a;">已汇报人数: ${window.appData.dailyReport[date]?.length || 0}人</p>
                    <button class="btn btn-sm btn-primary" onclick="window.dailyReport.viewReportDetail('${date}')">查看详情</button>
                </div>
            `).join('')}
            ${dates.length === 0 ? '<p style="color: #ff8f4e;">暂无历史记录</p>' : ''}
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function viewReportDetail(date) {
    const reported = window.appData.dailyReport[date] || [];
    const students = reported.map(id => {
        const student = window.appData.scores[id];
        return student ? `${student[0]} (${id})` : id;
    }).join(', ');
    
    window.modal.show(`汇报详情 - ${date}`, `
        <div>
            <p><strong style="color: #ff4e4e;">已汇报学生 (${reported.length}人):</strong></p>
            <p style="background: #fff6f0; padding: 15px; border-radius: 8px; max-height: 300px; overflow-y: auto; color: #ff6b4a;">
                ${students || '暂无记录'}
            </p>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

// 导出到全局
window.dailyReport = {
    showDailyReport,
    toggleReport,
    quickAdjust,
    customAdjust,
    selectAllReport,
    clearAllReport,
    showReportHistory,
    viewReportDetail
};
// ==================== 每日汇报页面 ====================
// 权限：r--rwxr--（user只能看，admin可修改，root只能看）

function showDailyReport() {
    //document.getElementById('contentArea').setAttribute('data-page', 'dailyReport');
    
    const userRole = window.currentUser?.role;
    const canModify = userRole === 'admin';  // 只有 admin 能修改
    
    if (!canModify) {
        showReadOnlyDailyReport();
        return;
    }
    
    // admin 版本（有修改权限）
    const students = window.utils.getAllStudents().sort((a, b) => parseInt(a.id) - parseInt(b.id));
    const today = window.utils.getBeijingDate();
    const reportedToday = window.appData.dailyReport[today] || [];
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">📋 每日汇报</h2>
                <span style="background: #ff4e4e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em;">r--rwxr--</span>
            </div>
            
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
                        ${students.map(student => {
                            const isReported = reportedToday.includes(student.id);
                            return `
                                <tr data-id="${student.id}">
                                    <td>${student.id}</td>
                                    <td>${student.name}</td>
                                    <td class="current-score">${student.score}</td>
                                    <td>
                                        <span class="report-status ${isReported ? 'status-reported' : 'status-unreported'}" 
                                              onclick="window.dailyReport.toggleReport('${student.id}')">
                                            ${isReported ? '✓ 已汇报' : '⭕ 未汇报'}
                                        </span>
                                    </td>
                                    <td>
                                        <button class="action-btn btn-minus" onclick="window.dailyReport.quickAdjust('${student.id}', -2)">-2</button>
                                    </td>
                                    <td>
                                        <input type="number" class="score-input" id="input-${student.id}" value="-2" 
                                               onchange="window.dailyReport.customAdjust('${student.id}', this.value)">
                                    </td>
                                    <td>
                                        <button class="action-btn btn-plus" onclick="window.dailyReport.quickAdjust('${student.id}', 2)">+2</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    window.utils.addViewLog('浏览', '进入每日汇报(管理版)');
}

function showReadOnlyDailyReport() {
    const today = window.utils.getBeijingDate();
    const reportedToday = window.appData.dailyReport[today] || [];
    const myId = window.currentUser.student_id;
    const iReported = reportedToday.includes(myId);
    
    // user 和 root 都看这个只读版本
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">📋 每日汇报</h2>
                <span style="background: #ff4e4e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em;">r--rwxr--</span>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${reportedToday.length}</div>
                    <div class="stat-label">今日已汇报</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${iReported ? '✅ 已汇报' : '⭕ 未汇报'}</div>
                    <div class="stat-label">我的状态</div>
                </div>
            </div>
            
            <div class="info-box">
                <strong>📢 说明：</strong> 今日汇报状态查看（仅值日班长可修改）
            </div>
            
            <div style="margin-top: 20px;">
                <h3 style="color: #ff4e4e;">今日已汇报同学</h3>
                <div style="background: #fff6f0; padding: 15px; border-radius: 8px;">
                    ${reportedToday.length > 0 
                        ? reportedToday.map(id => {
                            const name = window.utils.getStudentName(id);
                            return `<span style="display: inline-block; margin: 5px; padding: 5px 10px; background: #ff9f4e; color: white; border-radius: 15px;">${name}</span>`;
                        }).join('')
                        : '<p style="color: #ff8f4e;">暂无同学汇报</p>'}
                </div>
            </div>
            
            <div class="btn-grid" style="margin-top: 20px;">
                <button class="btn btn-primary" onclick="window.dailyReport.showReportHistory()">📊 历史记录</button>
            </div>
        </div>
    `;
    
    window.utils.addViewLog('浏览', '进入每日汇报(只读版)');
}

// 其他函数保持不变...
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
    window.utils.addLog('修改汇报', studentId, 0, 0, `今日汇报状态变更`);
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    showDailyReport();
}

function quickAdjust(studentId, change) {
    const newScore = window.utils.getStudentScore(studentId) + change;
    window.appData.scores[studentId][1] = newScore;
    window.dataManager.saveData('scores');
    window.utils.addLog('每日汇报调整', studentId, change, newScore, `快速${change > 0 ? '+' : ''}${change}`);
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    showDailyReport();
}

function customAdjust(studentId, value) {
    const change = parseFloat(value);
    if (isNaN(change)) return;
    
    const newScore = window.utils.getStudentScore(studentId) + change;
    window.appData.scores[studentId][1] = newScore;
    window.dataManager.saveData('scores');
    window.utils.addLog('每日汇报调整', studentId, change, newScore, `自定义${change > 0 ? '+' : ''}${change}`);
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    showDailyReport();
}

function selectAllReport() {
    const today = window.utils.getBeijingDate();
    const students = Object.entries(window.appData.scores || {})
        .filter(([id]) => id !== '0')
        .map(([id]) => id);
    
    window.appData.dailyReport[today] = students;
    window.dataManager.saveData('dailyReport');
    window.utils.addLog('批量汇报', 'system', 0, 0, '全选今日汇报');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    showDailyReport();
}

function clearAllReport() {
    const today = window.utils.getBeijingDate();
    window.appData.dailyReport[today] = [];
    window.dataManager.saveData('dailyReport');
    window.utils.addLog('批量汇报', 'system', 0, 0, '清空今日汇报');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
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
    
    window.utils.addViewLog('浏览', '查看汇报历史');
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

// ==================== 导出 ====================
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
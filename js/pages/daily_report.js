// ==================== 每日汇报页面 ====================
// 权限：r--rwxr--（user只能看，admin可修改，root只能看）

function showDailyReport() {
    document.getElementById('contentArea').setAttribute('data-page', 'dailyReport');
    
    const userRole = window.currentUser?.role;
    const canModify = userRole === 'admin';
    
    if (!canModify) {
        showReadOnlyDailyReport();
        return;
    }
    
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
                <strong>⏰ 操作说明：</strong> 
                点击汇报状态切换，使用+2/-2按钮调整输入框，点击「批量应用」将输入框的值应用到分数。
            </div>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.dailyReport.selectAllReport()">✅ 全选今日汇报</button>
                <button class="btn btn-primary" onclick="window.dailyReport.clearAllReport()">🔄 清空今日汇报</button>
                <button class="btn btn-success" onclick="window.dailyReport.batchApplyFromInputs()">📊 批量应用</button>
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
                            <th colspan="3">调整值</th>
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
                                        <button class="action-btn btn-minus" onclick="window.dailyReport.adjustInput('${student.id}', -2)">-2</button>
                                    </td>
                                    <td>
                                        <input type="number" class="score-input" id="input-${student.id}" value="0" placeholder="调整值">
                                    </td>
                                    <td>
                                        <button class="action-btn btn-plus" onclick="window.dailyReport.adjustInput('${student.id}', 2)">+2</button>
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

// 只读版本
function showReadOnlyDailyReport() {
    const today = window.utils.getBeijingDate();
    const reportedToday = window.appData.dailyReport[today] || [];
    const myId = window.currentUser.student_id;
    const iReported = reportedToday.includes(myId);
    
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

// ==================== 核心功能 ====================

// 切换汇报状态
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

// 调整输入框
function adjustInput(studentId, delta) {
    const input = document.getElementById(`input-${studentId}`);
    if (input) {
        const current = parseInt(input.value) || 0;
        input.value = current + delta;
    }
}

// 批量应用输入框的值
function batchApplyFromInputs() {
    let success = 0;
    let total = 0;
    
    window.utils.getAllStudents().forEach(student => {
        const input = document.getElementById(`input-${student.id}`);
        if (input) {
            const change = parseInt(input.value) || 0;
            if (change !== 0) {
                window.utils.updateStudentScore(student.id, change, '每日汇报批量调整');
                success++;
                total += change;
            }
        }
    });
    
    alert(`✅ 成功为 ${success} 名学生调整分数，总变动 ${total} 分`);
    showDailyReport();
}

// ==================== 全选今日汇报（带分数应用）====================

function selectAllReport() {
    const today = window.utils.getBeijingDate();
    const students = window.utils.getAllStudents();
    
    // 1. 先把所有学生的汇报状态设为「已汇报」
    window.appData.dailyReport[today] = students.map(s => s.id);
    window.dataManager.saveData('dailyReport');
    
    // 2. 再把所有输入框的值应用到分数
    let totalChange = 0;
    let appliedCount = 0;
    
    students.forEach(student => {
        const input = document.getElementById(`input-${student.id}`);
        if (input) {
            const change = parseInt(input.value) || 0;
            if (change !== 0) {
                window.utils.updateStudentScore(student.id, change, '全选汇报自动应用');
                appliedCount++;
                totalChange += change;
            }
        }
    });
    
    // 3. 记录一条系统日志
    window.utils.addLog(
        '批量汇报', 
        'system', 
        totalChange, 
        0, 
        `全选汇报：为 ${appliedCount} 名学生应用输入框值，总变动 ${totalChange} 分`
    );
    
    // 4. 上传到云端
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    // 5. 提示结果
    alert(`✅ 全选汇报完成：\n• 已汇报状态已标记\n• 为 ${appliedCount} 名学生应用了输入框值\n• 总变动分数：${totalChange}`);
    
    // 6. 刷新页面
    showDailyReport();
}

// 清空今日汇报
function clearAllReport() {
    const today = window.utils.getBeijingDate();
    window.appData.dailyReport[today] = [];
    window.dataManager.saveData('dailyReport');
    window.utils.addLog('批量汇报', 'system', 0, 0, '清空今日汇报');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    showDailyReport();
}

// 显示历史记录
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

// 查看详情
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
    adjustInput,
    batchApplyFromInputs,
    selectAllReport,
    clearAllReport,
    showReportHistory,
    viewReportDetail
};

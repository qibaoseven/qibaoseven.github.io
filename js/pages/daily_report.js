// ==================== 每日汇报页面 ====================
// 权限:r--rwxr--(user只能看,admin可修改,root只能看)
// 新逻辑:只存储最后一次汇报的时间戳,记录今日是否已全部汇报
// 支持批量加减分,最后统一保存

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
    
    // 获取今日汇报状态
    const reportStatus = window.appData.dailyReport?.[today] || {};
    const allReported = reportStatus.allReported || false;
    const lastReportTime = reportStatus.lastReportTime || null;
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">📋 每日汇报</h2>
                <span style="background: #ff4e4e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em;">r--rwxr--</span>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${allReported ? '✅' : '⭕'}</div>
                    <div class="stat-label">今日汇报状态</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${students.length}</div>
                    <div class="stat-label">总学生数</div>
                </div>
            </div>
            
            ${lastReportTime ? `
                <div class="info-box">
                    <strong>⏰ 最后汇报时间:</strong> ${lastReportTime}
                </div>
            ` : ''}
            
            <div class="btn-grid">
                <button class="btn btn-success" onclick="window.dailyReport.handleAllReported()" ${allReported ? 'disabled' : ''}>
                    ✅ 一键全部汇报
                </button>
                <button class="btn btn-primary" onclick="window.dailyReport.batchApplyScores()">
                    💾 批量应用分数
                </button>
                <button class="btn btn-primary" onclick="window.dailyReport.resetDailyReport()">
                    🔄 重置今日状态
                </button>
            </div>
            
            <div class="info-box">
                <strong>📢 操作说明:</strong> 
                使用+2/-2按钮调整分数,调整完后点击"批量应用分数"统一保存。最后点击"一键全部汇报"标记今日完成。
            </div>
            
            <div style="margin-top: 30px; overflow-x: auto;">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>学号</th>
                            <th>姓名</th>
                            <th>当前分数</th>
                            <th colspan="3">分数调整</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(student => `
                            <tr data-id="${student.id}">
                                <td>${student.id}</td>
                                <td>${student.name}</td>
                                <td class="current-score" id="score-${student.id}">${student.score}</td>
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
                        `).join('')}
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
    const reportStatus = window.appData.dailyReport?.[today] || {};
    const allReported = reportStatus.allReported || false;
    const lastReportTime = reportStatus.lastReportTime || null;
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">📋 每日汇报</h2>
                <span style="background: #ff4e4e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em;">r--rwxr--</span>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${allReported ? '✅ 已汇报' : '⭕ 未汇报'}</div>
                    <div class="stat-label">今日状态</div>
                </div>
            </div>
            
            ${lastReportTime ? `
                <div class="info-box">
                    <strong>⏰ 最后汇报时间:</strong> ${lastReportTime}
                </div>
            ` : `
                <div class="warning-box">
                    今日尚未进行汇报
                </div>
            `}
        </div>
    `;
    
    window.utils.addViewLog('浏览', '进入每日汇报(只读版)');
}

// 调整输入框
function adjustInput(studentId, delta) {
    const input = document.getElementById(`input-${studentId}`);
    if (input) {
        const current = parseInt(input.value) || 0;
        input.value = current + delta;
    }
}

// 批量应用分数(统一保存)
function batchApplyScores() {
    let success = 0;
    let total = 0;
    let hasChanges = false;
    
    window.utils.getAllStudents().forEach(student => {
        const input = document.getElementById(`input-${student.id}`);
        if (input) {
            const change = parseInt(input.value) || 0;
            if (change !== 0) {
                // 使用save=false,不自动上传到云端
                window.utils.updateStudentScore(student.id, change, '每日汇报分数调整', false);
                success++;
                total += change;
                hasChanges = true;
                
                // 更新显示
                const scoreCell = document.getElementById(`score-${student.id}`);
                if (scoreCell) {
                    const newScore = window.utils.getStudentScore(student.id);
                    scoreCell.textContent = newScore;
                }
                // 重置输入框
                input.value = 0;
            }
        }
    });
    
    if (!hasChanges) {
        alert('没有分数变动需要保存');
        return;
    }
    
    // 统一保存到本地和云端
    window.dataManager.saveData('scores');
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    alert(`✅ 成功为 ${success} 名学生调整分数,总变动 ${total} 分`);
    window.modal.notify(`✅ 分数调整已保存`, 'success');
}

// 一键全部汇报
function handleAllReported() {
    if (!confirm('确定今日所有学生都已汇报吗?此操作不可撤销。')) {
        return;
    }
    
    const today = window.utils.getBeijingDate();
    const timestamp = window.utils.formatDateWithMs();
    
    // 只保存最后一次汇报状态
    if (!window.appData.dailyReport) {
        window.appData.dailyReport = {};
    }
    
    window.appData.dailyReport[today] = {
        allReported: true,
        lastReportTime: timestamp
    };
    
    window.dataManager.saveData('dailyReport');
    window.utils.addLog('每日汇报', 'system', 0, 0, `今日全部汇报完成`);
    window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    
    showDailyReport();
    window.modal.notify('✅ 今日汇报已完成', 'success');
}

// 重置今日状态(仅用于测试/特殊情况)
function resetDailyReport() {
    if (!confirm('确定要重置今日的汇报状态吗?这将清除汇报标记,但不会恢复分数。')) {
        return;
    }
    
    const today = window.utils.getBeijingDate();
    
    if (window.appData.dailyReport?.[today]) {
        delete window.appData.dailyReport[today];
        window.dataManager.saveData('dailyReport');
        window.dataManager.saveToCloud().catch(e => console.warn('上传失败', e));
    }
    
    showDailyReport();
    window.modal.notify('✅ 今日状态已重置', 'success');
}

// ==================== 导出 ====================
window.dailyReport = {
    showDailyReport,
    adjustInput,
    batchApplyScores,
    handleAllReported,
    resetDailyReport
};


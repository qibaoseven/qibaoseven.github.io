// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// ==================== 每日互评汇报页面(小组互评) ====================
// 权限:admin 可提交打分;user/root 只读
// 逻辑:每个小组(学生)每天只能汇报一次。
//       7 个评价项目打分求和 = k, 应扣分 = 10 - k/10
//       作业系统暂不对接,页面保留占位,不用作业数据。

// 评价项目定义(权重, 评价标准)
const EVAL_ITEMS = [
    { key: 'regionDiscipline', name: '区域纪律', weight: 20, standard: '小组所在区域成员遵守课堂/活动纪律情况，无打闹、喧哗、违纪行为' },
    { key: 'homeworkRate',     name: '作业提交率', weight: 20, standard: '小组全体成员按时、按质完成并提交作业的比例' },
    { key: 'areaHygiene',      name: '组区卫生', weight: 15, standard: '小组负责区域的整洁度、物品摆放规范度、卫生打扫完成情况' },
    { key: 'unity',            name: '组员团结', weight: 15, standard: '组员之间协作互助、无矛盾冲突、团队凝聚力表现' },
    { key: 'progress',         name: '组员各方面有进步', weight: 10, standard: '组员在学习、纪律、活动参与等方面的综合态度或者成果' },
    { key: 'participation',    name: '组员活动参与度', weight: 10, standard: '组员主动参与集体活动、小组任务的积极性和参与比例' },
    { key: 'quality',          name: '活动完成质量', weight: 10, standard: '小组承担的活动、任务最终完成的效果和达标情况' }
];

// 满权重总分(用于校验)
const EVAL_MAX_TOTAL = EVAL_ITEMS.reduce((s, i) => s + i.weight, 0); // =100

function showDailyReport() {
    document.getElementById('contentArea').setAttribute('data-page', 'dailyReport');

    const userRole = window.currentUser?.role;
    const canModify = userRole === 'admin';
    const today = window.utils.getBeijingDate();

    if (!canModify) {
        showReadOnlyDailyReport();
        return;
    }

    const students = window.utils.getAllStudents().sort((a, b) => parseInt(a.id) - parseInt(b.id));

    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">📋 小组互评打分</h2>
                <span style="background: #ff4e4e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em;">r--rwxr--</span>
            </div>

            <div class="info-box">
                <strong>📢 说明:</strong> 每个小组(学生)每天只能打分一次。7 项评分合计为 k，
                应扣分 = <b>10 - k/10</b> 分（评分越全面、越高，扣得越少）。提交后不可重复提交。
            </div>

            <!-- 学生选择栏 -->
            <div style="margin: 16px 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <label><b>选择小组(学生):</b></label>
                <select id="evalStudentSelect" onchange="window.dailyReport.onSelectStudent()"
                    style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; min-width: 200px;">
                    ${students.map(s => `<option value="${s.id}">${s.id} ${escapeHtml(s.name)}</option>`).join('')}
                </select>
                <span id="evalTodayStatus" style="font-size: 0.9em; padding: 4px 10px; border-radius: 12px;"></span>
            </div>

            <!-- 3x7 打分表格 -->
            <div style="margin-top: 10px; overflow-x: auto;">
                <table class="report-table" id="evalTable" style="width:100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="width: 15%; text-align:left;">评价项目（及权重）</th>
                            <th style="width: 55%; text-align:left;">评价标准（要求）</th>
                            <th style="width: 15%;">得分(0~权重)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${EVAL_ITEMS.map((it, idx) => `
                            <tr data-key="${it.key}">
                                <td style="padding:8px;"><b>${idx + 1}、${it.name}</b>（${it.weight}分）</td>
                                <td style="padding:8px; font-size: 0.9em;">${escapeHtml(it.standard)}</td>
                                <td style="text-align:center; padding:4px;">
                                    <input type="number" class="eval-input" id="eval-${it.key}" min="0" max="${it.weight}"
                                        value="0" style="width:64px; padding:6px; border:1px solid #ddd; border-radius:6px; text-align:center;"
                                        oninput="window.dailyReport.onInputChange()">
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background:#fff6f0; font-weight:bold;">
                            <td style="padding:8px;">合计 k</td>
                            <td></td>
                            <td style="text-align:center;"><span id="evalK">0</span></td>
                        </tr>
                        <tr style="background:#fff9f2; font-weight:bold;">
                            <td style="padding:8px;">应扣分 = 10 − k/10</td>
                            <td></td>
                            <td style="text-align:center; color:#ff4e4e;"><span id="evalDeduct">10.00</span> 分</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div style="margin-top: 16px; text-align:right;">
                <button class="btn btn-primary" onclick="window.dailyReport.submitEval()" id="evalSubmitBtn">✅ 提交本组打分</button>
            </div>

            <!-- 今日已汇报的学生列表 -->
            <div id="evalReportedList" style="margin-top: 20px;"></div>
        </div>
    `;

    // 初始化选中第一个学生
    if (students.length) {
        loadStudentEvalStatus(students[0].id);
    } else {
        document.getElementById('evalSubmitBtn').disabled = true;
    }

    // 渲染今日已汇报小组列表
    renderReportedList();

    window.utils.addViewLog('浏览', '进入小组互评打分');
}

// 获取今日该学生是否已汇报及记录
function getTodayEval(sid) {
    const today = window.utils.getBeijingDate();
    return (window.appData.dailyReport?.[today]?.[sid]) || null;
}

// 切换选中学生时加载其今日状态
function onSelectStudent() {
    const sid = document.getElementById('evalStudentSelect').value;
    if (sid) loadStudentEvalStatus(sid);
}

// 加载某学生对应当前打分状态: 若今日已提交则锁定并显示
function loadStudentEvalStatus(sid) {
    const rec = getTodayEval(sid);
    const statusEl = document.getElementById('evalTodayStatus');
    const btn = document.getElementById('evalSubmitBtn');

    // 重置所有输入框为 0
    EVAL_ITEMS.forEach(it => {
        const el = document.getElementById(`eval-${it.key}`);
        if (el) el.value = 0;
    });

    if (rec) {
        // 已提交: 回填并锁定
        EVAL_ITEMS.forEach(it => {
            const el = document.getElementById(`eval-${it.key}`);
            if (el) {
                el.value = rec.scores?.[it.key] ?? 0;
                el.disabled = true;
            }
        });
        if (statusEl) {
            statusEl.textContent = `✅ 今日已打分 (k=${rec.k}, 扣${rec.deduct}分, ${rec.time || ''})`;
            statusEl.style.background = '#d8f5dc';
            statusEl.style.color = '#2e8b3d';
        }
        if (btn) btn.disabled = true;
    } else {
        // 未提交: 可编辑
        EVAL_ITEMS.forEach(it => {
            const el = document.getElementById(`eval-${it.key}`);
            if (el) el.disabled = false;
        });
        if (statusEl) {
            statusEl.textContent = '⭕ 今日尚未打分，可提交';
            statusEl.style.background = '#fff3cd';
            statusEl.style.color = '#8a6d1b';
        }
        if (btn) btn.disabled = false;
    }
    onInputChange();
}

// 输入变动时实时更新 k 与应扣分
function onInputChange() {
    const k = getCurrentK();
    const elK = document.getElementById('evalK');
    const elD = document.getElementById('evalDeduct');
    if (elK) elK.textContent = k;
    if (elD) elD.textContent = (10 - k / 10).toFixed(2);
}

// 读取当前所有输入, 返回求和 k(截断到int)
function getCurrentK() {
    let sum = 0;
    EVAL_ITEMS.forEach(it => {
        const el = document.getElementById(`eval-${it.key}`);
        const v = parseInt(el ? el.value : '0', 10);
        if (!isNaN(v) && v >= 0) {
            sum += Math.min(v, it.weight); // 不超过权重
        }
    });
    return sum;
}

// 提交本组打分
function submitEval() {
    const sid = document.getElementById('evalStudentSelect').value;
    if (!sid) { alert('请先选择小组(学生)'); return; }

    // 校验今日是否已提交
    if (getTodayEval(sid)) {
        alert('该小组今日已打分，不能重复提交');
        return;
    }

    // 读取各项目评分
    const scores = {};
    let k = 0;
    let invalid = false;
    EVAL_ITEMS.forEach(it => {
        const el = document.getElementById(`eval-${it.key}`);
        const v = parseInt(el ? el.value : '', 10);
        if (isNaN(v) || v < 0 || v > it.weight) {
            invalid = true;
            return;
        }
        scores[it.key] = v;
        k += v;
    });

    if (invalid) {
        alert('请检查各项目得分，必须在 0 到对应权重之间');
        return;
    }

    const deduct = +(10 - k / 10).toFixed(2);

    if (!confirm(`确认提交?\n\n${getStudentName(sid)} 组\n评分合计 k = ${k}\n应扣分 = ${deduct} 分\n\n提交后今日不可重复打分。`)) {
        return;
    }

    // 扣分(仅当 deduct>0; 全满分 deduct=0 不扣)
    if (deduct > 0) {
        window.utils.updateStudentScore(sid, -deduct, `小组互评打分 (k=${k})`, false);
    }

    // 记录今日已提交(存储: dailyReport[date][sid])
    const today = window.utils.getBeijingDate();
    if (!window.appData.dailyReport) window.appData.dailyReport = {};
    if (!window.appData.dailyReport[today]) window.appData.dailyReport[today] = {};
    window.appData.dailyReport[today][sid] = {
        k,
        deduct,
        scores,
        time: window.utils.formatDateWithMs()
    };

    window.dataManager.saveData('dailyReport');
    window.utils.addLog('小组互评', sid, deduct > 0 ? -deduct : 0, window.utils.getStudentScore(sid), `小组互评打分 k=${k}，扣${deduct}分`);
    window.modal.notify('✅ 打分已提交', 'success');

    // 刷新: 重载当前学生状态 + 已汇报列表
    loadStudentEvalStatus(sid);
    renderReportedList();
}

// 渲染今日已汇报的小组列表
function renderReportedList() {
    try {
        const today = window.utils.getBeijingDate();
        const dayRecs = window.appData.dailyReport?.[today] || {};
        const entries = Object.entries(dayRecs);
        const el = document.getElementById('evalReportedList');
        if (!el) return;

        if (!entries.length) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = `
            <h4>📌 今日已打分小组</h4>
            <table style="width:100%; border-collapse:collapse; font-size:0.9em;">
                <thead><tr style="background:#fff0e6; color:#ff8f4e;">
                    <th style="padding:6px;">小组(学号)</th>
                    <th style="padding:6px;">姓名</th>
                    <th style="padding:6px;">合计k</th>
                    <th style="padding:6px;">扣分</th>
                    <th style="padding:6px;">提交时间</th>
                </tr></thead>
                <tbody>
                ${entries.map(([sid, rec]) => `
                    <tr>
                        <td style="padding:6px; text-align:center;">${sid}</td>
                        <td style="padding:6px;">${escapeHtml(getStudentName(sid))}</td>
                        <td style="padding:6px; text-align:center;">${rec.k ?? '-'}</td>
                        <td style="padding:6px; text-align:center; color:#ff4e4e;">${rec.deduct ?? '-'}</td>
                        <td style="padding:6px; text-align:center;">${rec.time ?? '-'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        // 忽略渲染错误
        window.utils && window.utils.addLog && window.utils.addViewLog('错误', '渲染已汇报列表失败');
    }
}

// 获取学生姓名
function getStudentName(sid) {
    const info = window.utils.getStudentData ? window.utils.getStudentData(sid) : null;
    if (info && info.name) return info.name;
    const user = Object.values(window.appData.users || {});
    const u = user.find(x => x && String(x.student_id) === String(sid));
    return u ? (u.display_name || u.username || sid) : ('学生' + sid);
}

// 只读版本
function showReadOnlyDailyReport() {
    const today = window.utils.getBeijingDate();
    const dayRecs = window.appData.dailyReport?.[today] || {};
    const entries = Object.entries(dayRecs);

    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">📋 小组互评打分</h2>
                <span style="background: #ff4e4e; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em;">r--rwxr--</span>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${entries.length}</div>
                    <div class="stat-label">今日已打分小组</div>
                </div>
            </div>
            <div style="margin-top:16px;">
                ${entries.length ? `
                    <table style="width:100%; border-collapse:collapse; font-size:0.9em;">
                        <thead><tr style="background:#fff0e6; color:#ff8f4e;">
                            <th style="padding:6px;">小组(学号)</th>
                            <th style="padding:6px;">姓名</th>
                            <th style="padding:6px;">合计k</th>
                            <th style="padding:6px;">扣分</th>
                            <th style="padding:6px;">提交时间</th>
                        </tr></thead>
                        <tbody>
                        ${entries.map(([sid, rec]) => `
                            <tr>
                                <td style="padding:6px; text-align:center;">${sid}</td>
                                <td style="padding:6px;">${escapeHtml(getStudentName(sid))}</td>
                                <td style="padding:6px; text-align:center;">${rec.k ?? '-'}</td>
                                <td style="padding:6px; text-align:center; color:#ff4e4e;">${rec.deduct ?? '-'}</td>
                                <td style="padding:6px; text-align:center;">${rec.time ?? '-'}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                ` : '<div class="warning-box">今日尚无小组完成打分。</div>'}
            </div>
        </div>
    `;
    window.utils.addViewLog('浏览', '进入小组互评打分(只读版)');
}

// ==================== 导出 ====================
window.dailyReport = {
    showDailyReport,
    onSelectStudent,
    onInputChange,
    submitEval,
    renderReportedList
};

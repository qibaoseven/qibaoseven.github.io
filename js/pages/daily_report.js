// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// ==================== 每日纪律检查(违纪扣分登记) ====================
// 权限:admin 可登记;user/root 只读
// 逻辑:顶部选择一个小组(真 id=小组), 7 个项目逐个登记违纪成员。
//       "学号"为假 id(仅作数据标记), 与真实学生无直接关系。
//       加分/扣分都作用到【当前选中的小组】上:
//          - 该项目无任何违纪成员  -> 不扣
//          - 参与了违纪的,按 -2/-3/-4 扣到该小组
//          若 7 项目全部无人违纪(完全达标)-> 该小组 +1 分
//       每个小组每天只能登记一次。
// 数据存储:appData.dailyDiscipline[today][groupId]
//         含 total_deduct, bonus, time, items{reasonKey:[{id,reason,score}...]}

// 检查项目定义(标题, 描述)  — 不显示分数
const EVAL_ITEMS = [
    { key: 'regionDiscipline', name: '区域纪律', standard: '小组所在区域成员遵守课堂/活动纪律情况，无打闹、喧哗、违纪行为' },
    { key: 'homeworkRate',     name: '作业提交率', standard: '小组全体成员按时、按质完成并提交作业的比例' },
    { key: 'areaHygiene',      name: '组区卫生', standard: '小组负责区域的整洁度、物品摆放规范度、卫生打扫完成情况' },
    { key: 'unity',            name: '组员团结', standard: '组员之间协作互助、无矛盾冲突、团队凝聚力表现' },
    { key: 'progress',         name: '组员各方面有进步', standard: '组员在学习、纪律、活动参与等方面的综合态度或者成果' },
    { key: 'participation',    name: '组员活动参与度', standard: '组员主动参与集体活动、小组任务的积极性和参与比例' },
    { key: 'quality',          name: '活动完成质量', standard: '小组承担的活动、任务最终完成的效果和达标情况' }
];

// 允许的扣分档位
const DEDUCT_OPTIONS = [-2, -3, -4];

// 运行中暂存: 当前选中小组成员登记(仅内存,提交后写入)
const DRAFT = {
    sid: null,              // 当前选中小组id
    records: {}             // { reasonKey: [{id,score}, ...] }  (id为假id数字)
};

function todayStr() {
    return window.utils.getBeijingDate();
}

function showDailyReport() {
    document.getElementById('contentArea').setAttribute('data-page', 'dailyReport');
    const canModify = window.currentUser?.role === 'admin';
    if (!canModify) { showReadOnlyDailyReport(); return; }

    const students = window.utils.getAllStudents().sort((a, b) => parseInt(a.id) - parseInt(b.id));

    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h2 class="card-title">📋 每日纪律登记</h2>
                <span style="background:#ff4e4e;color:#fff;padding:4px 8px;border-radius:4px;font-size:.8em;">r--rwxr--</span>
            </div>

            <div class="info-box">
                <strong>📢 说明:</strong> 选择小组后，在下方七个项目中登记违反的成员。
                填写的「学号」仅作为记录标记；查到违纪则对<span style="color:#ff4e4e;">当前小组</span>扣 <b>-2 / -3 / -4</b> 分。
                若七项全部无人违纪（完全达标），该小组当日 <b>+1</b> 分。每个小组每天只能登记一次。
            </div>

            <!-- 顶部选小组 -->
            <div style="margin:16px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <label><b>选择小组:</b></label>
                <select id="discSelectSid" onchange="window.dailyReport.onSelectSid()"
                    style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;min-width:200px;">
                    ${students.map(s => `<option value="${s.id}">${s.id} · ${escapeHtml(s.name)}</option>`).join('')}
                </select>
                <span id="discStatus" style="font-size:.9em;padding:4px 10px;border-radius:12px;"></span>
                <span style="margin-left:auto;font-size:.95em;">当前小组分数: <b id="discGroupScore">-</b></span>
            </div>

            <!-- 七个项目区块 -->
            <div style="display:flex;flex-direction:column;gap:12px;" id="discItems"></div>

            <!-- 统计与提交 -->
            <div style="margin-top:14px;background:#fff9f2;border:1px solid #f0e0cc;border-radius:8px;padding:12px;">
                <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center;">
                    <span>已记录违纪: <b id="discCount">0</b> 条</span>
                    <span>预计扣分: <b id="discDeduct" style="color:#ff4e4e;">0</b> 分</span>
                    <span id="discBonus" style="display:none;font-weight:bold;color:#2e8b3d;">🎉 该项目组全达标，提交后 +1 分</span>
                </div>
                <div style="margin-top:10px;text-align:right;">
                    <button class="btn btn-primary" onclick="window.dailyReport.submitDisc()" id="discSubmitBtn">✅ 提交今日登记</button>
                </div>
            </div>

            <div style="margin-top:14px;" id="discTodayList"></div>
        </div>
    `;

    // 初始化选中第一个小组
    if (students.length) {
        DRAFT.sid = students[0].id;
        initGroup(students[0].id);
    } else {
        document.getElementById('discSubmitBtn').disabled = true;
    }
    renderTodayList();
    window.utils.addViewLog('浏览', '进入每日纪律登记');
}

// 切换小组
function onSelectSid() {
    const sid = document.getElementById('discSelectSid').value;
    if (sid != null && sid !== '') { DRAFT.sid = sid; initGroup(sid); }
}

// 获取今日某个小组已登记记录(若已提交过)
function getTodayRecord(sid) {
    const d = window.appData.dailyDiscipline?.[todayStr()]?.[sid];
    return d || null;
}

// 初始化小组: 若今日已提交 -> 锁定展示; 否则进入空白编辑
function initGroup(sid) {
    DRAFT.sid = sid;
    const rec = getTodayRecord(sid);
    const statusEl = document.getElementById('discStatus');
    const btn = document.getElementById('discSubmitBtn');
    const scoreEl = document.getElementById('discGroupScore');

    if (rec) {
        // 今日已提交 -> 锁定
        DRAFT.records = {};
        if (statusEl) { statusEl.textContent = '✅ 今日已登记，不可修改'; statusEl.style.background='#d8f5dc'; statusEl.style.color='#2e8b3d'; }
        if (btn) btn.disabled = true;
    } else {
        // 空白新建
        DRAFT.records = {};
        if (statusEl) { statusEl.textContent = '⭕ 今日未登记，可编辑'; statusEl.style.background='#fff3cd'; statusEl.style.color='#8a6d1b'; }
        if (btn) btn.disabled = false;
    }

    // 当前小组分数
    if (scoreEl) {
        try { scoreEl.textContent = window.utils.getStudentScore(sid); } catch(e){ scoreEl.textContent = '-'; }
    }

    renderItems(sid, rec);
    updateSummary();
}

// 渲染七个项目区
function renderItems(sid, rec) {
    const cont = document.getElementById('discItems');
    if (!cont) return;

    const submitted = !!rec; // 若已提交则只读展示
    const storedByKey = rec && rec.items ? (rec.items||{}) : {};

    cont.innerHTML = EVAL_ITEMS.map(item => {
        // 该项目的数据(重读, 运行中优先 DRAFT.records; 若已提交从 rec)
        const list = submitted ? (storedByKey[item.key]||[]) : (DRAFT.records[item.key]||[]);

        const chips = list.map((r, i) => `
            <span style="display:inline-flex;align-items:center;gap:6px;background:#fff0e6;color:#ff4e4e;
                border-radius:14px;padding:3px 10px;margin:3px;font-size:.85em;">
                id #${r.id} (${r.score})
                ${submitted ? '' : `<span style="cursor:pointer;font-weight:bold;" title="移除"
                    onclick="window.dailyReport.removeMember('${item.key}',${i})">✕</span>`}
            </span>`).join('');

        return `
        <div style="border:1px solid #eee;border-radius:10px;padding:12px 14px;background:#fafafa;">
            <h3 style="margin:0 0 6px;font-size:1.05em;">${item.name}</h3>
            <p style="margin:0 0 10px;color:#666;font-size:.9em;">${escapeHtml(item.standard)}</p>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-weight:bold;flex-shrink:0;">减分同学：</span>
                <div style="flex:1;display:flex;flex-wrap:wrap;align-items:center;min-height:28px;">
                    ${chips}
                    ${submitted ? '' : `<button class="btn" style="padding:4px 12px;margin-left:4px;"
                        onclick="window.dailyReport.showAddMember('${item.key}')">＋ 添加同学</button>`}
                </div>
            </div>
        </div>`;
    }).join('');
}

// 展示"添加同学"弹窗
function showAddMember(itemKey) {
    const item = EVAL_ITEMS.find(i => i.key === itemKey);
    const idInputId = 'disc_add_id';
    const opts = DEDUCT_OPTIONS.map(o=>`<option value="${o}">${o} 分</option>`).join('');
    window.modal.show(`添加违纪 · ${item.name}`, `
        <div style="margin:12px 0;">
            <label>学号:</label>
            <input type="number" id="${idInputId}" placeholder="输入学号编号" min="1"
                style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-top:4px;">
            <label style="display:block;margin-top:12px;">扣分选项:</label>
            <select id="disc_add_score" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-top:4px;">${opts}</select>
        </div>
    `, [
        { text:'取消', onclick:'window.modal.close()' },
        { text:'确定添加', className:'btn-primary', onclick:`window.dailyReport.confirmAddMember('${itemKey}')` }
    ]);
}

// 确认添加成员
function confirmAddMember(itemKey) {
    const idEl = document.getElementById('disc_add_id');
    const scoreEl = document.getElementById('disc_add_score');
    const id = parseInt(idEl ? idEl.value : '', 10);
    const score = parseInt(scoreEl ? scoreEl.value : '', 10);

    if (!idEl || !scoreEl) return;
    if (isNaN(id) || id <= 0) { alert('请填写有效的学号'); return; }
    if (isNaN(score)) { alert('请选择扣分选项'); return; }

    // 加到 DRAFT.records
    if (!DRAFT.records[itemKey]) DRAFT.records[itemKey] = [];
    DRAFT.records[itemKey].push({ id, score });
    window.modal.close();
    renderItems(DRAFT.sid, null);
    updateSummary();
}

// 移除成员(编辑态)
function removeMember(itemKey, idx) {
    const arr = DRAFT.records[itemKey];
    if (arr) { arr.splice(idx, 1); if (!arr.length) delete DRAFT.records[itemKey]; }
    renderItems(DRAFT.sid, null);
    updateSummary();
}

// 汇总预览
function updateSummary() {
    const countEl = document.getElementById('discCount');
    const dedEl = document.getElementById('discDeduct');
    const bonusEl = document.getElementById('discBonus');

    if (!countEl) return;
    // 统计 DRAFT
    let count = 0, deduct = 0;
    let hasClean = true;
    EVAL_ITEMS.forEach(it => {
        const list = (DRAFT.records[it.key]||[]).slice();
        count += list.length;
        list.forEach(r => { if (typeof r.score === 'number') deduct += r.score; });
        if (list.length) hasClean = false;
    });

    countEl.textContent = count;
    dedEl.textContent = deduct;

    // 全达标 -> +1 提示
    if (bonusEl) {
        if (hasClean) {
            bonusEl.style.display = 'inline';
        } else {
            bonusEl.style.display = 'none';
        }
    }
}

// 渲染今日已登记的小组
function renderTodayList() {
    const el = document.getElementById('discTodayList');
    if (!el) return;
    const day = window.appData.dailyDiscipline?.[todayStr()] || {};
    const entries = Object.entries(day);
    if (!entries.length) { el.innerHTML = ''; return; }

    const rows = entries.map(([sid, rec]) => `
        <tr>
            <td style="padding:6px;text-align:center;">小组 ${sid}</td>
            <td style="padding:6px;text-align:center;">${rec.total_deduct ?? 0}</td>
            <td style="padding:6px;text-align:center;">${rec.bonus ? '+1' : '—'}</td>
            <td style="padding:6px;text-align:center;">${rec.time ?? ''}</td>
        </tr>`).join('');
    el.innerHTML = `
        <h4>📌 今日已登记小组</h4>
        <table style="width:100%;border-collapse:collapse;font-size:.9em;">
            <thead><tr style="background:#fff0e6;color:#ff8f4e;">
                <th style="padding:6px;">小组</th>
                <th style="padding:6px;">总扣分</th>
                <th style="padding:6px;">达标加分</th>
                <th style="padding:6px;">时间</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// 提交今日登记
function submitDisc() {
    const sid = DRAFT.sid;
    if (!sid) { alert('请先选择小组'); return; }

    if (getTodayRecord(sid)) { alert('该小组今日已登记，不能重复提交'); return; }

    // 收集所有记录
    const items = {};
    let hasClean = true;  // 是否项目全部无人违纪
    let totalDeduct = 0;
    let count = 0;
    EVAL_ITEMS.forEach(it => {
        const list = (DRAFT.records[it.key]||[]).slice();
        items[it.key] = list;
        count += list.length;
        list.forEach(r => { totalDeduct += (typeof r.score === 'number' ? r.score : 0); });
        if (list.length) hasClean = false;
    });

    // 全达标 -> +1, 否则按违纪扣
    let scoreChange = 0;
    if (hasClean) scoreChange = +1;
    else scoreChange = totalDeduct;   // 负数

    const gname = getStudentName(sid);
    const detail = count === 0
        ? '七项全部无人违纪'
        : (`违纪 ${count} 条，扣 ${totalDeduct} 分`);

    // 二次确认
    if (!confirm(`确认提交「${gname}」今日登记?\n\n${detail}\n本次影响分值: ${scoreChange > 0 ? '+' : ''}${scoreChange} 分\n\n提交后今日不可修改。`)) return;

    // 1. 应用分数(加/扣到当前小组)
    if (scoreChange !== 0) {
        const reason = hasClean ? '纪律全达标奖励' : `纪律违纪 (${count}条)`;
        window.utils.updateStudentScore(sid, scoreChange, reason, false);
    }

    // 2. 写入 dailyDiscipline 数据结构
    if (!window.appData.dailyDiscipline) window.appData.dailyDiscipline = {};
    const today = todayStr();
    if (!window.appData.dailyDiscipline[today]) window.appData.dailyDiscipline[today] = {};
    window.appData.dailyDiscipline[today][sid] = {
        total_deduct: totalDeduct,     // 负数; 若无违纪为 0
        bonus: hasClean ? 1 : 0,       // 全达标 +1
        score_change: scoreChange,
        items,                          // 详细数据: {reasonKey:[{id,reason,score}u]}, 需注入reason
        time: window.utils.formatDateWithMs()
    };
    // 给每条注入 reason 字符串
    const saved = window.appData.dailyDiscipline[today][sid];
    EVAL_ITEMS.forEach(it => {
        if (saved.items && saved.items[it.key]) {
            saved.items[it.key].forEach(r => r.reason = it.name);
        }
    });

    window.dataManager.saveData('dailyDiscipline');
    window.utils.addLog('纪律登记', sid, scoreChange, window.utils.getStudentScore(sid), `${gname} ${detail}，分值${scoreChange>0?'+':''}${scoreChange}`);
    window.modal.notify('✅ 今日登记已提交', 'success');

    // 刷新回该小组(锁定)
    DRAFT.records = {};
    initGroup(sid);
    renderTodayList();
}

// 只读版
function showReadOnlyDailyReport() {
    const day = window.appData.dailyDiscipline?.[todayStr()] || {};
    const entries = Object.entries(day);

    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h2 class="card-title">📋 每日纪律登记</h2>
                <span style="background:#ff4e4e;color:#fff;padding:4px 8px;border-radius:4px;font-size:.8em;">r--rwxr--</span>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${entries.length}</div>
                    <div class="stat-label">今日已登记小组</div>
                </div>
            </div>
            <div style="margin-top:16px;">
            ${entries.length ? `
                <table style="width:100%;border-collapse:collapse;font-size:.9em;">
                    <thead><tr style="background:#fff0e6;color:#ff8f4e;">
                        <th style="padding:6px;">小组</th><th style="padding:6px;">总扣分</th>
                        <th style="padding:6px;">达标加分</th><th style="padding:6px;">时间</th>
                    </tr></thead>
                    <tbody>
                    ${entries.map(([sid,rec])=>`<tr>
                        <td style="padding:6px;text-align:center;">小组 ${sid}</td>
                        <td style="padding:6px;text-align:center;">${rec.total_deduct??0}</td>
                        <td style="padding:6px;text-align:center;">${rec.bonus?'+1':'—'}</td>
                        <td style="padding:6px;text-align:center;">${rec.time??''}</td>
                    </tr>`).join('')}
                    </tbody>
                </table>` : '<div class="warning-box">今日尚无小组登记。</div>'}
            </div>
        </div>`;
    window.utils.addViewLog('浏览','进入每日纪律登记(只读)');
}

// 取学生/小组名
function getStudentName(sid) {
    try {
        const d = window.utils.getStudentData ? window.utils.getStudentData(sid) : null;
        if (d && d.name) return d.name;
    } catch(e){}
    return '小组' + sid;
}

// ==================== 导出 ====================
window.dailyReport = {
    showDailyReport,
    onSelectSid,
    showAddMember,
    confirmAddMember,
    removeMember,
    submitDisc
};

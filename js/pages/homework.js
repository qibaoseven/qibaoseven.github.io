// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// Homework 作业子系统 - 前端页面
// 只读展示:所有角色可查看作业数据
// 创建/布置/登记:仅 admin 和 root
// ========================================

// 惰性获取作业 API 基础路径 (避免加载时序依赖)
function hwAPIBase() {
    return `${window.API_BASE || '/.netlify/functions/api'}/class/${window.currentClassId}/homework`;
}

// 本地 HTML 转义 (保证自包含)
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// 转义 JSON 字符串后再放入HTML(用于 textarea 预填)
function escapeForAttr(str) {
    return escapeHtml(String(str)).replace(/\n/g, '\\n');
}

// ---------- 工具函数 ----------
function parseDateStr(s) {
    // 支持 'YYYY-MM-DD' 或 'YYYY/M/D'
    if (!s) return null;
    const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
}

function fmtDate(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// 某日期所在周的周一
function startOfWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const wd = (x.getDay() + 6) % 7; // 周一=0
    x.setDate(x.getDate() - wd);
    return x;
}

// 某日期所在月的第一天
function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

// 某日期所在年的第一天
function startOfYear(d) {
    return new Date(d.getFullYear(), 0, 1);
}

// 判断当前用户是否有管理权限
function isHomeworkManager() {
    return window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'root');
}

// 易读的角色名
function roleLabel(role) {
    const m = { user: '👤 学生', admin: '🔧 管理员', root: '⚡ 超级管理员' };
    return m[role] || '学生';
}

// ---------- 后端 API 封装 ----------
function hwHeaders(withJson) {
    const h = {
        'X-Password': window.classPassword || '',
        'X-Password-Hash': window.classPasswordHash || ''
    };
    if (withJson) h['Content-Type'] = 'application/json';
    return h;
}

async function hwGet(path) {
    const r = await fetch(`${hwAPIBase()}${path}`, { headers: hwHeaders() });
    return r;
}

async function hwPost(path, body) {
    const r = await fetch(`${hwAPIBase()}${path}`, {
        method: 'POST',
        headers: hwHeaders(true),
        body: JSON.stringify(body)
    });
    return r;
}

// 计算"应提交科目"和"已提交科目"
// dayData: 该生当天 [语文,数学,...] 位数组 (1=已交)
// subjectCount: 学科总数
// 应提交科目 = 所有学科 (当天布置的学科布尔通常在 meta 里,此处按全部学科计)
function computeRate(dayData, subjectCount) {
    if (!Array.isArray(dayData)) return { submitted: 0, total: subjectCount, rate: 0 };
    const total = subjectCount || dayData.length || 0;
    const submitted = dayData.filter(v => v === 1 || v === true).length;
    return { submitted, total, rate: total > 0 ? submitted / total : 0 };
}

// 作业积极度权重:1/(k+0.5)^sqrt(3)
function hwWeight(k) {
    const SQRT3 = Math.sqrt(3);
    return 1 / Math.pow(k + 0.5, SQRT3);
}

// ---------- 数据加载 ----------
// 拉取作业元数据 (学科列表, 学生数)
async function hwLoadMeta() {
    const r = await hwGet('/meta');
    if (r.status === 404) return { uninitialized: true };
    if (!r.ok) throw new Error('获取作业元数据失败');
    return await r.json();
}

// 拉取全班作业数据 (后端返回 data 三维数组 [天数][学生索引][学科] + dateFrom/dateTo)
async function hwLoadAll() {
    const r = await hwGet('');
    if (r.status === 404) return { exists: false };
    if (!r.ok) throw new Error('获取作业数据失败:' + r.status);
    return await r.json();
}

// 拉取某个学生某天作业 ([语文,数学,...])
async function hwLoadStudentDay(studentId, dateStr) {
    const r = await hwGet(`/student/${studentId}?date=${dateStr}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('获取学生作业失败');
    const j = await r.json();
    return j.homework || null;
}

// 拉取某个学生全部作业记录 [{date, homework}]
async function hwLoadStudentAll(studentId) {
    const r = await hwGet(`/student/${studentId}`);
    if (r.status === 404) return [];
    if (!r.ok) throw new Error('获取学生作业记录失败');
    const j = await r.json();
    return j.data || [];
}

// ---------- 主入口 ----------
async function showHomework() {
    const content = document.getElementById('contentArea');
    content.innerHTML = `<div style="padding:20px;">⏳ 正在加载作业系统...</div>`;

    let meta;
    let full;
    try {
        meta = await hwLoadMeta();
        if (meta.uninitialized) {
            content.innerHTML = renderNotInitialized();
            return;
        }
        full = await hwLoadAll();
    } catch (e) {
        content.innerHTML = `<div class="content-card"><h2 class="card-title">📚 作业提交</h2>
            <p style="color:#ff4e4e;">加载失败:${escapeHtml(e.message)}</p>
            <p style="color:#888;">请退出后重新进入班级，或检查网络。</p></div>`;
        return;
    }

    // 后端 GET /homework 返回 {data,dateFrom,dateTo,totalDays},不包含 exists 字段
    if (!full.data || !Array.isArray(full.data) || full.data.length === 0) {
        content.innerHTML = `<div class="content-card"><h2 class="card-title">📚 作业提交</h2>
            <p>作业系统已初始化，但暂无作业数据。请管理员创建作业。</p></div>`;
        return;
    }

    // 组装视图
    window.hw = { meta, full };
    window.hwTrend = window.hwTrend || { mode: guessTrendMode(), sid: guessTrendSid(), granularity: 'week' };
    content.innerHTML = renderHomeworkPage(meta, full);
    // 初次绘制趋势图
    renderTrendChart(meta, full);
}

// 默认趋势:当前用户有学号则默认查自己,否则查全班
function guessTrendMode() {
    const me = window.currentUser;
    return (me && me.student_id && !isNaN(+me.student_id)) ? 'student' : 'class';
}
function guessTrendSid() {
    const me = window.currentUser;
    return (me && me.student_id && !isNaN(+me.student_id)) ? Number(me.student_id) : 1;
}

// ---------- 渲染:未初始化 ----------
function renderNotInitialized() {
    if (!isHomeworkManager()) {
        return `<div class="content-card">
            <h2 class="card-title">📚 作业提交</h2>
            <p>作业系统尚未初始化。请联系管理员创建作业。</p>
        </div>`;
    }
    const stuCount = window.appData && window.appData.scores ? Object.keys(window.appData.scores).filter(id => id !== '0').length : 0;
    // 从班级实时提取学科建议(若 scores 无默认列则给常见学科)
    const subjectNames = localStorage.getItem('studentos_homework_subjects') || '{"0":"语文","1":"数学","2":"英语","3":"科学"}';
    return `<div class="content-card">
        <h2 class="card-title">📚 创建作业文件</h2>
        <p style="color:#888;">作业系统尚未初始化，请先创建作业文件。</p>
        <div style="margin:20px 0; max-width:420px;">
            <label>学生人数：</label>
            <input type="number" id="hwStuCount" value="${stuCount}" min="1" placeholder="学生人数"
                style="width:100%; padding:10px; margin:8px 0; border:1px solid #ddd; border-radius:8px;">
            <label>学科列表（JSON 格式，键从 0 开始）：</label>
            <textarea id="hwSubjectsText" rows="4"
                style="width:100%; padding:10px; margin:8px 0; border:1px solid #ddd; border-radius:8px;">${escapeHtml(subjectNames)}</textarea>
            <label>起始日期（可选，默认今天）：</label>
            <input type="date" id="hwStartDate" style="width:100%; padding:10px; margin:8px 0; border:1px solid #ddd; border-radius:8px;">
            <button class="btn btn-primary" onclick="window.homework.submitInit()">✅ 创建作业文件</button>
        </div>
    </div>`;
}

// ---------- 渲染:主页面 ----------
function renderHomeworkPage(meta, full) {
    const subjectNames = meta.subjectNames || {};
    const subjectCount = meta.subjectCount || Object.keys(subjectNames).length || 1;
    const startDate = meta.startDate || full.dateFrom;
    const width = { maxWidth: '1250px' };
    const html = `
    <div class="content-card">
        <h2 class="card-title">📚 作业提交系统</h2>
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid #eee;margin-bottom:16px;">
            <span class="roleTag" style="padding:4px 10px;border-radius:12px;background:#fff0e6;color:#ff8f4e;font-weight:600;">学科: ${Object.values(subjectNames).join(' / ') || '未配置'}</span>
            <span class="roleTag" style="padding:4px 10px;border-radius:12px;background:#eef;color:#4e8fff;font-weight:600;">学生 ${meta.studentCount} 人</span>
            <span class="roleTag" style="padding:4px 10px;border-radius:12px;background:#efe;color:#4ecf6e;font-weight:600;">起始 ${escapeHtml(startDate||'')}</span>
            ${isHomeworkManager() ? '<button class="btn" onclick="window.homework.showManage()">⚙️ 布置/登记</button>' : ''}
        </div>

        <div style="display:grid;gap:16px;">
            ${renderMyHomeworkBlock(meta, full, subjectNames, subjectCount)}
            <hr style="border:none;border-top:1px dashed #eee;">
            ${renderTrendBlock(meta, full, subjectNames, subjectCount)}
            <hr style="border:none;border-top:1px dashed #eee;">
            ${renderRankBlock(full, startDate, subjectCount)}
        </div>
    </div>`;
    return html;
}

// ---------- 个人作业概览 (当前用户 当天/本周/本月) ----------
function renderMyHomeworkBlock(meta, full, subjectNames, subjectCount) {
    const me = window.currentUser;
    const myId = me && me.student_id ? String(me.student_id) : '';
    if (myId && !isNaN(+myId)) {
        return renderStudentOverview(+myId, meta, full, subjectCount, me.display_name || me.username);
    }
    // 学生ID无效则提示
    return `<div style="background:#fff9f0;border-radius:10px;padding:16px;">
        <h3 style="margin:0 0 10px;">👤 我的作业</h3>
        <p style="color:#888;">当前账号没有有效的学生学号，无法展示个人作业。</p>
    </div>`;
}

// 指定学生当/周/月提交率概览
function renderStudentOverview(studentId, meta, full, subjectCount, name) {
    const seen = buildStudentDayMap(full, studentId);
    const today = new Date();
    const todayKey = fmtDate(today);
    const sunday = startOfWeek(today);
    const monthFirst = startOfMonth(today);
    const yearFirst = startOfYear(today);

    const todayR = summaryInRange(seen, k => k === todayKey, subjectCount);
    const weekR = summaryInRange(seen, k => { const d = parseDateStr(k); return d && d >= sunday && d <= today; }, subjectCount);
    const monthR = summaryInRange(seen, k => { const d = parseDateStr(k); return d && d >= monthFirst && d <= today; }, subjectCount);
    const yearR = summaryInRange(seen, k => { const d = parseDateStr(k); return d && d >= yearFirst && d <= today; }, subjectCount);

    function card(label, r) {
        return `<div class="stat-card" style="padding:14px;">
            <div class="stat-value">${pct(r.rate)}</div>
            <div class="stat-label">${label}</div>
            <div style="font-size:12px;color:#999;">${r.submitted}/${r.total} 科目</div>
        </div>`;
    }
    return `<div>
        <h3 style="margin:0 0 12px;">👤 ${escapeHtml(name || ('学生 '+studentId))} 提交概览</h3>
        <div class="stats-grid">${card('今天', todayR)}${card('本周', weekR)}${card('本月', monthR)}${card('今年', yearR)}</div>
    </div>`;
}

function pct(r) {
    return Math.round(r * 100) + '%';
}

// 构建某学生 [日期->dayData] 映射
function buildStudentDayMap(full, studentId) {
    const map = {};
    const data = full.data || [];
    const dateFrom = parseDateStr(full.dateFrom || full.data_date_from);
    data.forEach((days, di) => {
        if (studentId >= 0 && studentId < days.length) {
            const dd = days[studentId];
            if (Array.isArray(dd)) {
                const date = dateFrom ? fmtDate(addDays(dateFrom, di)) : String(di);
                map[date] = dd;
            }
        }
    });
    return map;
}

function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
}

// 在范围内统计提交率 (seen: {date:dayData})
function summaryInRange(seen, filterFn, subjectCount) {
    let submitted = 0, totalDays = 0;
    Object.keys(seen).forEach(k => {
        if (!filterFn(k)) return;
        const r = computeRate(seen[k], subjectCount);
        submitted += r.submitted;
        totalDays += r.total;
    });
    return { submitted, total: totalDays, rate: totalDays > 0 ? submitted / totalDays : 0 };
}

// ---------- 趋势折线图数据 ----------
// 采集某学生或全班,在某时间范围内,按粒度聚合的提交率序列
// mode: 'student' 传入学生ID, 或 'class'
// granularity: 'day'|'week'|'month'
// range: {type:'week'|'month'|'year', ref:Date}
function buildTrendSeries(full, mode, studentId, granularity, range, subjectCount) {
    const data = full.data || [];
    const dateFrom = parseDateStr(full.dateFrom);
    if (!dateFrom) return { labels: [], values: [] };

    // 收集每个时间点的 "提交科目/应提交科目"
    // 聚合窗口起点 -> 累计提交/累计应提交
    const agg = new Map(); // key: 窗口起始日期字符串

    const startDay = rangeStart(range, dateFrom);
    const endDay = rangeEnd(range, new Date()); // 至今天

    for (let di = 0; di < data.length; di++) {
        const d = addDays(dateFrom, di);
        if (d < startDay) continue;
        if (d > endDay) break;
        const dayPatients = data[di];
        let sub = 0, tot = 0;
        if (mode === 'student') {
            if (studentId >= 0 && studentId < dayPatients.length && Array.isArray(dayPatients[studentId])) {
                const r = computeRate(dayPatients[studentId], subjectCount);
                sub += r.submitted; tot += r.total;
            }
        } else {
            // 全班:从索引1开始,跳过0号机器人哨兵(它恒为[0,0],会拉低全班比率)
            for (let si = 1; si < dayPatients.length; si++) {
                if (Array.isArray(dayPatients[si])) {
                    const r = computeRate(dayPatients[si], subjectCount);
                    sub += r.submitted; tot += r.total;
                }
            }
        }
        if (tot === 0) continue; // 当天无应提交科目(未布置)则跳过

        const key = bucketKey(d, granularity);
        const cur = agg.get(key) || { s: 0, t: 0 };
        cur.s += sub; cur.t += tot;
        agg.set(key, cur);
    }

    // 转为升序序列
    const labels = [], values = [];
    const sortedKeys = Array.from(agg.keys()).sort((a, b) => a < b ? -1 : 1);
    sortedKeys.forEach(k => {
        const cur = agg.get(k);
        labels.push(k);
        values.push(cur.t > 0 ? cur.s / cur.t : 0);
    });
    return { labels, values };
}

function rangeStart(range, dateFrom) {
    const ref = range.ref || new Date();
    const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    if (range.type === 'week') return startOfWeek(today);
    if (range.type === 'month') return startOfMonth(today);
    if (range.type === 'year') return startOfYear(today);
    return dateFrom;
}

function rangeEnd(range, todayRef) {
    return todayRef;
}

function bucketKey(d, granularity) {
    if (granularity === 'week') return fmtDate(startOfWeek(d));
    if (granularity === 'month') return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    return fmtDate(d);
}

// ---------- 趋势区块 ----------
function renderTrendBlock(meta, full, subjectNames, subjectCount) {
    const me = window.currentUser;
    const myId = me && me.student_id && !isNaN(+me.student_id) ? Number(me.student_id) : '';
    const curMode = window.hwTrend ? window.hwTrend.mode : (myId !== '' ? 'student' : 'class');
    const curSid = window.hwTrend ? window.hwTrend.sid : (myId !== '' ? myId : 1);
    const curGran = window.hwTrend ? window.hwTrend.granularity : 'week';
    const bound = full.data ? full.data[0].length - 1 : 1; // 实际学生最大索引(含0机器人,减1)

    return `<div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px;">
            <h3 style="margin:0;">📈 提交趋势</h3>
            <select id="hwTrendMode" onchange="window.homework.chgTrend({mode:this.value})">
                <option value="class" ${curMode==='class'?'selected':''}>👥 全班</option>
                <option value="student" ${curMode==='student'?'selected':''}>👤 单个学生</option>
            </select>
            <input type="number" id="hwTrendSid" value="${curSid}" min="1" max="${Math.max(bound,1)}" placeholder="学生ID"
                style="width:90px;padding:8px;border:1px solid #ddd;border-radius:8px;"
                onchange="window.homework.chgTrend({})"
                ${curMode==='class'?'disabled':''}>
            <select id="hwTrendGran" onchange="window.homework.chgTrend({granularity:this.value})">
                <option value="day" ${curGran==='day'?'selected':''}>按日</option>
                <option value="week" ${curGran==='week'?'selected':''}>按周</option>
                <option value="month" ${curGran==='month'?'selected':''}>按月</option>
            </select>
        </div>
        <div id="hwTrendChart" style="width:100%;height:280px;background:#fafafa;border-radius:10px;position:relative;"></div>
        <div style="color:#888;font-size:12px;margin-top:6px;">提交率 = 已提交科目 / 应提交科目</div>
    </div>`;
}

// 切换趋势选项
function chgTrend(opt) {
    if (!window.hw || !window.hw.meta || !window.hw.full) return;
    const mode = document.getElementById('hwTrendMode').value;
    const sid = parseInt(document.getElementById('hwTrendSid').value || '0', 10);
    const gran = document.getElementById('hwTrendGran').value;
    window.hwTrend = { mode, sid, granularity: gran };
    // 模式切换时同步学生输入框可用性
    const sidInput = document.getElementById('hwTrendSid');
    if (sidInput) sidInput.disabled = (mode === 'class');
    renderTrendChart(window.hw.meta, window.hw.full);
}

// 重绘趋势图(保持当前选择)
function renderTrendChart(meta, full) {
    const t = window.hwTrend || {};
    const mode = t.mode || 'class';
    const sid = t.sid || 1;
    const gran = t.granularity || 'week';
    const subjectCount = meta.subjectCount || 1;

    const range = { type: 'week', ref: new Date() }; // 默认本周,数据里7天
    const ser = buildTrendSeries(full, mode, sid, gran, range, subjectCount);
    const el = document.getElementById('hwTrendChart');
    if (!el) return;
    if (!ser.labels.length) {
        el.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">该时间范围内暂无作业数据</div>';
        return;
    }
    drawLineChart(el, ser.labels, ser.values, `${mode==='class'?'全班':('学生 '+sid)} 提交率`);
}

// Canvas 折线图绘制(无第三方依赖)
function drawLineChart(container, labels, values, title) {
    const W = container.clientWidth || 800;
    const H = container.clientHeight || 280;
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    const padL = 42, padR = 14, padT = 26, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxV = 1, minV = 0;

    // 网格与刻度
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.strokeStyle = '#eee';
    ctx.fillStyle = '#999';
    for (let i = 0; i <= 4; i++) {
        const y = padT + plotH - (plotH * i / 4);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillText(Math.round((minV + (maxV - minV) * i / 4) * 100) + '%', padL - 6, y + 4);
    }

    const n = labels.length;
    const stepX = n > 1 ? plotW / (n - 1) : 0;

    // 面积填充
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    for (let i = 0; i < n; i++) {
        const x = padL + i * stepX;
        const y = padT + plotH - (values[i] - minV) / (maxV - minV) * plotH;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + (n - 1) * stepX, padT + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,143,78,0.12)';
    ctx.fill();

    // 折线
    ctx.beginPath();
    ctx.strokeStyle = '#ff8f4e';
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
        const x = padL + i * stepX;
        const y = padT + plotH - (values[i] - minV) / (maxV - minV) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 数据点与数值
    ctx.fillStyle = '#ff8f4e';
    ctx.strokeStyle = '#fff';
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
        const x = padL + i * stepX;
        const y = padT + plotH - (values[i] - minV) / (maxV - minV) * plotH;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.stroke();
    }

    // X 轴标签(采样显示)
    ctx.fillStyle = '#999';
    ctx.textBaseline = 'top';
    const maxLabels = Math.max(1, Math.floor(plotW / 90));
    const every = Math.ceil(n / maxLabels);
    for (let i = 0; i < n; i += every) {
        const x = padL + i * stepX;
        ctx.fillText(shortLabel(labels[i]), x, padT + plotH + 8);
    }
    ctx.textBaseline = 'alphabetic';

    // 标题
    ctx.textAlign = 'left';
    ctx.fillStyle = '#666';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(title, padL, 14);

    // Tooltip: 显示最近一点数值
    if (n > 0) {
        const lastX = padL + (n - 1) * stepX;
        const lastY = padT + plotH - (values[n - 1] - minV) / (maxV - minV) * plotH;
        ctx.fillStyle = '#333';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        const label = shortLabel(labels[n - 1]) + ' ' + Math.round(values[n - 1] * 100) + '%';
        ctx.fillText(label, padL + plotH > 0 ? Math.max(padL, lastX - 8) : padL, lastY > 14 ? lastY - 8 : 14);
    }
}

function shortLabel(k) {
    // '2026-08-28' -> '08-28' ; '2026-08' -> '08月' ; '2026-07-01'(周起点) -> '07/01周'
    const m = String(k).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (m) return m[3] ? `${m[2]}-${m[3]}` : `${m[2]}月`;
    return k;
}

// ---------- 积极度排行榜 (近30天) ----------
function renderRankBlock(full, startDate, subjectCount) {
    const today = new Date();
    const todayKey = fmtDate(today);
    const data = full.data || [];
    const dateFrom = parseDateStr(full.dateFrom);

    if (!dateFrom) return '';
    // 计算每个学生的积极度
    const scores = new Map(); // sid -> 得分
    const names = {};
    for (let sid = 1; sid < (data[0] ? data[0].length : 1); sid++) {
        let score = 0;
        if (data.length === 0) continue;
        for (let di = 0; di < data.length; di++) {
            const d = addDays(dateFrom, di);
            const k = Math.round((today - d) / 86400000); // 距今
            if (k < 0 || k > 29 || !Array.isArray(data[di][sid])) continue;
            const r = computeRate(data[di][sid], subjectCount);
            score += r.rate * hwWeight(k);
        }
        if (score > 0) scores.set(sid, score);
    }
    // 名称映射
    if (window.appData && window.appData.users) {
        Object.values(window.appData.users).forEach(u => {
            if (u && u.student_id) names[String(u.student_id)] = u.display_name || u.username || String(u.student_id);
        });
    }

    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const rows = sorted.map(([sid, sc], idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1);
        return `<tr>
            <td style="text-align:center;">${medal}</td>
            <td>${escapeHtml(names[String(sid)] || ('学生 ' + sid))}</td>
            <td style="text-align:center;">${sid}</td>
            <td style="text-align:center;">${sc.toFixed(2)}</td>
        </tr>`;
    }).join('');

    if (!rows) return `<div>
        <h3 style="margin:0 0 10px;">🏆 近30天作业积极度</h3>
        <p style="color:#888;">暂无足够数据。</p></div>`;

    return `<div>
        <h3 style="margin:0 0 6px;">🏆 近30天作业积极度排行榜</h3>
        <div style="font-size:12px;color:#999;margin-bottom:10px;">权重 = 当日提交率 × 1/(距今天数+0.5)^√3，近30天求和</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead><tr style="background:#fff0e6;color:#ff8f4e;">
                <th style="padding:8px;">名次</th><th style="padding:8px;text-align:left;">学生</th>
                <th style="padding:8px;">学号</th><th style="padding:8px;">积极度分</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

// ---------- 管理员: 创建作业文件 ----------
async function submitInit() {
    const countEl = document.getElementById('hwStuCount');
    const subjEl = document.getElementById('hwSubjectsText');
    const startEl = document.getElementById('hwStartDate');
    const stuCount = parseInt(countEl ? countEl.value : '', 10);
    let subjectNames;
    try {
        subjectNames = JSON.parse(subjEl ? subjEl.value : '{}');
    } catch (e) {
        alert('学科列表不是合法的 JSON，请检查格式，例如：{"0":"语文","1":"数学"}');
        return;
    }
    if (!stuCount || stuCount < 1) { alert('请填写有效的学生人数'); return; }
    if (!subjectNames || typeof subjectNames !== 'object' || Object.keys(subjectNames).length === 0) {
        alert('请至少填写一个学科'); return;
    }
    localStorage.setItem('studentos_homework_subjects', JSON.stringify(subjectNames));

    const body = {
        student_count: stuCount,
        subject_count: Object.keys(subjectNames).length,
        subject_names: subjectNames
    };
    if (startEl && startEl.value) body.start_date = startEl.value;

    try {
        const r = await hwPost('/init', body);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || '创建失败');
        alert('✅ ' + (j.message || '作业文件创建成功'));
        window.homework.showHomework();
    } catch (e) {
        alert('创建失败: ' + e.message);
    }
}

// ---------- 管理员: 布置 / 登记界面 ----------
async function showManage() {
    if (!isHomeworkManager()) { alert('无权限'); return; }
    let meta;
    try { meta = await hwLoadMeta(); } catch (e) { alert(e.message); return; }
    if (meta.uninitialized) { alert('作业系统未初始化'); return; }
    window.hwManageMeta = meta;

    const subjectNames = meta.subjectNames || {};
    const subjectCount = meta.subjectCount || 1;
    const content = document.getElementById('contentArea');

    content.innerHTML = `<div class="content-card">
        <h2 class="card-title">⚙️ 作业管理</h2>
        <button class="btn" onclick="window.homework.showHomework()">⬅ 返回查看</button>
        <hr style="border:none;border-top:1px dashed #eee;margin:14px 0;">

        <h3>📝 布置作业</h3>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:10px 0;">
            <div><label>日期</label><br>
                <input type="date" id="hwArrangeDate" value="${fmtDate(new Date())}" style="padding:8px;border:1px solid #ddd;border-radius:8px;"></div>
            <div><label>学科（按住 Ctrl 可多选）</label><br>
                <select id="hwArrangeSubjects" multiple size="${Math.min(subjectCount, subjectCount)}" style="padding:8px;border:1px solid #ddd;border-radius:8px;min-width:160px;">
                    ${Object.entries(subjectNames).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('')}
                </select></div>
            <div><button class="btn btn-primary" onclick="window.homework.submitArrange()">📬 布置作业</button></div>
        </div>
        <div style="font-size:12px;color:#999;">布置后当天所有学生该学科记为"未提交"，供学生提交。</div>
        <hr style="border:none;border-top:1px dashed #eee;margin:14px 0;">

        <h3>✅ 提交登记</h3>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:10px 0;">
            <div><label>学生ID</label><br>
                <input type="number" id="hwRecSid" min="1" placeholder="学号" style="padding:8px;width:90px;border:1px solid #ddd;border-radius:8px;"></div>
            <div><label>日期</label><br>
                <input type="date" id="hwRecDate" value="${fmtDate(new Date())}" style="padding:8px;border:1px solid #ddd;border-radius:8px;"></div>
            <div><label>学科</label><br>
                <select id="hwRecSubject" style="padding:8px;border:1px solid #ddd;border-radius:8px;">
                    ${Object.entries(subjectNames).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('')}
                </select></div>
            <div><button class="btn btn-primary" onclick="window.homework.submitRecord()">📌 标记已提交</button></div>
        </div>
    </div>`;
}

// 布置作业：把当天所有学生该学科标记为 0 (未提交)
async function submitArrange() {
    const dateEl = document.getElementById('hwArrangeDate');
    const subjEl = document.getElementById('hwArrangeSubjects');
    if (!dateEl || !dateEl.value) { alert('请选择日期'); return; }
    const subjectKeys = Array.from(subjEl.selectedOptions).map(o => o.value);
    if (!subjectKeys.length) { alert('请选择至少一个学科'); return; }

    const meta = window.hwManageMeta || (await hwLoadMeta());
    const stuCount = meta.studentCount || 1;
    const subjectCount = meta.subjectCount || 1;
    const date = dateEl.value;

    // 构建当日数据: 当前已有数据的基础上,把指定学科设为未提交(0)
    // 后端 /day 以覆盖整日方式写入,因此需先拉取当天,再把目标学科置0
    let current = null;
    try {
        const cur = await hwGet(`/student/1?date=${date}`);
        if (cur.ok) { const j = await cur.json(); if (j && j.homework) current = j.homework; }
    } catch (e) {}

    const dayData = [];
    for (let i = 0; i <= stuCount; i++) { // 0..stuCount 含机器人
        const arr = current && Array.isArray(current) ? current.slice() : new Array(subjectCount).fill(0);
        subjectKeys.forEach(k => { arr[+k] = 0; });
        dayData.push(arr);
    }

    const r = await hwPost('/day', { target_date: date, day_data: dayData });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '布置失败');
    alert('✅ 已布置 ' + date + ' 的作业');
    window.homework.showHomework();
}

// 提交登记：标记某学生某天某学科为已提交(1)
async function submitRecord() {
    const sidEl = document.getElementById('hwRecSid');
    const dateEl = document.getElementById('hwRecDate');
    const subjEl = document.getElementById('hwRecSubject');
    const sid = parseInt(sidEl ? sidEl.value : '', 10);
    if (!sid || sid < 1) { alert('请输入有效的学生ID'); return; }
    if (!dateEl || !dateEl.value) { alert('请选择日期'); return; }
    const subjectId = parseInt(subjEl ? subjEl.value : '0', 10);
    if (isNaN(subjectId)) { alert('请选择学科'); return; }

    const r = await hwPost('/update', {
        student_id: sid, target_date: dateEl.value, subject_id: subjectId
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '登记失败');
    alert('✅ 已登记学生 ' + sid + ' 提交');
    window.homework.showHomework();
}

// ---------- 导出 ----------
window.homework = {
    showHomework,
    showManage,
    submitInit,
    submitArrange,
    submitRecord,
    chgTrend,
    renderTrendChart,
    drawLineChart,
    hwWeight,
    computeRate,
    buildTrendSeries,
    renderRankBlock
};

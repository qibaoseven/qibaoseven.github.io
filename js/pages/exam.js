// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// 考试分数页面
// ========================================
// 数据存储
//   · 直接挂在整班数据的 appData.examScores 上（不新增子系统、不新增接口）
//   · 结构：
//       { "1": [ { id, date, name, score, full, subject }, ... ], ... }
//     即 学号 -> 该生所有考试记录数组
//   · 科目的"官方列表"从作业子系统的 homework_meta.subjectNames 里读，
//     读不到时再从已有记录 / 班级学科设置里兜底
// 权限
//   · user  —— 只能给自己登记、只能看自己的曲线
//   · admin —— 全班登记 + 汇总统计（avg / median / 标准差 / 前 x% 等）
//   · root  —— 同 admin
// ========================================

// ---------- 基础工具 ----------
function examEscape(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function examAPIBase() {
    return `${window.API_BASE || '/.netlify/functions/api'}/class/${window.currentClassId}`;
}

function examIsManager() {
    const me = window.currentUser;
    return !!(me && (me.role === 'admin' || me.role === 'root'));
}

function examMyId() {
    const me = window.currentUser;
    if (!me) return null;
    const sid = me.student_id;
    if (sid === null || sid === undefined || sid === '') return null;
    return String(sid);
}

function examHeaders(withJson) {
    const h = {
        'X-Password': window.classPassword || '',
        'X-Password-Hash': window.classPasswordHash || ''
    };
    if (withJson) h['Content-Type'] = 'application/json';
    return h;
}

// 本班学生名单 [{id, name}]，从 scores 兜底（0 号机器人跳过）
function examStudents() {
    const list = [];
    const scores = (window.appData && window.appData.scores) || {};
    Object.keys(scores).forEach(id => {
        if (String(id) === '0') return;
        const row = scores[id];
        let name = '';
        if (Array.isArray(row)) name = row[0];
        else if (row && typeof row === 'object') name = row.name;
        list.push({ id: String(id), name: String(name || '未知') });
    });
    list.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
    return list;
}

function examToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- 数据层 ----------
function examEnsureStore() {
    if (!window.appData) window.appData = {};
    if (!window.appData.examScores || typeof window.appData.examScores !== 'object' || Array.isArray(window.appData.examScores)) {
        window.appData.examScores = {};
    }
    return window.appData.examScores;
}

// 取某个学生的记录数组（副本）
function examRecordsOf(sid) {
    const store = examEnsureStore();
    const arr = store[String(sid)];
    return Array.isArray(arr) ? arr.slice() : [];
}

// 全部记录平铺 [{sid, name, ...record}]
function examAllRecords() {
    const store = examEnsureStore();
    const out = [];
    Object.keys(store).forEach(sid => {
        const arr = store[sid];
        if (!Array.isArray(arr)) return;
        arr.forEach(rec => {
            if (rec && typeof rec === 'object') out.push(Object.assign({ sid: String(sid) }, rec));
        });
    });
    return out;
}

function examGenId() {
    return 'ex_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 写入一条记录。返回 { ok, error }
function examAddRecord(sid, rec) {
    const store = examEnsureStore();
    const key = String(sid);
    if (!Array.isArray(store[key])) store[key] = [];
    store[key].push(rec);
    // 按日期排序，保持曲线稳定
    store[key].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
    return { ok: true };
}

// ---------- 科目 ----------
// 缓存作业子系统 meta 里的 subjectNames
let examMetaSubjects = null;

async function examLoadSubjects() {
    if (examMetaSubjects) return examMetaSubjects;
    try {
        const r = await fetch(`${examAPIBase()}/homework/meta`, { headers: examHeaders() });
        if (r.ok) {
            const meta = await r.json();
            const names = meta && meta.subjectNames;
            if (names && typeof names === 'object') {
                const arr = Object.keys(names).map(k => Number(k)).sort((a, b) => a - b)
                    .map(k => String(names[k] || '').trim()).filter(Boolean);
                if (arr.length) {
                    examMetaSubjects = arr;
                    return arr;
                }
            }
        }
    } catch (e) { /* 忽略，走兜底 */ }
    examMetaSubjects = [];
    return examMetaSubjects;
}

// 合并：作业子系统学科 + 班里已出现过的学科 + 常见默认
function examSubjectList(extra) {
    const set = [];
    const push = s => {
        const v = String(s || '').trim();
        if (v && !set.includes(v)) set.push(v);
    };
    (examMetaSubjects || []).forEach(push);
    examAllRecords().forEach(rec => push(rec.subject));
    (extra || []).forEach(push);
    if (!set.length) ['语文', '数学', '英语'].forEach(push);
    return set;
}

// ---------- 统计 ----------
function examStats(values) {
    const arr = values.filter(v => typeof v === 'number' && isFinite(v)).slice().sort((a, b) => a - b);
    const n = arr.length;
    if (!n) return { n: 0, sum: 0, avg: null, median: null, min: null, max: null, std: null, variance: null, q1: null, q3: null, iqr: null, cv: null };
    const sum = arr.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    // 中位数
    const median = n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2;
    // 总体标准差（按全班所有人算，用总体而不是样本）
    const variance = arr.reduce((a, v) => a + (v - avg) * (v - avg), 0) / n;
    const std = Math.sqrt(variance);
    // 四分位（线性插值法）
    const quantile = p => {
        if (n === 1) return arr[0];
        const pos = (n - 1) * p;
        const lo = Math.floor(pos), hi = Math.ceil(pos);
        if (lo === hi) return arr[lo];
        return arr[lo] + (arr[hi] - arr[lo]) * (pos - lo);
    };
    const q1 = quantile(0.25), q3 = quantile(0.75);
    return {
        n, sum, avg, median, min: arr[0], max: arr[n - 1],
        std, variance, q1, q3, iqr: q3 - q1,
        cv: avg ? (std / Math.abs(avg)) * 100 : null,
        sorted: arr
    };
}

// 前 x% 的分数线（含并列）
function examTopThreshold(sortedDesc, percent) {
    if (!sortedDesc || !sortedDesc.length) return null;
    const k = Math.max(1, Math.ceil(sortedDesc.length * percent / 100));
    return sortedDesc[Math.min(k, sortedDesc.length) - 1];
}

// 百分位排名：分数 v 高于全班百分之多少
function examPercentile(sortedAsc, v) {
    const n = sortedAsc.length;
    if (!n) return null;
    let below = 0;
    for (const x of sortedAsc) { if (x < v) below++; }
    return (below / n) * 100;
}

function examFmt(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    const d = digits === undefined ? 1 : digits;
    return Number(v).toFixed(d).replace(/\.0+$/, '');
}

// ---------- SVG 图表（不依赖任何外部库）----------

const EXAM_PALETTE = ['#ff4e4e', '#ff9f4e', '#ffb84e', '#4ec9b0', '#4e8eff', '#9b7bff', '#ff6b9d', '#7bc86c', '#d97757', '#00b3b3'];

function examColor(i) {
    return EXAM_PALETTE[i % EXAM_PALETTE.length];
}

// 折线图。series: [{name, color, points: [{x: 标签, y: 数值}]}]
// opts: { height, yMin, yMax, xLabels }
function examLineChart(series, opts) {
    opts = opts || {};
    const W = opts.width || 380, H = opts.height || 240;
    const padL = 40, padR = 12, padT = 14, padB = 38;
    const iw = W - padL - padR, ih = H - padT - padB;

    const xLabels = opts.xLabels || (series[0] ? series[0].points.map(p => p.x) : []);
    const xN = xLabels.length;

    let ys = [];
    series.forEach(s => s.points.forEach(p => { if (typeof p.y === 'number' && isFinite(p.y)) ys.push(p.y); }));
    let yMin = opts.yMin !== undefined ? opts.yMin : (ys.length ? Math.min(...ys) : 0);
    let yMax = opts.yMax !== undefined ? opts.yMax : (ys.length ? Math.max(...ys) : 100);
    if (yMin === yMax) { yMin -= 5; yMax += 5; }
    const padY = (yMax - yMin) * 0.12;
    yMin = Math.max(0, yMin - padY);
    yMax = yMax + padY;

    const X = i => xN <= 1 ? padL + iw / 2 : padL + (iw * i) / (xN - 1);
    const Y = v => padT + ih - ((v - yMin) / (yMax - yMin)) * ih;

    let svg = `<div class="exam-chart-scroll"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block;">`;
    // 背景网格 + Y 轴刻度
    const gridN = 4;
    for (let g = 0; g <= gridN; g++) {
        const v = yMin + ((yMax - yMin) * g) / gridN;
        const y = Y(v);
        svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#ffe3d4" stroke-width="1"/>`;
        svg += `<text x="${padL - 6}" y="${(y + 4).toFixed(1)}" font-size="11" fill="#b06a4a" text-anchor="end">${examFmt(v, 0)}</text>`;
    }
    // X 轴刻度（标签太多时抽稀）
    const step = Math.max(1, Math.ceil(xN / 12));
    xLabels.forEach((lab, i) => {
        if (i % step !== 0 && i !== xN - 1) return;
        const lab2 = String(lab).slice(5);  // 只显示 MM-DD，避免挤成一团
        svg += `<text x="${X(i).toFixed(1)}" y="${H - padB + 16}" font-size="10" fill="#b06a4a" text-anchor="middle">${examEscape(lab2)}</text>`;
    });
    // 折线 + 点
    series.forEach(s => {
        const pts = s.points.filter(p => typeof p.y === 'number' && isFinite(p.y));
        if (!pts.length) return;
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
        svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        pts.forEach(p => {
            svg += `<circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.4" fill="white" stroke="${s.color}" stroke-width="2"/>`;
        });
    });
    svg += `</svg></div>`;
    return svg;
}

// 把 series 的 points 补齐 index，方便画线
function examNormalizeSeries(series) {
    const labels = [];
    series.forEach(s => s.points.forEach(p => { if (!labels.includes(p.x)) labels.push(p.x); }));
    labels.sort();
    const out = series.map(s => ({
        name: s.name,
        color: s.color,
        points: labels.map((lab, i) => {
            const hit = s.points.find(p => p.x === lab);
            return { x: lab, i, y: hit ? hit.y : null };
        })
    }));
    return { labels, series: out };
}

// 横向柱状图（学科对比等）。用 HTML 而不是 SVG，
// 这样文字永远不会随容器宽度被缩放压缩。
function examBarChart(items, opts) {
    opts = opts || {};
    const max = opts.max !== undefined ? opts.max : Math.max(1, ...items.map(i => i.value || 0));
    return `<div style="display:flex;flex-direction:column;gap:8px;">` + items.map(it => {
        const w = Math.max(0, Math.min(100, ((it.value || 0) / max) * 100));
        const text = it.text !== undefined ? it.text : examFmt(it.value, 1);
        return `<div style="display:flex;align-items:center;gap:8px;font-size:.9em;">
            <span style="flex:0 0 72px;text-align:right;color:#8a5a44;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${examEscape(it.label)}</span>
            <span style="flex:1 1 auto;background:#fff6f0;border-radius:6px;height:20px;overflow:hidden;">
                <span style="display:block;height:100%;width:${w.toFixed(1)}%;background:${it.color || '#ff9f4e'};border-radius:6px;"></span>
            </span>
            <span style="flex:0 0 auto;min-width:56px;color:#8a5a44;">${examEscape(text)}</span>
        </div>`;
    }).join('') + `</div>`;
}

// 列状（纵向）柱状图，用于分数段分布
function examColumnChart(items, opts) {
    opts = opts || {};
    const max = Math.max(1, ...items.map(i => i.value || 0));
    const H = opts.height || 150;
    return `<div style="display:flex;align-items:flex-end;gap:6px;height:${H}px;padding-top:8px;">` + items.map(it => {
        const h = Math.max(2, ((it.value || 0) / max) * (H - 30));
        return `<div style="flex:1 1 0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;min-width:0;">
            <span style="font-size:.72em;color:#8a5a44;">${it.value || 0}</span>
            <span style="width:100%;max-width:34px;height:${h.toFixed(0)}px;background:${it.color || 'linear-gradient(180deg,#ff9f4e,#ff4e4e)'};border-radius:4px 4px 0 0;"></span>
            <span style="font-size:.62em;color:#b06a4a;white-space:nowrap;transform:rotate(-45deg);transform-origin:center;margin-top:2px;">${examEscape(it.label)}</span>
        </div>`;
    }).join('') + `</div>`;
}

// 箱线图（min / q1 / median / q3 / max），用 HTML 绝对定位，文字不缩放
function examBoxPlot(stats, opts) {
    opts = opts || {};
    const lo = opts.min !== undefined ? opts.min : Math.min(stats.min, stats.q1);
    const hi = opts.max !== undefined ? opts.max : Math.max(stats.max, stats.q3);
    const span = (hi - lo) || 1;
    const P = v => Math.max(0.5, Math.min(99.5, ((v - lo) / span) * 100));
    return `<div style="position:relative;height:70px;margin:4px 2px 10px;">
        <div style="position:absolute;left:0;right:0;top:44px;height:2px;background:#ffd1b8;"></div>
        <div style="position:absolute;top:22px;height:44px;left:${P(stats.q1).toFixed(2)}%;width:${Math.max(1.5, P(stats.q3) - P(stats.q1)).toFixed(2)}%;background:#ffe3d4;border:1.5px solid #ff9f4e;border-radius:4px;box-sizing:border-box;"></div>
        <div style="position:absolute;top:18px;height:52px;left:${P(stats.median).toFixed(2)}%;width:3px;background:#ff4e4e;transform:translateX(-50%);"></div>
        <div style="position:absolute;top:52px;left:0;font-size:.72em;color:#b06a4a;">min ${examFmt(stats.min, 1)}</div>
        <div style="position:absolute;top:52px;right:0;font-size:.72em;color:#b06a4a;">max ${examFmt(stats.max, 1)}</div>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.82em;color:#8a5a44;margin-top:2px;">
        <span>箱体 IQR：${examFmt(stats.q1, 1)} ~ ${examFmt(stats.q3, 1)}</span>
        <span style="color:#ff4e4e;">▌中位数 ${examFmt(stats.median, 1)}</span>
    </div>`;
}

// 直方图（分数段分布）
function examHistogram(values, opts) {
    opts = opts || {};
    const bins = opts.bins || 10;
    const lo = opts.min !== undefined ? opts.min : 0;
    const hi = opts.max !== undefined ? opts.max : 100;
    const width = (hi - lo) / bins;
    const counts = new Array(bins).fill(0);
    values.forEach(v => {
        if (typeof v !== 'number' || !isFinite(v)) return;
        let idx = Math.floor((v - lo) / width);
        if (idx < 0) idx = 0;
        if (idx >= bins) idx = bins - 1;
        counts[idx]++;
    });
    const items = counts.map((c, i) => ({
        label: `${examFmt(lo + i * width, 0)}-${examFmt(lo + (i + 1) * width, 0)}`,
        value: c,
        text: `${c} 人`
    }));
    return examColumnChart(items, { height: 160 });
}

// ---------- 页面状态 ----------
let examState = {
    view: 'input',            // input | trends | summary
    subject: '',              // 当前查看的科目
    student: '',              // 当前查看的学生（学生视角固定为自己）
    percent: 10,              // 前 x%
    loadedSubjects: false
};

function examSubjects() {
    return examSubjectList([]);
}

// ---------- 主入口 ----------
async function showExamScores() {
    const content = document.getElementById('contentArea');
    const me = window.currentUser;
    if (!me) {
        content.innerHTML = `<div class="content-card"><h2 class="card-title">📝 考试分数</h2>
            <p style="color:#ff4e4e;">请先登录。</p></div>`;
        return;
    }

    content.innerHTML = `<div style="padding:20px;color:#ff8f4e;">⏳ 正在加载考试数据...</div>`;

    await examLoadSubjects();

    const subs = examSubjects();
    if (!examState.subject || !subs.includes(examState.subject)) {
        examState.subject = subs[0] || '';
    }
    if (!examState.student || !examStudents().some(x => x.id === String(examState.student))) {
        // 管理员账号（9999 之类）本身不在学生名单里，回落到第一个学生
        const mine = examMyId();
        const hasMine = examStudents().some(x => x.id === String(mine));
        examState.student = String((hasMine ? mine : (examStudents()[0] || {}).id) || '');
    }
    if (!examIsManager()) {
        examState.view = examState.view === 'summary' ? 'input' : examState.view;
    }

    examRender();
}

function examConstrainArea() {
    // content-area 是 flex 子项，默认 min-width:auto，宽表格会把整页顶宽。
    // 只在考试页渲染时收紧，离开页面时由其他页面自行覆盖 innerHTML。
    const area = document.getElementById('contentArea');
    if (!area) return;
    area.style.minWidth = '0';
    area.style.maxWidth = '100%';
    area.style.width = '100%';
    area.style.boxSizing = 'border-box';
    area.style.overflowX = 'hidden';
}

function examRender() {
    const content = document.getElementById('contentArea');
    examConstrainArea();
    const manager = examIsManager();
    const tabs = [
        { id: 'input', name: '✍️ 登记分数' },
        { id: 'trends', name: '📈 折线统计' }
    ];
    if (manager) tabs.push({ id: 'summary', name: '🧮 汇总分析' });

    let html = `<div class="content-card">
        <h2 class="card-title">📝 考试分数</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
            ${tabs.map(t => `<button class="btn ${examState.view === t.id ? 'btn-primary' : ''}" data-exam-tab="${t.id}">${t.name}</button>`).join('')}
        </div>
        <div style="color:#b06a4a;font-size:.9em;">共 ${examAllRecords().length} 条考试记录 · ${examStudents().length} 名学生 · 科目 ${examSubjects().length} 个</div>
    </div>`;

    if (examState.view === 'input') html += examRenderInput(manager);
    else if (examState.view === 'trends') html += examRenderTrends(manager);
    else html += examRenderSummary();

    content.innerHTML = html;
    examBind();
}

// ---------- 登记 ----------
function examRenderInput(manager) {
    const students = examStudents();
    const subs = examSubjects();
    const myId = examMyId();
    // 学生只能用自己
    const targetOptions = manager
        ? students.map(s => `<option value="${s.id}">${examEscape(s.id + ' ' + s.name)}</option>`).join('')
        : students.filter(s => s.id === myId).map(s => `<option value="${s.id}">${examEscape(s.id + ' ' + s.name)}</option>`).join('');

    if (!manager && !myId) {
        return `<div class="content-card"><p style="color:#ff4e4e;">当前账号没有绑定学号，无法登记成绩。请联系管理员。</p></div>`;
    }

    return `<div class="content-card">
        <h3 style="color:#ff6b4a;margin-bottom:14px;">✍️ 上传一次考试分数</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;align-items:end;">
            <label style="display:flex;flex-direction:column;gap:6px;color:#8a5a44;">
                学生
                <select id="examStudent" class="exam-input">${targetOptions}</select>
            </label>
            <label style="display:flex;flex-direction:column;gap:6px;color:#8a5a44;">
                科目
                <select id="examSubject" class="exam-input">
                    ${subs.map(s => `<option ${s === examState.subject ? 'selected' : ''}>${examEscape(s)}</option>`).join('')}
                </select>
            </label>
            <label style="display:flex;flex-direction:column;gap:6px;color:#8a5a44;">
                分数
                <input id="examScore" class="exam-input" type="number" step="0.5" placeholder="例如 86" />
            </label>
            <label style="display:flex;flex-direction:column;gap:6px;color:#8a5a44;">
                满分
                <input id="examFull" class="exam-input" type="number" step="1" value="100" />
            </label>
            <label style="display:flex;flex-direction:column;gap:6px;color:#8a5a44;">
                考试日期
                <input id="examDate" class="exam-input" type="date" value="${examToday()}" />
            </label>
            <label style="display:flex;flex-direction:column;gap:6px;color:#8a5a44;">
                考试名称（可选）
                <input id="examName" class="exam-input" type="text" placeholder="例如 期中考试" />
            </label>
        </div>
        <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="examSubmit">➕ 上传这一个分数</button>
            <button class="btn" id="examClearForm">清空</button>
        </div>
        <div id="examMsg" style="margin-top:12px;"></div>
    </div>
    ${examRenderRecent(manager)}`;
}

// 最近的记录
function examRenderRecent(manager) {
    const myId = examMyId();
    let recs = examAllRecords();
    if (!manager) recs = recs.filter(r => String(r.sid) === String(myId));
    recs.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
    recs = recs.slice(0, 10);

    const nameOf = sid => {
        const s = examStudents().find(x => x.id === String(sid));
        return s ? s.name : '未知';
    };

    if (!recs.length) {
        return `<div class="content-card"><h3 style="color:#ff6b4a;margin-bottom:14px;">📋 最近记录</h3>
            <p style="color:#888;">还没有任何考试记录。</p></div>`;
    }

    return `<div class="content-card">
        <h3 style="color:#ff6b4a;margin-bottom:14px;">📋 最近记录</h3>
        <div style="overflow-x:auto;">
        <table class="data-table">
            <thead><tr><th>日期</th><th>学生</th><th>科目</th><th>分数</th><th>占比</th><th>名称</th>${manager ? '<th>操作</th>' : ''}</tr></thead>
            <tbody>
            ${recs.map(r => {
                const pct = r.full ? (Number(r.score) / Number(r.full) * 100) : null;
                return `<tr>
                    <td>${examEscape(r.date)}</td>
                    <td>${examEscape(nameOf(r.sid))}</td>
                    <td>${examEscape(r.subject)}</td>
                    <td><b style="color:#ff4e4e;">${examFmt(r.score, 1)}</b><span style="color:#b06a4a;"> / ${examFmt(r.full, 0)}</span></td>
                    <td>${pct === null ? '—' : examFmt(pct, 1) + '%'}</td>
                    <td>${examEscape(r.name || '')}</td>
                    ${manager ? `<td><button class="btn btn-sm btn-danger" data-exam-del="${examEscape(r.id)}" data-exam-del-sid="${examEscape(r.sid)}">删除</button></td>` : ''}
                </tr>`;
            }).join('')}
            </tbody>
        </table>
        </div>
    </div>`;
}

// ---------- 折线统计 ----------
function examRenderTrends(manager) {
    const subs = examSubjects();
    const students = examStudents();
    const myId = examMyId();
    const sub = examState.subject;

    // 学生视角只看自己
    if (!manager) {
        if (!myId) return `<div class="content-card"><p style="color:#ff4e4e;">当前账号未绑定学号。</p></div>`;
        examState.student = String(myId);
    } else if (!examState.student || !students.some(x => x.id === String(examState.student))) {
        examState.student = String((students[0] || {}).id || '');
    }

    const subjectTabs = subs.map(s => `<button class="btn ${s === sub ? 'btn-primary' : 'btn-sm'}" data-exam-subject="${examEscape(s)}">${examEscape(s)}</button>`).join(' ');

    let html = `<div class="content-card">
        <h3 style="color:#ff6b4a;margin-bottom:12px;">📈 按科目看曲线</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">${subjectTabs}</div>
    </div>`;

    // 当前科目的记录
    let recs = examAllRecords().filter(r => String(r.subject) === String(sub));
    if (!manager) recs = recs.filter(r => String(r.sid) === String(myId));

    // 个人曲线
    const personRecs = manager ? recs.filter(r => String(r.sid) === String(examState.student)) : recs;
    const personName = (() => {
        const s = students.find(x => x.id === String(examState.student));
        return s ? s.name : '我';
    })();

    const toSeries = (list, name, color) => {
        const pts = list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .map(r => ({ x: String(r.date), y: Number(r.score) }));
        // 同一天多条时取平均
        const merged = [];
        pts.forEach(p => {
            const hit = merged.find(m => m.x === p.x);
            if (hit) { hit.y = (hit.y + p.y) / 2; } else merged.push(p);
        });
        return { name, color, points: merged };
    };

    html += `<div class="content-card">
        <h3 style="color:#ff6b4a;margin-bottom:6px;">${examEscape(personName)} · ${examEscape(sub)}</h3>
        <div style="color:#b06a4a;font-size:.9em;margin-bottom:12px;">${personRecs.length} 次记录，纵轴为原始分数</div>
        ${personRecs.length ? (() => {
            const norm = examNormalizeSeries([toSeries(personRecs, personName, examColor(0))]);
            return examLineChart(norm.series, { xLabels: norm.labels });
        })() : '<p style="color:#888;">该学生这门科目还没有记录。</p>'}
        ${manager ? examRenderStudentPicker(students) : ''}
    </div>`;

    // 全班对比曲线（管理员）
    if (manager) {
        // 按科目取每次考试（日期）的全班平均分曲线 + 最高/最低
        const byDate = {};
        recs.forEach(r => {
            const d = String(r.date);
            if (!byDate[d]) byDate[d] = [];
            byDate[d].push(Number(r.score));
        });
        const dates = Object.keys(byDate).sort();
        if (dates.length) {
            const avgSeries = { name: '班级平均', color: '#ff4e4e', points: dates.map(d => ({ x: d, y: byDate[d].reduce((a, b) => a + b, 0) / byDate[d].length })) };
            const maxSeries = { name: '最高分', color: '#4ec9b0', points: dates.map(d => ({ x: d, y: Math.max(...byDate[d]) })) };
            const minSeries = { name: '最低分', color: '#9b7bff', points: dates.map(d => ({ x: d, y: Math.min(...byDate[d]) })) };
            const norm = examNormalizeSeries([avgSeries, maxSeries, minSeries]);
            html += `<div class="content-card">
                <h3 style="color:#ff6b4a;margin-bottom:6px;">全班对比 · ${examEscape(sub)}</h3>
                <div style="color:#b06a4a;font-size:.9em;margin-bottom:12px;">${dates.length} 次考试</div>
                ${examLineChart(norm.series, { xLabels: norm.labels })}
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:.9em;">
                    ${[avgSeries, maxSeries, minSeries].map(s => `<span style="color:${s.color};">■ ${s.name}</span>`).join('')}
                </div>
            </div>`;

            // 每人一条（学生多时只画前 12 名，避免糊成一团）
            const perStudent = students.map(st => {
                const list = recs.filter(r => String(r.sid) === st.id);
                return { st, list };
            }).filter(x => x.list.length);

            if (perStudent.length) {
                const ranked = perStudent.map(x => {
                    const st = examStats(x.list.map(r => Number(r.score)));
                    return { st: x.st, list: x.list, avg: st.avg };
                }).sort((a, b) => b.avg - a.avg);

                const shown = ranked.slice(0, 12);
                const series = shown.map((x, i) => toSeries(x.list, x.st.name, examColor(i)));
                const norm2 = examNormalizeSeries(series);
                html += `<div class="content-card">
                    <h3 style="color:#ff6b4a;margin-bottom:6px;">个人曲线对比 · ${examEscape(sub)}</h3>
                    <div style="color:#b06a4a;font-size:.9em;margin-bottom:12px;">按平均分排序，最多显示前 12 人（共 ${ranked.length} 人）</div>
                    ${examLineChart(norm2.series, { xLabels: norm2.labels })}
                    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:.88em;">
                        ${shown.map((x, i) => `<span style="color:${examColor(i)};">■ ${examEscape(x.st.name)}</span>`).join('')}
                    </div>
                </div>`;
            }
        } else {
            html += `<div class="content-card"><p style="color:#888;">这门科目还没有考试记录。</p></div>`;
        }
    }

    // 个人记录明细
    html += `<div class="content-card">
        <h3 style="color:#ff6b4a;margin-bottom:14px;">📋 记录明细</h3>
        ${personRecs.length ? `<div class="exam-table-scroll"><table class="data-table" style="min-width:520px;">
            <thead><tr><th>日期</th><th>科目</th><th>分数</th><th>满分</th><th>得分率</th><th>名称</th></tr></thead>
            <tbody>${personRecs.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(r => {
                const pct = r.full ? Number(r.score) / Number(r.full) * 100 : null;
                return `<tr><td>${examEscape(r.date)}</td><td>${examEscape(r.subject)}</td>
                    <td><b style="color:#ff4e4e;">${examFmt(r.score, 1)}</b></td>
                    <td>${examFmt(r.full, 0)}</td>
                    <td>${pct === null ? '—' : examFmt(pct, 1) + '%'}</td>
                    <td>${examEscape(r.name || '')}</td></tr>`;
            }).join('')}</tbody>
        </table></div>` : '<p style="color:#888;">暂无记录。</p>'}
    </div>`;

    return html;
}

function examRenderStudentPicker(students) {
    return `<div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <span style="color:#8a5a44;">查看学生：</span>
        <select id="examStudentPick" class="exam-input" style="max-width:260px;">
            ${students.map(s => `<option value="${s.id}" ${String(s.id) === String(examState.student) ? 'selected' : ''}>${examEscape(s.id + ' ' + s.name)}</option>`).join('')}
        </select>
    </div>`;
}

// ---------- 汇总分析（admin / root）----------
function examRenderSummary() {
    if (!examIsManager()) {
        return `<div class="content-card"><p style="color:#ff4e4e;">只有管理员及以上可以查看汇总统计。</p></div>`;
    }

    const subs = examSubjects();
    const sub = examState.subject;
    const recs = examAllRecords().filter(r => String(r.subject) === String(sub));

    if (!recs.length) {
        return `<div class="content-card"><h3 style="color:#ff6b4a;margin-bottom:12px;">🧮 汇总分析 · ${examEscape(sub || '—')}</h3>
            <p style="color:#888;">这门科目还没有考试记录，先去登记一些吧。</p></div>`;
    }

    // 每次考试（日期）的统计
    const byDate = {};
    recs.forEach(r => {
        const d = String(r.date);
        (byDate[d] = byDate[d] || []).push({ sid: String(r.sid), score: Number(r.score), full: Number(r.full) || 100 });
    });
    const dates = Object.keys(byDate).sort();

    // 最近一次考试的详细统计
    const lastDate = dates[dates.length - 1];
    const lastList = byDate[lastDate];
    const lastScores = lastList.map(x => x.score);
    const st = examStats(lastScores);
    const desc = (st.sorted || []).slice().reverse();
    const topN = examTopThreshold(desc, examState.percent);

    const nameOf = sid => {
        const s = examStudents().find(x => x.id === String(sid));
        return s ? s.name : '未知';
    };

    // 统计卡片
    const cards = [
        ['人数', st.n, '人'],
        ['平均分', examFmt(st.avg, 2), 'avg'],
        ['中位数', examFmt(st.median, 1), 'median'],
        ['标准差', examFmt(st.std, 2), 'std'],
        ['最高', examFmt(st.max, 1), 'max'],
        ['最低', examFmt(st.min, 1), 'min'],
        ['极差', examFmt(st.max - st.min, 1), 'max-min'],
        ['变异系数', st.cv === null ? '—' : examFmt(st.cv, 1) + '%', 'cv'],
        ['Q1 / Q3', `${examFmt(st.q1, 1)} / ${examFmt(st.q3, 1)}`, '四分位'],
        ['IQR', examFmt(st.iqr, 1), 'q3-q1']
    ];

    let html = `<div class="content-card">
        <h3 style="color:#ff6b4a;margin-bottom:6px;">🧮 汇总分析 · ${examEscape(sub)}</h3>
        <div style="color:#b06a4a;font-size:.9em;margin-bottom:14px;">最近一次考试：${examEscape(lastDate)}（${st.n} 人参考）</div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
            ${cards.map(([label, val, hint]) => `<div class="stat-card" style="padding:14px 8px;" title="${examEscape(hint)}">
                <div class="stat-value">${examEscape(val)}</div>
                <div class="stat-label">${examEscape(label)}</div>
            </div>`).join('')}
        </div>
    </div>`;

    // 前 x% 调节
    html += `<div class="content-card">
        <h3 style="color:#ff6b4a;margin-bottom:12px;">🏅 前 x% 名单</h3>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">
            <span style="color:#8a5a44;">前</span>
            <select id="examPercent" class="exam-input" style="max-width:120px;">
                ${[5, 10, 15, 20, 25, 30, 50].map(p => `<option value="${p}" ${p === examState.percent ? 'selected' : ''}>${p}%</option>`).join('')}
            </select>
            <span style="color:#8a5a44;">的分数线：<b style="color:#ff4e4e;">${examFmt(topN, 1)}</b> 分（含并列，共 ${desc.filter(v => v >= topN).length} 人）</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
            ${lastList.slice().sort((a, b) => b.score - a.score).map((x, i) => {
                const pct = examPercentile(st.sorted || [], x.score);
                const inTop = x.score >= topN;
                return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;${inTop ? 'background:#fff0e6;' : 'background:#fffaf6;'}">
                    <span style="flex:0 0 22px;color:#b06a4a;font-size:.9em;">${i + 1}</span>
                    <span style="flex:1 1 auto;color:#8a5a44;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${inTop ? '🏅 ' : ''}${examEscape(nameOf(x.sid))}</span>
                    <span style="flex:0 0 auto;color:#ff4e4e;font-weight:bold;">${examFmt(x.score, 1)}</span>
                    <span style="flex:0 0 auto;color:#b06a4a;font-size:.8em;min-width:66px;text-align:right;">超 ${pct === null ? '—' : examFmt(pct, 0)}%</span>
                </div>`;
            }).join('')}
        </div>
    </div>`;

    // 直方图 + 箱线图
    html += `<div class="content-card">
        <h3 style="color:#ff6b4a;margin-bottom:12px;">📊 分数分布 · ${examEscape(lastDate)}</h3>
        ${examHistogram(lastScores, { min: 0, max: 100, bins: 10 })}
        <div style="margin-top:20px;">
            <div style="color:#8a5a44;margin-bottom:6px;">箱线图</div>
            ${examBoxPlot(st, { min: 0, max: 100 })}
        </div>
    </div>`;

    // 各学科平均分对比（最近一次）
    const subAvgItems = subs.map(s => {
        const list = examAllRecords().filter(r => String(r.subject) === String(s));
        // 取该科目最近一次日期
        const ds = Array.from(new Set(list.map(r => String(r.date)))).sort();
        const latest = ds[ds.length - 1];
        const vals = list.filter(r => String(r.date) === latest).map(r => Number(r.score));
        const s2 = examStats(vals);
        return { label: s, value: s2.avg || 0, text: s2.n ? `${examFmt(s2.avg, 1)}（${s2.n}人）` : '无数据' };
    }).filter(x => x.value > 0);

    if (subAvgItems.length > 1) {
        html += `<div class="content-card">
            <h3 style="color:#ff6b4a;margin-bottom:12px;">📚 各科平均分对比（各自最近一次）</h3>
            ${examBarChart(subAvgItems, { rowH: 32, padL: 80 })}
        </div>`;
    }

    // 趋势总览：各次考试的平均分 / 中位数曲线
    const trendAvg = dates.map(d => ({ x: d, y: examStats(byDate[d].map(x => x.score)).avg }));
    const trendMed = dates.map(d => ({ x: d, y: examStats(byDate[d].map(x => x.score)).median }));
    const norm = examNormalizeSeries([
        { name: '平均分', color: '#ff4e4e', points: trendAvg },
        { name: '中位数', color: '#4e8eff', points: trendMed }
    ]);
    html += `<div class="card content-card">
        <h3 style="color:#ff6b4a;margin-bottom:12px;">📈 历次考试趋势</h3>
        ${examLineChart(norm.series, { xLabels: norm.labels })}
        <div style="display:flex;gap:16px;margin-top:8px;font-size:.9em;">
            <span style="color:#ff4e4e;">■ 平均分</span><span style="color:#4e8eff;">■ 中位数</span>
        </div>
    </div>`;

    // 各学生稳定度（次数 >= 2）
    const stable = examStudents().map(s => {
        const list = recs.filter(r => String(r.sid) === s.id);
        if (list.length < 2) return null;
        const ss = examStats(list.map(r => Number(r.score)));
        return { name: s.name, n: ss.n, avg: ss.avg, std: ss.std, cv: ss.cv, max: ss.max, min: ss.min, trend: Number(list[list.length - 1].score) - Number(list[0].score) };
    }).filter(Boolean).sort((a, b) => b.avg - a.avg);

    if (stable.length) {
        html += `<div class="content-card">
            <h3 style="color:#ff6b4a;margin-bottom:14px;">🧭 个人稳定度（≥2 次考试）</h3>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${stable.map(x => {
                    const tColor = x.trend > 0 ? '#4ec9b0' : (x.trend < 0 ? '#ff4e4e' : '#b06a4a');
                    const arrow = x.trend > 0 ? '▲' : (x.trend < 0 ? '▼' : '—');
                    return `<div style="background:#fffaf6;border-radius:8px;padding:10px 12px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="flex:1 1 auto;color:#8a5a44;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${examEscape(x.name)}</span>
                            <span style="color:#ff4e4e;font-weight:bold;">${examFmt(x.avg, 1)}</span>
                            <span style="color:#b06a4a;font-size:.82em;">${x.n} 次</span>
                            <span style="color:${tColor};font-size:.85em;min-width:56px;text-align:right;">${arrow} ${examFmt(Math.abs(x.trend), 1)}</span>
                        </div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;font-size:.78em;color:#b06a4a;">
                            <span>标准差 ${examFmt(x.std, 2)}</span>
                            <span>变异系数 ${x.cv === null ? '—' : examFmt(x.cv, 1) + '%'}</span>
                            <span>最高/最低 ${examFmt(x.max, 1)} / ${examFmt(x.min, 1)}</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    return html;
}

// ---------- 事件绑定 ----------
function examBind() {
    // tab 切换
    document.querySelectorAll('[data-exam-tab]').forEach(btn => {
        btn.onclick = () => {
            examState.view = btn.getAttribute('data-exam-tab');
            examRender();
        };
    });

    // 科目切换
    document.querySelectorAll('[data-exam-subject]').forEach(btn => {
        btn.onclick = () => {
            examState.subject = btn.getAttribute('data-exam-subject');
            examRender();
        };
    });

    // 学生选择（折线页）
    const pick = document.getElementById('examStudentPick');
    if (pick) pick.onchange = () => { examState.student = pick.value; examRender(); };

    // 前 x% 切换
    const pctEl = document.getElementById('examPercent');
    if (pctEl) pctEl.onchange = () => { examState.percent = Number(pctEl.value) || 10; examRender(); };

    // 登记提交
    const submit = document.getElementById('examSubmit');
    if (submit) {
        submit.onclick = async () => {
            const msg = document.getElementById('examMsg');
            const sid = document.getElementById('examStudent')?.value;
            const subject = document.getElementById('examSubject')?.value;
            const scoreRaw = document.getElementById('examScore')?.value;
            const fullRaw = document.getElementById('examFull')?.value;
            const date = document.getElementById('examDate')?.value || examToday();
            const name = (document.getElementById('examName')?.value || '').trim();

            if (!sid) { if (msg) msg.innerHTML = `<span style="color:#ff4e4e;">请选择学生</span>`; return; }
            if (!subject) { if (msg) msg.innerHTML = `<span style="color:#ff4e4e;">请选择科目</span>`; return; }
            const score = Number(scoreRaw);
            const full = Number(fullRaw) || 100;
            if (scoreRaw === '' || !isFinite(score) || score < 0) {
                if (msg) msg.innerHTML = `<span style="color:#ff4e4e;">请输入有效分数</span>`;
                return;
            }
            if (!isFinite(full) || full <= 0) {
                if (msg) msg.innerHTML = `<span style="color:#ff4e4e;">满分必须大于 0</span>`;
                return;
            }
            if (score > full) {
                if (!confirm(`分数 ${score} 超过了满分 ${full}，仍然提交吗？`)) return;
            }

            const rec = {
                id: examGenId(),
                date: date,
                name: name,
                score: score,
                full: full,
                subject: subject
            };

            examAddRecord(sid, rec);
            examState.subject = subject;
            // 立刻写云端
            if (window.saveAllDataToCloud) {
                try { await window.saveAllDataToCloud(); } catch (e) { console.warn(e); }
            }
            if (window.utils && window.utils.addLog) {
                try {
                    window.utils.addLog('上传考试分数', Number(sid), 0, 0, `${subject} ${score}/${full} ${date}`);
                } catch (e) { /* 忽略 */ }
            }

            const who = (examStudents().find(s => s.id === String(sid)) || {}).name || sid;
            const subNow = examSubjects();
            if (!subNow.includes(subject)) { /* 新科目会自动出现在列表 */ }

            examRender();
            const m2 = document.getElementById('examMsg');
            if (m2) m2.innerHTML = `<span style="color:#4ec9b0;">✅ 已上传：${examEscape(who)} · ${examEscape(subject)} · ${examFmt(score, 1)}/${examFmt(full, 0)}</span>`;
        };
    }

    // 清空表单
    const clearBtn = document.getElementById('examClearForm');
    if (clearBtn) {
        clearBtn.onclick = () => {
            const s = document.getElementById('examScore');
            const n = document.getElementById('examName');
            if (s) s.value = '';
            if (n) n.value = '';
            const msg = document.getElementById('examMsg');
            if (msg) msg.innerHTML = '';
        };
    }

    // 删除记录（管理员）
    document.querySelectorAll('[data-exam-del]').forEach(btn => {
        btn.onclick = async () => {
            const id = btn.getAttribute('data-exam-del');
            const sid = btn.getAttribute('data-exam-del-sid');
            if (!confirm('确定删除这条考试记录吗？')) return;
            const store = examEnsureStore();
            const arr = store[String(sid)];
            if (Array.isArray(arr)) {
                const idx = arr.findIndex(r => r && r.id === id);
                if (idx >= 0) arr.splice(idx, 1);
                if (!arr.length) delete store[String(sid)];
            }
            if (window.saveAllDataToCloud) {
                try { await window.saveAllDataToCloud(); } catch (e) { console.warn(e); }
            }
            examRender();
        };
    });
}

window.exam = {
    showExamScores,
    // 供外部/测试调用
    stats: examStats,
    topThreshold: examTopThreshold,
    percentile: examPercentile
};

// ========================================
// OpenStu v0.46
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// 学生历程页面
// ========================================
// 权限约定
//   · user  —— 只能看自己的历程，只能追加，不能删
//   · admin —— 可以看全班任何人的历程，对所有人依然只能追加，不能删
//   · 前后端都没有任何删除/覆盖入口
// 存储
//   · 每份历程就是一个纯文本字符串，存在班级桶的 journal_{学号}
// ========================================

// ---------- 工具 ----------
function jnEscape(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// 本班全部学生（学号 -> 姓名），从 scores 里取
function jnAllStudents() {
    const list = [];
    const scores = (window.appData && window.appData.scores) || {};
    Object.keys(scores).forEach(id => {
        if (String(id) === '0') return;
        const data = scores[id];
        let name = '未知';
        if (Array.isArray(data)) name = data[0] || '未知';
        else if (data && typeof data === 'object') name = data.name || '未知';
        list.push({ id: String(id), name: String(name) });
    });
    list.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
    return list;
}

// 当前登录者是否管理员（admin / root）
function jnIsManager() {
    const me = window.currentUser;
    return !!(me && (me.role === 'admin' || me.role === 'root'));
}

// 当前登录者绑定的学号（普通学生只能看这个）
function jnMyStudentId() {
    const me = window.currentUser;
    if (!me) return null;
    const sid = me.student_id;
    if (sid === null || sid === undefined || sid === '') return null;
    return String(sid);
}

function jnHeaders(withJson) {
    const h = {
        'X-Password': window.classPassword || '',
        'X-Password-Hash': window.classPasswordHash || ''
    };
    if (withJson) h['Content-Type'] = 'application/json';
    return h;
}

function jnBase() {
    return `${window.API_BASE || '/.netlify/functions/api'}/class/${window.currentClassId}`;
}

async function jnFetchJournal(studentId) {
    const r = await fetch(`${jnBase()}/journal/${encodeURIComponent(studentId)}`, { headers: jnHeaders() });
    if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || ('读取历程失败 ' + r.status));
    }
    return await r.json();
}

async function jnFetchJournals(ids) {
    const r = await fetch(`${jnBase()}/journals?ids=${encodeURIComponent(ids.join(','))}`, { headers: jnHeaders() });
    if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || ('读取历程失败 ' + r.status));
    }
    const j = await r.json();
    return j.journals || {};
}

async function jnAppend(studentId, content) {
    const me = window.currentUser || {};
    const r = await fetch(`${jnBase()}/journal`, {
        method: 'POST',
        headers: jnHeaders(true),
        body: JSON.stringify({
            student_id: studentId,
            content: content,
            operator: me.username || '',
            operator_name: me.display_name || me.username || '',
            operator_role: me.role || ''
        })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('追加失败 ' + r.status));
    return j;
}

// 把纯文本历程渲染成一条条记录
// 追加格式：[2026/10/12 21:30:00]〔张三〕 内容
// 非本格式的历史行按原样整行显示，保证永不丢字
function jnRenderText(text) {
    if (!text || text.trim() === '') {
        return `<p style="color:#ff8f4e;text-align:center;padding:30px 0;">
            🌱 这里还是一片空白，写下第一条历程吧。
        </p>`;
    }

    const lines = text.split('\n');
    let html = '';
    let buffer = [];

    const flush = () => {
        if (buffer.length === 0) return;
        html += `<div class="log-item" style="padding:12px 15px;margin:8px 0;background:#fff6f0;
            border-radius:8px;border-left:3px solid #ffb84e;color:#ff6b4a;white-space:pre-wrap;">${jnEscape(buffer.join('\n'))}</div>`;
        buffer = [];
    };

    const re = /^\[([^\]]*)\](?:〔([^〕]*)〕)?\s?([\s\S]*)$/;

    lines.forEach(line => {
        const m = line.match(re);
        if (m) {
            flush();
            const stamp = m[1];
            const who = m[2] || '';
            const body = m[3] || '';
            html += `
                <div class="log-item" style="padding:12px 15px;margin:8px 0;background:#fff6f0;
                     border-radius:8px;border-left:3px solid #ff9f4e;">
                    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                        <span style="color:#ff8f4e;font-size:0.9em;">📅 ${jnEscape(stamp)}</span>
                        ${who ? `<span style="color:#ff6b4a;font-size:0.9em;">✍️ ${jnEscape(who)}</span>` : ''}
                    </div>
                    <div style="margin-top:6px;color:#ff6b4a;white-space:pre-wrap;">${jnEscape(body)}</div>
                </div>`;
        } else {
            buffer.push(line);
        }
    });
    flush();

    return html;
}

// ---------- 主入口 ----------
async function showJournal() {
    const content = document.getElementById('contentArea');
    const me = window.currentUser;

    if (!me) {
        content.innerHTML = `<div class="content-card"><h2 class="card-title">📖 学生历程</h2>
            <p style="color:#ff4e4e;">请先登录。</p></div>`;
        return;
    }

    const manager = jnIsManager();
    const myId = jnMyStudentId();

    // 普通学生必须绑定学号才能看自己的历程
    if (!manager && !myId) {
        content.innerHTML = `<div class="content-card"><h2 class="card-title">📖 学生历程</h2>
            <p style="color:#ff4e4e;">当前账号没有绑定学号，无法查看个人历程。请联系管理员。</p></div>`;
        return;
    }

    content.innerHTML = `<div style="padding:20px;color:#ff8f4e;">⏳ 正在加载历程...</div>`;

    window.jnTarget = manager ? String(myId || '') : String(myId);

    try {
        if (manager) {
            // 管理员：先看全班名单（一人一个长度概览），再下钻
            await jnRenderClassView();
        } else {
            await jnRenderStudentView(String(myId));
        }
    } catch (e) {
        content.innerHTML = `<div class="content-card"><h2 class="card-title">📖 学生历程</h2>
            <p style="color:#ff4e4e;">加载失败：${jnEscape(e.message)}</p>
            <p style="color:#888;">请退出后重新进入班级，或检查网络。</p></div>`;
    }
}

// ---------- 管理员：全班视角 ----------
async function jnRenderClassView() {
    const content = document.getElementById('contentArea');
    const students = jnStudentList();

    if (students.length === 0) {
        content.innerHTML = `<div class="content-card"><h2 class="card-title">📖 学生历程</h2>
            <p style="color:#888;">本班暂无学生数据。</p></div>`;
        return;
    }

    let journals = {};
    try {
        journals = await jnFetchJournals(students.map(s => s.id));
    } catch (e) {
        journals = {};
        window.modal.notify && window.modal.notify('历程概览加载失败：' + e.message, 'error');
    }

    const totalChars = Object.values(journals).reduce((n, j) => n + (j.length || 0), 0);
    const filled = students.filter(s => (journals[s.id]?.length || 0) > 0).length;
    const byId = {};
    students.forEach(s => { byId[s.id] = s.name; });

    content.innerHTML = `
        <div class="content-card">
            <h2 class="card-title">📖 学生历程（全班）</h2>

            <div class="stats-grid" style="margin-bottom:14px;">
                <div class="stat-card"><div class="stat-value">${students.length}</div><div class="stat-label">学生总数</div></div>
                <div class="stat-card"><div class="stat-value">${filled}</div><div class="stat-label">已有历程</div></div>
                <div class="stat-card"><div class="stat-value">${totalChars}</div><div class="stat-label">总字数</div></div>
            </div>

            <div style="background:#fff9f0;border-left:3px solid #ff9f4e;border-radius:8px;padding:12px 15px;color:#ff8f4e;margin-bottom:15px;">
                👮 管理员可以查看全班历程，但<b>对所有人都只能追加，不能删除</b>。
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:15px;">
                <input type="text" id="jnKeyword" placeholder="搜索姓名或学号..." oninput="window.journal.filterClassList()"
                       style="flex:2;min-width:150px;padding:10px;border:2px solid #ffd1b8;border-radius:8px;color:#ff6b4a;">
                <button class="btn btn-primary" onclick="window.journal.exportAll()">📤 导出全班历程</button>
            </div>

            <div id="jnClassList" style="max-height:600px;overflow-y:auto;">
                ${students.map(s => {
                    const text = journals[s.id]?.journal || '';
                    const preview = text.trim() === ''
                        ? '<span style="color:#ffb84e;">（暂无历程）</span>'
                        : jnEscape(text.trim().split('\n').slice(-1)[0].slice(0, 60));
                    return `
                        <div class="jn-row" data-search="${jnEscape(s.id + ' ' + s.name)}"
                             onclick="window.journal.openStudent('${jnEscape(s.id)}')"
                             style="display:flex;justify-content:space-between;gap:10px;align-items:center;
                                    padding:12px 15px;margin:8px 0;background:#fff6f0;border-radius:8px;
                                    border-left:3px solid ${text.trim() === '' ? '#ffd1b8' : '#ff9f4e'};cursor:pointer;">
                            <div style="min-width:0;">
                                <div style="color:#ff6b4a;font-weight:600;">${jnEscape(s.name)}
                                    <span style="color:#ff8f4e;font-weight:400;font-size:0.85em;">#${jnEscape(s.id)}</span>
                                </div>
                                <div style="color:#ff8f4e;font-size:0.85em;margin-top:4px;overflow:hidden;
                                            text-overflow:ellipsis;white-space:nowrap;">${preview}</div>
                            </div>
                            <div style="color:#ffb84e;font-size:0.85em;white-space:nowrap;">${text.length} 字 ›</div>
                        </div>`;
                }).join('')}
            </div>
        </div>`;

    window.jnClassJournals = journals;
    window.jnClassStudents = students;
}

function jnFilterClassList() {
    const kw = (document.getElementById('jnKeyword')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#jnClassList .jn-row').forEach(row => {
        const hay = (row.getAttribute('data-search') || '').toLowerCase();
        row.style.display = (!kw || hay.includes(kw)) ? '' : 'none';
    });
}

// 管理员下钻到某个学生
async function jnOpenStudent(studentId) {
    const content = document.getElementById('contentArea');
    content.innerHTML = `<div style="padding:20px;color:#ff8f4e;">⏳ 正在加载...</div>`;
    await jnRenderStudentView(String(studentId), true);
}

// ---------- 学生视角（单人） ----------
async function jnRenderStudentView(studentId, fromClassView) {
    const content = document.getElementById('contentArea');
    const manager = jnIsManager();
    const students = jnStudentList();
    const found = students.find(s => s.id === String(studentId));
    const name = found ? found.name : '学生 ' + studentId;

    const data = await jnFetchJournal(studentId);
    const text = data.journal || '';

    // 管理员可切换查看对象；学生固定看自己
    const picker = manager ? `
        <div style="margin-bottom:15px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <label style="color:#ff6b4a;">查看学生：</label>
            <select id="jnStudentPick" onchange="window.journal.switchStudent(this.value)"
                    style="flex:1;min-width:180px;padding:10px;border:2px solid #ffd1b8;border-radius:8px;color:#ff6b4a;">
                ${students.map(s => `<option value="${jnEscape(s.id)}" ${s.id === String(studentId) ? 'selected' : ''}>
                    ${jnEscape(s.name)}（#${jnEscape(s.id)}）</option>`).join('')}
            </select>
            <button class="btn" onclick="window.journal.showClassView()">⬅ 返回全班</button>
        </div>` : '';

    content.innerHTML = `
        <div class="content-card">
            <h2 class="card-title">📖 ${manager ? '学生历程' : '我的历程'}</h2>

            ${picker}

            <div style="background:#fff9f0;border-left:3px solid #ff9f4e;border-radius:8px;
                        padding:12px 15px;color:#ff8f4e;margin-bottom:15px;line-height:1.7;">
                <div>👤 <b>${jnEscape(name)}</b>
                    <span style="font-size:0.9em;">（学号 ${jnEscape(studentId)}）</span></div>
                <div style="font-size:0.9em;margin-top:4px;">
                    ${manager
                        ? '👮 你可以为这位同学追加历程，但<b>不能删除任何内容</b>。'
                        : '🔒 你只能查看和追加自己的历程，<b>不能删除已记录的内容</b>。'}
                </div>
            </div>

            <div style="margin-bottom:10px;color:#ff8f4e;font-size:0.9em;">
                共 ${text.length} 字 · 只可追加
            </div>

            <div id="jnTimeline" style="max-height:460px;overflow-y:auto;padding-right:4px;">
                ${jnRenderText(text)}
            </div>

            <hr style="border:none;border-top:1px dashed #ffd1b8;margin:20px 0;">

            <h3 style="color:#ff6b4a;margin-bottom:10px;">✍️ 追加历程</h3>
            <textarea id="jnInput" rows="4" placeholder="记录今天发生的事..."
                      style="width:100%;padding:12px;border:2px solid #ffd1b8;border-radius:8px;
                             color:#ff6b4a;font-family:inherit;font-size:1em;box-sizing:border-box;"></textarea>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;align-items:center;">
                <button class="btn btn-primary" id="jnSubmitBtn" onclick="window.journal.submit('${jnEscape(studentId)}')">
                    ➕ 追加
                </button>
                <button class="btn" onclick="window.journal.exportOne('${jnEscape(studentId)}')">📤 导出这份历程</button>
                <span style="color:#ffb84e;font-size:0.85em;">追加后立即保存，无法撤销（本系统不提供删除）</span>
            </div>
        </div>`;

    window.jnTarget = String(studentId);
}

async function jnSubmit(studentId) {
    const box = document.getElementById('jnInput');
    if (!box) return;
    const text = box.value.trim();
    if (!text) {
        window.modal.notify('请先写点什么再追加', 'error');
        return;
    }

    const btn = document.getElementById('jnSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 提交中...'; }

    try {
        await jnAppend(studentId, text);
        box.value = '';
        window.modal.notify('✅ 已追加到历程', 'success');
        window.utils.addLog('追加历程', studentId, 0, window.utils.getStudentScore(studentId),
            text.length > 40 ? text.slice(0, 40) + '…' : text);
        // 重新拉取（永远以服务端文本为准）
        await jnRenderStudentView(studentId, true);
    } catch (e) {
        window.modal.notify('追加失败：' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '➕ 追加'; }
    }
}

function jnSwitchStudent(id) {
    jnOpenStudent(id);
}

function jnShowClassView() {
    jnRenderClassView();
}

// ---------- 导出 ----------
function jnDownload(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function jnExportOne(studentId) {
    const students = jnStudentList();
    const found = students.find(s => s.id === String(studentId));
    const name = found ? found.name : String(studentId);

    fetch(`${jnBase()}/journal/${encodeURIComponent(studentId)}`, { headers: jnHeaders() })
        .then(r => r.json())
        .then(j => {
            const text = j.journal || '';
            if (!text.trim()) {
                window.modal.notify('这份历程还是空的', 'error');
                return;
            }
            jnDownload(`历程_${name}_${studentId}.txt`, text);
            window.modal.notify('✅ 已导出', 'success');
        })
        .catch(e => window.modal.notify('导出失败：' + e.message, 'error'));
}

function jnExportAll() {
    const students = jnStudentList();
    if (students.length === 0) {
        window.modal.notify('没有可导出的学生', 'error');
        return;
    }
    const ids = students.map(s => s.id).join(',');
    const names = students.map(s => s.name).join(',');
    const url = `${jnBase()}/journal-export?ids=${encodeURIComponent(ids)}&names=${encodeURIComponent(names)}`;
    fetch(url, { headers: jnHeaders() })
        .then(r => {
            if (!r.ok) throw new Error('导出失败 ' + r.status);
            return r.text();
        })
        .then(text => {
            const stamp = new Date().toISOString().split('T')[0];
            jnDownload(`全班历程_${stamp}.txt`, text);
            window.modal.notify('✅ 已导出全班历程', 'success');
        })
        .catch(e => window.modal.notify('导出失败：' + e.message, 'error'));
}

// ---------- 与班级数据同步 ----------
// 历程不占用班级数据字段，只需要知道"有哪些学生"。
// 这里把 scores 里的学号/姓名映射缓存到内存，供页面使用；
// 若将来出现只存在于 users 里的学号，也会一并纳入。
function jnSyncStudents() {
    const list = jnAllStudents();

    // 兜底：users 表里绑定了学号、但 scores 里还没有的账号。
    // 只纳入 role=user 的账号 —— 管理员/Root 的学号（如 999 / 9999）不是学生，
    // 出现在历程名单里属于噪音。
    const known = new Set(list.map(s => s.id));
    Object.values((window.appData && window.appData.users) || {}).forEach(u => {
        if (!u) return;
        if (u.role && u.role !== 'user') return;
        if (u.student_id === null || u.student_id === undefined || u.student_id === '') return;
        const id = String(u.student_id);
        if (id === '0' || known.has(id)) return;
        known.add(id);
        list.push({ id, name: String(u.display_name || u.username || ('学生 ' + id)) });
    });

    list.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
    window.jnStudentsCache = list;
    return list;
}

// 学生列表取缓存优先，保证 users 里有、scores 里没有的学号也能显示
function jnStudentList() {
    if (!window.jnStudentsCache || window.jnStudentsCache.length === 0) {
        return jnSyncStudents();
    }
    return window.jnStudentsCache;
}

// ---------- 导出到全局 ----------
window.journal = {
    showJournal,
    syncStudents: jnSyncStudents,
    openStudent: jnOpenStudent,
    switchStudent: jnSwitchStudent,
    showClassView: jnShowClassView,
    submit: jnSubmit,
    filterClassList: jnFilterClassList,
    exportOne: jnExportOne,
    exportAll: jnExportAll,
    isManager: jnIsManager
};

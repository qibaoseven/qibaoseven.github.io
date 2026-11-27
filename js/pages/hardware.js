// ========================================
// OpenStu v0.46
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// 硬件登记页
// A 模式：Web Serial 直连 NodeMCU（读卡模式固件从串口吐 UID），自动进表格
// B 模式：连不上/没插板子时手填 UID
// 表格每行 = 一张卡；右侧选学号/学科/作业种类，支持勾选后批量设置
// 提交走 /uuids/add（绑卡 + 可选登记学科与作业种类）
// ========================================

let hwrState = {
    rows: [],
    meta: null,
    port: null,
    keepReading: false,
    seq: 0
};

function hwrEscape(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 把任意写法（: / - / 空格 / 0x / 连写）统一成 "AA:BB:CC"
function hwrNormUid(text) {
    if (!text) return '';
    const groups = String(text).toUpperCase().match(/[0-9A-F]{2}/g);
    if (!groups) return '';
    return groups.slice(0, 7).join(':');
}

// 串口一行 → UID；兼容 "UID:.."、"[card] uid=.."、纯 hex
function hwrParseLine(line) {
    const cleaned = String(line || '').trim();
    if (!cleaned) return '';
    const lower = cleaned.toLowerCase();
    let payload = '';
    if (lower.startsWith('uid:')) payload = cleaned.slice(4);
    else if (lower.includes('uid=')) payload = cleaned.split(/uid=/i)[1];
    else if (lower.includes('uid:')) payload = cleaned.split(/uid:/i)[1];
    else if (/^[0-9a-fx:\-\s]+$/i.test(cleaned) && /[0-9a-f]{2}/i.test(cleaned)) payload = cleaned;
    else return '';
    const uid = hwrNormUid(payload);
    const count = uid ? uid.split(':').length : 0;
    if (count < 1 || count > 7) return '';
    return uid;
}

// ---------- 数据源 ----------
function hwrStudents() {
    const users = (window.appData && window.appData.users) || {};
    const scores = (window.appData && window.appData.scores) || {};
    const list = [];
    Object.keys(scores).forEach(id => {
        if (id === '0' || !/^\d+$/.test(id)) return;
        let name = '';
        Object.values(users).forEach(u => {
            if (u && String(u.student_id) === String(id)) name = u.display_name || u.username || '';
        });
        list.push({ sid: +id, name });
    });
    return list.sort((a, b) => a.sid - b.sid);
}

function hwrSubjects() {
    const names = (hwrState.meta && hwrState.meta.subjectNames) || {};
    return Object.entries(names).map(([k, v]) => ({ id: +k, name: String(v) }));
}

function hwrTypesOf(subjectId) {
    const types = (hwrState.meta && hwrState.meta.types) || {};
    const list = types[String(subjectId)] || types[subjectId] || [];
    return Array.isArray(list) ? list : [];
}

// ---------- 入口 ----------
async function showHardware() {
    const content = document.getElementById('contentArea');
    content.innerHTML = '<div style="padding:20px;">⏳ 正在加载硬件登记...</div>';

    try {
        const base = `${window.API_BASE || '/.netlify/functions/api'}/class/${window.currentClassId}/homework/meta`;
        const r = await fetch(base, {
            headers: { 'X-Password': window.classPassword || '', 'X-Password-Hash': window.classPasswordHash || '' }
        });
        hwrState.meta = r.status === 404 ? null : await r.json();
    } catch (e) {
        hwrState.meta = null;
    }

    if (!hwrState.meta) {
        content.innerHTML = `<div class="content-card">
            <h2 class="card-title">🔌 硬件登记</h2>
            <p style="color:#ff4e4e;">作业系统尚未初始化，没有学科和作业种类可绑定。</p>
            <p style="color:#888;">先去「作业提交」创建作业文件，再回来绑卡。</p>
            <button class="btn" onclick="window.homework.showHomework()">📚 去初始化</button>
        </div>`;
        return;
    }

    content.innerHTML = renderHardwarePage();
    renderHardwareRows();
    hwrUpdateSerialState();
}

function renderHardwarePage() {
    const subjects = hwrSubjects();
    const subjectOptions = subjects.map(s => `<option value="${s.id}">${hwrEscape(s.name)}</option>`).join('');
    return `<div class="content-card">
        <h2 class="card-title">🔌 硬件登记</h2>
        <p style="color:#888;">把卡片 UID 绑到学号；顺带可以记录这张卡对应哪个学科、哪种作业。批量绑定请先勾左列，再用上面的批量栏。</p>

        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px;border:1px dashed #ffd8bd;border-radius:10px;margin:12px 0;background:#fffaf6;">
            <button class="btn btn-primary" id="hwrConnectBtn" onclick="window.hardware.toggleSerial()">🔌 连接 NodeMCU</button>
            <span id="hwrSerialState" style="font-size:13px;color:#888;">未连接</span>
            <button class="btn" onclick="window.hardware.sendBoot()" style="font-size:13px;">↩ 让板子退出读卡模式</button>
            <span style="font-size:12px;color:#bbb;">需要桌面版 Chrome / Edge，手机浏览器没有 Web Serial</span>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;padding:10px;background:#f8f9fb;border-radius:10px;margin-bottom:12px;">
            <div><label style="font-size:12px;color:#666;display:block;">批量 学号</label>
                <select id="hwrBulkSid" style="padding:8px;border:1px solid #ddd;border-radius:8px;min-width:130px;">
                    <option value="">不设置</option>
                    ${hwrStudents().map(s => `<option value="${s.sid}">${s.sid} ${hwrEscape(s.name)}</option>`).join('')}
                </select></div>
            <div><label style="font-size:12px;color:#666;display:block;">批量 学科</label>
                <select id="hwrBulkSubject" onchange="window.hardware.refreshBulkTypes()" style="padding:8px;border:1px solid #ddd;border-radius:8px;min-width:120px;">
                    <option value="">不设置</option>${subjectOptions}
                </select></div>
            <div><label style="font-size:12px;color:#666;display:block;">批量 种类</label>
                <select id="hwrBulkType" style="padding:8px;border:1px solid #ddd;border-radius:8px;min-width:140px;">
                    <option value="">不设置</option>
                </select></div>
            <button class="btn" onclick="window.hardware.applyBulk()">⬇ 应用到选中行</button>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">
            <input id="hwrManualUid" placeholder="手填 UID，如 12:34:56:78:9A:BC:DE"
                style="flex:1;min-width:240px;padding:9px 10px;border:1px solid #ddd;border-radius:8px;">
            <button class="btn" onclick="window.hardware.addManual()">➕ 添加一行</button>
            <button class="btn" onclick="window.hardware.checkAll(true)">全选</button>
            <button class="btn" onclick="window.hardware.checkAll(false)">清空勾选</button>
            <button class="btn btn-primary" onclick="window.hardware.submitRows()">📤 提交选中</button>
            <button class="btn" onclick="window.hardware.clearRows()">🗑 清空表格</button>
        </div>

        <div id="hwrTableWrap" style="overflow-x:auto;"></div>
        <div style="font-size:12px;color:#999;margin-top:8px;">
            提交 = POST /uuids/add：先校验 UID（1~7 字节）→ 绑到学号；带学科/种类时顺带登记为已交。
        </div>
    </div>`;
}

// ---------- 表格 ----------
function renderHardwareRows() {
    const wrap = document.getElementById('hwrTableWrap');
    if (!wrap) return;
    const rows = hwrState.rows;
    if (!rows.length) {
        wrap.innerHTML = '<div style="padding:24px;text-align:center;color:#aaa;border:1px dashed #eee;border-radius:10px;">还没有卡片。插上板子刷卡，或手动添加 UID。</div>';
        return;
    }
    const subjects = hwrSubjects();
    const students = hwrStudents();

    const body = rows.map(row => {
        const studentOptions = '<option value="">未选</option>' + students.map(s =>
            `<option value="${s.sid}" ${row.sid === s.sid ? 'selected' : ''}>${s.sid} ${hwrEscape(s.name)}</option>`).join('');
        const subjectOptions = '<option value="">不登记</option>' + subjects.map(s =>
            `<option value="${s.id}" ${row.subjectId === s.id ? 'selected' : ''}>${hwrEscape(s.name)}</option>`).join('');
        const typeOptions = '<option value="">整科</option>' + hwrTypesOf(row.subjectId).map((t, i) =>
            `<option value="${i}" ${row.typeId === i ? 'selected' : ''}>${hwrEscape(t)}</option>`).join('');
        const statusColor = row.status.indexOf('✅') === 0 ? '#4ecf6e' : (row.status ? '#ff6b6b' : '#aaa');
        return `<tr>
            <td style="text-align:center;"><input type="checkbox" ${row.checked ? 'checked' : ''}
                onchange="window.hardware.toggleRow('${row.uid}', this.checked)"></td>
            <td style="font-family:monospace;white-space:nowrap;">${row.uid}</td>
            <td><select onchange="window.hardware.setRow('${row.uid}','sid',this.value)"
                style="padding:6px;border:1px solid #eee;border-radius:6px;max-width:170px;">${studentOptions}</select></td>
            <td><select onchange="window.hardware.setRow('${row.uid}','subjectId',this.value)"
                style="padding:6px;border:1px solid #eee;border-radius:6px;">${subjectOptions}</select></td>
            <td><select onchange="window.hardware.setRow('${row.uid}','typeId',this.value)"
                style="padding:6px;border:1px solid #eee;border-radius:6px;">${typeOptions}</select></td>
            <td style="font-size:12px;color:${statusColor};">${hwrEscape(row.status)}</td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#fff0e6;color:#ff8f4e;">
            <th style="padding:8px;width:34px;">选</th>
            <th style="padding:8px;text-align:left;">卡片 UID</th>
            <th style="padding:8px;text-align:left;">学号</th>
            <th style="padding:8px;text-align:left;">学科</th>
            <th style="padding:8px;text-align:left;">作业种类</th>
            <th style="padding:8px;text-align:left;">状态</th>
        </tr></thead>
        <tbody>${body}</tbody>
    </table>`;
}

function refreshBulkTypes() {
    const subjSel = document.getElementById('hwrBulkSubject');
    const typeSel = document.getElementById('hwrBulkType');
    if (!subjSel || !typeSel) return;
    const sid = subjSel.value === '' ? -1 : parseInt(subjSel.value, 10);
    typeSel.innerHTML = '<option value="">不设置</option>' + hwrTypesOf(sid).map((t, i) =>
        `<option value="${i}">${hwrEscape(t)}</option>`).join('');
}

// ---------- 行操作 ----------
function addRow(uid, fromSerial) {
    if (!uid) return;
    uid = hwrNormUid(uid);
    if (!uid) return;
    const existing = hwrState.rows.find(r => r.uid === uid);
    if (existing) {
        existing.status = '这张卡已在表格里';
        renderHardwareRows();
        return;
    }
    hwrState.rows.push({
        uid,
        sid: '',
        subjectId: '',
        typeId: '',
        checked: true,
        status: fromSerial ? '串口读取' : '手动输入'
    });
    renderHardwareRows();
}

function addManual() {
    const el = document.getElementById('hwrManualUid');
    if (!el) return;
    const uid = hwrNormUid(el.value);
    if (!uid) { alert('UID 不合法：需要 1~7 组两位十六进制，例如 12:34:56:78:9A:BC:DE'); return; }
    if (uid.split(':').length > 7) { alert('UID 超过 7 字节'); return; }
    addRow(uid, false);
    el.value = '';
}

function toggleRow(uid, checked) {
    const row = hwrState.rows.find(r => r.uid === uid);
    if (row) row.checked = !!checked;
}

function setRow(uid, field, value) {
    const row = hwrState.rows.find(r => r.uid === uid);
    if (!row) return;
    if (field === 'sid') row.sid = value === '' ? '' : parseInt(value, 10);
    if (field === 'subjectId') {
        row.subjectId = value === '' ? '' : parseInt(value, 10);
        row.typeId = '';             // 换学科后种类要重选
    }
    if (field === 'typeId') row.typeId = value === '' ? '' : parseInt(value, 10);
    renderHardwareRows();
}

function checkAll(checked) {
    hwrState.rows.forEach(r => { r.checked = !!checked; });
    renderHardwareRows();
}

function clearRows() {
    if (!confirm('清空表格（不会动服务端已绑定的数据）？')) return;
    hwrState.rows = [];
    renderHardwareRows();
}

// ---------- 批量 ----------
function applyBulk() {
    const sidEl = document.getElementById('hwrBulkSid');
    const subjEl = document.getElementById('hwrBulkSubject');
    const typeEl = document.getElementById('hwrBulkType');
    const sids = new Set(hwrState.rows.filter(r => r.checked).map(r => r.uid));
    if (!sids.size) { alert('先在左列勾选要批量设置的行'); return; }

    const sid = sidEl && sidEl.value !== '' ? parseInt(sidEl.value, 10) : null;
    const subjectId = subjEl && subjEl.value !== '' ? parseInt(subjEl.value, 10) : null;
    const typeId = typeEl && typeEl.value !== '' ? parseInt(typeEl.value, 10) : null;

    hwrState.rows.forEach(row => {
        if (!sids.has(row.uid)) return;
        if (sid !== null) row.sid = sid;
        if (subjectId !== null) { row.subjectId = subjectId; row.typeId = ''; }
        if (typeId !== null) row.typeId = typeId;
        row.status = '批量设置';
    });
    renderHardwareRows();
}

// ---------- 提交 ----------
async function submitRows() {
    const rows = hwrState.rows.filter(r => r.checked);
    if (!rows.length) { alert('没有勾选任何行'); return; }
    const bad = rows.filter(r => !r.sid);
    if (bad.length) { alert(`有 ${bad.length} 行没选学号，先补上再提交`); return; }

    let ok = 0, fail = 0;
    for (const row of rows) {
        const body = { student_id: row.sid, uid: row.uid };
        if (row.subjectId !== '' && row.subjectId !== null) body.subject_id = row.subjectId;
        if (row.typeId !== '' && row.typeId !== null) body.type_id = row.typeId;
        try {
            const r = await fetch(`${window.API_BASE || '/.netlify/functions/api'}/class/${window.currentClassId}/uuids/add`, {
                method: 'POST',
                headers: hwrHeaders(),
                body: JSON.stringify(body)
            });
            const j = await r.json().catch(() => ({}));
            if (r.ok) {
                ok++;
                row.status = '✅ 已绑定' + (body.subject_id !== undefined ? '（含登记）' : '');
            } else {
                fail++;
                row.status = '❌ ' + (j.error || ('HTTP ' + r.status));
            }
        } catch (e) {
            fail++;
            row.status = '❌ 网络失败';
        }
        renderHardwareRows();
    }
    alert(`提交完成：成功 ${ok}，失败 ${fail}`);
}

function hwrHeaders() {
    return {
        'X-Password': window.classPassword || '',
        'X-Password-Hash': window.classPasswordHash || '',
        'Content-Type': 'application/json'
    };
}

// ---------- Web Serial ----------
function hwrUpdateSerialState() {
    const el = document.getElementById('hwrSerialState');
    const btn = document.getElementById('hwrConnectBtn');
    if (!el) return;
    if (!('serial' in navigator)) {
        el.textContent = '此浏览器不支持 Web Serial（用桌面 Chrome/Edge，或改用 B 模式手填）';
        el.style.color = '#ff6b6b';
        if (btn) btn.disabled = true;
        return;
    }
    if (hwrState.port && hwrState.keepReading) {
        el.textContent = '已连接，等待刷卡…';
        el.style.color = '#4ecf6e';
        if (btn) btn.textContent = '⏏ 断开';
    } else {
        el.textContent = '未连接';
        el.style.color = '#888';
        if (btn) btn.textContent = '🔌 连接 NodeMCU';
    }
}

async function toggleSerial() {
    if (hwrState.port && hwrState.keepReading) { await disconnectSerial(); return; }

    if (!('serial' in navigator)) {
        alert('当前浏览器不支持 Web Serial。\n请将开发板插入 USB 后用桌面版 Chrome/Edge 打开，或直接在下方手动输入 UID。');
        return;
    }

    try {
        if (!hwrState.port) {
            hwrState.port = await navigator.serial.requestPort();
        }
        await hwrState.port.open({ baudRate: 115200 });
        hwrState.keepReading = true;
        hwrUpdateSerialState();
        hwrReadLoop();
    } catch (e) {
        hwrState.port = null;
        hwrState.keepReading = false;
        hwrUpdateSerialState();
        alert('连接失败：' + (e && e.message ? e.message : e) + '\n请将开发板插入 USB 后再点连接，或者手动输入 UID。');
    }
}

async function disconnectSerial() {
    hwrState.keepReading = false;
    try { if (hwrState.port) await hwrState.port.close(); } catch (e) { }
    hwrState.port = null;
    hwrUpdateSerialState();
}

async function hwrReadLoop() {
    const decoder = new TextDecoderStream();
    const readable = hwrState.port.readable;
    if (!readable) return;
    readable.pipeTo(decoder.writable).catch(() => { });
    const reader = decoder.readable.getReader();
    let buf = '';
    try {
        while (hwrState.keepReading) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            const lines = buf.split(/\r?\n/);
            buf = lines.pop();
            lines.forEach(line => {
                const uid = hwrParseLine(line);
                if (uid) addRow(uid, true);
            });
            if (buf.length > 512) buf = '';
        }
    } catch (e) {
        // 拔线/关闭端口都会走到这里
    } finally {
        try { reader.releaseLock(); } catch (e) { }
        hwrState.keepReading = false;
        hwrUpdateSerialState();
    }
}

async function sendBoot() {
    if (!hwrState.port) { alert('先连接 NodeMCU'); return; }
    try {
        const writer = hwrState.port.writable.getWriter();
        await writer.write(new TextEncoder().encode('boot\n'));
        writer.releaseLock();
    } catch (e) {
        alert('发送失败：' + (e && e.message ? e.message : e));
    }
}

window.hardware = {
    showHardware,
    toggleSerial,
    disconnectSerial,
    sendBoot,
    addManual,
    addRow,
    toggleRow,
    setRow,
    checkAll,
    clearRows,
    applyBulk,
    refreshBulkTypes,
    submitRows
};

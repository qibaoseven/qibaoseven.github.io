// v0.45 单元测试自检脚本 (node:test + vm 沙箱, 无需 DOM/浏览器)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');   // 仓库根目录 = test 的上一级

// 跨 vm 隔离层: 把沙箱里取到的对象转成宿主 JS 再比较 (避免 realm 导致的 deepStrictEqual 差异)
function eq(actual, expected, msg) {
  const norm = x => (x && typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : x);
  assert.deepStrictEqual(norm(actual), norm(expected), msg);
}

// 载入文件到可见沙箱(共享 window === sandbox), 返回可操控的 sandbox
function load(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;          // 源码用 window.xxx, 落在 sandbox 上
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: file });
  return sandbox;
}

// 一个干净的 box: 只 load 目标文件, appData 每次重设
function makeBoxForData(file) {
  const sb = load(file);
  // 提供 ensureUserGroupIds 所需的最小依赖(本轮调用不触碰 DOM)
  sb.saveAllDataToCloud = null;
  return sb;
}

// ---- 帮助:构造一个旧式单 account 的 appData ----
function mkUsers(extra) {
  return { users: extra };
}

/* ============== A. bb1 ensureUserGroupIds ============== */
test('bb1 ensureUserGroupIds: role=user 缺字段 -> 补空 {} 并返回 true', () => {
  const sb = makeBoxForData('js/data.js');
  sb.appData = mkUsers({
    g1: { username: 'g1', role: 'user' },            // 缺失 group_ids
    admin: { username: 'admin', role: 'admin' }      // 不应被碰
  });
  const changed = sb.window.dataManager.ensureUserGroupIds();
  assert.equal(changed, true);
  eq(sb.appData.users.g1.group_ids, {}, 'user 应补成空字典');
  assert.equal(sb.appData.users.admin.group_ids, undefined, 'admin 不应被添加');
});

test('bb1: role=user 已有合法空 {} -> 不再补, 返回 false, 不重复写', () => {
  const sb = makeBoxForData('js/data.js');
  sb.appData = mkUsers({ g1: { username: 'g1', role: 'user', group_ids: {} } });
  const changed = sb.window.dataManager.ensureUserGroupIds();
  assert.equal(changed, false);
  eq(sb.appData.users.g1.group_ids, {});
});

test('bb1: 已有内容的合法字典保持不变, 返回 false', () => {
  const sb = makeBoxForData('js/data.js');
  sb.appData = mkUsers({ g1: { username: 'g1', role: 'user', group_ids: { 1: '张', 2: '吴' } } });
  const changed = sb.window.dataManager.ensureUserGroupIds();
  assert.equal(changed, false);
  eq(sb.appData.users.g1.group_ids, { 1: '张', 2: '吴' }, '内容不得被清空');
});

test('bb1: 非法类型(数组/数字/字符串/null)会被纠正为空 {}, 返回 true', () => {
  for (const bad of [null, 7, 'abc', [1, 2], true]) {
    const sb = makeBoxForData('js/data.js');
    sb.appData = mkUsers({ g1: { username: 'g1', role: 'user', group_ids: bad } });
    const changed = sb.window.dataManager.ensureUserGroupIds();
    assert.equal(changed, true, '应判定为需补全: ' + JSON.stringify(bad));
    eq(sb.appData.users.g1.group_ids, {}, '应替换为空字典');
  }
});

test('bb1: 空 users / appData 缺失 -> 安全返回 false', () => {
  const a = makeBoxForData('js/data.js');
  a.appData = mkUsers({});
  assert.equal(a.window.dataManager.ensureUserGroupIds(), false);

  const b = makeBoxForData('js/data.js');
  b.appData = null;
  assert.equal(b.window.dataManager.ensureUserGroupIds(), false, 'appData 为 null 不应报错');

  const c = makeBoxForData('js/data.js');
  c.appData = { users: undefined };
  assert.equal(c.window.dataManager.ensureUserGroupIds(), false, 'users 缺失不应报错');
});

/* ============== B. bb2 修改小组人员的保存收集逻辑 ============== */
// 载入 account.js, 但需要 data.js 来提供 window.dataManager 等。
// 这里只测"收行->字典"与校验,不依赖真实 DOM:用伪行 + 假 modal。
function makeAccountBox() {
  // 同一沙箱先载 data.js(提供 window.dataManager), 再载 account.js
  const dataSrc = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
  const accSrc = fs.readFileSync(path.join(ROOT, 'js/pages/account.js'), 'utf8');
  const sb = {};
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(dataSrc, sb, { filename: 'js/data.js' });
  vm.runInContext(accSrc, sb, { filename: 'js/pages/account.js' });
  return sb;
}

// 造一批伪行供 saveManageGroupMembers 读取(document.querySelectorAll 打桩)
function fakeRows(pairs) {
  // pairs: [ [idRaw, nameRaw], ... ]
  return pairs.map(([idRaw, nameRaw]) => ({
    querySelector(sel) {
      if (sel === '.gb-id') return { value: String(idRaw) };
      if (sel === '.gb-name') return { value: String(nameRaw) };
      return null;
    }
  }));
}

function setupForSave(sb, rows) {
  // 伪 DOM
  sb.document = { querySelectorAll: (sel) => (sel === '#gbRows .gb-member-row' ? rows : []) };
  sb.modal = { close: () => { sb.__modalClosed = true; }, notify: () => {} };
  sb.alert = () => {};
  sb.dataManager = { saveData: (key) => { sb.__savedKey = key; } };
  // 允许未定义 confirm 时默认通过(好行时不会调用)
  if (sb.confirm === undefined) sb.confirm = () => true;
  // 当前登录是 user
  sb.currentUser = { role: 'user', username: 'g1', display_name: '第一组' };
  sb.appData.users.g1 = { role: 'user', group_ids: {} };
}

test('bb2 保存: 有效行全部写入 group_ids 并调用 saveData(users)', () => {
  const sb = makeAccountBox();
  sb.userRoleSkip = null;
  setupForSave(sb, fakeRows([
    ['1', '张'], ['2', '吴'], ['', '']      // 空行忽略
  ]));
  sb.window.account.saveManageGroupMembers();
  eq(sb.appData.users.g1.group_ids, { 1: "张", 2: "吴" });
  assert.ok(sb.__modalClosed, '保存成功后关窗');
  assert.equal(sb.__savedKey, 'users', '触发 users 保存');
});

test('bb2 保存: 全空行 -> 清空成空字典(允许删除全部)', () => {
  const sb = makeAccountBox();
  setupForSave(sb, fakeRows([['', ''], ['', '']]));
  sb.appData.users.g1.group_ids = { 1: '张' };       // 原先有人
  sb.window.account.saveManageGroupMembers();
  eq(sb.appData.users.g1.group_ids, {}, '结束后为空字典');
  assert.equal(sb.__savedKey, 'users');
});

test('bb2 保存: ID 是数字字符串会规整成字典(不重复覆盖同 ID)', () => {
  const sb = makeAccountBox();
  setupForSave(sb, fakeRows([['5', '李'], ['05', '李'], ['5', '李重']])); // 相同ID或 key 01→1
  sb.window.account.saveManageGroupMembers();
  // parseInt('05')=5 => 与 5 同 key; 后出现的 '李重' 因 result[5] 已有定义不覆盖(保留首个)
  eq(sb.appData.users.g1.group_ids, { 5: '李' });
});

test('bb2 保存: 不完整行(缺名字/非法ID)被跳过, confirm=false 则不保存', () => {
  const sb = makeAccountBox();
  setupForSave(sb, fakeRows([['1', '张'], ['2', ''], ['x', '王']])); // 2缺名, x非法
  sb.confirm = () => false;                         // 用户取消
  delete sb.__savedKey;
  sb.window.account.saveManageGroupMembers();
  assert.equal(sb.__savedKey, undefined, '确认取消时不得保存');
  eq(sb.appData.users.g1.group_ids, {}, '不应写入');

  // 再次允许确认 -> 有效行保留下来的
  const sb2 = makeAccountBox();
  setupForSave(sb2, fakeRows([['1', '张'], ['2', ''], ['x', '王']]));
  sb2.confirm = () => true;
  sb2.window.account.saveManageGroupMembers();
  eq(sb2.appData.users.g1.group_ids, { 1: '张' }, '跳过坏行保留有效行');
});

test('bb2 保存: 非 user 角色调用被拦截(不改数据)', () => {
  const sb = makeAccountBox();
  setupForSave(sb, fakeRows([['1', '张']]));
  sb.currentUser.role = 'admin';
  delete sb.__savedKey;
  sb.window.account.saveManageGroupMembers();
  assert.equal(sb.__savedKey, undefined, '无权限不保存原数据');
});

/* ============== C. bb2 UI 权限/按钮门控(纯逻辑) ============== */
test('bb2: 渲染条件 & 弹窗门控 —— 非 user 调用 show... 函数直接返回', () => {
  const sb = makeAccountBox();
  sb.currentUser = { role: 'admin', username: 'x' };
  sb.appData.users.x = {};
  sb.modal = { show: () => { sb.__shown = true; } };
  sb.window.account.showManageGroupMembers();   // 应因 role!=='user' 提前 return
  assert.equal(sb.__shown, undefined, 'admin 不应能打开该弹窗');
});

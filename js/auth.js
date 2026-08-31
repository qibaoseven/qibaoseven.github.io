// ========================================
// StudentOS v0.44
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
window.currentUser = null;
window.currentPage = 'unknown';

function hasPermission(permission) {
    if (!window.currentUser) return false;
    const role = window.currentUser.role;
    
    const permissions = {
        user: ['我的分数', '排名管理', '学分抽奖', '惩罚管理', '金币系统', '职位系统'],
        admin: ['分数管理', '分组管理', '排名管理', '数据备份', '学分抽奖', '惩罚管理', '金币系统', '我的分数', '每日汇报', '操作日志', '职位系统'],
        root: ['分数管理', '分组管理', '排名管理', '操作日志', '数据备份', '学分抽奖', '惩罚管理', '金币系统', '我的分数', '每日汇报', '职位系统', '自动事件']
    };
    
    return permissions[role]?.includes(permission) || false;
}

function getPagePermissionString(pageName) {
    const permissionMap = {
        'dashboard': 'rwxrwxrwx',
        'myScore': 'rwxrwxrwx',
        'score': '---rwxrwx',
        'group': '---rwxrwx',
        'rank': 'r--r--r--',
        'dailyReport': 'r--rwxr--',
        'gacha': 'rwxrwxrwx',
        'punishment': 'rwxrwxrwx',
        'gold': 'rwxrwxrwx',
        'logs': '------rwx',
        'backup': '------rwx',
        'account': 'rwxrwxrwx',
        'autoEvents': 'r--r--rwx',
        'positions': 'rw-rw-rwx',
        'homework': 'r--r-xr-x'
    };
    return permissionMap[pageName] || 'rwxrwxrwx';
}

function renderUserSelect() {
    const select = document.getElementById('userSelect');
    select.innerHTML = '<option value="">请选择账号...</option>';
    
    Object.values(window.appData.users).forEach(user => {
        if (user && user.username) {
            const option = document.createElement('option');
            option.value = user.username;
            option.textContent = `${user.display_name || user.username} (${user.role || 'user'})`;
            select.appendChild(option);
        }
    });
}

async function handleLogin() {
    const username = document.getElementById('userSelect').value;
    const password = document.getElementById('password').value;
    
    if (!username) {
        alert('请选择账号');
        return;
    }
    
    const user = window.appData.users[username];
    if (!user) {
        alert('用户不存在');
        return;
    }
    
    if (user.password === null) {
        window.currentUser = { ...user, username };
        showSetPasswordModal(user);
        return;
    }
    
    const isValid = await window.utils.verifyPassword(password, user.password);
    if (!isValid) {
        alert('密码错误');
        return;
    }
    
    if (window.utils.isPasswordLegacy(user.password)) {
        user.password = await window.utils.createPasswordHash(password);
        if (window.saveAllDataToCloud) window.saveAllDataToCloud().catch(e => console.warn('保存失败', e));
        console.log(`用户 ${username} 的密码已自动升级为哈希格式`);
    }
    
    window.currentUser = { ...user, username };
    window.currentPage = 'login';
    
    window.utils.addViewLog('登录', `用户 ${username} 登录`);
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'block';
    
    document.getElementById('userAvatar').textContent = window.currentUser.avatar || '👤';
    document.getElementById('userDisplayName').textContent = window.currentUser.display_name || username;
    const roleNames = { user: '👤 学生', admin: '🔧 管理员', root: '⚡ 超级管理员' };
    document.getElementById('userRole').textContent = roleNames[window.currentUser.role] || '学生';
    
    const fridayBadge = document.getElementById('fridayBadge');
    fridayBadge.innerHTML = window.utils.isFridayAfternoon() ? '🎉 现在是周五下午，可以抽奖啦！' : '⏰ 抽奖时间：周五下午12:00后';
    
    renderSidebar();
    if (window.dashboard) window.dashboard.showDashboard();
}

async function showSetPasswordModal(user) {
    window.modal.show('首次登录，请设置密码', `
        <div style="margin: 20px 0;">
            <label>新密码：</label>
            <input type="password" id="newPwd" class="password-input" style="width: 100%;">
            <label>确认密码：</label>
            <input type="password" id="confirmPwd" class="password-input" style="width: 100%;">
        </div>
    `, [
        { text: '跳过', onclick: 'closeModalAndEnter()' },
        { text: '确认', onclick: 'handleSetPassword()', className: 'btn-primary' }
    ]);
}

async function closeModalAndEnter() {
    window.modal.close();
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'block';
    document.getElementById('userAvatar').textContent = window.currentUser.avatar || '👤';
    document.getElementById('userDisplayName').textContent = window.currentUser.display_name || window.currentUser.username;
    const roleNames = { user: '👤 学生', admin: '🔧 管理员', root: '⚡ 超级管理员' };
    document.getElementById('userRole').textContent = roleNames[window.currentUser.role] || '学生';
    renderSidebar();
    if (window.dashboard) window.dashboard.showDashboard();
}

async function handleSetPassword() {
    const newPwd = document.getElementById('newPwd').value;
    const confirmPwd = document.getElementById('confirmPwd').value;
    
    if (!newPwd) {
        alert('请输入密码');
        return;
    }
    if (newPwd !== confirmPwd) {
        alert('两次输入的密码不一致');
        return;
    }
    if (newPwd.length < 4) {
        alert('密码长度不能少于4位');
        return;
    }
    
    const hashed = await window.utils.createPasswordHash(newPwd);
    window.currentUser.password = hashed;
    window.appData.users[window.currentUser.username].password = hashed;
    if (window.saveAllDataToCloud) window.saveAllDataToCloud().catch(e => console.warn('保存失败', e));
    
    window.modal.close();
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'block';
    document.getElementById('userAvatar').textContent = window.currentUser.avatar || '👤';
    document.getElementById('userDisplayName').textContent = window.currentUser.display_name || window.currentUser.username;
    const roleNames = { user: '👤 学生', admin: '🔧 管理员', root: '⚡ 超级管理员' };
    document.getElementById('userRole').textContent = roleNames[window.currentUser.role] || '学生';
    renderSidebar();
    if (window.dashboard) window.dashboard.showDashboard();
    
    window.utils.addViewLog('设置密码', `用户 ${window.currentUser.username} 首次设置密码`);
}

function renderSidebar() {
    const menuItems = [
        { id: 'dashboard', icon: '🏠', name: '控制台', permission: null, page: 'dashboard' },
        { id: 'myScore', icon: '📊', name: '我的分数', permission: '我的分数', page: 'myScore' },
        { id: 'score', icon: '📊', name: '分数管理', permission: '分数管理', page: 'score' },
        { id: 'group', icon: '👥', name: '分组管理', permission: '分组管理', page: 'group' },
        { id: 'ranking', icon: '🏆', name: '排名管理', permission: '排名管理', page: 'rank' },
        { id: 'dailyReport', icon: '📋', name: '每日汇报', permission: '每日汇报', page: 'dailyReport' },
        { id: 'gold', icon: '💰', name: '金币系统', permission: '金币系统', page: 'gold' },
        { id: 'logs', icon: '📋', name: '操作日志', permission: '操作日志', page: 'logs' },
        { id: 'backup', icon: '💾', name: '数据备份', permission: '数据备份', page: 'backup' },
        { id: 'autoEvents', icon: '⚡', name: '自动事件', permission: null, page: 'autoEvents' },
        { id: 'account', icon: '👤', name: '账号管理', permission: null, page: 'account' },
        { id: 'positions', icon: '👔', name: '职位系统', permission: null, page: 'positions' },
        { id: 'homework', icon: '📚', name: '作业提交', permission: null, page: 'homework' },
        { id: 'logout', icon: '🚪', name: '退出系统', permission: null, page: 'logout' }
    ];
    
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = '';
    
    menuItems.forEach(item => {
        if (item.permission && !hasPermission(item.permission)) return;
        
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.innerHTML = `${item.icon} ${item.name}`;
        div.onclick = () => {
            if (item.id === 'logout') {
                if (confirm('确定要退出系统吗？')) {
                    window.utils.addViewLog('退出', `用户 ${window.currentUser.username} 退出`);
                    window.currentUser = null;
                    window.currentPage = 'unknown';
                    document.getElementById('loginScreen').style.display = 'block';
                    document.getElementById('mainScreen').style.display = 'none';
                    document.getElementById('password').value = '';
                }
                return;
            }
            
            document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');
            
            window.currentPage = item.page;
            window.utils.addViewLog('切换页面', `进入 ${item.name}`);
            
            switch(item.page) {
                case 'dashboard': if (window.dashboard) window.dashboard.showDashboard(); break;
                case 'myScore': if (window.myScore) window.myScore.showMyScore(); break;
                case 'score': if (window.score) window.score.showScoreManagement(); break;
                case 'group': if (window.group) window.group.showGroupManagement(); break;
                case 'rank': if (window.rank) window.rank.showRanking(); break;
                case 'dailyReport': if (window.dailyReport) window.dailyReport.showDailyReport(); break;
                case 'gold': if (window.gold) window.gold.showGoldSystem(); break;
                case 'logs': if (window.logs) window.logs.showLogs(); break;
                case 'backup': if (window.backup) window.backup.showBackup(); break;
                case 'autoEvents': if (window.autoEvents) window.autoEvents.showAutoEvents(); break;
                case 'account': if (window.account) window.account.showAccountManagement(); break;
                case 'positions': if (window.positions) window.positions.showPositions(); break;
                case 'homework': if (window.homework) window.homework.showHomework(); break;
            }
        };
        sidebar.appendChild(div);
    });
}

window.auth = {
    hasPermission,
    getPagePermissionString,
    renderUserSelect,
    handleLogin,
    renderSidebar
};

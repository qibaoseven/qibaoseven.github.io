// ==================== 当前用户 ====================
window.currentUser = null;
window.currentPage = 'unknown';

// ==================== 权限检查 ====================
function hasPermission(permission) {
    if (!window.currentUser) return false;
    const role = window.currentUser.role;
    
    const permissions = {
        user: ['我的分数', '排名管理', '学分抽奖', '惩罚管理', '金币系统', '职位系统'],
        admin: ['分数管理', '分组管理', '排名管理', '数据备份', '学分抽奖', '惩罚管理', '金币系统', '我的分数', '每日汇报', '云端同步', '操作日志', '职位系统'],
        root: ['分数管理', '分组管理', '排名管理', '操作日志', '数据备份', '学分抽奖', '惩罚管理', '金币系统', '我的分数', '每日汇报', '云端同步', '职位系统']
    };
    
    return permissions[role]?.includes(permission) || false;
}

// ==================== 获取页面权限字符串 ====================
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
        'cloudSync': '------rwx',
        'backup': '------rwx',
        'account': 'rwxrwxrwx',
        'autoEvents': 'r--r--rwx',
        'positions': 'rw-rw-rwx'
    };
    
    return permissionMap[pageName] || 'rwxrwxrwx';
}

// ==================== 渲染用户选择 ====================
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

// ==================== 处理登录 ====================
function handleLogin() {
    const username = document.getElementById('userSelect').value;
    const password = document.getElementById('password').value;
    
    if (!username) {
        alert('请选择账号');
        return;
    }
    
    const user = window.appData.users[username];
    if (!user || user.password !== password) {
        alert('密码错误');
        return;
    }
    
    window.currentUser = { ...user, username };
    window.currentPage = 'login';
    
    // 记录登录行为
    window.utils.addViewLog('登录', `用户 ${username} 登录`);
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'block';
    
    document.getElementById('userAvatar').textContent = window.currentUser.avatar || '👤';
    document.getElementById('userDisplayName').textContent = window.currentUser.display_name || username;
    const roleNames = { user: '👤 学生', admin: '🔧 管理员', root: '⚡ 超级管理员' };
    document.getElementById('userRole').textContent = roleNames[window.currentUser.role] || '学生';
    
    const fridayBadge = document.getElementById('fridayBadge');
    fridayBadge.innerHTML = window.utils.isFridayAfternoon() ? 
        '🎉 现在是周五下午，可以抽奖啦！' : 
        '⏰ 抽奖时间：周五下午12:00后';
    
    renderSidebar();
    window.dashboard?.showDashboard();
}

// ==================== 渲染侧边栏 ====================
function renderSidebar() {
    const menuItems = [
        { id: 'dashboard', icon: '🏠', name: '控制台', permission: null, page: 'dashboard' },
        { id: 'myScore', icon: '📊', name: '我的分数', permission: '我的分数', page: 'myScore' },
        { id: 'score', icon: '📊', name: '分数管理', permission: '分数管理', page: 'score' },
        { id: 'group', icon: '👥', name: '分组管理', permission: '分组管理', page: 'group' },
        { id: 'ranking', icon: '🏆', name: '排名管理', permission: '排名管理', page: 'rank' },
        { id: 'dailyReport', icon: '📋', name: '每日汇报', permission: '每日汇报', page: 'dailyReport' },
        { id: 'gacha', icon: '🎰', name: '学分抽奖', permission: '学分抽奖', page: 'gacha' },
        { id: 'punishment', icon: '🎯', name: '惩罚管理', permission: '惩罚管理', page: 'punishment' },
        { id: 'gold', icon: '💰', name: '金币系统', permission: '金币系统', page: 'gold' },
        { id: 'logs', icon: '📋', name: '操作日志', permission: '操作日志', page: 'logs' },
        { id: 'cloudSync', icon: '☁️', name: '云端同步', permission: '云端同步', page: 'cloudSync' },
        { id: 'backup', icon: '💾', name: '数据备份', permission: '数据备份', page: 'backup' },
        { id: 'autoEvents', icon: '⚡', name: '自动事件', permission: null, page: 'autoEvents' },
        { id: 'account', icon: '👤', name: '账号管理', permission: null, page: 'account' },
        { id: 'positions', icon: '👔', name: '职位系统', permission: null, page: 'positions' },
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
                case 'dashboard': window.dashboard?.showDashboard(); break;
                case 'myScore': window.myScore?.showMyScore(); break;
                case 'score': window.score?.showScoreManagement(); break;
                case 'group': window.group?.showGroupManagement(); break;
                case 'rank': window.rank?.showRanking(); break;
                case 'dailyReport': window.dailyReport?.showDailyReport(); break;
                case 'gacha': window.gacha?.showGacha(); break;
                case 'punishment': window.punishment?.showPunishment(); break;
                case 'gold': window.gold?.showGoldSystem(); break;
                case 'logs': window.logs?.showLogs(); break;
                case 'cloudSync': window.cloudSync?.showCloudSync(); break;
                case 'backup': window.backup?.showBackup(); break;
                case 'autoEvents': window.autoEvents?.showAutoEvents(); break;
                case 'account': window.account?.showAccountManagement(); break;
                case 'positions': window.positions?.showPositions(); break;
            }
        };
        sidebar.appendChild(div);
    });
}

// ==================== 导出 ====================
window.auth = {
    hasPermission,
    getPagePermissionString,
    renderUserSelect,
    handleLogin,
    renderSidebar
};
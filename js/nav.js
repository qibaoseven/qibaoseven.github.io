// ========================================
// OpenStu v0.46
// Author: github@qibaoseven, bilibili@七宝-Seven
// ========================================
// 手机端导航：汉堡按钮 + 全屏抽屉菜单
// ========================================
// 行为
//   · <=720px：顶栏只显示左上角「三横」按钮，侧边栏默认隐藏
//   · 点按钮 -> 侧边栏铺满整屏覆盖页面，按钮变成 X
//   · 点任意菜单项 / 遮罩 / 再次点 X / 按 Esc -> 收起
//   · 选中菜单项后自动收起，并把内容滚回顶部
//   · >720px：侧边栏常驻，按钮隐藏，不做任何干预
// ========================================

const MOBILE_BREAKPOINT = 720;

function navIsMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

function navGetEls() {
    return {
        toggle: document.getElementById('menuToggle'),
        sidebar: document.getElementById('sidebar'),
        overlay: document.getElementById('sidebarOverlay')
    };
}

function navIsOpen() {
    const { sidebar } = navGetEls();
    return !!(sidebar && sidebar.classList.contains('open'));
}

function navOpen() {
    const { toggle, sidebar, overlay } = navGetEls();
    if (!sidebar) return;
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('open');
    if (toggle) {
        toggle.classList.add('active');
        toggle.setAttribute('aria-expanded', 'true');
    }
    document.body.classList.add('menu-open');
}

function navClose() {
    const { toggle, sidebar, overlay } = navGetEls();
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    if (toggle && toggle.classList.contains('active')) {
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
    }
    document.body.classList.remove('menu-open');
}

function navToggle() {
    if (navIsOpen()) navClose(); else navOpen();
}

// 菜单项被点击后收起（由 auth.js 的点击处理调用）
function navAfterSelect() {
    if (navIsMobile()) {
        navClose();
        // 切页后回到顶部，避免停在上一个页面的滚动位置
        const area = document.getElementById('contentArea');
        if (area) area.scrollTop = 0;
        window.scrollTo(0, 0);
    }
}

function navBind() {
    const { toggle, overlay } = navGetEls();

    if (toggle && !toggle.dataset.bound) {
        toggle.addEventListener('click', navToggle);
        toggle.dataset.bound = '1';
    }

    if (overlay && !overlay.dataset.bound) {
        overlay.addEventListener('click', navClose);
        overlay.dataset.bound = '1';
    }

    if (!document.body.dataset.navBound) {
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && navIsOpen()) navClose();
        });

        // 窗口变宽时自动收起，避免残留的 open 状态影响桌面布局
        window.addEventListener('resize', () => {
            if (!navIsMobile() && navIsOpen()) navClose();
        });

        document.body.dataset.navBound = '1';
    }
}

document.addEventListener('DOMContentLoaded', navBind);
// index.html 的脚本顺序里本文件可能晚于 DOMContentLoaded，补一次
if (document.readyState !== 'loading') navBind();

window.nav = {
    open: navOpen,
    close: navClose,
    toggle: navToggle,
    isOpen: navIsOpen,
    afterSelect: navAfterSelect
};

// ==================== 模态框组件 ====================

// 显示模态框
function showModal(title, body, buttons) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = body;
    
    const buttonsDiv = document.getElementById('modalButtons');
    buttonsDiv.innerHTML = '';
    
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = `btn ${btn.className || ''}`;
        button.textContent = btn.text;
        button.onclick = new Function(btn.onclick);
        buttonsDiv.appendChild(button);
    });
    
    document.getElementById('modal').classList.add('active');
}

// 关闭模态框
function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#ff9f4e' : type === 'error' ? '#ff4e4e' : '#ff6b4a'};
        color: white;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(255, 78, 78, 0.3);
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// 导出到全局
window.modal = {
    show: showModal,
    close: closeModal,
    notify: showNotification
};
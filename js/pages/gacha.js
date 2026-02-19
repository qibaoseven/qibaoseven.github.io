// ==================== 学分抽奖页面 ====================

function showGacha() {
    if (!window.auth.hasPermission('学分抽奖')) {
        alert('权限不足');
        return;
    }
    
    const studentId = window.currentUser.student_id;
    const gold = window.utils.getStudentGold(studentId);
    const score = window.utils.getStudentScore(studentId);
    
    // 安全地处理奖励数据
    const rewards = window.appData.rewards || {};
    
    // 生成奖励预览HTML
    let rewardsHtml = '';
    Object.entries(rewards).forEach(([rarity, rewardList]) => {
        if (Array.isArray(rewardList)) {
            rewardList.slice(0, 2).forEach(reward => {
                rewardsHtml += `
                    <div class="reward-card reward-rarity-${rarity}">
                        <div class="reward-name">${reward.name || ''}</div>
                        <div class="reward-type">${reward.type || ''}</div>
                        <div class="reward-desc">${reward.description || ''}</div>
                        <div class="reward-prob">${reward.probability || 0}%</div>
                    </div>
                `;
            });
        }
    });
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">🎰 学分抽奖</h2>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${gold}</div>
                    <div class="stat-label">我的金币</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${score}</div>
                    <div class="stat-label">我的学分</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">160</div>
                    <div class="stat-label">单抽价格</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">1600</div>
                    <div class="stat-label">十连价格</div>
                </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
                ${window.utils.isFridayAfternoon() 
                    ? `<div style="background: #fff6f0; padding: 15px; border-radius: 10px; border-left: 3px solid #ff9f4e; color: #ff6b4a;">
                        🎉 现在是周五下午，可以抽奖啦！
                       </div>`
                    : `<div style="background: #ffe4d6; padding: 15px; border-radius: 10px; color: #ff4e4e;">
                        ⏰ 抽奖只在周五下午12:00后开放
                       </div>`
                }
            </div>
            
            <div class="btn-grid">
                <button class="btn btn-primary" style="font-size: 1.2em; padding: 20px;" onclick="window.gacha.handleSingleGacha()" ${!window.utils.isFridayAfternoon() ? 'disabled' : ''}>
                    🎯 单次抽奖 (160金币)
                </button>
                <button class="btn btn-primary" style="font-size: 1.2em; padding: 20px;" onclick="window.gacha.handleMultiGacha()" ${!window.utils.isFridayAfternoon() ? 'disabled' : ''}>
                    🎊 十连抽奖 (1600金币)
                </button>
            </div>
            
            <div class="btn-grid" style="margin-top: 10px;">
                <button class="btn" onclick="window.gacha.showGachaHistory()">📋 抽奖记录</button>
                <button class="btn" onclick="window.gacha.showRewardPool()">🎁 奖励预览</button>
            </div>
            
            <div style="margin-top: 30px;">
                <h3 style="color: #ff4e4e;">📋 奖励预览</h3>
                <div class="reward-grid">
                    ${rewardsHtml}
                </div>
            </div>
        </div>
    `;
}

function showGachaHistory() {
    const studentId = window.currentUser.student_id;
    const logs = (window.appData.logs || []).filter(log => 
        log.student_id === studentId && 
        (log.action === '抽奖消耗' || log.action === '十连抽消耗')
    );
    
    window.modal.show('抽奖记录', `
        <div style="max-height: 400px; overflow-y: auto;">
            ${logs.map(log => `
                <div style="padding: 15px; margin: 10px 0; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff4e4e;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #ff6b4a;">📅 ${log.timestamp}</span>
                        <span style="color: #ff4e4e;">${log.score_change}金币</span>
                    </div>
                    <div style="margin-top: 5px; color: #ff8f4e;">${log.action}: ${log.reason || ''}</div>
                </div>
            `).join('')}
            ${logs.length === 0 ? '<p style="color: #ff8f4e;">暂无抽奖记录</p>' : ''}
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showRewardPool() {
    const rewards = window.appData.rewards || {};
    
    let rewardsHtml = '';
    Object.entries(rewards).forEach(([rarity, rewardList]) => {
        if (rarity !== 'hidden_rewards' && Array.isArray(rewardList)) {
            rewardsHtml += `<h4 style="margin-top: 15px; color: #ff4e4e;">${rarity} 稀有度</h4>`;
            rewardList.forEach(reward => {
                rewardsHtml += `
                    <div style="padding: 10px; margin: 5px 0; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff9f4e;">
                        <strong style="color: #ff6b4a;">${reward.name}</strong> <span style="color: #ff8f4e;">(${reward.probability}%)</span>
                        <p style="color: #ff8f4e; margin-top: 5px;">${reward.description}</p>
                    </div>
                `;
            });
        }
    });
    
    // 添加隐藏奖励
    if (rewards.hidden_rewards && Array.isArray(rewards.hidden_rewards)) {
        rewardsHtml += `<h4 style="margin-top: 20px; color: #ff4e4e;">🎁 隐藏奖励</h4>`;
        rewards.hidden_rewards.forEach(reward => {
            rewardsHtml += `
                <div style="padding: 10px; margin: 5px 0; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ffb84e;">
                    <strong style="color: #ff6b4a;">${reward.name}</strong> <span style="color: #ff8f4e;">(${reward.probability}%)</span>
                    <p style="color: #ff8f4e; margin-top: 5px;">${reward.description}</p>
                </div>
            `;
        });
    }
    
    window.modal.show('完整奖励列表', `
        <div style="max-height: 400px; overflow-y: auto;">
            ${rewardsHtml || '<p style="color: #ff8f4e;">暂无奖励数据</p>'}
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function handleSingleGacha() {
    const studentId = window.currentUser.student_id;
    const gold = window.utils.getStudentGold(studentId);
    
    if (gold < 160) {
        alert('金币不足！');
        return;
    }
    
    if (!confirm(`消耗160金币进行单次抽奖，确定吗？`)) return;
    
    window.utils.updateStudentGold(studentId, -160);
    
    const reward = window.utils.drawReward();
    
    if (reward.name.includes('+')) {
        const scoreMatch = reward.name.match(/(\d+)/);
        if (scoreMatch) {
            const score = parseInt(scoreMatch[0]);
            window.utils.updateStudentScore(studentId, score, `抽奖获得: ${reward.name}`);
        }
    }
    
    window.utils.addLog('抽奖消耗', studentId, -160, window.utils.getStudentGold(studentId), `获得: ${reward.name}`);
    
    window.modal.show('抽奖结果', `
        <div style="text-align: center; padding: 20px;">
            <div class="reward-card reward-rarity-${reward.rarity}" style="margin: 0 auto; max-width: 300px;">
                <div class="reward-name">${reward.name}</div>
                <div class="reward-type">${reward.type}</div>
                <div class="reward-desc">${reward.description}</div>
            </div>
            <p style="margin-top: 20px; color: #ff6b4a;">消耗金币: 160</p>
            <p style="color: #ff4e4e;">剩余金币: ${window.utils.getStudentGold(studentId)}</p>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close(); window.gacha.showGacha();' }
    ]);
}

function handleMultiGacha() {
    const studentId = window.currentUser.student_id;
    const gold = window.utils.getStudentGold(studentId);
    
    if (gold < 1600) {
        alert('金币不足！');
        return;
    }
    
    if (!confirm(`消耗1600金币进行十连抽，确定吗？`)) return;
    
    window.utils.updateStudentGold(studentId, -1600);
    
    const rewards = [];
    for (let i = 0; i < 10; i++) {
        rewards.push(window.utils.drawReward());
    }
    
    const stats = {};
    rewards.forEach(r => {
        stats[r.rarity] = (stats[r.rarity] || 0) + 1;
        
        if (r.name.includes('+')) {
            const scoreMatch = r.name.match(/(\d+)/);
            if (scoreMatch) {
                const score = parseInt(scoreMatch[0]);
                window.utils.updateStudentScore(studentId, score, `十连抽获得: ${r.name}`);
            }
        }
    });
    
    window.utils.addLog('十连抽消耗', studentId, -1600, window.utils.getStudentGold(studentId), `获得${rewards.length}个奖励`);
    
    window.modal.show('十连抽结果', `
        <div style="padding: 20px;">
            <h4 style="color: #ff4e4e; margin-bottom: 15px;">📊 稀有度统计</h4>
            ${Object.entries(stats).map(([rarity, count]) => `
                <p style="color: #ff6b4a;">${rarity}: ${count}个</p>
            `).join('')}
            
            <h4 style="margin: 20px 0 15px; color: #ff4e4e;">🎁 详细奖励</h4>
            <div style="max-height: 300px; overflow-y: auto;">
                ${rewards.map((r, i) => `
                    <div style="padding: 10px; margin: 5px 0; background: #fff6f0; border-left: 3px solid #ff9f4e; border-radius: 8px;">
                        <span style="color: #ff6b4a;">${i+1}. ${r.name}</span> - <span style="color: #ff8f4e;">${r.description}</span>
                    </div>
                `).join('')}
            </div>
            
            <p style="margin-top: 20px; color: #ff6b4a;">消耗金币: 1600</p>
            <p style="color: #ff4e4e;">剩余金币: ${window.utils.getStudentGold(studentId)}</p>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close(); window.gacha.showGacha();' }
    ]);
}

// 导出到全局
window.gacha = {
    showGacha,
    showGachaHistory,
    showRewardPool,
    handleSingleGacha,
    handleMultiGacha
};
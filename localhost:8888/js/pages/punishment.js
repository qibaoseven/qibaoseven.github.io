// ==================== 惩罚管理页面 ====================

function showPunishment() {
    if (!window.auth.hasPermission('惩罚管理')) {
        alert('权限不足');
        return;
    }
    
    const studentId = window.currentUser.student_id;
    const score = window.utils.getStudentScore(studentId);
    const activePuns = (window.appData.userPunishments?.active?.[studentId]) || [];
    const completedPuns = (window.appData.userPunishments?.completed?.[studentId]) || [];
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">🎯 惩罚管理</h2>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${score}</div>
                    <div class="stat-label">当前分数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${activePuns.length}</div>
                    <div class="stat-label">进行中</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${completedPuns.length}</div>
                    <div class="stat-label">已完成</div>
                </div>
            </div>
            
            ${score < 100 
                ? `<div style="background: #fff6f0; padding: 15px; border-radius: 10px; margin-bottom: 20px; border-left: 3px solid #ff9f4e; color: #ff6b4a;">
                    🎯 你的分数低于100分，可以抽取惩罚！
                   </div>`
                : `<div style="background: #ffe4d6; padding: 15px; border-radius: 10px; margin-bottom: 20px; color: #ff4e4e;">
                    ⚠️ 只有分数低于100分才能抽取惩罚
                   </div>`
            }
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.punishment.handleDrawPunishment()" ${score >= 100 ? 'disabled' : ''}>
                    🎲 抽取惩罚
                </button>
                <button class="btn btn-primary" onclick="window.punishment.showMyPunishments()">
                    📋 我的惩罚
                </button>
                <button class="btn btn-primary" onclick="window.punishment.showCompletePunishment()">
                    ✅ 完成惩罚
                </button>
                <button class="btn btn-primary" onclick="window.punishment.showPunishmentPool()">
                    📚 惩罚池
                </button>
            </div>
            
            ${activePuns.length > 0 ? `
                <h3 style="margin-top: 30px; color: #ff4e4e;">📋 进行中的惩罚</h3>
                ${activePuns.map(pun => {
                    const deadline = new Date(pun.deadline);
                    const now = new Date();
                    const timeLeft = deadline - now;
                    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    
                    return `
                        <div style="padding: 15px; margin: 10px 0; background: #fff6f0; border-radius: 10px; border-left: 3px solid #ff4e4e;">
                            <div style="display: flex; justify-content: space-between;">
                                <strong style="color: #ff6b4a;">${pun.name || ''}</strong>
                                <span class="reward-rarity-${pun.rarity}" style="padding: 2px 8px; border-radius: 12px; color: white;">${pun.rarity || ''}</span>
                            </div>
                            <p style="margin: 10px 0; color: #ff8f4e;">${pun.description || ''}</p>
                            <p style="color: #ff6b4a;">⏰ 剩余时间: ${days > 0 ? days + '天' : ''} ${hours}小时</p>
                            <p style="color: ${pun.success_gold > 0 ? '#ff9f4e' : '#ff4e4e'};">✅ 成功: +${pun.success_gold || 0}金币 | ❌ 失败: ${pun.fail_gold || 0}金币</p>
                        </div>
                    `;
                }).join('')}
            ` : ''}
        </div>
    `;
}

function showPunishmentPool() {
    const punishments = window.appData.punishments || {};
    
    window.modal.show('惩罚池', `
        <div style="max-height: 400px; overflow-y: auto;">
            ${Object.entries(punishments).map(([rarity, list]) => `
                <h4 style="margin-top: 15px; color: #ff4e4e;">${rarity} 稀有度</h4>
                ${list.map(pun => `
                    <div style="padding: 10px; margin: 5px 0; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff9f4e;">
                        <strong style="color: #ff6b4a;">${pun.name}</strong> <span style="color: #ff8f4e;">(概率: ${pun.probability}%)</span>
                        <p style="color: #ff8f4e; margin-top: 5px;">${pun.description}</p>
                        <p style="color: #ff6b4a;">⏰ 时限: ${pun.time[0]} | 任务时长: ${pun.time[1]}</p>
                        <p style="color: ${pun.score[0] > 0 ? '#ff9f4e' : '#ff4e4e'};">💰 成功: +${pun.score[0] * 10}金币 | 失败: ${pun.score[1] * 10}金币</p>
                    </div>
                `).join('')}
            `).join('')}
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function handleDrawPunishment() {
    const studentId = window.currentUser.student_id;
    const score = window.utils.getStudentScore(studentId);
    
    if (score >= 100) {
        alert('分数需低于100分才能抽取惩罚');
        return;
    }
    
    const pool = [];
    Object.entries(window.appData.punishments || {}).forEach(([rarity, list]) => {
        (list || []).forEach(pun => {
            for (let i = 0; i < (pun.probability || 1); i++) {
                pool.push({ ...pun, rarity });
            }
        });
    });
    
    if (pool.length === 0) {
        alert('暂无可用惩罚');
        return;
    }
    
    const punishment = pool[Math.floor(Math.random() * pool.length)];
    
    const deadline = new Date();
    if (punishment.time && punishment.time[0] && punishment.time[0].endsWith('d')) {
        const days = parseInt(punishment.time[0]);
        deadline.setDate(deadline.getDate() + days);
    } else {
        deadline.setHours(deadline.getHours() + 1);
    }
    
    const newPun = {
        id: Date.now().toString(),
        name: punishment.name || '',
        description: punishment.description || '',
        rarity: punishment.rarity || 'N',
        time_limit: punishment.time?.[0] || '',
        task_duration: punishment.time?.[1] || '',
        success_gold: (punishment.score?.[0] || 0) * 10,
        fail_gold: (punishment.score?.[1] || 0) * 10,
        deadline: deadline.toISOString(),
        draw_time: new Date().toISOString(),
        status: 'active'
    };
    
    if (!window.appData.userPunishments) window.appData.userPunishments = { active: {}, completed: {} };
    if (!window.appData.userPunishments.active[studentId]) {
        window.appData.userPunishments.active[studentId] = [];
    }
    window.appData.userPunishments.active[studentId].push(newPun);
    window.dataManager.saveData('userPunishments');
    
    window.utils.addLog('抽取惩罚', studentId, 0, score, `抽到: ${punishment.name}`);
    
    window.modal.show('抽取结果', `
        <div style="text-align: center;">
            <h3 style="color: #ff4e4e; margin-bottom: 20px;">🎯 抽到惩罚!</h3>
            
            <div class="reward-card reward-rarity-${punishment.rarity}" style="padding: 20px; border-radius: 10px;">
                <div style="font-size: 1.3em; margin-bottom: 10px;">${punishment.name || ''}</div>
                <div>${punishment.description || ''}</div>
            </div>
            
            <div style="margin: 20px 0; text-align: left;">
                <p style="color: #ff6b4a;">⏰ 完成时限: ${punishment.time?.[0] || ''}</p>
                <p style="color: #ff6b4a;">⏱️ 任务时长: ${punishment.time?.[1] || ''}</p>
                <p style="color: #ff9f4e;">💰 成功奖励: +${(punishment.score?.[0] || 0) * 10}金币</p>
                <p style="color: #ff4e4e;">💰 失败惩罚: ${(punishment.score?.[1] || 0) * 10}金币</p>
            </div>
            
            <p style="color: #ff8f4e;">惩罚已添加到您的任务列表！</p>
        </div>
    `, [
        { text: '确定', onclick: 'window.modal.close(); window.punishment.showPunishment();' }
    ]);
}

function showMyPunishments() {
    const studentId = window.currentUser.student_id;
    const active = (window.appData.userPunishments?.active?.[studentId]) || [];
    const completed = (window.appData.userPunishments?.completed?.[studentId]) || [];
    
    window.modal.show('我的惩罚', `
        <div style="max-height: 400px; overflow-y: auto;">
            <h4 style="color: #ff4e4e;">📋 进行中的惩罚 (${active.length})</h4>
            ${active.map(pun => `
                <div style="padding: 10px; margin: 10px 0; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff4e4e;">
                    <strong style="color: #ff6b4a;">${pun.name || ''}</strong> 
                    <span class="reward-rarity-${pun.rarity}" style="padding: 2px 8px; border-radius: 12px; color: white;">${pun.rarity || ''}</span>
                    <p style="font-size: 0.9em; color: #ff8f4e;">${pun.description || ''}</p>
                    <p style="color: #ff6b4a;">截止: ${new Date(pun.deadline).toLocaleString()}</p>
                </div>
            `).join('') || '<p style="color: #ff8f4e;">暂无进行中的惩罚</p>'}
            
            <h4 style="margin-top: 20px; color: #ff4e4e;">✅ 已完成的惩罚 (${completed.length})</h4>
            ${completed.map(pun => `
                <div style="padding: 10px; margin: 10px 0; background: #fff6f0; border-radius: 8px; border-left: 3px solid #ff9f4e;">
                    <strong style="color: #ff6b4a;">${pun.name || ''}</strong>
                    <p style="color: #ff8f4e;">完成时间: ${pun.completion_time ? new Date(pun.completion_time).toLocaleString() : ''}</p>
                    <p style="color: #ff9f4e;">结果: ${pun.result || ''} | 获得: ${pun.final_gold || 0}金币</p>
                </div>
            `).join('') || '<p style="color: #ff8f4e;">暂无完成的惩罚</p>'}
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

function showCompletePunishment() {
    const studentId = window.currentUser.student_id;
    const active = (window.appData.userPunishments?.active?.[studentId]) || [];
    
    if (active.length === 0) {
        alert('没有进行中的惩罚');
        return;
    }
    
    const students = Object.entries(window.appData.scores || {})
        .filter(([id]) => id !== studentId && id !== '0')
        .map(([id, [name]]) => `${id} - ${name}`);
    
    if (students.length === 0) {
        alert('没有可用的见证人');
        return;
    }
    
    window.modal.show('完成惩罚', `
        <div style="margin: 20px 0;">
            <label style="color: #ff6b4a;">选择惩罚：</label>
            <select id="completePunSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${active.map(pun => `
                    <option value="${pun.id}">${pun.name || ''} (截止: ${new Date(pun.deadline).toLocaleDateString()})</option>
                `).join('')}
            </select>
            
            <label style="color: #ff6b4a;">选择见证人：</label>
            <select id="witnessSelect" style="width: 100%; padding: 10px; margin: 10px 0; border: 2px solid #ffd1b8; border-radius: 8px;">
                ${students.map(s => `<option value="${s.split(' - ')[0]}">${s}</option>`).join('')}
            </select>
            
            <label style="color: #ff6b4a;">完成结果：</label>
            <div style="margin: 10px 0;">
                <label style="color: #ff9f4e;"><input type="radio" name="punResult" value="success" checked> 成功完成</label>
                <label style="margin-left: 20px; color: #ff4e4e;"><input type="radio" name="punResult" value="fail"> 未能完成</label>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认完成', onclick: 'window.punishment.handleCompletePunishment()', className: 'btn-primary' }
    ]);
}

function handleCompletePunishment() {
    const studentId = window.currentUser.student_id;
    const punId = document.getElementById('completePunSelect').value;
    const witnessId = document.getElementById('witnessSelect').value;
    const result = document.querySelector('input[name="punResult"]:checked').value;
    
    const active = window.appData.userPunishments.active[studentId] || [];
    const punIndex = active.findIndex(p => p.id === punId);
    
    if (punIndex === -1) return;
    
    const pun = active[punIndex];
    const finalGold = result === 'success' ? pun.success_gold : pun.fail_gold;
    
    window.utils.updateStudentGold(studentId, finalGold);
    
    pun.status = 'completed';
    pun.completion_time = new Date().toISOString();
    pun.result = result === 'success' ? '成功完成' : '未能完成';
    pun.final_gold = finalGold;
    pun.witness = window.appData.scores[witnessId]?.[0] || '未知';
    pun.witness_id = witnessId;
    
    if (!window.appData.userPunishments.completed[studentId]) {
        window.appData.userPunishments.completed[studentId] = [];
    }
    window.appData.userPunishments.completed[studentId].push(pun);
    
    active.splice(punIndex, 1);
    window.appData.userPunishments.active[studentId] = active;
    
    window.dataManager.saveData('userPunishments');
    window.utils.addLog('完成惩罚', studentId, 0, window.utils.getStudentScore(studentId), `惩罚: ${pun.name}, 结果: ${result}, 金币: ${finalGold}`);
    
    alert(`惩罚完成！获得 ${finalGold} 金币`);
    window.modal.close();
    showPunishment();
}

// 导出到全局
window.punishment = {
    showPunishment,
    showPunishmentPool,
    handleDrawPunishment,
    showMyPunishments,
    showCompletePunishment,
    handleCompletePunishment
};
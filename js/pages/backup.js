// ==================== 数据备份页面 ====================

function showBackup() {
    if (!window.auth.hasPermission('数据备份')) {
        alert('权限不足');
        return;
    }
    
    // 计算本地存储大小
    let totalSize = 0;
    Object.values(window.dataManager.STORAGE_KEYS).forEach(key => {
        const item = localStorage.getItem(key);
        if (item) totalSize += item.length;
    });
    
    document.getElementById('contentArea').innerHTML = `
        <div class="content-card">
            <h2 class="card-title">💾 数据备份</h2>
            
            <div class="btn-grid">
                <button class="btn btn-primary" onclick="window.backup.exportData()">📤 导出数据</button>
                <button class="btn btn-primary" onclick="window.backup.importData()">📂 导入单个文件</button>
                <button class="btn btn-success" onclick="window.backup.showImportFolder()">📁 导入文件夹</button>
                <button class="btn btn-danger" onclick="window.backup.resetToDefault()">🔄 恢复默认</button>
                <button class="btn btn-primary" onclick="window.backup.syncToExcel()">📊 同步到Excel</button>
            </div>
            
            <div class="stats-grid" style="margin-top: 30px;">
                <div class="stat-card">
                    <div class="stat-value">${(totalSize / 1024).toFixed(2)}</div>
                    <div class="stat-label">本地缓存 (KB)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${Object.keys(window.appData.users).length}</div>
                    <div class="stat-label">用户数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${Object.keys(window.appData.scores).length}</div>
                    <div class="stat-label">学生数</div>
                </div>
            </div>
            
            <div style="margin-top: 30px;">
                <h3 style="color: #ff4e4e;">📋 数据文件映射</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>文件名</th>
                            <th>数据键</th>
                            <th>说明</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>user.json</td><td>users</td><td>用户数据</td></tr>
                        <tr><td>score.json</td><td>scores</td><td>分数数据</td></tr>
                        <tr><td>gold_data.json</td><td>gold</td><td>金币数据</td></tr>
                        <tr><td>rewards.json</td><td>rewards</td><td>奖励数据</td></tr>
                        <tr><td>punishment.json</td><td>punishments</td><td>惩罚数据</td></tr>
                        <tr><td>usr_pun.json</td><td>userPunishments</td><td>用户惩罚数据</td></tr>
                        <tr><td>log.json</td><td>logs</td><td>操作日志</td></tr>
                        <tr><td>score_rules.json</td><td>rules</td><td>积分规则</td></tr>
                        <tr><td>exchange_rate.json</td><td>exchangeRate</td><td>汇率数据</td></tr>
                        <tr><td>emoji.json</td><td>emoji</td><td>表情数据</td></tr>
                        <tr><td>daily_report.json</td><td>dailyReport</td><td>每日汇报</td></tr>
                        <tr><td>daily_check.json</td><td>dailyCheck</td><td>每日检查</td></tr>
                        <tr><td>auto_events.json</td><td>autoEvents</td><td>自动事件</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function syncToExcel() {
    window.modal.show('Excel同步', `
        <div style="padding: 20px; text-align: center;">
            <p style="color: #ff6b4a;">Excel同步功能需要与后端配合使用</p>
            <p style="color: #ff8f4e;">当前版本支持JSON数据导出</p>
            <div style="margin-top: 20px;">
                <button class="btn btn-primary" onclick="window.backup.exportData()">📤 导出JSON</button>
            </div>
        </div>
    `, [
        { text: '关闭', onclick: 'window.modal.close()' }
    ]);
}

// ==================== 导出数据 ====================
function exportData() {
    try {
        // 构建完整的导出数据
        const exportData = {};
        
        // 遍历所有存储键，导出对应的数据
        Object.keys(window.dataManager.STORAGE_KEYS).forEach(key => {
            const dataKey = key.toLowerCase();
            if (window.appData[dataKey] !== undefined) {
                exportData[key] = window.appData[dataKey];
            }
        });
        
        // 添加元数据
        exportData.METADATA = {
            exportTime: new Date().toISOString(),
            version: '1.0',
            user: window.currentUser?.username || 'unknown',
            dataCount: Object.keys(exportData).length
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 生成文件名：studentos_backup_2026-03-07_14-30-25.json
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        a.download = `studentos_backup_${dateStr}_${timeStr}.json`;
        
        a.click();
        URL.revokeObjectURL(url);
        
        window.utils.addLog('导出数据', 'system', 0, 0, `导出完整数据备份`);
        window.modal.notify('✅ 数据导出成功！', 'success');
    } catch (error) {
        console.error('导出失败:', error);
        alert('❌ 导出失败：' + error.message);
    }
}

// ==================== 导入单个文件 ====================
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const imported = JSON.parse(e.target.result);
                let count = 0;
                let errors = [];
                
                // 遍历导入的数据
                Object.entries(imported).forEach(([key, value]) => {
                    // 跳过元数据
                    if (key === 'METADATA') return;
                    
                    const dataKey = key.toLowerCase();
                    const storageKey = window.dataManager.STORAGE_KEYS[key];
                    
                    if (storageKey && window.appData[dataKey] !== undefined) {
                        try {
                            // 特殊处理某些数据类型
                            if (dataKey === 'logs' && Array.isArray(value)) {
                                // 合并日志，保留最新的200条
                                const allLogs = [...value, ...window.appData.logs];
                                allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                                window.appData.logs = allLogs.slice(0, 200);
                            } else if (dataKey === 'userPunishments') {
                                // 合并惩罚数据
                                if (!window.appData.userPunishments) {
                                    window.appData.userPunishments = { active: {}, completed: {} };
                                }
                                
                                if (value.active) {
                                    Object.entries(value.active).forEach(([userId, puns]) => {
                                        if (!window.appData.userPunishments.active[userId]) {
                                            window.appData.userPunishments.active[userId] = [];
                                        }
                                        window.appData.userPunishments.active[userId] = [
                                            ...window.appData.userPunishments.active[userId],
                                            ...puns
                                        ];
                                    });
                                }
                                
                                if (value.completed) {
                                    Object.entries(value.completed).forEach(([userId, puns]) => {
                                        if (!window.appData.userPunishments.completed[userId]) {
                                            window.appData.userPunishments.completed[userId] = [];
                                        }
                                        window.appData.userPunishments.completed[userId] = [
                                            ...window.appData.userPunishments.completed[userId],
                                            ...puns
                                        ];
                                    });
                                }
                            } else if (typeof value === 'object' && value !== null) {
                                // 合并对象
                                window.appData[dataKey] = {
                                    ...window.appData[dataKey],
                                    ...value
                                };
                            } else {
                                // 直接覆盖
                                window.appData[dataKey] = value;
                            }
                            
                            // 保存到localStorage
                            localStorage.setItem(storageKey, JSON.stringify(window.appData[dataKey]));
                            count++;
                        } catch (err) {
                            errors.push(`${key}: ${err.message}`);
                        }
                    }
                });
                
                // 如果有导入的元数据，显示导入信息
                let metadataMsg = '';
                if (imported.METADATA) {
                    metadataMsg = `\n\n导出时间: ${imported.METADATA.exportTime}\n导出者: ${imported.METADATA.user}`;
                }
                
                if (errors.length > 0) {
                    alert(`⚠️ 部分导入成功\n✅ 成功: ${count} 个\n❌ 失败: ${errors.length} 个\n${errors.join('\n')}${metadataMsg}`);
                } else {
                    alert(`✅ 成功导入 ${count} 个数据文件${metadataMsg}`);
                }
                
                // 上传到云端
                window.dataManager.saveToCloud().then(() => {
                    window.modal.notify('✅ 数据已同步到云端', 'success');
                }).catch(e => console.warn('云端同步失败', e));
                
                // 刷新当前页面显示
                if (window.currentUser) {
                    window.dashboard.showDashboard();
                }
                
            } catch (err) {
                alert('❌ 导入失败：无效的数据文件\n' + err.message);
            }
        };
        
        reader.readAsText(file);
    };
    input.click();
}

// ==================== 文件夹导入（显示详细失败原因）====================

function showImportFolder() {
    window.modal.show('导入文件夹', `
        <div style="padding: 20px;">
            <div class="info-box">
                <strong style="color: #ff4e4e;">📁 文件夹导入说明：</strong><br>
                • 选择包含JSON数据文件的文件夹<br>
                • 系统会<strong>根据文件内容自动识别</strong>数据类型<br>
                • 支持的文件：emoji.json, score_rules.json 等<br>
                • 导入后会合并到现有数据中，并自动上传到云端<br>
                • <strong>不会刷新页面</strong>，可以继续操作
            </div>
            
            <div class="folder-input-container" style="margin: 20px 0;">
                <input type="file" id="folderInput" webkitdirectory directory multiple style="display: none;">
                <label for="folderInput" class="folder-label" id="folderLabel">
                    📂 点击选择文件夹<br>
                    <span class="small">支持批量导入多个JSON文件</span>
                </label>
            </div>
            
            <div id="importPreview" style="display: none; margin-top: 20px;">
                <h4 style="color: #ff4e4e;">📋 文件列表</h4>
                <div id="fileList" class="file-list"></div>
                
                <div style="margin-top: 20px;">
                    <label style="color: #ff6b4a;">
                        <input type="checkbox" id="confirmImport"> 我确认要导入这些数据
                    </label>
                </div>
            </div>
            
            <div id="importResult" style="margin-top: 20px;"></div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '开始导入', onclick: 'window.backup.handleFolderImport()', className: 'btn-success' }
    ]);
    
    // 监听文件夹选择
    document.getElementById('folderInput').onchange = function(e) {
        window.backup.previewFolderFiles(e.target.files);
    };
}

function previewFolderFiles(files) {
    const fileList = document.getElementById('fileList');
    const importPreview = document.getElementById('importPreview');
    
    if (!fileList || !importPreview) return;
    
    const jsonFiles = Array.from(files).filter(f => f.name.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
        fileList.innerHTML = '<p style="color: #ff4e4e;">❌ 未找到JSON文件</p>';
        return;
    }
    
    fileList.innerHTML = '<p style="color: #ff8f4e;">⏳ 正在分析文件内容...</p>';
    
    // 异步分析每个文件的内容
    Promise.all(jsonFiles.map(file => analyzeJSONFile(file))).then(results => {
        let html = '';
        let matchedCount = 0;
        let failedCount = 0;
        
        results.forEach(result => {
            if (result.matched) {
                matchedCount++;
                html += `
                    <div class="file-item" style="display: flex; justify-content: space-between; padding: 8px; background: rgba(255, 159, 78, 0.1); border-left: 3px solid #ff9f4e; margin-bottom: 5px;">
                        <span style="color: #ff6b4a;">📄 ${result.fileName}</span>
                        <span style="color: #ff9f4e;">✅ ${result.dataKey} (${result.detail || '匹配成功'})</span>
                    </div>
                `;
            } else {
                failedCount++;
                let reason = result.reason || '未知原因';
                if (result.error) reason = result.error;
                
                html += `
                    <div class="file-item" style="display: flex; flex-direction: column; padding: 8px; background: rgba(255, 78, 78, 0.1); border-left: 3px solid #ff4e4e; margin-bottom: 5px;">
                        <div style="display: flex; justify-content: space-between; width: 100%;">
                            <span style="color: #ff6b4a;">📄 ${result.fileName}</span>
                            <span style="color: #ff4e4e;">❌ 匹配失败</span>
                        </div>
                        <div style="margin-top: 5px; font-size: 0.9em; color: #ff8f4e; background: rgba(255, 255, 255, 0.5); padding: 5px; border-radius: 4px;">
                            ⚠️ 原因：${reason}
                        </div>
                    </div>
                `;
            }
        });
        
        // 添加统计信息
        html = `
            <div style="margin-bottom: 15px; padding: 10px; background: #fff6f0; border-radius: 8px;">
                <p style="color: #ff6b4a; margin: 0;">
                    📊 统计：总共 ${results.length} 个文件，✅ 成功匹配 ${matchedCount} 个，❌ 失败 ${failedCount} 个
                </p>
            </div>
            ${html}
        `;
        
        fileList.innerHTML = html;
        importPreview.style.display = 'block';
        
        // 保存文件列表供后续使用
        window.backup.selectedFiles = jsonFiles;
        window.backup.fileAnalysis = results;
    });
}

// 分析JSON文件内容，返回详细原因
async function analyzeJSONFile(file) {
    try {
        const content = await readFileAsText(file);
        let jsonData;
        
        try {
            jsonData = JSON.parse(content);
        } catch (parseError) {
            return {
                fileName: file.name,
                matched: false,
                dataKey: null,
                detail: 'JSON解析失败',
                reason: `不是有效的JSON格式：${parseError.message}`,
                error: parseError.message
            };
        }
        
        const fileName = file.name.toLowerCase();
        
        console.log(`分析文件: ${file.name}`, jsonData);
        
        // 专门针对 emoji.json 的检测
        if (fileName.includes('emoji')) {
            // 检查是否是 emoji 数据
            if (jsonData.emojis) {
                if (typeof jsonData.emojis === 'string') {
                    return {
                        fileName: file.name,
                        matched: true,
                        dataKey: 'emoji',
                        detail: '表情数据 (emojis字段)',
                        data: jsonData
                    };
                } else {
                    return {
                        fileName: file.name,
                        matched: false,
                        dataKey: null,
                        detail: 'emoji格式错误',
                        reason: 'emojis字段存在，但值不是字符串类型',
                        data: jsonData
                    };
                }
            }
            
            if (typeof jsonData === 'object' && Object.keys(jsonData).length === 1) {
                const value = Object.values(jsonData)[0];
                if (typeof value === 'string') {
                    return {
                        fileName: file.name,
                        matched: true,
                        dataKey: 'emoji',
                        detail: '表情数据 (单键字符串)',
                        data: jsonData
                    };
                } else {
                    return {
                        fileName: file.name,
                        matched: false,
                        dataKey: null,
                        detail: 'emoji格式错误',
                        reason: '文件只有一个键，但值不是字符串类型',
                        data: jsonData
                    };
                }
            }
            
            // 如果文件名包含emoji但内容不匹配
            return {
                fileName: file.name,
                matched: false,
                dataKey: null,
                detail: '不是有效的emoji文件',
                reason: '文件内容格式不符：需要包含emojis字段或为单键字符串对象',
                data: jsonData
            };
        }
        
        // 专门针对 score_rules.json 的检测
        if (fileName.includes('score_rules') || fileName.includes('score-rule') || fileName.includes('rules')) {
            
            // 检查是否有 score_rules 字段
            if (jsonData.score_rules) {
                if (typeof jsonData.score_rules === 'object') {
                    // 验证是否是有效的规则数据
                    const rules = jsonData.score_rules;
                    const hasValidRule = Object.values(rules).some(v => 
                        v && typeof v === 'object' && (v.value !== undefined)
                    );
                    
                    if (hasValidRule) {
                        return {
                            fileName: file.name,
                            matched: true,
                            dataKey: 'rules',
                            detail: '积分规则 (score_rules字段)',
                            data: jsonData.score_rules
                        };
                    } else {
                        return {
                            fileName: file.name,
                            matched: false,
                            dataKey: null,
                            detail: '规则格式错误',
                            reason: 'score_rules字段存在，但没有找到有效的规则数据（缺少value字段）',
                            data: jsonData
                        };
                    }
                } else {
                    return {
                        fileName: file.name,
                        matched: false,
                        dataKey: null,
                        detail: '规则格式错误',
                        reason: 'score_rules字段存在，但不是对象类型',
                        data: jsonData
                    };
                }
            }
            
            // 检查是否有 rules 字段
            if (jsonData.rules) {
                if (typeof jsonData.rules === 'object') {
                    const hasValidRule = Object.values(jsonData.rules).some(v => 
                        v && typeof v === 'object' && (v.value !== undefined)
                    );
                    
                    if (hasValidRule) {
                        return {
                            fileName: file.name,
                            matched: true,
                            dataKey: 'rules',
                            detail: '积分规则 (rules字段)',
                            data: jsonData.rules
                        };
                    } else {
                        return {
                            fileName: file.name,
                            matched: false,
                            dataKey: null,
                            detail: '规则格式错误',
                            reason: 'rules字段存在，但没有找到有效的规则数据（缺少value字段）',
                            data: jsonData
                        };
                    }
                } else {
                    return {
                        fileName: file.name,
                        matched: false,
                        dataKey: null,
                        detail: '规则格式错误',
                        reason: 'rules字段存在，但不是对象类型',
                        data: jsonData
                    };
                }
            }
            
            // 检查是否直接是规则对象
            if (typeof jsonData === 'object') {
                const hasRuleStructure = Object.values(jsonData).some(v => 
                    v && typeof v === 'object' && (v.value !== undefined || v.column !== undefined)
                );
                
                if (hasRuleStructure) {
                    return {
                        fileName: file.name,
                        matched: true,
                        dataKey: 'rules',
                        detail: '积分规则 (直接对象)',
                        data: jsonData
                    };
                } else {
                    // 检查是否有任何可能的规则结构
                    const sampleKeys = Object.keys(jsonData).slice(0, 3);
                    return {
                        fileName: file.name,
                        matched: false,
                        dataKey: null,
                        detail: '不是有效的规则文件',
                        reason: `文件内容不是规则格式：没有找到包含value或column字段的规则对象。示例键: ${sampleKeys.join(', ')}`,
                        data: jsonData
                    };
                }
            }
            
            return {
                fileName: file.name,
                matched: false,
                dataKey: null,
                detail: '不是有效的JSON对象',
                reason: '文件内容不是对象类型',
                data: jsonData
            };
        }
        
        // 通用检测：检查是否是完整的备份文件
        if (jsonData.METADATA) {
            const matchedKeys = [];
            for (const [key, storageKey] of Object.entries(window.dataManager.STORAGE_KEYS)) {
                if (jsonData[key] !== undefined) {
                    matchedKeys.push(key.toLowerCase());
                }
            }
            
            if (matchedKeys.length > 0) {
                return {
                    fileName: file.name,
                    matched: true,
                    dataKey: 'backup',
                    detail: `完整备份 (包含: ${matchedKeys.join(', ')})`,
                    data: jsonData
                };
            } else {
                return {
                    fileName: file.name,
                    matched: false,
                    dataKey: null,
                    detail: '备份文件格式错误',
                    reason: '文件包含METADATA字段，但没有找到任何有效的数据键',
                    data: jsonData
                };
            }
        }
        
        // 通用检测：检查是否是单个数据文件
        for (const [key, storageKey] of Object.entries(window.dataManager.STORAGE_KEYS)) {
            const dataKey = key.toLowerCase();
            
            if (jsonData[dataKey] !== undefined || jsonData[key] !== undefined) {
                return {
                    fileName: file.name,
                    matched: true,
                    dataKey: dataKey,
                    detail: `${dataKey} 数据文件`,
                    data: jsonData[dataKey] || jsonData[key] || jsonData
                };
            }
        }
        
        // 根据数据结构特征判断
        if (Array.isArray(jsonData)) {
            if (jsonData.length > 0) {
                const sample = jsonData[0];
                if (sample.timestamp && sample.action) {
                    return {
                        fileName: file.name,
                        matched: true,
                        dataKey: 'logs',
                        detail: '日志数据 (数组格式)',
                        data: jsonData
                    };
                } else {
                    return {
                        fileName: file.name,
                        matched: false,
                        dataKey: null,
                        detail: '未知数组格式',
                        reason: `数组第一个元素缺少timestamp或action字段。示例: ${JSON.stringify(sample).substring(0, 100)}`,
                        data: jsonData
                    };
                }
            } else {
                return {
                    fileName: file.name,
                    matched: false,
                    dataKey: null,
                    detail: '空数组',
                    reason: '文件是空数组，无法识别数据类型',
                    data: jsonData
                };
            }
        } else if (typeof jsonData === 'object') {
            // 检查是否是用户数据
            const hasPassword = Object.values(jsonData).some(v => v && v.password !== undefined);
            if (hasPassword) {
                return {
                    fileName: file.name,
                    matched: true,
                    dataKey: 'users',
                    detail: '用户数据',
                    data: jsonData
                };
            }
            
            // 检查是否是分数数据
            const hasScoreData = Object.values(jsonData).some(v => 
                (Array.isArray(v) && v.length === 2) || (v && v.score !== undefined)
            );
            if (hasScoreData) {
                return {
                    fileName: file.name,
                    matched: true,
                    dataKey: 'scores',
                    detail: '分数数据',
                    data: jsonData
                };
            }
            
            // 实在匹配不上，给出详细提示
            const keys = Object.keys(jsonData).slice(0, 5);
            const sampleValue = jsonData[keys[0]];
            let valueType = typeof sampleValue;
            if (Array.isArray(sampleValue)) valueType = 'array';
            
            return {
                fileName: file.name,
                matched: false,
                dataKey: null,
                detail: '无法识别的对象结构',
                reason: `未能匹配任何已知数据类型。前5个键: ${keys.join(', ')}。第一个值的类型: ${valueType}`,
                data: jsonData
            };
        }
        
        // 其他类型（字符串、数字等）
        return {
            fileName: file.name,
            matched: false,
            dataKey: null,
            detail: '不是对象或数组',
            reason: `文件内容是 ${typeof jsonData} 类型，不是预期的对象或数组`,
            data: jsonData
        };
        
    } catch (error) {
        return {
            fileName: file.name,
            matched: false,
            dataKey: null,
            detail: '读取失败',
            reason: `读取文件时出错: ${error.message}`,
            error: error.message
        };
    }
}

async function handleFolderImport() {
    const confirm = document.getElementById('confirmImport')?.checked;
    if (!confirm) {
        alert('请先确认导入操作');
        return;
    }
    
    if (!window.backup.selectedFiles || window.backup.selectedFiles.length === 0) {
        alert('请先选择文件夹');
        return;
    }
    
    const importResult = document.getElementById('importResult');
    importResult.innerHTML = '<div class="info-box">⏳ 正在导入数据...</div>';
    
    try {
        // 重新分析所有文件（确保最新）
        const analyses = await Promise.all(
            window.backup.selectedFiles.map(file => analyzeJSONFile(file))
        );
        
        const matchedFiles = analyses.filter(a => a.matched);
        const unmatchedFiles = analyses.filter(a => !a.matched);
        
        if (matchedFiles.length === 0) {
            // 显示详细的失败原因
            let failDetails = '';
            unmatchedFiles.forEach(f => {
                failDetails += `
                    <div style="margin: 10px 0; padding: 10px; background: #fff6f0; border-left: 3px solid #ff4e4e; border-radius: 4px;">
                        <p style="color: #ff6b4a; font-weight: bold;">📄 ${f.fileName}</p>
                        <p style="color: #ff4e4e;">❌ 失败原因：${f.reason || f.detail || '未知错误'}</p>
                        ${f.data ? `<p style="color: #ff8f4e; font-size: 0.9em;">📊 数据结构：${JSON.stringify(f.data).substring(0, 200)}${JSON.stringify(f.data).length > 200 ? '...' : ''}</p>` : ''}
                    </div>
                `;
            });
            
            importResult.innerHTML = `
                <div class="warning-box" style="max-height: 400px; overflow-y: auto;">
                    <h4 style="color: #ff4e4e; margin-bottom: 15px;">❌ 导入失败：没有可识别的文件</h4>
                    <p style="color: #ff6b4a; margin-bottom: 10px;">共分析 ${analyses.length} 个文件，全部匹配失败：</p>
                    ${failDetails}
                    <p style="color: #ff8f4e; margin-top: 15px;">💡 提示：请确保文件内容符合预期的格式（如 emoji.json 应有 emojis 字段，score_rules.json 应有 score_rules 字段）</p>
                </div>
            `;
            return;
        }
        
        // 按数据类型分组
        const dataGroups = {};
        matchedFiles.forEach(a => {
            if (!dataGroups[a.dataKey]) {
                dataGroups[a.dataKey] = [];
            }
            dataGroups[a.dataKey].push(a);
        });
        
        // 批量导入数据
        let successCount = 0;
        let failedItems = [];
        let importDetails = [];
        
        for (const [dataKey, files] of Object.entries(dataGroups)) {
            try {
                for (const file of files) {
                    const fileData = file.data;
                    
                    // 根据数据类型特殊处理
                    if (dataKey === 'emoji') {
                        if (fileData.emojis) {
                            window.appData.emoji = fileData.emojis;
                            importDetails.push(`✅ ${file.fileName}: 导入表情数据 (${fileData.emojis.length}个表情)`);
                        } else if (typeof fileData === 'object') {
                            const firstValue = Object.values(fileData)[0];
                            if (typeof firstValue === 'string') {
                                window.appData.emoji = firstValue;
                                importDetails.push(`✅ ${file.fileName}: 导入表情数据 (${firstValue.length}个表情)`);
                            }
                        }
                    } else if (dataKey === 'rules') {
                        let rulesData = fileData;
                        if (fileData.score_rules) rulesData = fileData.score_rules;
                        else if (fileData.rules) rulesData = fileData.rules;
                        
                        const ruleCount = Object.keys(rulesData).length;
                        window.appData.rules = {
                            ...window.appData.rules,
                            ...rulesData
                        };
                        importDetails.push(`✅ ${file.fileName}: 导入积分规则 (${ruleCount}条规则)`);
                    } else if (dataKey === 'backup') {
                        // 完整备份文件，遍历所有键
                        let backupCount = 0;
                        Object.entries(fileData).forEach(([key, value]) => {
                            if (key === 'METADATA') return;
                            
                            const innerDataKey = key.toLowerCase();
                            if (window.appData[innerDataKey] !== undefined) {
                                if (innerDataKey === 'logs' && Array.isArray(value)) {
                                    const allLogs = [...value, ...window.appData.logs];
                                    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                                    window.appData.logs = allLogs.slice(0, 200);
                                } else if (typeof value === 'object' && value !== null) {
                                    window.appData[innerDataKey] = {
                                        ...window.appData[innerDataKey],
                                        ...value
                                    };
                                } else {
                                    window.appData[innerDataKey] = value;
                                }
                                backupCount++;
                            }
                        });
                        importDetails.push(`✅ ${file.fileName}: 导入完整备份 (包含${backupCount}个数据项)`);
                    } else {
                        // 普通数据
                        const itemCount = Object.keys(fileData).length;
                        if (dataKey === 'logs' && Array.isArray(fileData)) {
                            const allLogs = [...fileData, ...window.appData.logs];
                            allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                            window.appData.logs = allLogs.slice(0, 200);
                            importDetails.push(`✅ ${file.fileName}: 导入日志数据 (${fileData.length}条日志)`);
                        } else if (typeof fileData === 'object' && fileData !== null) {
                            window.appData[dataKey] = {
                                ...window.appData[dataKey],
                                ...fileData
                            };
                            importDetails.push(`✅ ${file.fileName}: 导入${dataKey}数据 (${itemCount}个项目)`);
                        }
                    }
                    
                    // 保存到localStorage
                    const storageKey = window.dataManager.STORAGE_KEYS[dataKey.toUpperCase()];
                    if (storageKey && window.appData[dataKey] !== undefined) {
                        localStorage.setItem(storageKey, JSON.stringify(window.appData[dataKey]));
                    }
                    
                    successCount++;
                }
            } catch (error) {
                console.error(`导入 ${dataKey} 失败:`, error);
                failedItems.push(dataKey);
                importDetails.push(`❌ ${dataKey}: 导入失败 - ${error.message}`);
            }
        }
        
        // 显示导入结果
        let resultHtml = `
            <div class="success-box" style="max-height: 400px; overflow-y: auto;">
                <h4 style="color: #ff4e4e; margin-bottom: 15px;">✅ 导入完成</h4>
                <p style="color: #ff6b4a;">📊 统计信息：</p>
                <ul style="color: #ff8f4e; margin-left: 20px;">
                    <li>总文件数: ${analyses.length} 个</li>
                    <li>成功导入: ${successCount} 个</li>
                    <li>匹配失败: ${unmatchedFiles.length} 个</li>
                    <li>数据类型: ${Object.keys(dataGroups).length} 种</li>
                </ul>
                
                <div style="margin-top: 15px;">
                    <p style="color: #ff6b4a;">📋 导入详情：</p>
                    ${importDetails.map(d => `<p style="color: #ff8f4e; margin-left: 10px;">${d}</p>`).join('')}
                </div>
        `;
        
        // 显示未匹配的文件
        if (unmatchedFiles.length > 0) {
            resultHtml += `
                <div style="margin-top: 20px; padding: 10px; background: #fff6f0; border-radius: 8px;">
                    <p style="color: #ff4e4e; font-weight: bold;">⚠️ 以下文件未能导入：</p>
                    ${unmatchedFiles.map(f => `
                        <div style="margin: 10px 0; padding: 8px; background: white; border-left: 3px solid #ff4e4e; border-radius: 4px;">
                            <p style="color: #ff6b4a;">📄 ${f.fileName}</p>
                            <p style="color: #ff4e4e;">❌ 原因：${f.reason || f.detail || '未知错误'}</p>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        resultHtml += '</div>';
        importResult.innerHTML = resultHtml;
        
        // 上传到云端
        if (successCount > 0) {
            window.dataManager.saveToCloud().then(() => {
                window.modal.notify('✅ 数据已同步到云端', 'success');
            }).catch(e => console.warn('云端同步失败', e));
        }
        
    } catch (error) {
        console.error('导入失败:', error);
        importResult.innerHTML = `
            <div class="warning-box">
                <h4 style="color: #ff4e4e;">❌ 导入失败</h4>
                <p style="color: #ff6b4a;">错误信息：${error.message}</p>
                <p style="color: #ff8f4e; margin-top: 10px;">💡 请检查控制台查看详细错误</p>
            </div>
        `;
    }
}

// 辅助函数：读取文件内容
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e.target.error);
        reader.readAsText(file);
    });
}

function resetToDefault() {
    window.modal.show('恢复默认数据', `
        <div style="padding: 20px;">
            <div class="warning-box">
                ⚠️ 确定要恢复默认数据吗？当前所有数据将被覆盖！
            </div>
            <div style="margin-top: 20px;">
                <label style="color: #ff6b4a;">
                    <input type="checkbox" id="confirmReset"> 我确认要恢复默认数据
                </label>
            </div>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' },
        { text: '确认恢复', onclick: 'window.backup.handleResetToDefault()', className: 'btn-danger' }
    ]);
}

function handleResetToDefault() {
    const confirm = document.getElementById('confirmReset')?.checked;
    if (!confirm) {
        alert('请先确认恢复操作');
        return;
    }
    
    window.modal.show('需要云端数据', `
        <div style="padding: 20px;">
            <p style="color: #ff6b4a;">恢复默认数据需要从云端获取初始数据。</p>
            <p style="color: #ff8f4e;">请确保网络连接正常，然后点击下方按钮。</p>
            <button class="btn btn-primary" onclick="window.backup.loadDefaultFromCloud()">☁️ 从云端加载默认数据</button>
        </div>
    `, [
        { text: '取消', onclick: 'window.modal.close()' }
    ]);
}

async function loadDefaultFromCloud() {
    window.modal.close();
    
    const result = await window.dataManager.loadFromCloud();
    
    if (result.success) {
        alert('✅ 已从云端加载最新数据作为默认');
        window.modal.notify('数据加载成功！', 'success');
        // 不刷新页面，直接更新当前显示
        if (window.currentUser) {
            window.dashboard.showDashboard();
        }
    } else {
        alert('❌ 从云端加载失败：' + result.error);
    }
}

// 导出到全局
window.backup = {
    showBackup,
    syncToExcel,
    exportData,
    importData,
    resetToDefault,
    handleResetToDefault,
    loadDefaultFromCloud,
    showImportFolder,
    previewFolderFiles,
    handleFolderImport,
    selectedFiles: [],
    fileAnalysis: []
};

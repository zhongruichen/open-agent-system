(function () {
    const vscode = acquireVsCodeApi();

    // --- STATE ---
    let state = {
        models: [],
        roles: [],
        allTools: [],
        plan: [],
        // Advanced settings
        enableSmartScan: false,
        enableParallelExec: false,
        enableAutoMode: false,
        enablePersistence: false,
        enableLongTermMemory: false,
        enableAgentCollaboration: false,
        // UI state
        editingType: null, // 'model' or 'role'
        editingIndex: -1,
    };

    // --- DOM CACHE ---
    // A single object to hold all DOM references
    const dom = {
        overallGoal: document.getElementById('overall-goal'),
        planList: document.getElementById('plan-list'),
        executionLog: document.getElementById('execution-log'),
        finalArtifact: document.getElementById('final-artifact').querySelector('code'),
        planReviewContainer: document.getElementById('plan-review-container'),
        editablePlanList: document.getElementById('editable-plan-list'),
        // Settings
        modelsList: document.getElementById('models-list'),
        rolesList: document.getElementById('roles-list'),
        addModelBtn: document.getElementById('add-model-btn'),
        addRoleBtn: document.getElementById('add-role-btn'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        // Advanced Settings
        smartScanCheckbox: document.getElementById('setting-smart-scan'),
        parallelExecCheckbox: document.getElementById('setting-parallel-exec'),
        autoModeCheckbox: document.getElementById('setting-auto-mode'),
        persistenceCheckbox: document.getElementById('setting-persistence'),
        longTermMemoryCheckbox: document.getElementById('setting-long-term-memory'),
        agentCollaborationCheckbox: document.getElementById('setting-agent-collaboration'),
        // Modal
        editorModal: document.getElementById('editor-modal'),
        editorTitle: document.getElementById('editor-title'),
        modelEditorFields: document.getElementById('model-editor-fields'),
        roleEditorFields: document.getElementById('role-editor-fields'),
        saveEditorBtn: document.getElementById('save-editor-btn'),
        cancelEditorBtn: document.getElementById('cancel-editor-btn'),
        // Health Check
        healthCheckBtn: document.getElementById('health-check-btn'),
        healthCheckSpinner: document.getElementById('health-check-spinner'),
        healthCheckResults: document.getElementById('health-check-results'),
        // Workspace Status
        refreshStatusBtn: document.getElementById('refresh-status-btn'),
        fsStatus: document.getElementById('fs-status'),
        debuggerStatus: document.getElementById('debugger-status'),
        gitStatus: document.getElementById('git-status'),
    };

    // --- EVENT LISTENERS ---
    function bindEventListeners() {
        // Main View
        document.querySelector('.tabs').addEventListener('click', handleTabClick);
        dom.planList.addEventListener('click', handlePlanClick);
        dom.planReviewContainer.addEventListener('click', handlePlanReviewClick);
        // Settings
        dom.addModelBtn.addEventListener('click', () => openEditor('model'));
        dom.addRoleBtn.addEventListener('click', () => openEditor('role'));
        dom.modelsList.addEventListener('click', (e) => handleListClick(e, 'model'));
        dom.rolesList.addEventListener('click', (e) => handleListClick(e, 'role'));
        dom.saveSettingsBtn.addEventListener('click', saveAllSettings);
        dom.healthCheckBtn.addEventListener('click', runHealthCheck);
        dom.refreshStatusBtn.addEventListener('click', requestWorkspaceStatus);
        // Modal
        dom.saveEditorBtn.addEventListener('click', handleSaveEditor);
        dom.cancelEditorBtn.addEventListener('click', closeEditor);
    }

    // --- MESSAGE HANDLER ---
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'updateGoal': dom.overallGoal.textContent = message.text; break;
            case 'updatePlan':
                state.plan = message.plan;
                renderPlan();
                break;
            case 'showPlanForReview':
                state.plan = message.plan;
                showPlanForReview(message.plan);
                break;
            case 'log': logMessage(message.text); break;
            case 'showArtifact':
                dom.finalArtifact.textContent = message.artifact;
                break;
            case 'artifactStreamChunk':
                dom.finalArtifact.textContent += message.chunk;
                break;
            case 'highlightArtifact':
                 if (typeof hljs !== 'undefined') hljs.highlightElement(dom.finalArtifact);
                 break;
            case 'receiveSettings':
                state.models = message.settings.models || [];
                state.roles = message.settings.roles || [];
                state.allTools = message.allTools || [];
                state.enableSmartScan = message.settings.enableSmartScan || false;
                state.enableParallelExec = message.settings.enableParallelExec || false;
                state.enableAutoMode = message.settings.enableAutoMode || false;
                state.enablePersistence = message.settings.enablePersistence || false;
                state.enableLongTermMemory = message.settings.enableLongTermMemory || false;
                state.enableAgentCollaboration = message.settings.enableAgentCollaboration || false;
                renderAllSettings();
                break;
            case 'healthCheckResult':
                dom.healthCheckSpinner.style.display = 'none';
                dom.healthCheckResults.style.display = 'block';
                renderHealthCheckResults(message.results);
                break;
            case 'updateDebuggerState':
                state.debuggerState = message.state;
                // If workspace tab is active, re-render
                if (document.getElementById('workspace').classList.contains('active')) {
                    renderWorkspaceStatus(state.workspaceState || {});
                }
                break;
            case 'updateWorkspaceStatus':
                state.workspaceState = message.status;
                renderWorkspaceStatus(message.status);
                break;
        }
    });

    // --- RENDER FUNCTIONS ---
    function renderAllSettings() {
        renderModelsList();
        renderRolesList();
        renderAdvancedSettings();
    }

    function renderModelsList() {
        dom.modelsList.innerHTML = '';
        state.models.forEach((model, index) => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <span><strong>${model.name}</strong> (${model.modelName})</span>
                <div class="item-buttons">
                    <button data-action="edit" data-index="${index}">编辑</button>
                    <button data-action="delete" data-index="${index}">删除</button>
                </div>`;
            dom.modelsList.appendChild(item);
        });
    }

    function renderRolesList() {
        dom.rolesList.innerHTML = '';
        state.roles.forEach((role, index) => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <span><strong>${role.name}</strong> (Model: ${role.model || '未分配'})</span>
                <div class="item-buttons">
                    <button data-action="edit" data-index="${index}">编辑</button>
                    <button data-action="delete" data-index="${index}">删除</button>
                </div>`;
            dom.rolesList.appendChild(item);
        });
    }

    function renderAdvancedSettings() {
        dom.smartScanCheckbox.checked = state.enableSmartScan;
        dom.parallelExecCheckbox.checked = state.enableParallelExec;
        dom.autoModeCheckbox.checked = state.enableAutoMode;
        dom.persistenceCheckbox.checked = state.enablePersistence;
        dom.longTermMemoryCheckbox.checked = state.enableLongTermMemory;
        dom.agentCollaborationCheckbox.checked = state.enableAgentCollaboration;
    }

    // --- EDITOR MODAL LOGIC ---
    function openEditor(type, index = -1) {
        state.editingType = type;
        state.editingIndex = index;
        dom.editorModal.style.display = 'flex';

        if (type === 'model') {
            dom.roleEditorFields.style.display = 'none';
            dom.modelEditorFields.style.display = 'block';
            dom.editorTitle.textContent = index > -1 ? '编辑模型' : '添加新模型';
            const model = index > -1 ? state.models[index] : {};
            dom.modelEditorFields.innerHTML = `
                <label>名称: <input type="text" id="edit-model-name" value="${model.name || ''}" required></label>
                <label>供应商:
                    <select id="edit-model-provider">
                        <option ${model.provider === 'OpenAI' ? 'selected' : ''}>OpenAI</option>
                        <option ${model.provider === 'Anthropic' ? 'selected' : ''}>Anthropic</option>
                        <option ${model.provider === 'Google' ? 'selected' : ''}>Google</option>
                        <option ${model.provider === 'Custom' ? 'selected' : ''}>Custom</option>
                    </select>
                </label>
                <label>模型名称 (e.g., gpt-4-turbo): <input type="text" id="edit-model-modelName" value="${model.modelName || ''}" required></label>
                <label>API Key: <input type="password" id="edit-model-apiKey" value="${model.apiKey || ''}" required></label>
                <label>Base URL (可选): <input type="text" id="edit-model-baseUrl" value="${model.baseUrl || ''}"></label>
            `;
        } else if (type === 'role') {
            dom.modelEditorFields.style.display = 'none';
            dom.roleEditorFields.style.display = 'block';
            dom.editorTitle.textContent = index > -1 ? '编辑角色' : '添加新角色';
            const role = index > -1 ? state.roles[index] : { allowedTools: [] };
            const modelOptions = state.models.map(m => `<option value="${m.name}" ${role.model === m.name ? 'selected' : ''}>${m.name}</option>`).join('');
            const toolCheckboxes = state.allTools.map(tool => `
                <label><input type="checkbox" value="${tool}" ${role.allowedTools.includes(tool) ? 'checked' : ''}> ${tool}</label>
            `).join('');

            dom.roleEditorFields.innerHTML = `
                <label>角色名称: <input type="text" id="edit-role-name" value="${role.name || ''}" required></label>
                <label>分配模型: <select id="edit-role-model"><option value="">-- 选择模型 --</option>${modelOptions}</select></label>
                <label>系统提示: <textarea id="edit-role-systemPrompt" rows="8">${role.systemPrompt || ''}</textarea></label>
                <fieldset>
                    <legend>可用工具</legend>
                    <div class="checkbox-group">${toolCheckboxes}</div>
                </fieldset>
            `;
        }
    }

    function closeEditor() {
        dom.editorModal.style.display = 'none';
        state.editingType = null;
        state.editingIndex = -1;
    }

    function handleSaveEditor() {
        if (state.editingType === 'model') {
            const newModel = {
                name: document.getElementById('edit-model-name').value,
                provider: document.getElementById('edit-model-provider').value,
                modelName: document.getElementById('edit-model-modelName').value,
                apiKey: document.getElementById('edit-model-apiKey').value,
                baseUrl: document.getElementById('edit-model-baseUrl').value,
            };
            if (state.editingIndex > -1) {
                state.models[state.editingIndex] = newModel;
            } else {
                state.models.push(newModel);
            }
        } else if (state.editingType === 'role') {
            const allowedTools = Array.from(dom.roleEditorFields.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
            const newRole = {
                name: document.getElementById('edit-role-name').value,
                model: document.getElementById('edit-role-model').value,
                systemPrompt: document.getElementById('edit-role-systemPrompt').value,
                allowedTools: allowedTools,
            };
            if (state.editingIndex > -1) {
                state.roles[state.editingIndex] = newRole;
            } else {
                state.roles.push(newRole);
            }
        }
        renderAllSettings();
        closeEditor();
    }

    function handleListClick(e, type) {
        const action = e.target.dataset.action;
        const index = parseInt(e.target.dataset.index, 10);
        if (action === 'edit') {
            openEditor(type, index);
        } else if (action === 'delete') {
            if (confirm(`确定要删除这个${type === 'model' ? '模型' : '角色'}吗?`)) {
                if (type === 'model') {
                    state.models.splice(index, 1);
                } else {
                    state.roles.splice(index, 1);
                }
                renderAllSettings();
            }
        }
    }

    function saveAllSettings() {
        state.enableSmartScan = dom.smartScanCheckbox.checked;
        state.enableParallelExec = dom.parallelExecCheckbox.checked;
        state.enableAutoMode = dom.autoModeCheckbox.checked;
        state.enablePersistence = dom.persistenceCheckbox.checked;
        state.enableLongTermMemory = dom.longTermMemoryCheckbox.checked;
        state.enableAgentCollaboration = dom.agentCollaborationCheckbox.checked;

        vscode.postMessage({
            command: 'saveSettings',
            settings: {
                models: state.models,
                roles: state.roles,
                enableSmartScan: state.enableSmartScan,
                enableParallelExec: state.enableParallelExec,
                enableAutoMode: state.enableAutoMode,
                enablePersistence: state.enablePersistence,
                enableLongTermMemory: state.enableLongTermMemory,
                enableAgentCollaboration: state.enableAgentCollaboration,
            }
        });

        const btn = dom.saveSettingsBtn;
        const originalText = btn.textContent;
        btn.textContent = '已保存!';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    }

    function runHealthCheck() {
        dom.healthCheckSpinner.style.display = 'block';
        dom.healthCheckResults.style.display = 'none';
        dom.healthCheckResults.textContent = '';
        vscode.postMessage({ command: 'runHealthCheck' });
    }

    function renderHealthCheckResults(results) {
        const resultsContainer = dom.healthCheckResults;
        resultsContainer.innerHTML = ''; // Clear previous results

        const header = document.createElement('p');
        header.textContent = '配置健康检查报告:';
        resultsContainer.appendChild(header);

        results.errors.forEach(e => {
            const span = document.createElement('span');
            span.className = 'health-error';
            span.textContent = `[错误] ${e}`;
            resultsContainer.appendChild(span);
        });
        results.warnings.forEach(w => {
            const span = document.createElement('span');
            span.className = 'health-warning';
            span.textContent = `[警告] ${w}`;
            resultsContainer.appendChild(span);
        });
        results.success.forEach(s => {
            const span = document.createElement('span');
            span.className = 'health-success';
            span.textContent = `[成功] ${s}`;
            resultsContainer.appendChild(span);
        });

        if (results.errors.length === 0 && results.warnings.length === 0) {
            const allGood = document.createElement('span');
            allGood.className = 'health-success';
            allGood.style.marginTop = '1em';
            allGood.textContent = '所有检查通过，配置看起来很棒！';
            resultsContainer.appendChild(allGood);
        }
    }

    // --- Other handlers ---
    function handleTabClick(e) {
        if (e.target.matches('.tab-button')) {
            const tabName = e.target.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(tabName).classList.add('active');

            if (tabName === 'workspace') {
                requestWorkspaceStatus();
            }
        }
    }

    function requestWorkspaceStatus() {
        dom.fsStatus.textContent = '正在刷新...';
        dom.debuggerStatus.textContent = '正在刷新...';
        dom.gitStatus.textContent = '正在刷新...';
        vscode.postMessage({ command: 'getWorkspaceStatus' });
    }

    function renderWorkspaceStatus(status) {
        // Render FS Status
        dom.fsStatus.textContent = status.fileSystem ? status.fileSystem.join('\n') : '未能加载文件列表。';

        // Render Debugger Status
        let debugContent = '';
        if (state.debuggerState?.isActive) {
            debugContent += `<p><strong>状态:</strong> <span class="health-success">激活</span></p>`;
            debugContent += `<p><strong>会话:</strong> ${state.debuggerState.sessionName}</p>`;
        } else {
            debugContent += `<p><strong>状态:</strong> <span class="health-error">未激活</span></p>`;
        }
        debugContent += `<strong>断点:</strong>`;
        if (status.breakpoints && status.breakpoints.length > 0) {
            debugContent += `<ul>${status.breakpoints.map(bp => `<li>${bp}</li>`).join('')}</ul>`;
        } else {
            debugContent += `<p>无</p>`;
        }
        dom.debuggerStatus.innerHTML = debugContent;


        // Render Git Status
        let gitContent = '';
        if (status.git) {
            gitContent += `<p><strong>当前分支:</strong> ${status.git.branch}</p>`;
            gitContent += `<strong>文件状态:</strong>`;
            if (status.git.files && status.git.files.length > 0) {
                 gitContent += `<pre class="log-box">${status.git.files.join('\n')}</pre>`;
            } else {
                gitContent += `<p>工作区纯净</p>`;
            }
        } else {
            gitContent = '<p>未能加载Git状态。</p>';
        }
        dom.gitStatus.innerHTML = gitContent;
    }

    // (Plan-related functions from previous steps, unchanged)
    function renderPlan() { /* ... */ }
    function handlePlanClick(e) { /* ... */ }
    function showPlanForReview(plan) { /* ... */ }
    function handlePlanReviewClick(e) { /* ... */ }
    function logMessage(text) { /* ... */ }

    // --- STARTUP ---
    document.addEventListener('DOMContentLoaded', bindEventListeners);
}());

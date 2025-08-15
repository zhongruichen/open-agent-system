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
        // Modal
        editorModal: document.getElementById('editor-modal'),
        editorTitle: document.getElementById('editor-title'),
        modelEditorFields: document.getElementById('model-editor-fields'),
        roleEditorFields: document.getElementById('role-editor-fields'),
        saveEditorBtn: document.getElementById('save-editor-btn'),
        cancelEditorBtn: document.getElementById('cancel-editor-btn'),
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
                renderAllSettings();
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

        vscode.postMessage({
            command: 'saveSettings',
            settings: {
                models: state.models,
                roles: state.roles,
                enableSmartScan: state.enableSmartScan,
                enableParallelExec: state.enableParallelExec,
                enableAutoMode: state.enableAutoMode,
                enablePersistence: state.enablePersistence,
            }
        });

        const btn = dom.saveSettingsBtn;
        const originalText = btn.textContent;
        btn.textContent = '已保存!';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    }

    // --- Other handlers ---
    function handleTabClick(e) {
        if (e.target.matches('.tab-button')) {
            const tabName = e.target.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        }
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

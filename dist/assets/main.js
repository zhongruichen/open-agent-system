(function () {
    const vscode = acquireVsCodeApi();

    // --- STATE ---
    let state = {
        models: [],
        roleAssignments: {}
    };

    // --- DOM ELEMENTS ---
    // Status Tab
    const overallGoalEl = document.getElementById('overall-goal');
    const planListEl = document.getElementById('plan-list');
    const executionLogEl = document.getElementById('execution-log');
    const finalArtifactEl = document.getElementById('final-artifact').querySelector('code');

    // Settings Tab
    const modelsListEl = document.getElementById('models-list');
    const modelEditorEl = document.getElementById('model-editor');
    const modelForm = document.getElementById('model-form');
    const editorTitleEl = document.getElementById('editor-title');
    const roleAssignmentsEl = document.getElementById('role-assignments');

    // --- INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', () => {
        // Request initial data from the extension
        vscode.postMessage({ command: 'getSettings' });

        // --- EVENT LISTENERS ---
        // Tab switching
        document.querySelector('.tabs').addEventListener('click', (e) => {
            if (e.target.matches('.tab-button')) {
                const tabName = e.target.dataset.tab;
                document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(tabName).classList.add('active');
            }
        });

        // Settings panel buttons
        document.getElementById('add-model-btn').addEventListener('click', () => openModelEditor());
        document.getElementById('cancel-edit-btn').addEventListener('click', () => closeModelEditor());
        document.getElementById('save-settings-btn').addEventListener('click', saveAllSettings);
        modelForm.addEventListener('submit', handleModelFormSubmit);
        modelsListEl.addEventListener('click', handleModelsListClick);
    });

    // Handle messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            // Status Tab commands
            case 'updateGoal':
                overallGoalEl.textContent = message.text;
                break;
            case 'updatePlan':
                updatePlan(message.plan);
                break;
            case 'log':
                logMessage(message.text);
                break;
            case 'showArtifact':
                finalArtifactEl.textContent = message.artifact;
                break;
            // Settings Tab commands
            case 'receiveSettings':
                state.models = message.settings.models || [];
                state.roleAssignments = message.settings.roleAssignments || {};
                renderSettings();
                break;
        }
    });

    // --- STATUS TAB FUNCTIONS ---
    function updatePlan(plan) {
        planListEl.innerHTML = '';
        if (!plan) return;
        for (const task of plan) {
            const li = document.createElement('li');
            const icon = document.createElement('span');
            icon.className = `status-icon status-${task.status}`;
            li.appendChild(icon);
            li.appendChild(document.createTextNode(task.description.split('\n\n')[0]));
            planListEl.appendChild(li);
        }
    }

    function logMessage(text) {
        const p = document.createElement('p');
        p.textContent = text;
        executionLogEl.appendChild(p);
        executionLogEl.scrollTop = executionLogEl.scrollHeight;
    }

    // --- SETTINGS TAB FUNCTIONS ---
    function renderSettings() {
        renderModelsList();
        renderRoleAssignments();
    }

    function renderModelsList() {
        modelsListEl.innerHTML = '';
        state.models.forEach((model, index) => {
            const item = document.createElement('div');
            item.className = 'model-item';
            item.innerHTML = `
                <span><strong>${model.name}</strong> (${model.modelName})</span>
                <div class="model-buttons">
                    <button class="button" data-action="edit" data-index="${index}">编辑</button>
                    <button class="button" data-action="delete" data-index="${index}">删除</button>
                </div>
            `;
            modelsListEl.appendChild(item);
        });
    }

    function renderRoleAssignments() {
        roleAssignmentsEl.innerHTML = '';
        const roles = ['orchestrator', 'worker', 'synthesizer', 'critiqueAggregator', 'codebaseScanner'];
        const modelNames = state.models.map(m => m.name);

        roles.forEach(role => {
            const item = document.createElement('div');
            item.className = 'role-item';

            const select = document.createElement('select');
            select.id = `role-${role}`;
            select.innerHTML = `<option value="">-- 选择模型 --</option>` + modelNames.map(name => `<option value="${name}">${name}</option>`).join('');
            select.value = state.roleAssignments[role] || '';

            item.innerHTML = `<label for="role-${role}">${role}:</label>`;
            item.appendChild(select);
            roleAssignmentsEl.appendChild(item);
        });

        // Handle evaluationTeam separately as it's an array
        const evalTeamItem = document.createElement('div');
        evalTeamItem.className = 'role-item';
        const evalSelect = document.createElement('select');
        evalSelect.id = 'role-evaluationTeam';
        evalSelect.multiple = true;
        evalSelect.innerHTML = modelNames.map(name => `<option value="${name}">${name}</option>`).join('');
        (state.roleAssignments.evaluationTeam || []).forEach(assignedModel => {
            const option = evalSelect.querySelector(`option[value="${assignedModel}"]`);
            if (option) option.selected = true;
        });
        evalTeamItem.innerHTML = `<label for="role-evaluationTeam">evaluationTeam:</label>`;
        evalTeamItem.appendChild(evalSelect);
        roleAssignmentsEl.appendChild(evalTeamItem);
    }

    function openModelEditor(model = null, index = -1) {
        modelForm.reset();
        if (model) {
            editorTitleEl.textContent = '编辑模型';
            modelForm.querySelector('#model-id').value = index;
            modelForm.querySelector('#model-name').value = model.name;
            modelForm.querySelector('#model-provider').value = model.provider;
            modelForm.querySelector('#model-modelName').value = model.modelName;
            modelForm.querySelector('#model-apiKey').value = model.apiKey;
            modelForm.querySelector('#model-baseUrl').value = model.baseUrl || '';
        } else {
            editorTitleEl.textContent = '添加新模型';
            modelForm.querySelector('#model-id').value = '-1';
        }
        modelEditorEl.style.display = 'block';
    }

    function closeModelEditor() {
        modelEditorEl.style.display = 'none';
    }

    function handleModelFormSubmit(e) {
        e.preventDefault();
        const index = parseInt(modelForm.querySelector('#model-id').value, 10);
        const newModel = {
            name: modelForm.querySelector('#model-name').value,
            provider: modelForm.querySelector('#model-provider').value,
            modelName: modelForm.querySelector('#model-modelName').value,
            apiKey: modelForm.querySelector('#model-apiKey').value,
            baseUrl: modelForm.querySelector('#model-baseUrl').value,
        };

        if (index > -1) { // Update existing
            state.models[index] = newModel;
        } else { // Add new
            state.models.push(newModel);
        }
        renderSettings();
        closeModelEditor();
    }

    function handleModelsListClick(e) {
        if (e.target.matches('button')) {
            const action = e.target.dataset.action;
            const index = parseInt(e.target.dataset.index, 10);
            if (action === 'edit') {
                openModelEditor(state.models[index], index);
            } else if (action === 'delete') {
                state.models.splice(index, 1);
                renderSettings();
            }
        }
    }

    function saveAllSettings() {
        // Collect role assignments
        const newRoleAssignments = {};
        document.querySelectorAll('#role-assignments select').forEach(select => {
            const role = select.id.replace('role-', '');
            if(select.multiple) {
                newRoleAssignments[role] = Array.from(select.selectedOptions).map(opt => opt.value);
            } else {
                newRoleAssignments[role] = select.value;
            }
        });
        state.roleAssignments = newRoleAssignments;

        vscode.postMessage({
            command: 'saveSettings',
            settings: {
                models: state.models,
                roleAssignments: state.roleAssignments
            }
        });

        // Optionally, show feedback to the user
        const btn = document.getElementById('save-settings-btn');
        const originalText = btn.textContent;
        btn.textContent = '已保存!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }

}());

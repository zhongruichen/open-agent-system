(function () {
    const vscode = acquireVsCodeApi();

    // --- STATE ---
    let state = {
        models: [],
        roleAssignments: {},
        plan: [],
        enableSmartScan: false,
        enableParallelExec: false,
        enableAutoMode: false,
        enablePersistence: false,
    };

    // --- DOM ELEMENTS ---
    const overallGoalEl = document.getElementById('overall-goal');
    const planListEl = document.getElementById('plan-list');
    const executionLogEl = document.getElementById('execution-log');
    const finalArtifactEl = document.getElementById('final-artifact').querySelector('code');
    const planReviewContainer = document.getElementById('plan-review-container');
    const editablePlanListEl = document.getElementById('editable-plan-list');

    // Settings Tab Elements...
    // (omitted for brevity as they are not changed in this step)

    // --- INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', () => {
        vscode.postMessage({ command: 'getSettings' });

        // --- EVENT LISTENERS ---
        planListEl.addEventListener('click', handlePlanClick);
        planReviewContainer.addEventListener('click', handlePlanReviewClick);

        // Other listeners (tabs, settings buttons)...
        // (omitted for brevity)
        document.querySelector('.tabs').addEventListener('click', (e) => {
            if (e.target.matches('.tab-button')) {
                const tabName = e.target.dataset.tab;
                document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(tabName).classList.add('active');
            }
        });
        document.getElementById('save-settings-btn').addEventListener('click', saveAllSettings);
    });

    // --- MESSAGE HANDLER ---
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'updateGoal':
                overallGoalEl.textContent = message.text;
                break;
            case 'updatePlan':
                state.plan = message.plan;
                updatePlan(message.plan);
                break;
            case 'showPlanForReview':
                state.plan = message.plan;
                showPlanForReview(message.plan);
                break;
            case 'log':
                logMessage(message.text);
                break;
            case 'showArtifact':
                finalArtifactEl.textContent = message.artifact;
                // This is now used to clear the display or show the full final content for highlighting
                if (message.artifact && typeof hljs !== 'undefined') {
                    hljs.highlightElement(finalArtifactEl);
                }
                break;
            case 'artifactStreamChunk':
                finalArtifactEl.textContent += message.chunk;
                break;
            case 'highlightArtifact':
                if (typeof hljs !== 'undefined') {
                    hljs.highlightElement(finalArtifactEl);
                }
                break;
            case 'receiveSettings':
                // ... (settings logic is unchanged)
                break;
        }
    });

    // --- PLAN DISPLAY & EDITING ---
    function updatePlan(plan) {
        planListEl.innerHTML = '';
        if (!plan) return;
        plan.forEach(task => {
            const li = document.createElement('li');
            li.dataset.taskId = task.id;
            li.className = 'plan-item';
            const summary = document.createElement('div');
            summary.className = 'plan-item-summary';
            summary.innerHTML = `<span class="status-icon status-${task.status}"></span> ${task.description.split('\n\n')[0]}`;
            const details = document.createElement('div');
            details.className = 'plan-item-details';
            details.style.display = 'none';
            let detailsContent = '';
            if (task.status === 'completed' && task.result) {
                detailsContent = `<strong>Result:</strong><pre>${task.result}</pre>`;
            } else if (task.status === 'failed' && task.error) {
                detailsContent = `<strong>Error:</strong><pre>${task.error}</pre>`;
            }
            details.innerHTML = detailsContent;
            li.appendChild(summary);
            li.appendChild(details);
            planListEl.appendChild(li);
        });
    }

    function handlePlanClick(e) {
        const item = e.target.closest('.plan-item');
        if (!item) return;
        const details = item.querySelector('.plan-item-details');
        if (details) {
            details.style.display = details.style.display === 'block' ? 'none' : 'block';
        }
    }

    function showPlanForReview(plan) {
        planListEl.style.display = 'none';
        planReviewContainer.style.display = 'block';
        editablePlanListEl.innerHTML = '';

        plan.forEach((task, index) => {
            const stepEl = document.createElement('div');
            stepEl.className = 'editable-step';
            stepEl.innerHTML = `
                <label>步骤 ${index + 1} (依赖: [${task.dependencies.join(', ')}])</label>
                <textarea>${task.description}</textarea>
                <div class="step-buttons">
                    <button data-action="delete" data-index="${index}">删除</button>
                    <button data-action="add_below" data-index="${index}">在下方添加步骤</button>
                </div>
            `;
            editablePlanListEl.appendChild(stepEl);
        });
    }

    function handlePlanReviewClick(e) {
        const action = e.target.dataset.action;
        const index = parseInt(e.target.dataset.index, 10);

        if (action === 'delete') {
            // This is a simplification. A real implementation would need to update dependencies.
            e.target.closest('.editable-step').remove();
        } else if (action === 'add_below') {
            const newStepEl = document.createElement('div');
            newStepEl.className = 'editable-step';
            // Simplification: new steps have no dependencies.
            newStepEl.innerHTML = `
                <label>新步骤 (依赖: [])</label>
                <textarea></textarea>
                <div class="step-buttons">
                    <button data-action="delete">删除</button>
                    <button data-action="add_below">在下方添加步骤</button>
                </div>
            `;
            e.target.closest('.editable-step').after(newStepEl);
        } else if (e.target.id === 'approve-plan-btn') {
            const newPlan = [];
            document.querySelectorAll('#editable-plan-list .editable-step').forEach((stepEl, i) => {
                const description = stepEl.querySelector('textarea').value;
                // Simplification: dependencies are not made editable in this UI.
                // We just re-assign IDs and assume a simple linear dependency chain for now.
                newPlan.push({
                    id: i + 1,
                    description: description,
                    dependencies: i > 0 ? [i] : []
                });
            });
            vscode.postMessage({ command: 'planApproved', plan: newPlan });
            planReviewContainer.style.display = 'none';
            planListEl.style.display = 'block';
        } else if (e.target.id === 'cancel-plan-btn') {
            vscode.postMessage({ command: 'cancelTask' });
            planReviewContainer.style.display = 'none';
            planListEl.style.display = 'block';
        }
    }

    function logMessage(text) {
        const p = document.createElement('p');
        p.textContent = text;
        executionLogEl.appendChild(p);
        executionLogEl.scrollTop = executionLogEl.scrollHeight;
    }

    // Placeholder for settings functions from previous steps
    function saveAllSettings() { /* ... */ }
}());

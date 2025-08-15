(function () {
    const vscode = acquireVsCodeApi();

    const overallGoalEl = document.getElementById('overall-goal');
    const planListEl = document.getElementById('plan-list');
    const executionLogEl = document.getElementById('execution-log');
    const finalArtifactEl = document.getElementById('final-artifact').querySelector('code');

    // Handle messages from the extension
    window.addEventListener('message', event => {
        const message = event.data; // The JSON data sent from the extension

        switch (message.command) {
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
        }
    });

    function updatePlan(plan) {
        planListEl.innerHTML = ''; // Clear existing plan
        for (const task of plan) {
            const li = document.createElement('li');
            const icon = document.createElement('span');
            icon.className = `status-icon status-${task.status}`;
            li.appendChild(icon);
            li.appendChild(document.createTextNode(task.description));
            planListEl.appendChild(li);
        }
    }

    function logMessage(text) {
        const p = document.createElement('p');
        p.textContent = text;
        executionLogEl.appendChild(p);
        // Scroll to the bottom
        executionLogEl.scrollTop = executionLogEl.scrollHeight;
    }

}());

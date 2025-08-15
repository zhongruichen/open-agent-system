const vscode = require('vscode');
const fs = require('fs').promises;
const path = require('path');
const { getModelsForRole } = require('./config');
const logger = require('./logger');
const { executeTool } = require('./tools/toolRegistry');
const { TaskContext } = require('./agents/taskContext');
const { OrchestratorAgent } = require('./agents/orchestratorAgent');
const { WorkerAgent } = require('./agents/workerAgent');
const { SynthesizerAgent } = require('./agents/synthesizerAgent');
const { EvaluatorAgent } = require('./agents/evaluatorAgent');
const { CritiqueAggregationAgent } = require('./agents/critiqueAggregationAgent');
const { CodebaseScannerAgent } = require('./agents/codebaseScannerAgent');
const { ReflectorAgent } = require('./agents/reflectorAgent.js');
const { MainPanel } = require('./ui/mainPanel');

async function scanProject(scannerAgent, enableSmartScan) {
    const message = enableSmartScan ? '正在快速扫描项目结构...' : '正在深度扫描项目代码库...';
    MainPanel.update({ command: 'log', text: message });

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return "没有打开的工作区。";
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    let projectContext = "项目结构:\n";
    const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'out', '.vscode']);
    const ignoreExtensions = new Set(['.lock', '.svg', '.png', '.jpg', '.jpeg', '.gif']);

    async function walk(dir, indent = '') {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (ignoreDirs.has(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                projectContext += `${indent}- ${entry.name}/\n`;
                await walk(fullPath, indent + '  ');
            } else {
                if (ignoreExtensions.has(path.extname(entry.name))) continue;

                if (enableSmartScan) {
                    projectContext += `${indent}- ${entry.name}\n`;
                } else {
                    try {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const summary = await scannerAgent.executeTask(content);
                        projectContext += `${indent}- ${entry.name}: ${summary}\n`;
                    } catch (e) {
                        projectContext += `${indent}- ${entry.name}: (无法读取或总结文件)\n`;
                    }
                }
            }
        }
    }

    await walk(rootPath);
    MainPanel.update({ command: 'log', text: '项目扫描完成。' });
    return projectContext;
}


function activate(context) {

    const stateFilePath = path.join(context.globalStoragePath, 'activeTaskState.json');

    async function saveTaskState(taskContext) {
        try {
            const stateJson = JSON.stringify(taskContext, null, 2);
            await fs.mkdir(context.globalStoragePath, { recursive: true });
            await fs.writeFile(stateFilePath, stateJson, 'utf8');
        } catch (error) {
            console.error('Failed to save task state:', error);
            vscode.window.showErrorMessage('无法保存任务状态。');
        }
    }

    async function loadTaskState() {
        try {
            if (fs.existsSync(stateFilePath)) {
                const stateJson = await fs.readFile(stateFilePath, 'utf8');
                const state = JSON.parse(stateJson);
                // Re-hydrate the class instance
                const taskContext = new TaskContext(state.originalUserRequest);
                Object.assign(taskContext, state);
                return taskContext;
            }
        } catch (error) {
            console.error('Failed to load task state:', error);
            vscode.window.showErrorMessage('无法加载任务状态。');
        }
        return null;
    }

    async function clearTaskState() {
        try {
            if (fs.existsSync(stateFilePath)) {
                await fs.unlink(stateFilePath);
            }
        } catch (error) {
            console.error('Failed to clear task state:', error);
        }
    }

    const a_key = 'multiAgentHelper.hasBeenActivated';
    if (!context.globalState.get(a_key)) {
        vscode.window.showInformationMessage('欢迎使用多智能体助手！请在设置中配置您的AI模型以开始使用。');
        context.globalState.update(a_key, true);
    }

    let disposable = vscode.commands.registerCommand('multi-agent-helper.startTask', async () => {
        try {
            logger.createLogChannel();
            MainPanel.createOrShow(context.extensionPath);
            const config = vscode.workspace.getConfiguration('multiAgent');
            const enablePersistence = config.get('enablePersistence', false);

            let taskContext = null;

            if (enablePersistence) {
                const savedState = await loadTaskState();
                if (savedState) {
                    const choice = await vscode.window.showInformationMessage(
                        '检测到有未完成的任务。您想继续吗?',
                        { modal: true },
                        '继续上次任务',
                        '开始新任务'
                    );
                    if (choice === '继续上次任务') {
                        taskContext = savedState;
                        MainPanel.update({ command: 'log', text: '已恢复上次的任务状态。' });
                        MainPanel.update({ command: 'updateGoal', text: taskContext.originalUserRequest });
                        MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
                    } else {
                        await clearTaskState();
                    }
                }
            }

            if (!taskContext) {
                const userRequest = await vscode.window.showInputBox({ prompt: "请输入您的总体任务目标" });
                if (!userRequest) {
                    MainPanel.update({ command: 'log', text: '任务被用户取消。' });
                    return;
                }
                MainPanel.update({ command: 'updateGoal', text: userRequest });
                taskContext = new TaskContext(userRequest);

                const enableSmartScan = config.get('enableSmartScan', false);
                const scannerConfigs = getModelsForRole('codebaseScanner');
                if (!scannerConfigs) {
                    vscode.window.showErrorMessage("代码库扫描员的模型配置缺失。");
                    return;
                }
                const scannerAgent = new CodebaseScannerAgent(scannerConfigs[0]);
                taskContext.projectContext = await scanProject(scannerAgent, enableSmartScan);
            }

            // Main execution logic encapsulated into a function
            await runTaskExecution(taskContext, config);

        } catch (error) {
            vscode.window.showErrorMessage(`发生严重错误: ${error.message}`);
            logger.logLine(`\n--- 发生严重错误 ---\n${error.stack}`);
        }
    });

    async function runTaskExecution(taskContext, config) {
        // This function now contains the main loop for task execution.
        const enablePersistence = config.get('enablePersistence', false);

        // Initialize agents
        const scannerAgent = new CodebaseScannerAgent(getModelsForRole('codebaseScanner')[0]);
        const orchestrator = new OrchestratorAgent(getModelsForRole('orchestrator')[0]);
        const worker = new WorkerAgent(getModelsForRole('worker')[0]);
        const synthesizer = new SynthesizerAgent(getModelsForRole('synthesizer')[0]);
        const critiqueAggregator = new CritiqueAggregationAgent(getModelsForRole('critiqueAggregator')[0]);
        const evaluationTeamConfigs = getModelsForRole('evaluationTeam');

        const reflectorConfig = getModelsForRole('reflector');
        const reflectorAgent = reflectorConfig ? new ReflectorAgent(reflectorConfig[0]) : null;


        // This function encapsulates the logic for executing a single task.
        async function executeSingleTask(subTask) {
            taskContext.updateTaskStatus(subTask.id, 'in_progress');
            MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
            MainPanel.update({ command: 'log', text: `正在执行任务 ${subTask.id}: ${subTask.description.split('\n\n')[0]}` });

            // (The retry loop and tool execution logic remains the same)
            let attempts = 0;
            const MAX_ATTEMPTS_PER_TASK = 3;
            let lastError = '';
            while (attempts < MAX_ATTEMPTS_PER_TASK) {
                const workerResult = await worker.executeTask(subTask, taskContext);
                try {
                    if (workerResult.toolName === 'terminal.executeCommand' && !config.get('enableAutoMode', false)) {
                        const userApproval = await vscode.window.showWarningMessage(
                            `智能体想要执行以下命令: \n\n${workerResult.args.command}\n\n您是否批准?`,
                            { modal: true }, "批准"
                        );
                        if (userApproval !== "批准") throw new Error("用户拒绝了终端命令的执行。");
                    }
                    const toolResult = await executeTool(workerResult.toolName, workerResult.args, logger, scannerAgent);
                    taskContext.updateTaskStatus(subTask.id, 'completed', toolResult);
                    MainPanel.update({ command: 'log', text: `任务 ${subTask.id} 成功完成。` });
                    lastError = '';
                    break;
                } catch (e) {
                    attempts++;
                    lastError = e.message;
                    subTask.error = lastError; // Store error on the task
                    MainPanel.update({ command: 'log', text: `任务 ${subTask.id} 第 ${attempts} 次尝试失败: ${lastError}` });

                    if (attempts < MAX_ATTEMPTS_PER_TASK) {
                        if (reflectorAgent) {
                            MainPanel.update({ command: 'log', text: '正在调用反思者智能体分析失败原因...' });
                            try {
                                const reflection = await reflectorAgent.executeTask(subTask);
                                MainPanel.update({ command: 'log', text: `反思者分析原因: ${reflection.cause}` });
                                subTask.description = reflection.nextStep; // Update task with corrected step
                            } catch (reflectionError) {
                                MainPanel.update({ command: 'log', text: `反思者智能体失败: ${reflectionError.message}` });
                                // Fallback to original retry logic
                                subTask.description = `${subTask.description.split('\n\n')[0]}\n\n(前一次尝试失败，错误信息: ${lastError}). 请分析此错误并尝试不同的方法。`;
                            }
                        } else {
                             subTask.description = `${subTask.description.split('\n\n')[0]}\n\n(前一次尝试失败，错误信息: ${lastError}). 请分析此错误并尝试不同的方法。`;
                        }
                        MainPanel.update({ command: 'log', text: `正在重试任务 ${subTask.id}...` });
                    }
                }
            }
            if (lastError) {
                taskContext.updateTaskStatus(subTask.id, 'failed', `尝试 ${MAX_ATTEMPTS_PER_TASK} 次后任务失败。最后错误: ${lastError}`);
            }
            MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
            if (enablePersistence) await saveTaskState(taskContext);
        }

        const MAX_ITERATIONS = 10;
        for (let i = taskContext.currentIteration -1; i < MAX_ITERATIONS; i++) {
            MainPanel.update({ command: 'log', text: `--- 第 ${taskContext.currentIteration} 轮迭代 ---` });

            // Only create a new plan if there are no pending tasks
            if (taskContext.subTasks.every(t => t.status !== 'pending' && t.status !== 'in_progress')) {
                 const plan = await orchestrator.executeTask(taskContext);
                 taskContext.setNewPlanForIteration(plan);
                 MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
                 if (enablePersistence) await saveTaskState(taskContext);
            }

            // Execute the plan
            const enableParallelExec = config.get('enableParallelExec', false);
            let executionPromise;
            if (enableParallelExec) {
                // Parallel execution logic
                executionPromise = (async () => {
                    while (!taskContext.areAllTasksDone()) {
                        const runnableTasks = taskContext.getRunnableTasks();
                        if (runnableTasks.length === 0) {
                            MainPanel.update({ command: 'log', text: '错误：检测到任务依赖死锁。' });
                            break;
                        }
                        await Promise.all(runnableTasks.map(executeSingleTask));
                    }
                })();
            } else {
                // Sequential execution logic
                executionPromise = (async () => {
                    while (!taskContext.areAllTasksDone()) {
                         const runnableTasks = taskContext.getRunnableTasks();
                         if (runnableTasks.length === 0) {
                            MainPanel.update({ command: 'log', text: '错误：检测到任务依赖死锁。' });
                            break;
                        }
                        await executeSingleTask(runnableTasks[0]);
                    }
                })();
            }
            await executionPromise;
            MainPanel.update({ command: 'log', text: '本轮所有任务已执行完毕。' });

            const artifact = await synthesizer.executeTask(taskContext);
            MainPanel.update({ command: 'showArtifact', artifact: artifact });

            const evaluationPromises = evaluationTeamConfigs.map(config => {
                const evaluator = new EvaluatorAgent(config);
                return evaluator.executeTask(artifact, taskContext);
            });
            const evaluations = await Promise.all(evaluationPromises);
            const finalCritique = await critiqueAggregator.executeTask(evaluations, taskContext);
            MainPanel.update({ command: 'log', text: `最终得分: ${finalCritique.score}/10. 总结: ${finalCritique.summary}` });

            taskContext.archiveCurrentIteration(artifact, finalCritique);
            if (enablePersistence) await saveTaskState(taskContext);

            if (finalCritique.score === 10) {
                vscode.window.showInformationMessage("任务已完成，评分为10/10！");
                if (enablePersistence) await clearTaskState();
                break;
            }
            if (i === MAX_ITERATIONS - 1) {
                vscode.window.showWarningMessage("已达到最大迭代次数，任务终止。");
                if (enablePersistence) await clearTaskState();
                break;
            }

            if (config.get('enableAutoMode', false)) {
                MainPanel.update({ command: 'log', text: '自动模式已启用，自动进入下一轮优化...' });
            } else {
                const choice = await vscode.window.showInformationMessage(
                    `第 ${taskContext.currentIteration - 1} 轮完成，得分 ${finalCritique.score}/10。\n总结: ${finalCritique.summary}\n\n是否继续优化?`,
                    { modal: true }, "继续", "终止"
                );
                if (choice !== "继续") {
                    if (enablePersistence) await clearTaskState();
                    break;
                }
            }
        }

        const report = generateReport(taskContext);
        const reportDocument = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
        await vscode.window.showTextDocument(reportDocument);
    }
    context.subscriptions.push(disposable);
}

function generateReport(taskContext) {
    let report = `# 多智能体任务报告\n\n`;
    report += `**原始需求:** ${taskContext.originalUserRequest}\n\n`;
    const finalIteration = taskContext.getLatestIteration();
    if (finalIteration) {
        report += `**最终得分:** ${finalIteration.evaluation.score}/10\n`;
        if (finalIteration.evaluation.summary) {
            report += `**最终总结:** ${finalIteration.evaluation.summary}\n\n`;
        }
        report += `## 最终产物\n\n\`\`\`\n${finalIteration.artifact}\n\`\`\`\n\n`;
    }
    report += `## 迭代历史\n\n`;
    for (const iter of taskContext.history) {
        report += `### 第 ${iter.iteration} 轮 (得分: ${iter.evaluation.score}/10)\n`;
        if (iter.evaluation.summary) {
            report += `**总结:** ${iter.evaluation.summary}\n`;
        }
        if (iter.evaluation.suggestions && iter.evaluation.suggestions.length > 0) {
            report += `**建议:**\n` + iter.evaluation.suggestions.map(s => `- ${s}`).join('\n') + '\n';
        }
        report += `\n`;
    }
    return report;
}

function deactivate() {
    MainPanel.currentPanel?.dispose();
}

module.exports = { activate, deactivate };

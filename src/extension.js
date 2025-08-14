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
const { MainPanel } = require('./ui/mainPanel');

async function scanProject(scannerAgent) {
    MainPanel.update({ command: 'log', text: '正在扫描项目代码库...' });
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

    await walk(rootPath);
    MainPanel.update({ command: 'log', text: '项目扫描完成。' });
    return projectContext;
}


function activate(context) {

    const a_key = 'multiAgentHelper.hasBeenActivated';
    if (!context.globalState.get(a_key)) {
        vscode.window.showInformationMessage('欢迎使用多智能体助手！请在设置中配置您的AI模型以开始使用。');
        context.globalState.update(a_key, true);
    }

    let disposable = vscode.commands.registerCommand('multi-agent-helper.startTask', async () => {
        try {
            logger.createLogChannel();
            MainPanel.createOrShow(context.extensionPath);

            const userRequest = await vscode.window.showInputBox({ prompt: "请输入您的总体任务目标" });
            if (!userRequest) {
                MainPanel.update({ command: 'log', text: '任务被用户取消。' });
                return;
            }
            MainPanel.update({ command: 'updateGoal', text: userRequest });

            const scannerConfigs = getModelsForRole('codebaseScanner');
            if (!scannerConfigs) {
                vscode.window.showErrorMessage("代码库扫描员的模型配置缺失。");
                return;
            }
            const scannerAgent = new CodebaseScannerAgent(scannerConfigs[0]);
            const projectContextStr = await scanProject(scannerAgent);

            const orchestratorConfigs = getModelsForRole('orchestrator');
            const workerConfigs = getModelsForRole('worker');
            const synthesizerConfigs = getModelsForRole('synthesizer');
            const evaluationTeamConfigs = getModelsForRole('evaluationTeam');
            const critiqueAggregatorConfigs = getModelsForRole('critiqueAggregator');

            if (!orchestratorConfigs || !workerConfigs || !synthesizerConfigs || !evaluationTeamConfigs || !critiqueAggregatorConfigs) {
                vscode.window.showErrorMessage("模型配置不完整。请在设置中为所有角色定义模型。");
                return;
            }

            const orchestrator = new OrchestratorAgent(orchestratorConfigs[0]);
            const worker = new WorkerAgent(workerConfigs[0]);
            const synthesizer = new SynthesizerAgent(synthesizerConfigs[0]);
            const critiqueAggregator = new CritiqueAggregationAgent(critiqueAggregatorConfigs[0]);
            const taskContext = new TaskContext(userRequest);
            taskContext.projectContext = projectContextStr;

            const MAX_ITERATIONS = 10;
            for (let i = 0; i < MAX_ITERATIONS; i++) {
                MainPanel.update({ command: 'log', text: `--- 第 ${taskContext.currentIteration} 轮迭代 ---` });

                const plan = await orchestrator.executeTask(taskContext);
                taskContext.setNewPlanForIteration(plan);
                MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });

                let subTask = taskContext.getNextPendingTask();
                while(subTask) {
                    taskContext.updateTaskStatus(subTask.id, 'in_progress');
                    MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
                    MainPanel.update({ command: 'log', text: `正在执行任务: ${subTask.description.split('\n\n')[0]}` });

                    let attempts = 0;
                    const MAX_ATTEMPTS_PER_TASK = 3;
                    let lastError = '';

                    while (attempts < MAX_ATTEMPTS_PER_TASK) {
                        const workerResult = await worker.executeTask(subTask, taskContext);

                        try {
                            if (workerResult.toolName === 'terminal.executeCommand') {
                                const userApproval = await vscode.window.showWarningMessage(
                                    `智能体想要执行以下命令: \n\n${workerResult.args.command}\n\n您是否批准?`,
                                    { modal: true }, "批准"
                                );
                                if (userApproval !== "批准") throw new Error("用户拒绝了终端命令的执行。");
                            }
                            const toolResult = await executeTool(workerResult.toolName, workerResult.args, logger);
                            taskContext.updateTaskStatus(subTask.id, 'completed', toolResult);
                            MainPanel.update({ command: 'log', text: `任务成功完成。` });
                            lastError = '';
                            break;
                        } catch (e) {
                            attempts++;
                            lastError = e.message;
                            MainPanel.update({ command: 'log', text: `第 ${attempts} 次尝试失败: ${lastError}` });
                            if (attempts < MAX_ATTEMPTS_PER_TASK) {
                                const originalDescription = subTask.description.split('\n\n')[0];
                                subTask.description = `${originalDescription}\n\n(前一次尝试失败，错误信息: ${lastError}). 请分析此错误并尝试不同的方法。`;
                                MainPanel.update({ command: 'log', text: `正在重试...` });
                            }
                        }
                    }

                    if (lastError) {
                        taskContext.updateTaskStatus(subTask.id, 'failed', `尝试 ${MAX_ATTEMPTS_PER_TASK} 次后任务失败。最后错误: ${lastError}`);
                    }

                    MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
                    subTask = taskContext.getNextPendingTask();
                }

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

                if (finalCritique.score === 10) {
                    vscode.window.showInformationMessage("任务已完成，评分为10/10！");
                    break;
                }
                if (i === MAX_ITERATIONS - 1) {
                    vscode.window.showWarningMessage("已达到最大迭代次数，任务终止。");
                    break;
                }

                const choice = await vscode.window.showInformationMessage(
                    `第 ${taskContext.currentIteration - 1} 轮完成，得分 ${finalCritique.score}/10。\n总结: ${finalCritique.summary}\n\n是否继续优化?`,
                    { modal: true }, "继续", "终止"
                );
                if (choice !== "继续") break;
            }

            const report = generateReport(taskContext);
            const reportDocument = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
            await vscode.window.showTextDocument(reportDocument);

        } catch (error) {
            vscode.window.showErrorMessage(`发生严重错误: ${error.message}`);
            logger.logLine(`\n--- 发生严重错误 ---\n${error.stack}`);
        }
    });
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

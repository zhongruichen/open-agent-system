const vscode = require('vscode');
const { getModelForRole, getModelsForTeam, getRoleProfile } = require('./config');
const logger = require('./logger');
const { executeTool } = require('./tools/toolRegistry');
const { OrchestratorAgent } = require('./agents/orchestratorAgent');
const { WorkerAgent } = require('./agents/workerAgent');
const { SynthesizerAgent } = require('./agents/synthesizerAgent');
const { EvaluatorAgent } = require('./agents/evaluatorAgent');
const { CritiqueAggregationAgent } = require('./agents/critiqueAggregationAgent');
const { CodebaseScannerAgent } = require('./agents/codebaseScannerAgent');
const { ReflectorAgent } = require('./agents/reflectorAgent.js');
const { ReviewerAgent } = require('./agents/reviewerAgent.js');
const { KnowledgeExtractorAgent } = require('./agents/knowledgeExtractorAgent.js');
const { MainPanel } = require('./ui/mainPanel');
const knowledgeBase = require('./memory/knowledgeBase.js');

// --- Helper Functions for Refactoring ---

function initializeAgents(config, agentMessageBus) {
    const { getModelForRole, getModelsForTeam, getRoleProfile } = require('./config');
    const agents = {};

    const workerProfile = getRoleProfile('Worker');
    let workerSystemPrompt = workerProfile.systemPrompt;
    if (config.get('enableAgentCollaboration', false)) {
        workerSystemPrompt += "\n- 'agent.sendMessage': 向另一个智能体发送消息。\n  - args: { \"recipientId\": \"<接收方智能体的ID>\", \"messageContent\": \"<消息内容>\" }";
    }

    agents.orchestrator = new OrchestratorAgent(getModelForRole('Orchestrator'), getRoleProfile('Orchestrator').systemPrompt, 'Orchestrator', agentMessageBus);
    agents.worker = new WorkerAgent(getModelForRole('Worker'), workerSystemPrompt, 'Worker', agentMessageBus);
    agents.synthesizer = new SynthesizerAgent(getModelForRole('Synthesizer'), getRoleProfile('Synthesizer').systemPrompt, 'Synthesizer', agentMessageBus);
    agents.critiqueAggregator = new CritiqueAggregationAgent(getModelForRole('CritiqueAggregator'), getRoleProfile('CritiqueAggregator').systemPrompt, 'CritiqueAggregator', agentMessageBus);
    agents.scannerAgent = new CodebaseScannerAgent(getModelForRole('CodebaseScanner'), getRoleProfile('CodebaseScanner').systemPrompt, 'CodebaseScanner', agentMessageBus);

    const reflectorProfile = getRoleProfile('Reflector');
    agents.reflectorAgent = reflectorProfile ? new ReflectorAgent(getModelForRole('Reflector'), reflectorProfile.systemPrompt, 'Reflector', agentMessageBus) : null;

    const reviewerProfile = getRoleProfile('Reviewer');
    agents.reviewerAgent = reviewerProfile ? new ReviewerAgent(getModelForRole('Reviewer'), reviewerProfile.systemPrompt, 'Reviewer', agentMessageBus) : null;

    agents.evaluationTeamConfigs = getModelsForTeam('Evaluator');
    agents.evaluatorProfile = getRoleProfile('Evaluator');

    return agents;
}

function setupMessageBusListeners(agentMessageBus, agents, taskContext) {
    agentMessageBus.on('createSubTask', (task) => {
        if (!taskContext) return;
        const newTaskId = taskContext.subTasks.length > 0 ? Math.max(...taskContext.subTasks.map(t => t.id)) + 1 : 1;
        const currentTask = taskContext.subTasks.find(t => t.status === 'in_progress');
        const dependencies = currentTask ? [currentTask.id] : [];
        const newSubTask = {
            id: newTaskId,
            description: `(委派自 ${task.recipientRole}): ${task.taskDescription}`,
            dependencies,
            status: 'pending',
            result: null,
            error: null,
        };
        taskContext.subTasks.push(newSubTask);
        MainPanel.update({ command: 'log', text: `动态创建新任务 #${newTaskId} 并已添加到计划中。` });
        MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
    });

    agentMessageBus.on('message', async (message) => {
        if (!taskContext || !message.recipientId) return;
        if (message.recipientId === 'Reviewer' && agents.reviewerAgent) {
            MainPanel.update({ command: 'log', text: `Reviewer 正在审查来自 ${message.senderId} 的操作...` });
            try {
                const review = await agents.reviewerAgent.executeTask(message.messageContent);
                agentMessageBus.emit('message', {
                    senderId: 'Reviewer',
                    recipientId: message.senderId,
                    isReview: true,
                    review: review,
                    originalSubTaskId: message.subTaskId,
                });
            } catch (e) {
                 MainPanel.update({ command: 'log', text: `Reviewer Agent 失败: ${e.message}` });
            }
        }
        if (message.senderId === 'Reviewer' && message.isReview) {
             const taskToUpdate = taskContext.subTasks.find(t => t.id === message.originalSubTaskId);
             if (taskToUpdate && taskToUpdate.status === 'waiting_for_review') {
                 MainPanel.update({ command: 'log', text: `收到对任务 #${taskToUpdate.id} 的审查反馈。` });
                 const { approved, feedback } = message.review;
                 taskToUpdate.description += `\n\n--- 审查反馈 ---\n状态: ${approved ? '已批准' : '需要修改'}\n反馈: ${feedback}`;
                 taskToUpdate.status = 'pending';
                 MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
             }
        }
    });
}

async function executePlan(taskContext, agents, config, agentMessageBus, saveTaskState) {
    const enableParallelExec = config.get('enableParallelExec', false);
    const executionPromise = (async () => {
        while (!taskContext.areAllTasksDone()) {
            const runnableTasks = taskContext.getRunnableTasks();
            if (runnableTasks.length === 0) {
                const isWaitingForReview = taskContext.subTasks.some(t => t.status === 'waiting_for_review');
                if (isWaitingForReview) {
                    MainPanel.update({ command: 'log', text: '正在等待审查反馈...' });
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                MainPanel.update({ command: 'log', text: '错误：检测到任务依赖死锁或所有任务都已完成/失败。' });
                break;
            }

            if (enableParallelExec) {
                await Promise.all(runnableTasks.map(subTask => executeSingleTask(subTask, taskContext, agents, config, agentMessageBus, saveTaskState)));
            } else {
                await executeSingleTask(runnableTasks[0], taskContext, agents, config, agentMessageBus, saveTaskState);
            }
        }
    })();
    await executionPromise;
    MainPanel.update({ command: 'log', text: '本轮所有任务已执行完毕。' });
}

async function executeSingleTask(subTask, taskContext, agents, config, agentMessageBus, saveTaskState) {
    taskContext.updateTaskStatus(subTask.id, 'in_progress');
    MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
    MainPanel.update({ command: 'log', text: `正在执行任务 ${subTask.id}: ${subTask.description.split('\n\n')[0]}` });

    let attempts = 0;
    const MAX_ATTEMPTS_PER_TASK = 3;
    let lastError = '';
    while (attempts < MAX_ATTEMPTS_PER_TASK) {
        const workerResult = await agents.worker.executeTask(subTask, taskContext);
        try {
            if (workerResult.toolName === 'terminal.executeCommand' && !config.get('enableAutoMode', false)) {
                const userApproval = await vscode.window.showWarningMessage(
                    `智能体想要执行以下命令: \n\n${workerResult.args.command}\n\n您是否批准?`,
                    { modal: true }, "批准"
                );
                if (userApproval !== "批准") throw new Error("用户拒绝了终端命令的执行。");
            }
            const toolContext = { scannerAgent: agents.scannerAgent, workerProfile: getRoleProfile('Worker'), agentMessageBus, senderId: agents.worker.id, subTaskId: subTask.id };
            const toolResult = await executeTool(workerResult.toolName, workerResult.args, logger, toolContext);

            if (workerResult.toolName === 'agent.sendMessage' && workerResult.args.recipientId === 'Reviewer') {
                taskContext.updateTaskStatus(subTask.id, 'waiting_for_review');
                MainPanel.update({ command: 'log', text: `任务 ${subTask.id} 已发送审查，正在等待反馈...` });
                MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
                return;
            }

            taskContext.updateTaskStatus(subTask.id, 'completed', toolResult);
            MainPanel.update({ command: 'log', text: `任务 ${subTask.id} 成功完成。` });
            lastError = '';
            break;
        } catch (e) {
            attempts++;
            lastError = e.message;
            subTask.error = lastError;
            MainPanel.update({ command: 'log', text: `任务 ${subTask.id} 第 ${attempts} 次尝试失败: ${lastError}` });

            if (attempts < MAX_ATTEMPTS_PER_TASK) {
                if (agents.reflectorAgent) {
                    MainPanel.update({ command: 'log', text: '正在调用反思者智能体分析失败原因...' });
                    try {
                        const reflection = await agents.reflectorAgent.executeTask(subTask);
                        MainPanel.update({ command: 'log', text: `反思者分析原因: ${reflection.cause}` });
                        subTask.description = reflection.nextStep;
                    } catch (reflectionError) {
                        MainPanel.update({ command: 'log', text: `反思者智能体失败: ${reflectionError.message}` });
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
    if (config.get('enablePersistence', false)) await saveTaskState(taskContext);
}

async function awaitPlanApproval(taskEventEmitter, initialPlan) {
    if (vscode.workspace.getConfiguration('multiAgent').get('enableAutoMode', false)) {
        MainPanel.update({ command: 'log', text: '自动模式已启用，自动批准计划。' });
        return initialPlan;
    }
    MainPanel.update({ command: 'showPlanForReview', plan: initialPlan });
    return new Promise((resolve, reject) => {
        taskEventEmitter.once('planApproved', (newPlan) => resolve(newPlan));
        taskEventEmitter.once('planCancelled', () => reject(new Error("任务被用户取消。")));
    });
}

function generateFinalReport(taskContext) {
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

async function runIterationLoop(taskContext, agents, config, agentMessageBus, taskEventEmitter, state) {
    const { saveTaskState, clearTaskState } = state;
    const enablePersistence = config.get('enablePersistence', false);
    const MAX_ITERATIONS = 10;

    for (let i = taskContext.currentIteration - 1; i < MAX_ITERATIONS; i++) {
        MainPanel.update({ command: 'log', text: `--- 第 ${taskContext.currentIteration} 轮迭代 ---` });

        if (taskContext.subTasks.every(t => t.status !== 'pending' && t.status !== 'in_progress')) {
            const initialPlan = await agents.orchestrator.executeTask(taskContext);
            const approvedPlan = await awaitPlanApproval(taskEventEmitter, initialPlan);
            taskContext.setNewPlanForIteration(approvedPlan);
            MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
            if (enablePersistence) await saveTaskState(taskContext);
        }

        await executePlan(taskContext, agents, config, agentMessageBus, saveTaskState);

        const artifact = await agents.synthesizer.executeTask(taskContext);
        MainPanel.update({ command: 'showArtifact', artifact: artifact });
        MainPanel.update({ command: 'highlightArtifact' });

        const evaluationPromises = agents.evaluationTeamConfigs.map((modelConfig, index) => {
            const evaluatorId = `Evaluator_${index + 1}`;
            const evaluator = new EvaluatorAgent(modelConfig, agents.evaluatorProfile.systemPrompt, evaluatorId, agentMessageBus);
            return evaluator.executeTask(artifact, taskContext);
        });
        const evaluations = await Promise.all(evaluationPromises);
        const finalCritique = await agents.critiqueAggregator.executeTask(evaluations, taskContext);
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
}

async function runTaskExecution(taskContext, config, agentMessageBus, taskEventEmitter, state) {
    agentMessageBus.removeAllListeners();

    const agents = initializeAgents(config, agentMessageBus);
    setupMessageBusListeners(agentMessageBus, agents, taskContext);

    await runIterationLoop(taskContext, agents, config, agentMessageBus, taskEventEmitter, state);

    const report = generateFinalReport(taskContext);
    const reportDocument = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
    await vscode.window.showTextDocument(reportDocument);

    if (config.get('enableLongTermMemory', false)) {
        MainPanel.update({ command: 'log', text: '任务完成，开始提取知识...' });
        try {
            const extractorProfile = getRoleProfile('KnowledgeExtractor');
            const knowledgeExtractor = new KnowledgeExtractorAgent(getModelForRole('KnowledgeExtractor'), extractorProfile.systemPrompt);
            const newKnowledge = await knowledgeExtractor.executeTask(taskContext);
            if (newKnowledge && newKnowledge.length > 0) {
                for (const entry of newKnowledge) {
                    await knowledgeBase.addKnowledge(entry);
                }
                MainPanel.update({ command: 'log', text: `已成功提取并保存 ${newKnowledge.length} 条新知识。` });
            } else {
                MainPanel.update({ command: 'log', text: '未提取到新的可泛化知识。' });
            }
        } catch (e) {
            console.error('Failed to extract or save knowledge:', e);
            MainPanel.update({ command: 'log', text: `知识提取失败: ${e.message}` });
        }
    }
}

module.exports = { runTaskExecution };

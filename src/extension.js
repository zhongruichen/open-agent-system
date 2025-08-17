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
const { ReviewerAgent } = require('./agents/reviewerAgent.js');
const { KnowledgeExtractorAgent } = require('./agents/knowledgeExtractorAgent.js');
const knowledgeBase = require('./memory/knowledgeBase.js');
const EventEmitter = require('events');
const { MainPanel } = require('./ui/mainPanel');
const { runHealthCheck } = require('./healthCheck');
const { listFiles } = require('./tools/fileSystem');
const gitTools = require('./tools/git');

const agentMessageBus = new EventEmitter();

// --- Debug State Manager ---
let activeDebugSession = null;

function setupDebugListeners() {
    vscode.debug.onDidStartDebugSession(session => {
        activeDebugSession = session;
        MainPanel.update({ command: 'log', text: `调试会话已开始: ${session.name} (类型: ${session.type})` });
        MainPanel.update({ command: 'updateDebuggerState', state: { isActive: true, sessionName: session.name } });
    });

    vscode.debug.onDidTerminateDebugSession(session => {
        activeDebugSession = null;
        MainPanel.update({ command: 'log', text: `调试会话已终止: ${session.name}` });
        MainPanel.update({ command: 'updateDebuggerState', state: { isActive: false, sessionName: null } });
    });

    // Initial check in case a session is already active when the extension loads
    if (vscode.debug.activeDebugSession) {
        activeDebugSession = vscode.debug.activeDebugSession;
        MainPanel.update({ command: 'log', text: `检测到已激活的调试会话: ${activeDebugSession.name}` });
         MainPanel.update({ command: 'updateDebuggerState', state: { isActive: true, sessionName: activeDebugSession.name } });
    }
}
// --- End Debug State Manager ---


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


async function migrateSettings(config) {
    const oldAssignments = config.get('roleAssignments');
    if (oldAssignments && Object.keys(oldAssignments).length > 0) {
        MainPanel.update({ command: 'log', text: '检测到旧版角色配置，正在迁移...' });
        const defaultRoles = config.inspect('roles').defaultValue;
        const newRoles = defaultRoles.map(role => {
            const oldRoleName = role.name.charAt(0).toLowerCase() + role.name.slice(1);
            const assignedModel = oldAssignments[oldRoleName];
            if (assignedModel) {
                return { ...role, model: assignedModel };
            }
            // Special handling for evaluationTeam array
            if (role.name === 'Evaluator' && Array.isArray(oldAssignments.evaluationTeam) && oldAssignments.evaluationTeam.length > 0) {
                 return { ...role, model: oldAssignments.evaluationTeam[0] };
            }
            return role;
        });

        await config.update('roles', newRoles, vscode.ConfigurationTarget.Global);
        // Unset the old setting to prevent re-migration
        await config.update('roleAssignments', undefined, vscode.ConfigurationTarget.Global);
        MainPanel.update({ command: 'log', text: '配置迁移完成。' });
    }
}


function activate(context) {
    setupDebugListeners();
    knowledgeBase.initialize(context);

    // Run migration once on activation
    migrateSettings(vscode.workspace.getConfiguration('multiAgent'));

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

    const taskEventEmitter = new EventEmitter();

    taskEventEmitter.on('runHealthCheck', () => {
        const config = vscode.workspace.getConfiguration('multiAgent');
        const results = runHealthCheck(config);
        MainPanel.update({
            command: 'healthCheckResult',
            results: results
        });
    });

    taskEventEmitter.on('getWorkspaceStatus', async () => {
        const status = await getWorkspaceStatus();
        MainPanel.update({
            command: 'updateWorkspaceStatus',
            status: status
        });
    });

    async function getWorkspaceStatus() {
        try {
            // 1. File System
            const fileList = await listFiles('.');

            // 2. Debugger
            const breakpoints = vscode.debug.breakpoints.map(bp => {
                if (bp instanceof vscode.SourceBreakpoint) {
                    return `${path.basename(bp.location.uri.fsPath)}:${bp.location.range.start.line + 1}`;
                }
                return 'Function Breakpoint';
            });

            // 3. Git
            const branch = await gitTools.getCurrentBranch();
            const gitStatus = await gitTools.getStatus();

            return {
                fileSystem: fileList,
                breakpoints: breakpoints,
                git: {
                    branch: branch.replace('Current branch is: ', ''),
                    files: gitStatus,
                }
            };
        } catch (error) {
            console.error('Error getting workspace status:', error);
            return { error: error.message };
        }
    }

    let disposable = vscode.commands.registerCommand('multi-agent-helper.startTask', async () => {
        try {
            logger.createLogChannel();
            MainPanel.createOrShow(context.extensionPath, taskEventEmitter);
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

                const enableLongTermMemory = config.get('enableLongTermMemory', false);
                const { getModelForRole, getRoleProfile } = require('./config');

                if (enableLongTermMemory) {
                    MainPanel.update({ command: 'log', text: '长期记忆已启用，正在查询知识库...' });
                    const relevantKnowledge = await knowledgeBase.queryKnowledge(userRequest, getModelForRole('KnowledgeExtractor'));
                    taskContext.addRelevantKnowledge(relevantKnowledge);
                    MainPanel.update({ command: 'log', text: `知识库查询完毕。` });
                }

                const enableSmartScan = config.get('enableSmartScan', false);
                const { getModelForRole, getRoleProfile } = require('./config');
                const scannerProfile = getRoleProfile('CodebaseScanner');
                if (!scannerProfile || !scannerProfile.model) {
                     vscode.window.showErrorMessage("代码库扫描员(CodebaseScanner)角色或其模型未配置。");
                    return;
                }
                const scannerAgent = new CodebaseScannerAgent(getModelForRole('CodebaseScanner'), scannerProfile.systemPrompt);
                taskContext.projectContext = await scanProject(scannerAgent, enableSmartScan);
            }

            // Main execution logic encapsulated into a function
            await runTaskExecution(taskContext, config);

        } catch (error) {
            vscode.window.showErrorMessage(`发生严重错误: ${error.message}`);
            logger.logLine(`\n--- 发生严重错误 ---\n${error.stack}`);
        }
    });

    async function awaitPlanApproval(initialPlan) {
        // Do not ask for approval in auto-mode
        if (vscode.workspace.getConfiguration('multiAgent').get('enableAutoMode', false)) {
            MainPanel.update({ command: 'log', text: '自动模式已启用，自动批准计划。' });
            return initialPlan;
        }

        MainPanel.update({ command: 'showPlanForReview', plan: initialPlan });

        return new Promise((resolve, reject) => {
            taskEventEmitter.once('planApproved', (newPlan) => {
                resolve(newPlan);
            });
            taskEventEmitter.once('planCancelled', () => {
                reject(new Error("任务被用户取消。"));
            });
        });
    }

    async function runTaskExecution(taskContext, config) {
        // This function now contains the main loop for task execution.
        const enablePersistence = config.get('enablePersistence', false);

        // Initialize agents based on role profiles
        const { getModelForRole, getModelsForTeam, getRoleProfile } = require('./config');

        const orchestratorProfile = getRoleProfile('Orchestrator');
        const workerProfile = getRoleProfile('Worker');
        const synthesizerProfile = getRoleProfile('Synthesizer');
        const critiqueAggregatorProfile = getRoleProfile('CritiqueAggregator');
        const scannerProfile = getRoleProfile('CodebaseScanner');
        const reflectorProfile = getRoleProfile('Reflector');
        const reviewerProfile = getRoleProfile('Reviewer');
        const evaluatorProfile = getRoleProfile('Evaluator');

        const orchestrator = new OrchestratorAgent(getModelForRole('Orchestrator'), orchestratorProfile.systemPrompt, 'Orchestrator', agentMessageBus);

        // --- Dynamic Task Delegation Listener ---
        agentMessageBus.on('createSubTask', (task) => {
            if (!taskContext) return; // Should not happen in a running task

            const newTaskId = taskContext.subTasks.length > 0 ? Math.max(...taskContext.subTasks.map(t => t.id)) + 1 : 1;

            const currentTask = taskContext.subTasks.find(t => t.status === 'in_progress');
            const dependencies = currentTask ? [currentTask.id] : [];

            const newSubTask = {
                id: newTaskId,
                description: `(委派自 ${task.recipientRole}): ${task.taskDescription}`,
                dependencies: dependencies,
                status: 'pending',
                result: null,
                error: null,
            };
            taskContext.subTasks.push(newSubTask);
            MainPanel.update({ command: 'log', text: `动态创建新任务 #${newTaskId} 并已添加到计划中。` });
            MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
        });

        // --- Agent Communication Listener ---
        const reviewerAgent = reviewerProfile ? new ReviewerAgent(getModelForRole('Reviewer'), reviewerProfile.systemPrompt, 'Reviewer', agentMessageBus) : null;

        agentMessageBus.on('message', async (message) => {
            if (!taskContext || !message.recipientId) return;

            // Handle messages sent TO the reviewer
            if (message.recipientId === 'Reviewer' && reviewerAgent) {
                MainPanel.update({ command: 'log', text: `Reviewer 正在审查来自 ${message.senderId} 的操作...` });
                try {
                    const review = await reviewerAgent.executeTask(message.messageContent);
                    // Send feedback back to the original sender
                    agentMessageBus.emit('message', {
                        senderId: 'Reviewer',
                        recipientId: message.senderId,
                        isReview: true,
                        review: review,
                        originalSubTaskId: message.subTaskId, // Pass the ID back
                    });
                } catch (e) {
                     MainPanel.update({ command: 'log', text: `Reviewer Agent 失败: ${e.message}` });
                }
            }

            // Handle messages sent FROM the reviewer (i.e., the review itself)
            if (message.senderId === 'Reviewer' && message.isReview) {
                 const taskToUpdate = taskContext.subTasks.find(t => t.id === message.originalSubTaskId);
                 if (taskToUpdate && taskToUpdate.status === 'waiting_for_review') {
                     MainPanel.update({ command: 'log', text: `收到对任务 #${taskToUpdate.id} 的审查反馈。` });
                     const { approved, feedback } = message.review;
                     taskToUpdate.description += `\n\n--- 审查反馈 ---\n状态: ${approved ? '已批准' : '需要修改'}\n反馈: ${feedback}`;
                     taskToUpdate.status = 'pending'; // Set it back to pending to be re-evaluated
                     MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
                 }
            }
        });
        // --- End Listeners ---

        let workerSystemPrompt = workerProfile.systemPrompt;
        if (config.get('enableAgentCollaboration', false)) {
            workerSystemPrompt += "\n- 'agent.sendMessage': 向另一个智能体发送消息。\n  - args: { \"recipientId\": \"<接收方智能体的ID>\", \"messageContent\": \"<消息内容>\" }";
        }
        const worker = new WorkerAgent(getModelForRole('Worker'), workerSystemPrompt, 'Worker', agentMessageBus);
        const synthesizer = new SynthesizerAgent(getModelForRole('Synthesizer'), synthesizerProfile.systemPrompt, 'Synthesizer', agentMessageBus);
        const critiqueAggregator = new CritiqueAggregationAgent(getModelForRole('CritiqueAggregator'), critiqueAggregatorProfile.systemPrompt, 'CritiqueAggregator', agentMessageBus);
        const scannerAgent = new CodebaseScannerAgent(getModelForRole('CodebaseScanner'), scannerProfile.systemPrompt, 'CodebaseScanner', agentMessageBus);
        const reflectorAgent = reflectorProfile ? new ReflectorAgent(getModelForRole('Reflector'), reflectorProfile.systemPrompt, 'Reflector', agentMessageBus) : null;
        // Note: Evaluation team and Knowledge Extractor are handled differently or created on-demand
        const evaluationTeamConfigs = getModelsForTeam('Evaluator');


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
                    const toolContext = { scannerAgent, workerProfile, agentMessageBus, senderId: worker.id, subTaskId: subTask.id };
                    const toolResult = await executeTool(workerResult.toolName, workerResult.args, logger, toolContext);

                    // Handle the self-correction workflow
                    if (workerResult.toolName === 'agent.sendMessage' && workerResult.args.recipientId === 'Reviewer') {
                        taskContext.updateTaskStatus(subTask.id, 'waiting_for_review');
                        MainPanel.update({ command: 'log', text: `任务 ${subTask.id} 已发送审查，正在等待反馈...` });
                        MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
                        return; // Exit executeSingleTask, do not mark as complete or failed
                    }

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
                 const initialPlan = await orchestrator.executeTask(taskContext);
                 const approvedPlan = await awaitPlanApproval(initialPlan);
                 taskContext.setNewPlanForIteration(approvedPlan);
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
                            // If there are no runnable tasks, check if we are just waiting for reviews.
                            const isWaitingForReview = taskContext.subTasks.some(t => t.status === 'waiting_for_review');
                            if (isWaitingForReview) {
                                MainPanel.update({ command: 'log', text: '正在等待审查反馈...' });
                                // Wait for a short period before checking again to avoid a busy loop.
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                continue;
                            }

                            MainPanel.update({ command: 'log', text: '错误：检测到任务依赖死锁或所有任务都已完成/失败。' });
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
                            // If there are no runnable tasks, check if we are just waiting for reviews.
                            const isWaitingForReview = taskContext.subTasks.some(t => t.status === 'waiting_for_review');
                            if (isWaitingForReview) {
                                MainPanel.update({ command: 'log', text: '正在等待审查反馈...' });
                                // Wait for a short period before checking again to avoid a busy loop.
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                continue;
                            }

                            MainPanel.update({ command: 'log', text: '错误：检测到任务依赖死锁或所有任务都已完成/失败。' });
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

            // After the stream is complete, re-highlight the entire block
            MainPanel.update({ command: 'highlightArtifact' });


            const evaluationPromises = evaluationTeamConfigs.map((config, index) => {
                const evaluatorId = `Evaluator_${index + 1}`;
                const evaluator = new EvaluatorAgent(config, evaluatorProfile.systemPrompt, evaluatorId, agentMessageBus);
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

        // Post-task reflection and knowledge extraction
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

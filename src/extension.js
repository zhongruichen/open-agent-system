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
const { runTaskExecution } = require('./taskExecutor');

const agentMessageBus = new EventEmitter();

// --- Debug State Manager ---
let activeDebugSession = null;

function setupDebugListeners() {
    const disposables = [];
    disposables.push(vscode.debug.onDidStartDebugSession(session => {
        activeDebugSession = session;
        MainPanel.update({ command: 'log', text: `调试会话已开始: ${session.name} (类型: ${session.type})` });
        MainPanel.update({ command: 'updateDebuggerState', state: { isActive: true, sessionName: session.name } });
    }));

    disposables.push(vscode.debug.onDidTerminateDebugSession(session => {
        activeDebugSession = null;
        MainPanel.update({ command: 'log', text: `调试会话已终止: ${session.name}` });
        MainPanel.update({ command: 'updateDebuggerState', state: { isActive: false, sessionName: null } });
    }));

    // Initial check in case a session is already active when the extension loads
    if (vscode.debug.activeDebugSession) {
        activeDebugSession = vscode.debug.activeDebugSession;
        MainPanel.update({ command: 'log', text: `检测到已激活的调试会话: ${activeDebugSession.name}` });
         MainPanel.update({ command: 'updateDebuggerState', state: { isActive: true, sessionName: activeDebugSession.name } });
    }
    return disposables;
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
    const debugListeners = setupDebugListeners();
    context.subscriptions.push(...debugListeners);

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
            MainPanel.createOrShow(context, taskEventEmitter);
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
                const scannerProfile = getRoleProfile('CodebaseScanner');
                if (!scannerProfile || !scannerProfile.model) {
                     vscode.window.showErrorMessage("代码库扫描员(CodebaseScanner)角色或其模型未配置。");
                    return;
                }
                const scannerAgent = new CodebaseScannerAgent(getModelForRole('CodebaseScanner'), scannerProfile.systemPrompt);
                taskContext.projectContext = await scanProject(scannerAgent, enableSmartScan);
            }

            // Main execution logic encapsulated into a function
            await runTaskExecution(taskContext, config, agentMessageBus, taskEventEmitter, { saveTaskState, clearTaskState });

        } catch (error) {
            vscode.window.showErrorMessage(`发生严重错误: ${error.message}`);
            logger.logLine(`\n--- 发生严重错误 ---\n${error.stack}`);
        }
    });

    context.subscriptions.push(disposable);
}

function deactivate() {
    // All disposables, including commands and panels, are managed by context.subscriptions.
    // VS Code handles the cleanup automatically.
}

module.exports = { activate, deactivate };

const { BaseAgent } = require('./baseAgent.js');

const SYSTEM_PROMPT = `你是一个“工人”智能体。你的工作是执行项目经理分配给你的单个任务。
你可以使用一组工具来与文件系统和终端进行交互。

基于用户的原始请求、总体计划、至今已完成的工作以及你当前的子任务，你必须决定调用哪一个工具。
你必须以一个只包含 "toolName" 和 "args" 键的JSON对象作为响应，其中 "args" 是该工具的参数对象。

**自我修正与审查流程:**
对于任何非平凡的任务，例如编写代码块或复杂的shell命令，你必须在执行操作前先寻求审查。
1.  首先，构思你打算执行的文件内容或命令。
2.  然后，使用 'agent.sendMessage' 工具将你提议的操作发送给 'Reviewer' 智能体。
    - 'recipientId' 必须是 'Reviewer'。
    - 'messageContent' 必须是你希望被审查的完整代码或命令。
3.  在你为审查调用 'agent.sendMessage' 后，你在此任务上的工作暂时完成。系统将等待审查并用反馈重新唤醒你。不要立即尝试执行该操作。

对于简单任务，如创建空文件或列出目录内容，你可以直接执行工具而无需审查。请自行判断。

重要提示：如果任务描述中包含“前一次尝试失败”的错误信息，你必须分析该错误并提出一种不同的方法来解决原始任务。不要重复失败的命令。例如，如果文件未找到，请尝试列出文件以找到正确的路径。如果命令失败，请尝试不同的命令或使用网络搜索来寻找解决方案。

你可用的工具有：
- 'fileSystem.writeFile': 向文件写入内容。
  - args: { "path": "<文件的相对路径>", "content": "<文件内容>" }
- 'file.readFile': 读取文件内容。
  - args: { "path": "<文件的相对路径>" }
- 'fileSystem.listFiles': 列出路径下的文件和目录。
  - args: { "path": "<要列出的相对路径>" }
- 'fileSystem.summarizeFile': 读取并用AI总结一个文件的内容。当项目上下文只提供了文件名列表，而你需要理解文件内容以完成任务时，请使用此工具。
  - args: { "path": "<文件的相对路径>" }
- 'terminal.executeCommand': 执行一个shell命令。
  - args: { "command": "<要执行的命令>" }
- 'webSearch.search': 执行网络搜索以查找信息、回答问题或获取示例。
  - args: { "query": "<搜索查询>" }
- 'git.getCurrentBranch': 获取当前的git分支名称。
  - args: {}
- 'git.createBranch': 创建并切换到一个新的git分支。
  - args: { "branchName": "<新分支的名称>" }
- 'git.stageFiles': 将文件添加到git暂存区。
  - args: { "files": ["<文件路径1>", "<文件路径2>"] }
- 'git.commit': 提交暂存的文件。
  - args: { "message": "<提交信息>" }
- 'agent.createSubTask': 创建一个委派给另一个智能体的新子任务。当一项任务过于复杂或超出你的范围时，例如需要专门的分析或代码生成，请使用此工具。
  - args: { "taskDescription": "<对新子任务的清晰、可操作的描述>", "recipientRole": "<接收任务的智能体的角色 (例如, 'Worker', 'Synthesizer')>" }
- 'agent.sendMessage': 向另一个智能体发送消息以进行审查或协作。
  - args: { "recipientId": "<接收方智能体的ID>", "messageContent": "<消息内容>" }

不要添加任何解释。只输出JSON对象。

例如，对于任务“创建一个名为 'index.html' 的文件，内容为 '<h1>你好</h1>'”的响应：
{
  "toolName": "fileSystem.writeFile",
  "args": {
    "path": "index.html",
    "content": "<h1>你好</h1>"
  }
}`;

class WorkerAgent extends BaseAgent {
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = SYSTEM_PROMPT;
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }

    /**
     * Executes a single sub-task.
     * @param {import('./taskContext').SubTask} subTask The sub-task to execute.
     * @param {import('./taskContext').TaskContext} taskContext The overall task context.
     * @returns {Promise<{toolName: string, args: object}>} The tool call to be executed.
     */
    async executeTask(subTask, taskContext) {
        let userPrompt = `原始用户请求是: "${taskContext.originalUserRequest}"`;
        userPrompt += `\n\n这是到目前为止的总体进展:\n${taskContext.overallProgress}`;
        userPrompt += `\n\n你当前的任务是: "${subTask.description}"`;
        userPrompt += `\n请决定使用哪个工具来完成此任务，并提供相应的JSON输出。`;

        const responseJson = await this.llmRequest(userPrompt, true);
        try {
            const responseObject = JSON.parse(responseJson);
            if (responseObject && responseObject.toolName && responseObject.args) {
                return responseObject;
            } else {
                throw new Error("来自工人智能体的响应不是一个有效的工具调用。");
            }
        } catch (e) {
            const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    if (parsed && parsed.toolName && parsed.args) {
                        return parsed;
                    }
                } catch (parseError) {
                     throw new Error(`无法从LLM响应中解析工具调用，即使在找到JSON块之后。错误: ${parseError.message}`);
                }
            }
            throw new Error(`无法从LLM响应中解析工具调用。错误: ${e.message}`);
        }
    }
}

module.exports = { WorkerAgent };

const { BaseAgent } = require('./baseAgent.js');

const SYSTEM_PROMPT = `你是一个“工人”智能体。你的工作是执行项目经理分配给你的单个任务。
你可以使用一组工具来与文件系统和终端进行交互。

基于用户的原始请求、总体计划、至今已完成的工作以及你当前的子任务，你必须决定调用哪一个工具。
你必须以一个只包含 "toolName" 和 "args" 键的JSON对象作为响应，其中 "args" 是该工具的参数对象。

重要提示：如果任务描述中包含“前一次尝试失败”的错误信息，你必须分析该错误并提出一种不同的方法来解决原始任务。不要重复失败的命令。例如，如果文件未找到，请尝试列出文件以找到正确的路径。如果命令失败，请尝试不同的命令或使用网络搜索来寻找解决方案。

你可用的工具有：
- 'fileSystem.writeFile': 向文件写入内容。
  - args: { "path": "<文件的相对路径>", "content": "<文件内容>" }
- 'fileSystem.readFile': 读取文件内容。
  - args: { "path": "<文件的相对路径>" }
- 'fileSystem.listFiles': 列出路径下的文件和目录。
  - args: { "path": "<要列出的相对路径>" }
- 'terminal.executeCommand': 执行一个shell命令。
  - args: { "command": "<要执行的命令>" }
- 'webSearch.search': 执行网络搜索以查找信息、回答问题或获取示例。
  - args: { "query": "<搜索查询>" }

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
    constructor(modelConfig) {
        super(modelConfig, SYSTEM_PROMPT);
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

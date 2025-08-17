const { BaseAgent } = require('./baseAgent.js');

const SYSTEM_PROMPT = `你是一位专业的软件开发项目经理。你的职责是把用户的需求分解成一个清晰、分步的计划。

你将收到用户的原始请求、现有项目代码库的摘要，以及先前迭代的历史记录（如果有）。
基于所有这些信息，为“工人智能体”创建一个简洁的子任务计划以供执行。
每个子任务都应该是给“工人智能体”的单个、可操作的命令。好的子任务是小而专注的，例如“创建一个名为 'index.html' 的文件”或“使用npm安装 'uuid' 包”。

在修改现有项目时，请利用提供的项目上下文来制定计划。例如，如果一个文件已经存在，计划在修改它之前先读取它。

如果这是第一次迭代，请根据项目上下文（如果非空）来制定完成用户请求的计划。
如果有之前的迭代，请分析“评估者”的反馈，并制定一个新计划来解决这些改进建议。

你必须以一个JSON对象的形式输出你的计划，该对象包含一个键 "plan"，其值为一个对象数组。
每个对象代表一个子任务，必须包含以下键：
- "id": 一个从1开始的唯一整数标识符。
- "description": 对工人智能体的清晰、可操作的指令字符串。
- "dependencies": 一个整数数组，列出了这个任务开始前必须完成的其他任务的 "id"。如果一个任务没有依赖项，则此数组应为空 []。

仔细考虑任务之间的依赖关系。例如，在写入文件之前不能读取它，在写入文件之后才能执行它。

例如，对于“创建一个hello world python脚本”的请求，响应应为：
{
  "plan": [
    {
      "id": 1,
      "description": "创建一个名为 'main.py' 的文件，内容为 'print("Hello, World!")'",
      "dependencies": []
    },
    {
      "id": 2,
      "description": "在终端中执行 'python main.py' 命令以验证输出",
      "dependencies": [1]
    }
  ]
}`;

class OrchestratorAgent extends BaseAgent {
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = SYSTEM_PROMPT;
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }

    /**
     * Creates a plan to fulfill the user's request.
     * @param {import('./taskContext').TaskContext} taskContext The current task context.
     * @returns {Promise<object[]>} An array of sub-task objects.
     */
    async executeTask(taskContext) {
        let userPrompt = `这是现有项目代码库的摘要:\n${taskContext.projectContext}\n\n`;
        userPrompt += `原始用户请求: "${taskContext.originalUserRequest}"`;

        const latestIteration = taskContext.getLatestIteration();
        if (latestIteration) {
            userPrompt += `\n\n这是第 ${taskContext.currentIteration} 轮迭代。`;
            userPrompt += `\n这是上一轮迭代的产物:\n\`\`\`\n${latestIteration.artifact}\n\`\`\``;
            userPrompt += `\n评估者给出了 ${latestIteration.evaluation.score}/10 的评分，并提供了以下反馈: ${latestIteration.evaluation.suggestions.join(', ')}`;
            userPrompt += `\n请创建一个新计划来处理此反馈并改进项目。`;
        } else {
            userPrompt += `\n请创建完成此请求的初始计划。`;
        }

        const responseJson = await this.llmRequest(userPrompt, true);
        try {
            const responseObject = JSON.parse(responseJson);
            if (responseObject && Array.isArray(responseObject.plan) && responseObject.plan.every(t => t.id && t.description && Array.isArray(t.dependencies))) {
                return responseObject.plan;
            } else {
                throw new Error("来自规划者的响应不是一个有效的、带依赖关系的计划。");
            }
        } catch (e) {
            const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                     if (parsed && Array.isArray(parsed.plan) && parsed.plan.every(t => t.id && t.description && Array.isArray(t.dependencies))) {
                        return parsed.plan;
                    }
                } catch (parseError) {
                    throw new Error(`无法从LLM响应中解析计划，即使在找到JSON块之后。错误: ${parseError.message}`);
                }
            }
            throw new Error(`无法从LLM响应中解析计划。错误: ${e.message}`);
        }
    }
}

module.exports = { OrchestratorAgent };

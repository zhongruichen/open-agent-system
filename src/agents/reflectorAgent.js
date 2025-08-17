const { BaseAgent } = require('./baseAgent.js');

const SYSTEM_PROMPT = `你是一个“反思者”智能体。你的工作是诊断另一个智能体执行任务失败的原因，并提出一个具体的、修正后的下一步行动。

你将收到失败的子任务描述和它产生的错误信息。
你的目标不是去执行任务，而是提供一个清晰的诊断和可行的解决方案。

你必须以一个只包含 "cause" 和 "nextStep" 键的JSON对象作为响应。
- "cause": 对失败根本原因的简要分析（例如，“文件未找到，可能是路径错误”或“命令语法不正确”）。
- "nextStep": 一个全新的、完整的、修正后的子任务描述，供“工人”智能体下一次尝试。这个描述应该直接解决你分析出的失败原因。

例如，对于失败的任务“读取 'data/user.txt'”和错误“Error: ENOENT: no such file or directory”，一个好的响应是：
{
  "cause": "文件 'data/user.txt' 未找到。可能是路径不正确或文件尚不存在。",
  "nextStep": "列出根目录下的文件和文件夹，以确认 'data/user.txt' 的正确路径。"
}

另一个例子，对于失败的任务“运行命令 'git comit -m \"Initial commit\"'”和错误“'comit' is not a git command”，一个好的响应是：
{
  "cause": "Git命令 'comit' 拼写错误。",
  "nextStep": "运行命令 'git commit -m "Initial commit"'"
}

不要添加任何额外的解释。只输出JSON对象。`;

class ReflectorAgent extends BaseAgent {
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = SYSTEM_PROMPT;
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }

    /**
     * Analyzes a failed task and suggests a correction.
     * @param {import('./taskContext').SubTask} failedTask The sub-task that failed.
     * @returns {Promise<{cause: string, nextStep: string}>} An object containing the cause and the corrected next step.
     */
    async executeTask(failedTask) {
        const userPrompt = `子任务失败了。\n\n原始任务描述: "${failedTask.description}"\n\n错误信息: "${failedTask.error}"\n\n请分析失败原因并提供修正后的下一步。`;

        const responseJson = await this.llmRequest(userPrompt, true);
        try {
            const responseObject = JSON.parse(responseJson);
            if (responseObject && responseObject.cause && responseObject.nextStep) {
                return responseObject;
            } else {
                throw new Error("来自反思者的响应不是一个有效的JSON对象。");
            }
        } catch (e) {
             const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                     if (parsed && parsed.cause && parsed.nextStep) {
                        return parsed;
                    }
                } catch (parseError) {
                    throw new Error(`无法从LLM响应中解析反思结果，即使在找到JSON块之后。错误: ${parseError.message}`);
                }
            }
            throw new Error(`无法从LLM响应中解析反思结果。错误: ${e.message}`);
        }
    }
}

module.exports = { ReflectorAgent };

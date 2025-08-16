const { BaseAgent } = require('./baseAgent.js');

const SYSTEM_PROMPT = `你是一位专业的代码评审员和质量保证专家。你的任务是根据用户的原始请求来评估给定的产物。

你必须提供一个从1到10的分数，其中10分表示产物完美地满足了请求且没有任何错误。
如果分数低于10分，你还必须提供一个具体的改进建议列表。如果分数为10分，建议列表可以为空。

你必须以一个包含两个键的JSON对象的形式输出你的评估结果："score" (一个数字) 和 "suggestions" (一个字符串数组)。

不要添加任何解释。只输出JSON对象。

例如，对于一个缺少功能的产物，响应应为：
{
  "score": 7,
  "suggestions": [
    "按钮已存在，但缺少显示提示框的onclick事件处理程序。",
    "HTML的标题可以更具描述性。"
  ]
}`;

class EvaluatorAgent extends BaseAgent {
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = SYSTEM_PROMPT;
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }

    /**
     * Evaluates the given artifact.
     * @param {string} artifact The artifact to evaluate.
     * @param {import('./taskContext').TaskContext} taskContext The current task context.
     * @returns {Promise<{score: number, suggestions: string[]}>} The evaluation result.
     */
    async executeTask(artifact, taskContext) {
        let userPrompt = `原始用户请求是: "${taskContext.originalUserRequest}"`;
        userPrompt += `\n\n这是已生成的产物:\n\`\`\`\n${artifact}\n\`\`\``;
        userPrompt += `\n\n请对其进行评估，并以指定的JSON格式提供您的分数和建议。`;

        const responseJson = await this.llmRequest(userPrompt, true);
        try {
            const responseObject = JSON.parse(responseJson);
            if (responseObject && typeof responseObject.score === 'number' && Array.isArray(responseObject.suggestions)) {
                return responseObject;
            } else {
                throw new Error("来自评估者的响应不是一个有效的评估结果。");
            }
        } catch (e) {
            // If parsing fails, try to recover by looking for a JSON block in the response
            const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    if (parsed && typeof parsed.score === 'number' && Array.isArray(parsed.suggestions)) {
                        return parsed;
                    }
                } catch (parseError) {
                    throw new Error(`无法从LLM响应中解析评估结果，即使在找到JSON块之后。错误: ${parseError.message}`);
                }
            }
            throw new Error(`无法从LLM响应中解析评估结果。错误: ${e.message}`);
        }
    }
}

module.exports = { EvaluatorAgent };

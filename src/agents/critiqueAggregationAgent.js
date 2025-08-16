const { BaseAgent } = require('./baseAgent.js');

const SYSTEM_PROMPT = `你是一位“首席评审员”。你收到了一系列针对某个软件产物的评审意见，每一条都来自不同的AI助手。你的工作是将所有这些反馈整合成一个单一、清晰、可操作的最终评审。

你将收到原始的用户请求和一系列评估结果，每个评估都包含一个分数和一些建议。

你的任务是：
1.  **整合建议：** 将所有建议合并成一个单一、去重且连贯的改进列表。删除冗余的观点，合并相似的想法。
2.  **决定最终分数：** 基于所提供的分数和你对反馈的评估，确定一个最终的、单一的产物分数。这可以是平均分、加权平均分，或者在反馈指出严重问题时的最低分。
3.  **提供总结：** 撰写一个简短、高度概括的总体评估总结。

你必须以一个包含三个键的JSON对象的形式输出你的最终评审："score" (一个数字)，"suggestions" (一个字符串数组)，和 "summary" (一个字符串)。

不要添加任何解释。只输出JSON对象。`;

class CritiqueAggregationAgent extends BaseAgent {
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = SYSTEM_PROMPT;
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }

    /**
     * Aggregates multiple evaluations into a single critique.
     * @param {Array<{score: number, suggestions: string[]}>} evaluations An array of evaluation objects.
     * @param {import('./taskContext').TaskContext} taskContext The current task context.
     * @returns {Promise<{score: number, suggestions: string[], summary: string}>} The aggregated critique.
     */
    async executeTask(evaluations, taskContext) {
        let userPrompt = `原始用户请求是: "${taskContext.originalUserRequest}"`;
        userPrompt += `\n\n这是来自团队的评估结果:\n${JSON.stringify(evaluations, null, 2)}`;
        userPrompt += `\n\n请将这些评估整合成一个单一的、最终的评审，并以指定的JSON格式输出。`;

        const responseJson = await this.llmRequest(userPrompt, true);
        try {
            const responseObject = JSON.parse(responseJson);
            if (responseObject && typeof responseObject.score === 'number' && Array.isArray(responseObject.suggestions) && typeof responseObject.summary === 'string') {
                return responseObject;
            } else {
                throw new Error("来自评审聚合者的响应不是一个有效的评审结果。");
            }
        } catch (e) {
            const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    if (parsed && typeof parsed.score === 'number' && Array.isArray(parsed.suggestions) && typeof parsed.summary === 'string') {
                        return parsed;
                    }
                } catch (parseError) {
                    throw new Error(`无法从LLM响应中解析评审结果，即使在找到JSON块之后。错误: ${parseError.message}`);
                }
            }
            throw new Error(`无法从LLM响应中解析评审结果。错误: ${e.message}`);
        }
    }
}

module.exports = { CritiqueAggregationAgent };

const { BaseAgent } = require('./baseAgent');

class KnowledgeExtractorAgent extends BaseAgent {
    constructor(llm, systemPrompt) {
        super(llm, systemPrompt);
    }

    /**
     * Analyzes a completed task context and extracts generalizable knowledge.
     * @param {TaskContext} taskContext The completed task context.
     * @returns {Promise<string[]>} A list of knowledge strings.
     */
    async executeTask(taskContext) {
        const fullHistory = this.formatContextForExtraction(taskContext);
        const prompt = `${this.systemPrompt}\n\n[任务历史]\n${fullHistory}\n\n请根据以上历史，提取出3-5条最有价值、最可能被未来任务复用的经验或知识点。`;

        try {
            const response = await this.llm.sendRequest([{ role: 'user', content: prompt }]);

            let extractedText = '';
            for await (const chunk of response.stream) {
                if (chunk.textContent) {
                    extractedText += chunk.textContent;
                }
            }

            // The LLM is expected to return a list of lessons, one per line.
            return extractedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        } catch (error) {
            console.error("Error extracting knowledge:", error);
            // In case of an error, return an empty array to not block the process.
            return [];
        }
    }

    formatContextForExtraction(taskContext) {
        let history = `原始用户请求: ${taskContext.originalUserRequest}\n\n`;
        taskContext.history.forEach(iter => {
            history += `--- 第 ${iter.iteration} 轮 ---\n`;
            history += "计划:\n";
            iter.subTasks.forEach(task => {
                history += `- [${task.status}] ${task.description.split('\n\n')[0]}\n`;
                if (task.result) history += `  结果: ${JSON.stringify(task.result)}\n`;
                if (task.error) history += `  错误: ${task.error}\n`;
            });
            history += `\n评估: ${iter.evaluation.score}/10 - ${iter.evaluation.summary}\n`;
            history += `产物:\n\`\`\`\n${iter.artifact}\n\`\`\`\n\n`;
        });
        return history;
    }
}

module.exports = { KnowledgeExtractorAgent };

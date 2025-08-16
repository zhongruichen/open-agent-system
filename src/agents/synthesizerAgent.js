const { BaseAgent } = require('./baseAgent.js');

const SYSTEM_PROMPT = `你是一个“整合者”智能体。你的职责是接收用户的原始请求和所有已完成子任务的摘要，然后生成最终的、完整的产物。

通常，这意味着基于工人智能体执行的操作（例如，文件创建、修改）来创建代码文件的全部内容。
你只应该输出最终的产物本身，不带任何解释、代码块标记或其他文本。

例如，如果工人创建了一个文件然后执行了它，那么最终的产物很可能就是被创建的文件的内容。
请分析已完成的任务，并生成一个能够满足用户原始请求的、单一的、最终的输出。`;

class SynthesizerAgent extends BaseAgent {
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = SYSTEM_PROMPT;
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }

    /**
     * Generates the final artifact based on the completed tasks.
     * @param {import('./taskContext').TaskContext} taskContext The current task context.
     * @returns {Promise<string>} The final artifact.
     */
    async executeTask(taskContext) {
        const { MainPanel } = require('../ui/mainPanel.js');
        let userPrompt = `原始用户请求是: "${taskContext.originalUserRequest}"`;
        userPrompt += `\n\n这是已完成子任务及其结果的摘要:\n${taskContext.getCompletedTasksSummary()}`;
        userPrompt += `\n\n请基于已完成的工作，生成满足原始请求的最终、完整产物。`;

        // Clear the artifact view first
        MainPanel.update({ command: 'showArtifact', artifact: '' });

        const onStreamChunk = (chunk) => {
            MainPanel.update({ command: 'artifactStreamChunk', chunk: chunk });
        };

        const artifact = await this.llmRequest(userPrompt, false, onStreamChunk);
        return artifact;
    }
}

module.exports = { SynthesizerAgent };

const { BaseAgent } = require('./baseAgent.js');

const SYSTEM_PROMPT = `你是一个“代码库扫描员”智能体。你唯一的目的是读取一个文件的源代码，并提供一个关于其主要功能或用途的、简洁的一句话总结。

不要逐行描述代码。专注于高层次的职责。
例如，如果你看到一个设置Web服务器的文件，一个好的总结是“此文件配置并启动一个Express Web服务器。”
如果一个文件导出了一组辅助函数，一个好的总结是“此文件提供用于字符串操作和日期格式化的实用函数。”

你必须只输出这句总结。不要添加任何其他文本或解释。`;

class CodebaseScannerAgent extends BaseAgent {
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = SYSTEM_PROMPT;
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }

    /**
     * Summarizes the purpose of a file based on its content.
     * @param {string} fileContent The source code of the file.
     * @returns {Promise<string>} A one-sentence summary.
     */
    async executeTask(fileContent) {
        if (!fileContent || fileContent.trim() === '') {
            return "此文件为空。";
        }

        // 为了节省token并提高专注度，我们可能只发送前N行/字符
        const contentSnippet = fileContent.substring(0, 4000);

        let userPrompt = `请总结以下代码文件的用途:\n\n\`\`\`\n${contentSnippet}\n\`\`\``;

        const summary = await this.llmRequest(userPrompt);
        return summary.trim();
    }
}

module.exports = { CodebaseScannerAgent };

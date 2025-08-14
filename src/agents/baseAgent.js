const { OpenAICompatibleProvider } = require('../llm/provider.js');

/**
 * The base class for all agents, providing common functionality for interacting with an LLM.
 */
class BaseAgent {
    /**
     * @param {object} modelConfig The configuration for the model to be used by this agent.
     * @param {string} systemPrompt The default system prompt for this agent.
     */
    constructor(modelConfig, systemPrompt) {
        if (!modelConfig) {
            throw new Error("Model configuration is required to initialize an agent.");
        }
        this.modelConfig = modelConfig;
        this.provider = new OpenAICompatibleProvider(modelConfig);
        this.systemPrompt = systemPrompt;
    }

    /**
     * A helper method to make a chat completion request with a consistent system prompt.
     * @param {string} userPrompt The user-facing prompt for this specific task.
     * @param {boolean} [jsonMode=false] Whether to request a JSON response from the LLM.
     * @returns {Promise<string>} The text content of the LLM's response.
     */
    async llmRequest(userPrompt, jsonMode = false) {
        const messages = [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userPrompt }
        ];
        // In a real scenario, you might add more complex history management here.

        return this.provider.chatCompletion(messages, jsonMode);
    }

    /**
     * A placeholder for the main task execution logic, to be implemented by subclasses.
     * @abstract
     */
    async executeTask() {
        throw new Error("The `executeTask` method must be implemented by subclasses.");
    }
}

module.exports = { BaseAgent };

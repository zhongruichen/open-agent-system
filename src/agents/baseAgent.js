const { OpenAICompatibleProvider } = require('../llm/provider.js');

/**
 * The base class for all agents, providing common functionality for interacting with an LLM.
 */
class BaseAgent {
    /**
     * @param {object} modelConfig The configuration for the model to be used by this agent.
     * @param {string} systemPrompt The default system prompt for this agent.
     * @param {string} id The unique identifier for this agent instance.
     * @param {import('events').EventEmitter} messageBus The message bus for inter-agent communication.
     */
    constructor(modelConfig, systemPrompt, id, messageBus) {
        if (!modelConfig) {
            throw new Error("Model configuration is required to initialize an agent.");
        }
        this.modelConfig = modelConfig;
        this.provider = new OpenAICompatibleProvider(modelConfig);
        this.systemPrompt = systemPrompt;
        this.id = id;
        this.messageBus = messageBus;

        if (this.id && this.messageBus) {
            this.messageBus.on(this.id, this.onReceiveMessage.bind(this));
        }
    }

    /**
     * A helper method to make a chat completion request with a consistent system prompt.
     * @param {string} userPrompt The user-facing prompt for this specific task.
     * @param {boolean} [jsonMode=false] Whether to request a JSON response from the LLM.
     * @returns {Promise<string>} The text content of the LLM's response.
     */
    async llmRequest(userPrompt, jsonMode = false, onStreamChunk = null) {
        const messages = [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userPrompt }
        ];
        // In a real scenario, you might add more complex history management here.

        return this.provider.chatCompletion(messages, jsonMode, onStreamChunk);
    }

    /**
     * A placeholder for the main task execution logic, to be implemented by subclasses.
     * @abstract
     */
    async executeTask() {
        throw new Error("The `executeTask` method must be implemented by subclasses.");
    }

    /**
     * Handles incoming messages from the message bus.
     * @param {object} message The message object from another agent.
     */
    onReceiveMessage(message) {
        // Default implementation logs the message. Can be overridden by subclasses.
        const logMessage = `Agent "${this.id}" received a message: ${JSON.stringify(message.content)}`;
        console.log(logMessage);
        // We need a static way to access the panel, or pass it down.
        // For now, let's assume MainPanel can be accessed statically if it's been created.
        if (require('../ui/mainPanel').MainPanel.currentPanel) {
             require('../ui/mainPanel').MainPanel.update({ command: 'log', text: logMessage });
        }
    }

    dispose() {
        if (this.id && this.messageBus) {
            this.messageBus.removeListener(this.id, this.onReceiveMessage);
        }
    }
}

module.exports = { BaseAgent };

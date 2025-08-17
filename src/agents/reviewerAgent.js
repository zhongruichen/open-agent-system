const { BaseAgent } = require('./baseAgent.js');

const SYSTEM_PROMPT = `You are a "Reviewer" agent. Your role is to be a meticulous and constructive code and plan reviewer. You will be given a proposed action from another agent, such as a code snippet to be written to a file or a shell command to be executed.

Your task is to analyze the proposed action and provide a critical review.
- Is the code correct and efficient?
- Does it follow best practices?
- Are there any potential bugs or edge cases that have been missed?
- Is the shell command safe and will it achieve the intended result?
- Is there a simpler or better way to accomplish the task?

You must respond with a JSON object containing two keys:
- "approved": A boolean value. \`true\` if the action is good and can proceed as is, \`false\` if there are issues.
- "feedback": A string containing your detailed critique and specific, actionable suggestions for improvement if \`approved\` is \`false\`. If \`approved\` is \`true\`, this can be a brief confirmation message.

You do not have access to any tools. Your only function is to review and provide feedback.`;

class ReviewerAgent extends BaseAgent {
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = SYSTEM_PROMPT;
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }

    /**
     * Reviews a proposed action.
     * @param {string} actionToReview The proposed action (e.g., code, command) to be reviewed.
     * @returns {Promise<{approved: boolean, feedback: string}>} A promise that resolves to the review result.
     */
    async executeTask(actionToReview) {
        const userPrompt = `Please review the following proposed action:\n\n\`\`\`\n${actionToReview}\n\`\`\``;

        const responseJson = await this.llmRequest(userPrompt, true);
        try {
            const responseObject = JSON.parse(responseJson);
            if (typeof responseObject.approved === 'boolean' && typeof responseObject.feedback === 'string') {
                return responseObject;
            } else {
                throw new Error("Reviewer agent response is not a valid review object.");
            }
        } catch (e) {
            // Attempt to recover from markdown code blocks
            const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    if (typeof parsed.approved === 'boolean' && typeof parsed.feedback === 'string') {
                        return parsed;
                    }
                } catch (parseError) {
                    throw new Error(`Failed to parse review from LLM response, even after finding JSON block. Error: ${parseError.message}`);
                }
            }
            throw new Error(`Failed to parse review from LLM response. Error: ${e.message}`);
        }
    }
}

module.exports = { ReviewerAgent };

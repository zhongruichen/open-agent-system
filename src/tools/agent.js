/**
 * Sends a message to another agent via the provided message bus.
 * @param {string} recipientId The ID of the agent to receive the message.
 * @param {any} messageContent The content of the message.
 * @param {import('events').EventEmitter} agentMessageBus The message bus instance.
 * @returns {Promise<{success: boolean, message: string}>} A confirmation that the message was sent.
 */
async function sendMessage(recipientId, messageContent, agentMessageBus) {
    if (!agentMessageBus) {
        return { success: false, message: "Internal Error: Message bus is not available." };
    }

    const message = {
        content: messageContent,
    };

    agentMessageBus.emit(recipientId, message);

    return { success: true, message: `Message sent to agent "${recipientId}".` };
}

async function createSubTask(recipientRole, taskDescription, agentMessageBus) {
    if (!agentMessageBus) {
        return { success: false, message: "Internal Error: Message bus is not available." };
    }

    const task = {
        recipientRole,
        taskDescription,
    };

    agentMessageBus.emit('createSubTask', task);

    return { success: true, message: `Sub-task creation request sent for role "${recipientRole}".` };
}

module.exports = {
    sendMessage,
    createSubTask,
};

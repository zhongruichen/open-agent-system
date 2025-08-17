async function sendMessage(args, context) {
    const { recipientId, messageContent } = args;
    const { agentMessageBus, senderId, subTaskId } = context;

    if (!agentMessageBus) {
        throw new Error("Internal Error: Message bus is not available.");
    }
    if (!recipientId || !messageContent) {
        throw new Error("sendMessage requires 'recipientId' and 'messageContent' arguments.");
    }

    agentMessageBus.emit('message', {
        senderId: senderId || 'UnknownAgent',
        recipientId: recipientId,
        messageContent: messageContent,
        subTaskId: subTaskId,
    });

    return `Message sent to agent "${recipientId}".`;
}

async function createSubTask(args, context) {
    const { recipientRole, taskDescription } = args;
    const { agentMessageBus } = context;

    if (!agentMessageBus) {
        throw new Error("Internal Error: Message bus is not available.");
    }
    if (!recipientRole || !taskDescription) {
        throw new Error("createSubTask requires 'recipientRole' and 'taskDescription' arguments.");
    }

    agentMessageBus.emit('createSubTask', {
        recipientRole,
        taskDescription,
    });

    return `Sub-task creation request sent for role "${recipientRole}".`;
}

module.exports = {
    sendMessage,
    createSubTask,
};

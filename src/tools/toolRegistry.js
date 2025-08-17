const { writeFile, readFile, listFiles, summarizeFile } = require('./fileSystem.js');
const { executeCommand } = require('./terminal.js');
const { search } = require('./webSearch.js');
const git = require('./git.js');
const dbg = require('./debugger.js');
const agent = require('./agent.js');

// The registry maps tool names to their implementation.
const toolRegistry = {
    'fileSystem.writeFile': writeFile,
    'fileSystem.readFile': readFile,
    'fileSystem.listFiles': listFiles,
    'fileSystem.summarizeFile': summarizeFile,
    'terminal.executeCommand': executeCommand,
    'webSearch.search': search,
    'git.getCurrentBranch': git.getCurrentBranch,
    'git.createBranch': git.createBranch,
    'git.stageFiles': git.stageFiles,
    'git.commit': git.commit,
    'git.getStatus': git.getStatus,
    'debugger.start': dbg.start,
    'debugger.stop': dbg.stop,
    'debugger.addBreakpoint': dbg.addBreakpoint,
    'debugger.removeBreakpoint': dbg.removeBreakpoint,
    'debugger.next': dbg.next,
    'debugger.stepIn': dbg.stepIn,
    'debugger.stepOut': dbg.stepOut,
    'debugger.continue': dbg.continue,
    'debugger.evaluate': dbg.evaluate,
    'agent.sendMessage': agent.sendMessage,
    'agent.createSubTask': agent.createSubTask,
};

/**
 * Executes a tool based on its name and arguments.
 * @param {string} toolName The name of the tool to execute.
 * @param {object} args The arguments for the tool.
 * @param {object} logger A logger object with a logLine method.
 * @param {object} toolContext An object containing contextual tools and instances.
 * @returns {Promise<any>} The result of the tool execution.
 */
async function executeTool(toolName, args, logger, toolContext) {
    const { scannerAgent, workerProfile, agentMessageBus } = toolContext;
    logger.logLine(`\n--- Tool Call ---`);
    logger.logLine(`Tool: ${toolName}`);
    logger.logLine(`Arguments: ${JSON.stringify(args)}`);

    // Security Check: Verify the agent has permission to use the tool.
    if (!workerProfile.allowedTools.includes(toolName)) {
        const errorMsg = `Error: Agent role "Worker" is not authorized to use tool "${toolName}".`;
        logger.logLine(errorMsg);
        throw new Error(errorMsg);
    }

    const toolFunction = toolRegistry[toolName];
    if (!toolFunction) {
        const errorMsg = `Error: Tool "${toolName}" not found.`;
        logger.logLine(errorMsg);
        throw new Error(errorMsg);
    }

    try {
        let result;
        // Calling the tool function with arguments tailored to its signature.
        if (toolName === 'fileSystem.writeFile') {
            result = await toolFunction(args.path, args.content);
        } else if (toolName === 'fileSystem.readFile') {
            result = await toolFunction(args.path);
        } else if (toolName === 'fileSystem.listFiles') {
            result = await toolFunction(args.path || './');
        } else if (toolName === 'fileSystem.summarizeFile') {
            result = await toolFunction(args.path, scannerAgent);
        } else if (toolName === 'terminal.executeCommand') {
            result = await toolFunction(args.command);
        } else if (toolName === 'webSearch.search') {
            result = await toolFunction(args.query);
        } else if (toolName === 'git.getCurrentBranch') {
            result = await toolFunction();
        } else if (toolName === 'git.createBranch') {
            result = await toolFunction(args.branchName);
        } else if (toolName === 'git.stageFiles') {
            result = await toolFunction(args.files);
        } else if (toolName === 'git.commit') {
            result = await toolFunction(args.message);
        } else if (toolName === 'git.getStatus') {
            result = await toolFunction();
        } else if (toolName === 'debugger.start') {
            result = await toolFunction(args.configName);
        } else if (toolName === 'debugger.stop' || toolName === 'debugger.next' || toolName === 'debugger.stepIn' || toolName === 'debugger.stepOut' || toolName === 'debugger.continue') {
            result = await toolFunction();
        } else if (toolName === 'debugger.addBreakpoint' || toolName === 'debugger.removeBreakpoint') {
            result = await toolFunction(args.file, args.line);
        } else if (toolName === 'debugger.evaluate') {
            result = await toolFunction(args.expression);
        } else if (toolName === 'agent.sendMessage') {
            result = await toolFunction(args, toolContext);
        } else if (toolName === 'agent.createSubTask') {
            result = await toolFunction(args.recipientRole, args.taskDescription, agentMessageBus);
        } else {
            throw new Error(`Argument handling for tool "${toolName}" is not implemented.`);
        }

        logger.logLine(`--- Tool Result ---`);
        logger.logLine(result);
        logger.logLine(`--- End Tool ---`);
        return result;
    } catch (error) {
        const errorMsg = `Error executing tool "${toolName}": ${error.message}`;
        logger.logLine(errorMsg);
        throw new Error(errorMsg);
    }
}

module.exports = { executeTool, toolRegistry };

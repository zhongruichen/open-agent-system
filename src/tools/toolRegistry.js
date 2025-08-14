const { writeFile, readFile, listFiles } = require('./fileSystem.js');
const { executeCommand } = require('./terminal.js');
const { search } = require('./webSearch.js');

// The registry maps tool names to their implementation.
const toolRegistry = {
    'fileSystem.writeFile': writeFile,
    'fileSystem.readFile': readFile,
    'fileSystem.listFiles': listFiles,
    'terminal.executeCommand': executeCommand,
    'webSearch.search': search,
};

/**
 * Executes a tool based on its name and arguments.
 * @param {string} toolName The name of the tool to execute (e.g., 'fileSystem.writeFile').
 * @param {object} args The arguments for the tool.
 * @param {object} logger A logger object with a logLine method.
 * @returns {Promise<any>} The result of the tool execution.
 */
async function executeTool(toolName, args, logger) {
    logger.logLine(`\n--- Tool Call ---`);
    logger.logLine(`Tool: ${toolName}`);
    logger.logLine(`Arguments: ${JSON.stringify(args)}`);

    const toolFunction = toolRegistry[toolName];
    if (!toolFunction) {
        const errorMsg = `Error: Tool "${toolName}" not found.`;
        logger.logLine(errorMsg);
        throw new Error(errorMsg);
    }

    try {
        let result;
        // Calling the tool function with arguments tailored to its signature.
        // This is a bit brittle and could be improved with a more generic argument passing mechanism.
        if (toolName === 'fileSystem.writeFile') {
            result = await toolFunction(args.path, args.content);
        } else if (toolName === 'fileSystem.readFile') {
            result = await toolFunction(args.path);
        } else if (toolName === 'fileSystem.listFiles') {
            result = await toolFunction(args.path || './');
        } else if (toolName === 'terminal.executeCommand') {
            result = await toolFunction(args.command);
        } else if (toolName === 'webSearch.search') {
            result = await toolFunction(args.query);
        } else {
            // This case should ideally not be reached if the tool is in the registry
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

module.exports = { executeTool };

const { exec } = require('child_process');
const vscode = require('vscode');
const util = require('util');

const execPromise = util.promisify(exec);

// Get the root path of the workspace
const workspaceRoot = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '.';

/**
 * Executes a shell command in the workspace root.
 * @param {string} command The command to execute.
 * @returns {Promise<string>} The stdout and stderr of the command.
 */
async function executeCommand(command) {
    // Security check: simple blocklist for potentially dangerous commands.
    // A more robust solution would use a more sophisticated sandboxing approach.
    const blocklist = ['rm -rf', 'sudo', 'mv', ':', '>'];
    if (blocklist.some(blocked => command.includes(blocked))) {
        return `Error: Command "${command}" is not allowed for security reasons.`;
    }

    try {
        const { stdout, stderr } = await execPromise(command, { cwd: workspaceRoot });
        let output = '';
        if (stdout) {
            output += `STDOUT:\n${stdout}\n`;
        }
        if (stderr) {
            output += `STDERR:\n${stderr}\n`;
        }
        return output.trim() || "Command executed successfully with no output.";
    } catch (error) {
        return `Error executing command: ${error.message}\nSTDOUT:\n${error.stdout}\nSTDERR:\n${error.stderr}`;
    }
}

module.exports = {
    executeCommand
};

const { exec } = require('child_process');
const vscode = require('vscode');

// Get the root path of the workspace
const workspaceRoot = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '.';

/**
 * A helper function to execute shell commands within the workspace root.
 * @param {string} command The command to execute.
 * @returns {Promise<string>} The stdout from the command.
 */
function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
            if (error) {
                reject(`Error executing command: ${error.message}\nStderr: ${stderr}`);
                return;
            }
            resolve(stdout.trim());
        });
    });
}

/**
 * Gets the current Git branch name.
 * @returns {Promise<string>} The name of the current branch.
 */
async function getCurrentBranch() {
    try {
        const branchName = await executeCommand('git rev-parse --abbrev-ref HEAD');
        return `Current branch is: ${branchName}`;
    } catch (error) {
        return `Error getting current branch: ${error}`;
    }
}

/**
 * Creates a new branch and checks it out.
 * @param {string} branchName The name for the new branch.
 * @returns {Promise<string>} A confirmation message.
 */
async function createBranch(branchName) {
    try {
        // A basic sanitization to prevent command injection
        if (!/^[a-zA-Z0-9\-_/]+$/.test(branchName)) {
            throw new Error("Invalid branch name.");
        }
        await executeCommand(`git checkout -b ${branchName}`);
        return `Successfully created and switched to new branch: ${branchName}`;
    } catch (error) {
        return `Error creating new branch: ${error}`;
    }
}

/**
 * Stages one or more files for commit.
 * @param {string[]} files An array of file paths to stage.
 * @returns {Promise<string>} A confirmation message.
 */
async function stageFiles(files) {
    try {
        if (!Array.isArray(files) || files.length === 0) {
            throw new Error("Files must be provided as a non-empty array.");
        }
        const filePaths = files.join(' ');
        await executeCommand(`git add ${filePaths}`);
        return `Successfully staged files: ${filePaths}`;
    } catch (error) {
        return `Error staging files: ${error}`;
    }
}

/**
 * Commits currently staged files.
 * @param {string} message The commit message.
 * @returns {Promise<string>} A confirmation message.
 */
async function commit(message) {
    try {
        // A basic sanitization for the message
        const sanitizedMessage = message.replace(/"/g, '\\"');
        await executeCommand(`git commit -m "${sanitizedMessage}"`);
        return `Successfully committed with message: "${message}"`;
    } catch (error) {
        return `Error committing: ${error}`;
    }
}

/**
 * Gets the status of the git repository.
 * @returns {Promise<string[]>} A list of files with their status.
 */
async function getStatus() {
    try {
        const statusOutput = await executeCommand('git status --porcelain');
        if (!statusOutput) {
            return [];
        }
        return statusOutput.split('\n').map(line => line.trim());
    } catch (error) {
        // This can happen if it's not a git repository
        return [`Error getting git status: ${error}`];
    }
}

module.exports = {
    getCurrentBranch,
    createBranch,
    stageFiles,
    commit,
    getStatus
};

const fs = require('fs').promises;
const path = require('path');
const vscode = require('vscode');

// Get the root path of the workspace
const workspaceRoot = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '.';

/**
 * Resolves a relative path to an absolute path within the workspace, ensuring it doesn't escape the workspace.
 * @param {string} relativePath The relative path from the user.
 * @returns {string} The resolved, safe absolute path.
 */
function getSafePath(relativePath) {
    const absolutePath = path.resolve(workspaceRoot, relativePath);
    if (!absolutePath.startsWith(workspaceRoot)) {
        throw new Error("Error: Path is outside of the workspace directory. Access denied.");
    }
    return absolutePath;
}

/**
 * Writes content to a file within the workspace.
 * @param {string} relativePath The path relative to the workspace root.
 * @param {string} content The content to write to the file.
 * @returns {Promise<string>} A confirmation message.
 */
async function writeFile(relativePath, content) {
    try {
        const safePath = getSafePath(relativePath);
        await fs.mkdir(path.dirname(safePath), { recursive: true });
        await fs.writeFile(safePath, content, 'utf8');
        return `File "${relativePath}" has been written successfully.`;
    } catch (error) {
        return `Error writing file: ${error.message}`;
    }
}

/**
 * Reads content from a file within the workspace.
 * @param {string} relativePath The path relative to the workspace root.
 * @returns {Promise<string>} The content of the file.
 */
async function readFile(relativePath) {
    try {
        const safePath = getSafePath(relativePath);
        const content = await fs.readFile(safePath, 'utf8');
        return content;
    } catch (error) {
        return `Error reading file: ${error.message}`;
    }
}

/**
 * Lists files and directories at a given path within the workspace.
 * @param {string} relativePath The path relative to the workspace root.
 * @returns {Promise<string>} A string containing the list of files and directories.
 */
async function listFiles(relativePath = './') {
    try {
        const safePath = getSafePath(relativePath);
        const items = await fs.readdir(safePath, { withFileTypes: true });
        const itemList = items.map(item => {
            return item.isDirectory() ? `${item.name}/` : item.name;
        }).join('\n');
        return `Listing for "${relativePath}":\n${itemList}`;
    } catch (error) {
        return `Error listing files: ${error.message}`;
    }
}

/**
 * Reads and summarizes the content of a file using a scanner agent.
 * @param {string} relativePath The path relative to the workspace root.
 * @param {object} scannerAgent An instance of CodebaseScannerAgent.
 * @returns {Promise<string>} A summary of the file content.
 */
async function summarizeFile(relativePath, scannerAgent) {
    try {
        const content = await readFile(relativePath);
        if (content.startsWith('Error reading file:')) {
            throw new Error(content);
        }
        const summary = await scannerAgent.executeTask(content);
        return `Summary of "${relativePath}":\n${summary}`;
    } catch (error) {
        return `Error summarizing file: ${error.message}`;
    }
}

module.exports = {
    writeFile,
    readFile,
    listFiles,
    summarizeFile
};

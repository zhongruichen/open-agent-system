const vscode = require('vscode');

let outputChannel; // Singleton output channel

function createLogChannel() {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel("多智能体日志");
    }
}

function log(message) {
    if (outputChannel) {
        outputChannel.append(String(message));
    }
}

function logLine(message) {
    if (outputChannel) {
        outputChannel.appendLine(String(message));
    }
}

function show() {
    if (outputChannel) {
        outputChannel.show(true); // true to preserve focus
    }
}

function dispose() {
    if (outputChannel) {
        outputChannel.dispose();
        outputChannel = undefined;
    }
}

module.exports = {
    createLogChannel,
    log,
    logLine,
    show,
    dispose
};

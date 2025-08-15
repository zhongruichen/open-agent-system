const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/**
 * Manages the lifecycle of the Multi-Agent Helper webview panel.
 */
class MainPanel {
    static currentPanel = undefined;
    static viewType = 'multiAgentStatus';

    static createOrShow(extensionPath, eventEmitter) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (MainPanel.currentPanel) {
            MainPanel.currentPanel.panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            MainPanel.viewType,
            'Multi-Agent Status',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'dist', 'assets'))]
            }
        );

        MainPanel.currentPanel = new MainPanel(panel, extensionPath, eventEmitter);
    }

    static update(message) {
        if (MainPanel.currentPanel) {
            MainPanel.currentPanel.panel.webview.postMessage(message);
        }
    }

    constructor(panel, extensionPath, eventEmitter) {
        this.panel = panel;
        this.extensionPath = extensionPath;
        this.eventEmitter = eventEmitter;

        this.panel.webview.html = this._getHtmlForWebview();

        this.panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'getSettings':
                        this.sendSettingsToWebview();
                        return;
                    case 'saveSettings':
                        await this.saveSettings(message.settings);
                        return;
                    case 'planApproved':
                        this.eventEmitter.emit('planApproved', message.plan);
                        return;
                    case 'cancelTask':
                        this.eventEmitter.emit('planCancelled');
                        return;
                }
            },
            null,
            []
        );

        this.panel.onDidDispose(() => this.dispose(), null, []);
    }

    sendSettingsToWebview() {
        const { toolRegistry } = require('../tools/toolRegistry.js');
        const config = vscode.workspace.getConfiguration('multiAgent');
        this.panel.webview.postMessage({
            command: 'receiveSettings',
            settings: {
                models: config.get('models', []),
                roles: config.get('roles', []),
                enableSmartScan: config.get('enableSmartScan', false),
                enableParallelExec: config.get('enableParallelExec', false),
                enableAutoMode: config.get('enableAutoMode', false),
                enablePersistence: config.get('enablePersistence', false)
            },
            allTools: Object.keys(toolRegistry)
        });
    }

    async saveSettings(settings) {
        const config = vscode.workspace.getConfiguration('multiAgent');
        await config.update('models', settings.models, vscode.ConfigurationTarget.Workspace);
        await config.update('roleAssignments', settings.roleAssignments, vscode.ConfigurationTarget.Workspace);
        await config.update('enableSmartScan', settings.enableSmartScan, vscode.ConfigurationTarget.Workspace);
        await config.update('enableParallelExec', settings.enableParallelExec, vscode.ConfigurationTarget.Workspace);
        await config.update('enableAutoMode', settings.enableAutoMode, vscode.ConfigurationTarget.Workspace);
        await config.update('enablePersistence', settings.enablePersistence, vscode.ConfigurationTarget.Workspace);
    }

    dispose() {
        // Also emit a cancel event if the panel is closed during review
        this.eventEmitter.emit('planCancelled');
        MainPanel.currentPanel = undefined;
        this.panel.dispose();
    }

    _getHtmlForWebview() {
        const assetsPath = path.join(this.extensionPath, 'dist', 'assets');
        const htmlPath = path.join(assetsPath, 'index.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        htmlContent = htmlContent.replace(/(href|src)="([^"]+)"/g, (match, p1, p2) => {
            const assetUri = vscode.Uri.file(path.join(assetsPath, p2));
            const webviewUri = this.panel.webview.asWebviewUri(assetUri);
            return `${p1}="${webviewUri}"`;
        });

        return htmlContent;
    }
}

module.exports = {
    MainPanel
};

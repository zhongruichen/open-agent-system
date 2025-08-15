const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/**
 * Manages the lifecycle of the Multi-Agent Helper webview panel.
 */
class MainPanel {
    static currentPanel = undefined;
    static viewType = 'multiAgentStatus';

    static createOrShow(extensionPath) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (MainPanel.currentPanel) {
            MainPanel.currentPanel.panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            MainPanel.viewType,
            'Multi-Agent Status',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'dist', 'assets'))]
            }
        );

        MainPanel.currentPanel = new MainPanel(panel, extensionPath);
    }

    static update(message) {
        if (MainPanel.currentPanel) {
            MainPanel.currentPanel.panel.webview.postMessage(message);
        }
    }

    constructor(panel, extensionPath) {
        this.panel = panel;
        this.extensionPath = extensionPath;

        // Set the webview's initial html content
        this.panel.webview.html = this._getHtmlForWebview();

        // Listen for messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'getSettings':
                        this.sendSettingsToWebview();
                        return;
                    case 'saveSettings':
                        await this.saveSettings(message.settings);
                        // Optional: Send a confirmation back to the webview
                        return;
                }
            },
            null,
            []
        );

        // Listen for when the panel is disposed
        this.panel.onDidDispose(() => this.dispose(), null, []);
    }

    sendSettingsToWebview() {
        const config = vscode.workspace.getConfiguration('multiAgent');
        this.panel.webview.postMessage({
            command: 'receiveSettings',
            settings: {
                models: config.get('models', []),
                roleAssignments: config.get('roleAssignments', {}),
                enableSmartScan: config.get('enableSmartScan', false),
                enableParallelExec: config.get('enableParallelExec', false),
                enableAutoMode: config.get('enableAutoMode', false),
                enablePersistence: config.get('enablePersistence', false)
            }
        });
    }

    async saveSettings(settings) {
        const config = vscode.workspace.getConfiguration('multiAgent');
        // Update settings in VS Code configuration
        await config.update('models', settings.models, vscode.ConfigurationTarget.Workspace);
        await config.update('roleAssignments', settings.roleAssignments, vscode.ConfigurationTarget.Workspace);
        await config.update('enableSmartScan', settings.enableSmartScan, vscode.ConfigurationTarget.Workspace);
        await config.update('enableParallelExec', settings.enableParallelExec, vscode.ConfigurationTarget.Workspace);
        await config.update('enableAutoMode', settings.enableAutoMode, vscode.ConfigurationTarget.Workspace);
        await config.update('enablePersistence', settings.enablePersistence, vscode.ConfigurationTarget.Workspace);
    }

    dispose() {
        MainPanel.currentPanel = undefined;
        this.panel.dispose();
    }

    _getHtmlForWebview() {
        const assetsPath = path.join(this.extensionPath, 'dist', 'assets');
        const htmlPath = path.join(assetsPath, 'index.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Replace local asset paths with webview-compatible URIs
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

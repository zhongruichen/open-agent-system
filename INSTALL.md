# 安装指南

本指南将提供如何将“多智能体助手”打包成可安装的 `.vsix` 文件，并在Visual Studio Code中进行安装的说明。

## 安装前置条件

- **Node.js 和 npm:** 您的系统中必须安装 Node.js (其中已包含 npm)。您可以从 [nodejs.org](https://nodejs.org/) 下载。
- **Visual Studio Code:** 必须已安装VS Code编辑器。

## 安装步骤

请在本项目根目录下的终端中，按照以下步骤操作。

### 1. 安装项目依赖

首先，您需要安装所有必需的项目依赖。

```bash
npm install
```

### 2. 打包插件

接着，运行自定义脚本来编译插件，并将其打包成一个 `.vsix` 文件。这个文件就是可安装的插件包。

```bash
npm run package-vsix
```

此命令会先编译项目，然后使用 `vsce` 工具在项目根目录创建一个名为 `multi-agent-helper-2.2.0.vsix` 的文件。

### 3. 在VS Code中安装 `.vsix` 文件

您可以通过两种方式安装打包好的插件：

#### A) 使用命令行

最简单的方式是使用VS Code自带的 `code` 命令行工具。

```bash
code --install-extension multi-agent-helper-2.2.0.vsix
```
*（请将 `multi-agent-helper-2.2.0.vsix` 替换为上一步中实际创建的文件名。）*

#### B) 使用VS Code界面

1.  打开 Visual Studio Code。
2.  点击侧边栏的图标或按 `Ctrl+Shift+X` 进入 **插件** 视图。
3.  点击插件视图顶部的 **...** (更多操作) 按钮。
4.  选择 **从VSIX安装...**。
5.  在弹出的文件对话框中，找到项目根目录，并选择您创建的 `.vsix` 文件。
6.  点击 **安装**。

### 4. 重启VS Code

安装完成后，您可能需要重启VS Code以激活插件。

---

现在您可以开始使用本插件了！关于如何配置和使用的说明，请参阅 [**USAGE_GUIDE.md (使用指南)**](USAGE_GUIDE.md)。

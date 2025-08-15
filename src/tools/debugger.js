const vscode = require('vscode');

async function start(configName) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return { success: false, error: 'No workspace folder is open.' };
  }
  const folder = workspaceFolders[0];

  try {
    await vscode.debug.startDebugging(folder, configName);
    return { success: true, message: `Debugging started with configuration "${configName}".` };
  } catch (error) {
    console.error('Failed to start debugging session:', error);
    return { success: false, error: `Failed to start debugging session: ${error.message}` };
  }
}

async function stop() {
  if (!vscode.debug.activeDebugSession) {
    return { success: false, error: 'No active debug session to stop.' };
  }
  try {
    await vscode.debug.stopDebugging(vscode.debug.activeDebugSession);
    return { success: true, message: 'Debug session stopped.' };
  } catch (error) {
    console.error('Failed to stop debugging session:', error);
    return { success: false, error: `Failed to stop debugging session: ${error.message}` };
  }
}

async function addBreakpoint(file, line) {
  try {
    const location = new vscode.Location(vscode.Uri.file(file), new vscode.Position(line - 1, 0));
    const breakpoint = new vscode.SourceBreakpoint(location);
    vscode.debug.addBreakpoints([breakpoint]);
    return { success: true, message: `Breakpoint added at ${file}:${line}.` };
  } catch (error) {
    console.error('Failed to add breakpoint:', error);
    return { success: false, error: `Failed to add breakpoint: ${error.message}` };
  }
}

async function removeBreakpoint(file, line) {
    try {
        const location = new vscode.Location(vscode.Uri.file(file), new vscode.Position(line - 1, 0));
        const breakpoints = vscode.debug.breakpoints;
        const breakpointToRemove = breakpoints.find(bp => bp instanceof vscode.SourceBreakpoint && bp.location.uri.fsPath === location.uri.fsPath && bp.location.range.start.line === location.range.start.line);

        if (breakpointToRemove) {
            vscode.debug.removeBreakpoints([breakpointToRemove]);
            return { success: true, message: `Breakpoint removed from ${file}:${line}.` };
        } else {
            return { success: false, error: `No breakpoint found at ${file}:${line}.` };
        }
    } catch (error) {
        console.error('Failed to remove breakpoint:', error);
        return { success: false, error: `Failed to remove breakpoint: ${error.message}` };
    }
}

async function sendDebugCommand(command) {
  if (!vscode.debug.activeDebugSession) {
    return { success: false, error: `No active debug session for command: ${command}.` };
  }
  try {
    await vscode.debug.activeDebugSession.customRequest(command);
    return { success: true, message: `Command "${command}" sent.` };
  } catch (error) {
    console.error(`Failed to send command "${command}":`, error);
    return { success: false, error: `Failed to send command "${command}": ${error.message}` };
  }
}

const next = () => sendDebugCommand('next');
const stepIn = () => sendDebugCommand('stepIn');
const stepOut = () => sendDebugCommand('stepOut');
const continueExecution = () => sendDebugCommand('continue');

async function evaluate(expression) {
    if (!vscode.debug.activeDebugSession) {
        return { success: false, error: 'No active debug session to evaluate expression.' };
    }

    const frameId = vscode.debug.activeStackItem?.frameId;

    try {
        const result = await vscode.debug.activeDebugSession.customRequest('evaluate', {
            expression,
            frameId,
            context: 'watch' // or 'repl', 'hover'
        });
        return { success: true, result: result.result, variablesReference: result.variablesReference };
    } catch (error) {
        console.error('Failed to evaluate expression:', error);
        return { success: false, error: `Failed to evaluate expression: ${error.message}` };
    }
}


module.exports = {
  name: 'debugger',
  tools: {
    start,
    stop,
    addBreakpoint,
    removeBreakpoint,
    next,
    stepIn,
    stepOut,
    continue: continueExecution,
    evaluate
  }
};

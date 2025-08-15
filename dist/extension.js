"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/config.js
var require_config = __commonJS({
  "src/config.js"(exports2, module2) {
    "use strict";
    var vscode2 = require("vscode");
    function getModelConfigs() {
      return vscode2.workspace.getConfiguration("multiAgent").get("models", []);
    }
    function getRoleAssignments() {
      return vscode2.workspace.getConfiguration("multiAgent").get("roleAssignments", {});
    }
    function getModelsForRole2(role) {
      const assignments = getRoleAssignments();
      const allModels = getModelConfigs();
      if (allModels.length === 0) {
        return null;
      }
      let modelNames = assignments[role];
      if (role === "evaluationTeam" && (!modelNames || modelNames.length === 0)) {
        const oldEvaluator = assignments["evaluator"];
        if (oldEvaluator) {
          console.warn("Using deprecated 'evaluator' role assignment. Please migrate to 'evaluationTeam'.");
          modelNames = [oldEvaluator];
        }
      }
      if (!modelNames || modelNames.length === 0) {
        return [JSON.parse(JSON.stringify(allModels[0]))];
      }
      const modelNamesArray = Array.isArray(modelNames) ? modelNames : [modelNames];
      const models = modelNamesArray.map((name) => {
        const model = allModels.find((m) => m.name === name);
        return model ? JSON.parse(JSON.stringify(model)) : null;
      }).filter(Boolean);
      if (models.length > 0) {
        return models;
      }
      return [JSON.parse(JSON.stringify(allModels[0]))];
    }
    module2.exports = {
      getModelsForRole: getModelsForRole2
    };
  }
});

// src/logger.js
var require_logger = __commonJS({
  "src/logger.js"(exports2, module2) {
    "use strict";
    var vscode2 = require("vscode");
    var outputChannel;
    function createLogChannel() {
      if (!outputChannel) {
        outputChannel = vscode2.window.createOutputChannel("\u591A\u667A\u80FD\u4F53\u65E5\u5FD7");
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
        outputChannel.show(true);
      }
    }
    function dispose() {
      if (outputChannel) {
        outputChannel.dispose();
        outputChannel = void 0;
      }
    }
    module2.exports = {
      createLogChannel,
      log,
      logLine,
      show,
      dispose
    };
  }
});

// src/tools/fileSystem.js
var require_fileSystem = __commonJS({
  "src/tools/fileSystem.js"(exports2, module2) {
    "use strict";
    var fs2 = require("fs").promises;
    var path2 = require("path");
    var vscode2 = require("vscode");
    var workspaceRoot = vscode2.workspace.workspaceFolders ? vscode2.workspace.workspaceFolders[0].uri.fsPath : ".";
    function getSafePath(relativePath) {
      const absolutePath = path2.resolve(workspaceRoot, relativePath);
      if (!absolutePath.startsWith(workspaceRoot)) {
        throw new Error("Error: Path is outside of the workspace directory. Access denied.");
      }
      return absolutePath;
    }
    async function writeFile(relativePath, content) {
      try {
        const safePath = getSafePath(relativePath);
        await fs2.mkdir(path2.dirname(safePath), { recursive: true });
        await fs2.writeFile(safePath, content, "utf8");
        return `File "${relativePath}" has been written successfully.`;
      } catch (error) {
        return `Error writing file: ${error.message}`;
      }
    }
    async function readFile(relativePath) {
      try {
        const safePath = getSafePath(relativePath);
        const content = await fs2.readFile(safePath, "utf8");
        return content;
      } catch (error) {
        return `Error reading file: ${error.message}`;
      }
    }
    async function listFiles(relativePath = "./") {
      try {
        const safePath = getSafePath(relativePath);
        const items = await fs2.readdir(safePath, { withFileTypes: true });
        const itemList = items.map((item) => {
          return item.isDirectory() ? `${item.name}/` : item.name;
        }).join("\n");
        return `Listing for "${relativePath}":
${itemList}`;
      } catch (error) {
        return `Error listing files: ${error.message}`;
      }
    }
    module2.exports = {
      writeFile,
      readFile,
      listFiles
    };
  }
});

// src/tools/terminal.js
var require_terminal = __commonJS({
  "src/tools/terminal.js"(exports2, module2) {
    "use strict";
    var { exec } = require("child_process");
    var vscode2 = require("vscode");
    var util = require("util");
    var execPromise = util.promisify(exec);
    var workspaceRoot = vscode2.workspace.workspaceFolders ? vscode2.workspace.workspaceFolders[0].uri.fsPath : ".";
    async function executeCommand(command) {
      const blocklist = ["rm -rf", "sudo", "mv", ":", ">"];
      if (blocklist.some((blocked) => command.includes(blocked))) {
        return `Error: Command "${command}" is not allowed for security reasons.`;
      }
      try {
        const { stdout, stderr } = await execPromise(command, { cwd: workspaceRoot });
        let output = "";
        if (stdout) {
          output += `STDOUT:
${stdout}
`;
        }
        if (stderr) {
          output += `STDERR:
${stderr}
`;
        }
        return output.trim() || "Command executed successfully with no output.";
      } catch (error) {
        return `Error executing command: ${error.message}
STDOUT:
${error.stdout}
STDERR:
${error.stderr}`;
      }
    }
    module2.exports = {
      executeCommand
    };
  }
});

// src/tools/webSearch.js
var require_webSearch = __commonJS({
  "src/tools/webSearch.js"(exports2, module2) {
    "use strict";
    async function search(query) {
      if (!query) {
        return "Error: A search query must be provided.";
      }
      try {
        const results = await google_search(query);
        return results;
      } catch (error) {
        return `Error: Failed to perform web search for query "${query}".`;
      }
    }
    module2.exports = {
      search
    };
  }
});

// src/tools/toolRegistry.js
var require_toolRegistry = __commonJS({
  "src/tools/toolRegistry.js"(exports2, module2) {
    "use strict";
    var { writeFile, readFile, listFiles } = require_fileSystem();
    var { executeCommand } = require_terminal();
    var { search } = require_webSearch();
    var toolRegistry = {
      "fileSystem.writeFile": writeFile,
      "fileSystem.readFile": readFile,
      "fileSystem.listFiles": listFiles,
      "terminal.executeCommand": executeCommand,
      "webSearch.search": search
    };
    async function executeTool2(toolName, args, logger2) {
      logger2.logLine(`
--- Tool Call ---`);
      logger2.logLine(`Tool: ${toolName}`);
      logger2.logLine(`Arguments: ${JSON.stringify(args)}`);
      const toolFunction = toolRegistry[toolName];
      if (!toolFunction) {
        const errorMsg = `Error: Tool "${toolName}" not found.`;
        logger2.logLine(errorMsg);
        throw new Error(errorMsg);
      }
      try {
        let result;
        if (toolName === "fileSystem.writeFile") {
          result = await toolFunction(args.path, args.content);
        } else if (toolName === "fileSystem.readFile") {
          result = await toolFunction(args.path);
        } else if (toolName === "fileSystem.listFiles") {
          result = await toolFunction(args.path || "./");
        } else if (toolName === "terminal.executeCommand") {
          result = await toolFunction(args.command);
        } else if (toolName === "webSearch.search") {
          result = await toolFunction(args.query);
        } else {
          throw new Error(`Argument handling for tool "${toolName}" is not implemented.`);
        }
        logger2.logLine(`--- Tool Result ---`);
        logger2.logLine(result);
        logger2.logLine(`--- End Tool ---`);
        return result;
      } catch (error) {
        const errorMsg = `Error executing tool "${toolName}": ${error.message}`;
        logger2.logLine(errorMsg);
        throw new Error(errorMsg);
      }
    }
    module2.exports = { executeTool: executeTool2 };
  }
});

// src/agents/taskContext.js
var require_taskContext = __commonJS({
  "src/agents/taskContext.js"(exports2, module2) {
    "use strict";
    var TaskContext2 = class {
      /**
       * @param {string} originalUserRequest The user's initial request.
       */
      constructor(originalUserRequest) {
        this.originalUserRequest = originalUserRequest;
        this.subTasks = [];
        this.history = [];
        this.currentIteration = 1;
        this.overallProgress = "";
        this.projectContext = "";
      }
      /**
       * Sets the plan for the new iteration.
       * @param {string[]} planDescriptions An array of strings, where each string is a sub-task description.
       */
      setNewPlanForIteration(planDescriptions) {
        this.subTasks = planDescriptions.map((desc, index) => ({
          id: `task_iter${this.currentIteration}_${index + 1}`,
          description: desc,
          status: "pending",
          result: null,
          error: null
        }));
      }
      /**
       * @returns {SubTask | undefined} The next pending sub-task.
       */
      getNextPendingTask() {
        return this.subTasks.find((task) => task.status === "pending");
      }
      /**
       * Updates the status of a sub-task.
       * @param {string} taskId
       * @param {'in_progress' | 'completed' | 'failed'} status
       * @param {string | null} [resultOrError] The result of the task or an error message.
       */
      updateTaskStatus(taskId, status, resultOrError = null) {
        const task = this.subTasks.find((t) => t.id === taskId);
        if (task) {
          task.status = status;
          if (status === "completed") {
            task.result = resultOrError;
            this.overallProgress += `Completed Task: ${task.description}
Result: ${resultOrError}

`;
          } else if (status === "failed") {
            task.error = resultOrError;
            this.overallProgress += `Failed Task: ${task.description}
Error: ${resultOrError}

`;
          }
        }
      }
      /**
       * Archives the results of the current iteration.
       * @param {string} artifact The final artifact produced in this iteration.
       * @param {Evaluation} evaluation The evaluation of the artifact.
       */
      archiveCurrentIteration(artifact, evaluation) {
        this.history.push({
          iteration: this.currentIteration,
          artifact,
          evaluation,
          subTasks: JSON.parse(JSON.stringify(this.subTasks))
          // Deep copy
        });
        this.currentIteration++;
      }
      /**
       * @returns {IterationHistory | null} The most recent iteration's history.
       */
      getLatestIteration() {
        return this.history.length > 0 ? this.history[this.history.length - 1] : null;
      }
      /**
       * @returns {string} A summary of all completed sub-tasks and their results.
       */
      getCompletedTasksSummary() {
        return this.subTasks.filter((task) => task.status === "completed" && task.result).map((task) => `Sub-task: ${task.description}
Result:
${task.result}`).join("\n\n---\n\n");
      }
    };
    module2.exports = { TaskContext: TaskContext2 };
  }
});

// src/llm/provider.js
var require_provider = __commonJS({
  "src/llm/provider.js"(exports2, module2) {
    "use strict";
    var https = require("https");
    var OpenAICompatibleProvider = class {
      /**
       * @param {object} modelConfig The configuration for the model, including apiKey, baseUrl, etc.
       */
      constructor(modelConfig) {
        this.modelConfig = modelConfig;
      }
      /**
       * Makes a chat completion request.
       * @param {Array<object>} messages The array of message objects.
       * @param {boolean} [jsonMode=false] Whether to enable JSON mode.
       * @returns {Promise<string>} The content of the assistant's response.
       */
      async chatCompletion(messages, jsonMode = false) {
        const { apiKey, baseUrl, modelName } = this.modelConfig;
        const url = new URL(baseUrl || "https://api.openai.com");
        url.pathname = url.pathname.replace(/\/v1\/?$/, "") + "/v1/chat/completions";
        const requestBody = {
          model: modelName,
          messages
        };
        if (jsonMode) {
          requestBody.response_format = { type: "json_object" };
        }
        const options = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          hostname: url.hostname,
          port: url.port,
          path: url.pathname
        };
        return new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
            });
            res.on("end", () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  const responseJson = JSON.parse(data);
                  const content = responseJson.choices[0]?.message?.content;
                  if (content) {
                    resolve(content);
                  } else {
                    reject(new Error("API response did not contain valid content."));
                  }
                } catch (e) {
                  reject(new Error(`Failed to parse API response: ${e.message}`));
                }
              } else {
                reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
              }
            });
          });
          req.on("error", (e) => {
            reject(new Error(`API request error: ${e.message}`));
          });
          req.write(JSON.stringify(requestBody));
          req.end();
        });
      }
    };
    module2.exports = { OpenAICompatibleProvider };
  }
});

// src/agents/baseAgent.js
var require_baseAgent = __commonJS({
  "src/agents/baseAgent.js"(exports2, module2) {
    "use strict";
    var { OpenAICompatibleProvider } = require_provider();
    var BaseAgent = class {
      /**
       * @param {object} modelConfig The configuration for the model to be used by this agent.
       * @param {string} systemPrompt The default system prompt for this agent.
       */
      constructor(modelConfig, systemPrompt) {
        if (!modelConfig) {
          throw new Error("Model configuration is required to initialize an agent.");
        }
        this.modelConfig = modelConfig;
        this.provider = new OpenAICompatibleProvider(modelConfig);
        this.systemPrompt = systemPrompt;
      }
      /**
       * A helper method to make a chat completion request with a consistent system prompt.
       * @param {string} userPrompt The user-facing prompt for this specific task.
       * @param {boolean} [jsonMode=false] Whether to request a JSON response from the LLM.
       * @returns {Promise<string>} The text content of the LLM's response.
       */
      async llmRequest(userPrompt, jsonMode = false) {
        const messages = [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: userPrompt }
        ];
        return this.provider.chatCompletion(messages, jsonMode);
      }
      /**
       * A placeholder for the main task execution logic, to be implemented by subclasses.
       * @abstract
       */
      async executeTask() {
        throw new Error("The `executeTask` method must be implemented by subclasses.");
      }
    };
    module2.exports = { BaseAgent };
  }
});

// src/agents/orchestratorAgent.js
var require_orchestratorAgent = __commonJS({
  "src/agents/orchestratorAgent.js"(exports2, module2) {
    "use strict";
    var { BaseAgent } = require_baseAgent();
    var SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u8F6F\u4EF6\u5F00\u53D1\u9879\u76EE\u7ECF\u7406\u3002\u4F60\u7684\u804C\u8D23\u662F\u628A\u7528\u6237\u7684\u9700\u6C42\u5206\u89E3\u6210\u4E00\u4E2A\u6E05\u6670\u3001\u5206\u6B65\u7684\u8BA1\u5212\u3002

\u4F60\u5C06\u6536\u5230\u7528\u6237\u7684\u539F\u59CB\u8BF7\u6C42\u3001\u73B0\u6709\u9879\u76EE\u4EE3\u7801\u5E93\u7684\u6458\u8981\uFF0C\u4EE5\u53CA\u5148\u524D\u8FED\u4EE3\u7684\u5386\u53F2\u8BB0\u5F55\uFF08\u5982\u679C\u6709\uFF09\u3002
\u57FA\u4E8E\u6240\u6709\u8FD9\u4E9B\u4FE1\u606F\uFF0C\u4E3A\u201C\u5DE5\u4EBA\u667A\u80FD\u4F53\u201D\u521B\u5EFA\u4E00\u4E2A\u7B80\u6D01\u7684\u5B50\u4EFB\u52A1\u8BA1\u5212\u4EE5\u4F9B\u6267\u884C\u3002
\u6BCF\u4E2A\u5B50\u4EFB\u52A1\u90FD\u5E94\u8BE5\u662F\u7ED9\u201C\u5DE5\u4EBA\u667A\u80FD\u4F53\u201D\u7684\u5355\u4E2A\u3001\u53EF\u64CD\u4F5C\u7684\u547D\u4EE4\u3002\u597D\u7684\u5B50\u4EFB\u52A1\u662F\u5C0F\u800C\u4E13\u6CE8\u7684\uFF0C\u4F8B\u5982\u201C\u521B\u5EFA\u4E00\u4E2A\u540D\u4E3A 'index.html' \u7684\u6587\u4EF6\u201D\u6216\u201C\u4F7F\u7528npm\u5B89\u88C5 'uuid' \u5305\u201D\u3002

\u5728\u4FEE\u6539\u73B0\u6709\u9879\u76EE\u65F6\uFF0C\u8BF7\u5229\u7528\u63D0\u4F9B\u7684\u9879\u76EE\u4E0A\u4E0B\u6587\u6765\u5236\u5B9A\u8BA1\u5212\u3002\u4F8B\u5982\uFF0C\u5982\u679C\u4E00\u4E2A\u6587\u4EF6\u5DF2\u7ECF\u5B58\u5728\uFF0C\u8BA1\u5212\u5728\u4FEE\u6539\u5B83\u4E4B\u524D\u5148\u8BFB\u53D6\u5B83\u3002

\u5982\u679C\u8FD9\u662F\u7B2C\u4E00\u6B21\u8FED\u4EE3\uFF0C\u8BF7\u6839\u636E\u9879\u76EE\u4E0A\u4E0B\u6587\uFF08\u5982\u679C\u975E\u7A7A\uFF09\u6765\u5236\u5B9A\u5B8C\u6210\u7528\u6237\u8BF7\u6C42\u7684\u8BA1\u5212\u3002
\u5982\u679C\u6709\u4E4B\u524D\u7684\u8FED\u4EE3\uFF0C\u8BF7\u5206\u6790\u201C\u8BC4\u4F30\u8005\u201D\u7684\u53CD\u9988\uFF0C\u5E76\u5236\u5B9A\u4E00\u4E2A\u65B0\u8BA1\u5212\u6765\u89E3\u51B3\u8FD9\u4E9B\u6539\u8FDB\u5EFA\u8BAE\u3002

\u4F60\u5FC5\u987B\u4EE5\u4E00\u4E2AJSON\u5BF9\u8C61\u7684\u5F62\u5F0F\u8F93\u51FA\u4F60\u7684\u8BA1\u5212\uFF0C\u8BE5\u5BF9\u8C61\u5305\u542B\u4E00\u4E2A\u952E "plan"\uFF0C\u5176\u503C\u4E3A\u4E00\u4E2A\u5B57\u7B26\u4E32\u6570\u7EC4\u3002\u6BCF\u4E2A\u5B57\u7B26\u4E32\u662F\u8BA1\u5212\u4E2D\u7684\u4E00\u4E2A\u6B65\u9AA4\u3002

\u4F8B\u5982\uFF0C\u5BF9\u4E8E\u201C\u521B\u5EFA\u4E00\u4E2Ahello world python\u811A\u672C\u201D\u7684\u8BF7\u6C42\uFF0C\u54CD\u5E94\u5E94\u4E3A\uFF1A
{
  "plan": [
    "\u521B\u5EFA\u4E00\u4E2A\u540D\u4E3A 'main.py' \u7684\u6587\u4EF6\uFF0C\u5185\u5BB9\u4E3A 'print("Hello, World!")'",
    "\u5728\u7EC8\u7AEF\u4E2D\u6267\u884C 'python main.py' \u547D\u4EE4\u4EE5\u9A8C\u8BC1\u8F93\u51FA"
  ]
}`;
    var OrchestratorAgent2 = class extends BaseAgent {
      constructor(modelConfig) {
        super(modelConfig, SYSTEM_PROMPT);
      }
      /**
       * Creates a plan to fulfill the user's request.
       * @param {import('./taskContext').TaskContext} taskContext The current task context.
       * @returns {Promise<string[]>} An array of strings representing the plan.
       */
      async executeTask(taskContext) {
        let userPrompt = `\u8FD9\u662F\u73B0\u6709\u9879\u76EE\u4EE3\u7801\u5E93\u7684\u6458\u8981:
${taskContext.projectContext}

`;
        userPrompt += `\u539F\u59CB\u7528\u6237\u8BF7\u6C42: "${taskContext.originalUserRequest}"`;
        const latestIteration = taskContext.getLatestIteration();
        if (latestIteration) {
          userPrompt += `

\u8FD9\u662F\u7B2C ${taskContext.currentIteration} \u8F6E\u8FED\u4EE3\u3002`;
          userPrompt += `
\u8FD9\u662F\u4E0A\u4E00\u8F6E\u8FED\u4EE3\u7684\u4EA7\u7269:
\`\`\`
${latestIteration.artifact}
\`\`\``;
          userPrompt += `
\u8BC4\u4F30\u8005\u7ED9\u51FA\u4E86 ${latestIteration.evaluation.score}/10 \u7684\u8BC4\u5206\uFF0C\u5E76\u63D0\u4F9B\u4E86\u4EE5\u4E0B\u53CD\u9988: ${latestIteration.evaluation.suggestions.join(", ")}`;
          userPrompt += `
\u8BF7\u521B\u5EFA\u4E00\u4E2A\u65B0\u8BA1\u5212\u6765\u5904\u7406\u6B64\u53CD\u9988\u5E76\u6539\u8FDB\u9879\u76EE\u3002`;
        } else {
          userPrompt += `
\u8BF7\u521B\u5EFA\u5B8C\u6210\u6B64\u8BF7\u6C42\u7684\u521D\u59CB\u8BA1\u5212\u3002`;
        }
        const responseJson = await this.llmRequest(userPrompt, true);
        try {
          const responseObject = JSON.parse(responseJson);
          if (responseObject && Array.isArray(responseObject.plan)) {
            return responseObject.plan;
          } else {
            throw new Error("\u6765\u81EA\u89C4\u5212\u8005\u7684\u54CD\u5E94\u4E0D\u662F\u4E00\u4E2A\u6709\u6548\u7684\u8BA1\u5212\u3002");
          }
        } catch (e) {
          const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              const parsed = JSON.parse(jsonMatch[1]);
              if (parsed && Array.isArray(parsed.plan)) {
                return parsed.plan;
              }
            } catch (parseError) {
              throw new Error(`\u65E0\u6CD5\u4ECELLM\u54CD\u5E94\u4E2D\u89E3\u6790\u8BA1\u5212\uFF0C\u5373\u4F7F\u5728\u627E\u5230JSON\u5757\u4E4B\u540E\u3002\u9519\u8BEF: ${parseError.message}`);
            }
          }
          throw new Error(`\u65E0\u6CD5\u4ECELLM\u54CD\u5E94\u4E2D\u89E3\u6790\u8BA1\u5212\u3002\u9519\u8BEF: ${e.message}`);
        }
      }
    };
    module2.exports = { OrchestratorAgent: OrchestratorAgent2 };
  }
});

// src/agents/workerAgent.js
var require_workerAgent = __commonJS({
  "src/agents/workerAgent.js"(exports2, module2) {
    "use strict";
    var { BaseAgent } = require_baseAgent();
    var SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4E2A\u201C\u5DE5\u4EBA\u201D\u667A\u80FD\u4F53\u3002\u4F60\u7684\u5DE5\u4F5C\u662F\u6267\u884C\u9879\u76EE\u7ECF\u7406\u5206\u914D\u7ED9\u4F60\u7684\u5355\u4E2A\u4EFB\u52A1\u3002
\u4F60\u53EF\u4EE5\u4F7F\u7528\u4E00\u7EC4\u5DE5\u5177\u6765\u4E0E\u6587\u4EF6\u7CFB\u7EDF\u548C\u7EC8\u7AEF\u8FDB\u884C\u4EA4\u4E92\u3002

\u57FA\u4E8E\u7528\u6237\u7684\u539F\u59CB\u8BF7\u6C42\u3001\u603B\u4F53\u8BA1\u5212\u3001\u81F3\u4ECA\u5DF2\u5B8C\u6210\u7684\u5DE5\u4F5C\u4EE5\u53CA\u4F60\u5F53\u524D\u7684\u5B50\u4EFB\u52A1\uFF0C\u4F60\u5FC5\u987B\u51B3\u5B9A\u8C03\u7528\u54EA\u4E00\u4E2A\u5DE5\u5177\u3002
\u4F60\u5FC5\u987B\u4EE5\u4E00\u4E2A\u53EA\u5305\u542B "toolName" \u548C "args" \u952E\u7684JSON\u5BF9\u8C61\u4F5C\u4E3A\u54CD\u5E94\uFF0C\u5176\u4E2D "args" \u662F\u8BE5\u5DE5\u5177\u7684\u53C2\u6570\u5BF9\u8C61\u3002

\u91CD\u8981\u63D0\u793A\uFF1A\u5982\u679C\u4EFB\u52A1\u63CF\u8FF0\u4E2D\u5305\u542B\u201C\u524D\u4E00\u6B21\u5C1D\u8BD5\u5931\u8D25\u201D\u7684\u9519\u8BEF\u4FE1\u606F\uFF0C\u4F60\u5FC5\u987B\u5206\u6790\u8BE5\u9519\u8BEF\u5E76\u63D0\u51FA\u4E00\u79CD\u4E0D\u540C\u7684\u65B9\u6CD5\u6765\u89E3\u51B3\u539F\u59CB\u4EFB\u52A1\u3002\u4E0D\u8981\u91CD\u590D\u5931\u8D25\u7684\u547D\u4EE4\u3002\u4F8B\u5982\uFF0C\u5982\u679C\u6587\u4EF6\u672A\u627E\u5230\uFF0C\u8BF7\u5C1D\u8BD5\u5217\u51FA\u6587\u4EF6\u4EE5\u627E\u5230\u6B63\u786E\u7684\u8DEF\u5F84\u3002\u5982\u679C\u547D\u4EE4\u5931\u8D25\uFF0C\u8BF7\u5C1D\u8BD5\u4E0D\u540C\u7684\u547D\u4EE4\u6216\u4F7F\u7528\u7F51\u7EDC\u641C\u7D22\u6765\u5BFB\u627E\u89E3\u51B3\u65B9\u6848\u3002

\u4F60\u53EF\u7528\u7684\u5DE5\u5177\u6709\uFF1A
- 'fileSystem.writeFile': \u5411\u6587\u4EF6\u5199\u5165\u5185\u5BB9\u3002
  - args: { "path": "<\u6587\u4EF6\u7684\u76F8\u5BF9\u8DEF\u5F84>", "content": "<\u6587\u4EF6\u5185\u5BB9>" }
- 'fileSystem.readFile': \u8BFB\u53D6\u6587\u4EF6\u5185\u5BB9\u3002
  - args: { "path": "<\u6587\u4EF6\u7684\u76F8\u5BF9\u8DEF\u5F84>" }
- 'fileSystem.listFiles': \u5217\u51FA\u8DEF\u5F84\u4E0B\u7684\u6587\u4EF6\u548C\u76EE\u5F55\u3002
  - args: { "path": "<\u8981\u5217\u51FA\u7684\u76F8\u5BF9\u8DEF\u5F84>" }
- 'terminal.executeCommand': \u6267\u884C\u4E00\u4E2Ashell\u547D\u4EE4\u3002
  - args: { "command": "<\u8981\u6267\u884C\u7684\u547D\u4EE4>" }
- 'webSearch.search': \u6267\u884C\u7F51\u7EDC\u641C\u7D22\u4EE5\u67E5\u627E\u4FE1\u606F\u3001\u56DE\u7B54\u95EE\u9898\u6216\u83B7\u53D6\u793A\u4F8B\u3002
  - args: { "query": "<\u641C\u7D22\u67E5\u8BE2>" }

\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u89E3\u91CA\u3002\u53EA\u8F93\u51FAJSON\u5BF9\u8C61\u3002

\u4F8B\u5982\uFF0C\u5BF9\u4E8E\u4EFB\u52A1\u201C\u521B\u5EFA\u4E00\u4E2A\u540D\u4E3A 'index.html' \u7684\u6587\u4EF6\uFF0C\u5185\u5BB9\u4E3A '<h1>\u4F60\u597D</h1>'\u201D\u7684\u54CD\u5E94\uFF1A
{
  "toolName": "fileSystem.writeFile",
  "args": {
    "path": "index.html",
    "content": "<h1>\u4F60\u597D</h1>"
  }
}`;
    var WorkerAgent2 = class extends BaseAgent {
      constructor(modelConfig) {
        super(modelConfig, SYSTEM_PROMPT);
      }
      /**
       * Executes a single sub-task.
       * @param {import('./taskContext').SubTask} subTask The sub-task to execute.
       * @param {import('./taskContext').TaskContext} taskContext The overall task context.
       * @returns {Promise<{toolName: string, args: object}>} The tool call to be executed.
       */
      async executeTask(subTask, taskContext) {
        let userPrompt = `\u539F\u59CB\u7528\u6237\u8BF7\u6C42\u662F: "${taskContext.originalUserRequest}"`;
        userPrompt += `

\u8FD9\u662F\u5230\u76EE\u524D\u4E3A\u6B62\u7684\u603B\u4F53\u8FDB\u5C55:
${taskContext.overallProgress}`;
        userPrompt += `

\u4F60\u5F53\u524D\u7684\u4EFB\u52A1\u662F: "${subTask.description}"`;
        userPrompt += `
\u8BF7\u51B3\u5B9A\u4F7F\u7528\u54EA\u4E2A\u5DE5\u5177\u6765\u5B8C\u6210\u6B64\u4EFB\u52A1\uFF0C\u5E76\u63D0\u4F9B\u76F8\u5E94\u7684JSON\u8F93\u51FA\u3002`;
        const responseJson = await this.llmRequest(userPrompt, true);
        try {
          const responseObject = JSON.parse(responseJson);
          if (responseObject && responseObject.toolName && responseObject.args) {
            return responseObject;
          } else {
            throw new Error("\u6765\u81EA\u5DE5\u4EBA\u667A\u80FD\u4F53\u7684\u54CD\u5E94\u4E0D\u662F\u4E00\u4E2A\u6709\u6548\u7684\u5DE5\u5177\u8C03\u7528\u3002");
          }
        } catch (e) {
          const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              const parsed = JSON.parse(jsonMatch[1]);
              if (parsed && parsed.toolName && parsed.args) {
                return parsed;
              }
            } catch (parseError) {
              throw new Error(`\u65E0\u6CD5\u4ECELLM\u54CD\u5E94\u4E2D\u89E3\u6790\u5DE5\u5177\u8C03\u7528\uFF0C\u5373\u4F7F\u5728\u627E\u5230JSON\u5757\u4E4B\u540E\u3002\u9519\u8BEF: ${parseError.message}`);
            }
          }
          throw new Error(`\u65E0\u6CD5\u4ECELLM\u54CD\u5E94\u4E2D\u89E3\u6790\u5DE5\u5177\u8C03\u7528\u3002\u9519\u8BEF: ${e.message}`);
        }
      }
    };
    module2.exports = { WorkerAgent: WorkerAgent2 };
  }
});

// src/agents/synthesizerAgent.js
var require_synthesizerAgent = __commonJS({
  "src/agents/synthesizerAgent.js"(exports2, module2) {
    "use strict";
    var { BaseAgent } = require_baseAgent();
    var SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4E2A\u201C\u6574\u5408\u8005\u201D\u667A\u80FD\u4F53\u3002\u4F60\u7684\u804C\u8D23\u662F\u63A5\u6536\u7528\u6237\u7684\u539F\u59CB\u8BF7\u6C42\u548C\u6240\u6709\u5DF2\u5B8C\u6210\u5B50\u4EFB\u52A1\u7684\u6458\u8981\uFF0C\u7136\u540E\u751F\u6210\u6700\u7EC8\u7684\u3001\u5B8C\u6574\u7684\u4EA7\u7269\u3002

\u901A\u5E38\uFF0C\u8FD9\u610F\u5473\u7740\u57FA\u4E8E\u5DE5\u4EBA\u667A\u80FD\u4F53\u6267\u884C\u7684\u64CD\u4F5C\uFF08\u4F8B\u5982\uFF0C\u6587\u4EF6\u521B\u5EFA\u3001\u4FEE\u6539\uFF09\u6765\u521B\u5EFA\u4EE3\u7801\u6587\u4EF6\u7684\u5168\u90E8\u5185\u5BB9\u3002
\u4F60\u53EA\u5E94\u8BE5\u8F93\u51FA\u6700\u7EC8\u7684\u4EA7\u7269\u672C\u8EAB\uFF0C\u4E0D\u5E26\u4EFB\u4F55\u89E3\u91CA\u3001\u4EE3\u7801\u5757\u6807\u8BB0\u6216\u5176\u4ED6\u6587\u672C\u3002

\u4F8B\u5982\uFF0C\u5982\u679C\u5DE5\u4EBA\u521B\u5EFA\u4E86\u4E00\u4E2A\u6587\u4EF6\u7136\u540E\u6267\u884C\u4E86\u5B83\uFF0C\u90A3\u4E48\u6700\u7EC8\u7684\u4EA7\u7269\u5F88\u53EF\u80FD\u5C31\u662F\u88AB\u521B\u5EFA\u7684\u6587\u4EF6\u7684\u5185\u5BB9\u3002
\u8BF7\u5206\u6790\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\uFF0C\u5E76\u751F\u6210\u4E00\u4E2A\u80FD\u591F\u6EE1\u8DB3\u7528\u6237\u539F\u59CB\u8BF7\u6C42\u7684\u3001\u5355\u4E00\u7684\u3001\u6700\u7EC8\u7684\u8F93\u51FA\u3002`;
    var SynthesizerAgent2 = class extends BaseAgent {
      constructor(modelConfig) {
        super(modelConfig, SYSTEM_PROMPT);
      }
      /**
       * Generates the final artifact based on the completed tasks.
       * @param {import('./taskContext').TaskContext} taskContext The current task context.
       * @returns {Promise<string>} The final artifact.
       */
      async executeTask(taskContext) {
        let userPrompt = `\u539F\u59CB\u7528\u6237\u8BF7\u6C42\u662F: "${taskContext.originalUserRequest}"`;
        userPrompt += `

\u8FD9\u662F\u5DF2\u5B8C\u6210\u5B50\u4EFB\u52A1\u53CA\u5176\u7ED3\u679C\u7684\u6458\u8981:
${taskContext.getCompletedTasksSummary()}`;
        userPrompt += `

\u8BF7\u57FA\u4E8E\u5DF2\u5B8C\u6210\u7684\u5DE5\u4F5C\uFF0C\u751F\u6210\u6EE1\u8DB3\u539F\u59CB\u8BF7\u6C42\u7684\u6700\u7EC8\u3001\u5B8C\u6574\u4EA7\u7269\u3002`;
        const artifact = await this.llmRequest(userPrompt);
        return artifact;
      }
    };
    module2.exports = { SynthesizerAgent: SynthesizerAgent2 };
  }
});

// src/agents/evaluatorAgent.js
var require_evaluatorAgent = __commonJS({
  "src/agents/evaluatorAgent.js"(exports2, module2) {
    "use strict";
    var { BaseAgent } = require_baseAgent();
    var SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u4EE3\u7801\u8BC4\u5BA1\u5458\u548C\u8D28\u91CF\u4FDD\u8BC1\u4E13\u5BB6\u3002\u4F60\u7684\u4EFB\u52A1\u662F\u6839\u636E\u7528\u6237\u7684\u539F\u59CB\u8BF7\u6C42\u6765\u8BC4\u4F30\u7ED9\u5B9A\u7684\u4EA7\u7269\u3002

\u4F60\u5FC5\u987B\u63D0\u4F9B\u4E00\u4E2A\u4ECE1\u523010\u7684\u5206\u6570\uFF0C\u5176\u4E2D10\u5206\u8868\u793A\u4EA7\u7269\u5B8C\u7F8E\u5730\u6EE1\u8DB3\u4E86\u8BF7\u6C42\u4E14\u6CA1\u6709\u4EFB\u4F55\u9519\u8BEF\u3002
\u5982\u679C\u5206\u6570\u4F4E\u4E8E10\u5206\uFF0C\u4F60\u8FD8\u5FC5\u987B\u63D0\u4F9B\u4E00\u4E2A\u5177\u4F53\u7684\u6539\u8FDB\u5EFA\u8BAE\u5217\u8868\u3002\u5982\u679C\u5206\u6570\u4E3A10\u5206\uFF0C\u5EFA\u8BAE\u5217\u8868\u53EF\u4EE5\u4E3A\u7A7A\u3002

\u4F60\u5FC5\u987B\u4EE5\u4E00\u4E2A\u5305\u542B\u4E24\u4E2A\u952E\u7684JSON\u5BF9\u8C61\u7684\u5F62\u5F0F\u8F93\u51FA\u4F60\u7684\u8BC4\u4F30\u7ED3\u679C\uFF1A"score" (\u4E00\u4E2A\u6570\u5B57) \u548C "suggestions" (\u4E00\u4E2A\u5B57\u7B26\u4E32\u6570\u7EC4)\u3002

\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u89E3\u91CA\u3002\u53EA\u8F93\u51FAJSON\u5BF9\u8C61\u3002

\u4F8B\u5982\uFF0C\u5BF9\u4E8E\u4E00\u4E2A\u7F3A\u5C11\u529F\u80FD\u7684\u4EA7\u7269\uFF0C\u54CD\u5E94\u5E94\u4E3A\uFF1A
{
  "score": 7,
  "suggestions": [
    "\u6309\u94AE\u5DF2\u5B58\u5728\uFF0C\u4F46\u7F3A\u5C11\u663E\u793A\u63D0\u793A\u6846\u7684onclick\u4E8B\u4EF6\u5904\u7406\u7A0B\u5E8F\u3002",
    "HTML\u7684\u6807\u9898\u53EF\u4EE5\u66F4\u5177\u63CF\u8FF0\u6027\u3002"
  ]
}`;
    var EvaluatorAgent2 = class extends BaseAgent {
      constructor(modelConfig) {
        super(modelConfig, SYSTEM_PROMPT);
      }
      /**
       * Evaluates the given artifact.
       * @param {string} artifact The artifact to evaluate.
       * @param {import('./taskContext').TaskContext} taskContext The current task context.
       * @returns {Promise<{score: number, suggestions: string[]}>} The evaluation result.
       */
      async executeTask(artifact, taskContext) {
        let userPrompt = `\u539F\u59CB\u7528\u6237\u8BF7\u6C42\u662F: "${taskContext.originalUserRequest}"`;
        userPrompt += `

\u8FD9\u662F\u5DF2\u751F\u6210\u7684\u4EA7\u7269:
\`\`\`
${artifact}
\`\`\``;
        userPrompt += `

\u8BF7\u5BF9\u5176\u8FDB\u884C\u8BC4\u4F30\uFF0C\u5E76\u4EE5\u6307\u5B9A\u7684JSON\u683C\u5F0F\u63D0\u4F9B\u60A8\u7684\u5206\u6570\u548C\u5EFA\u8BAE\u3002`;
        const responseJson = await this.llmRequest(userPrompt, true);
        try {
          const responseObject = JSON.parse(responseJson);
          if (responseObject && typeof responseObject.score === "number" && Array.isArray(responseObject.suggestions)) {
            return responseObject;
          } else {
            throw new Error("\u6765\u81EA\u8BC4\u4F30\u8005\u7684\u54CD\u5E94\u4E0D\u662F\u4E00\u4E2A\u6709\u6548\u7684\u8BC4\u4F30\u7ED3\u679C\u3002");
          }
        } catch (e) {
          const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              const parsed = JSON.parse(jsonMatch[1]);
              if (parsed && typeof parsed.score === "number" && Array.isArray(parsed.suggestions)) {
                return parsed;
              }
            } catch (parseError) {
              throw new Error(`\u65E0\u6CD5\u4ECELLM\u54CD\u5E94\u4E2D\u89E3\u6790\u8BC4\u4F30\u7ED3\u679C\uFF0C\u5373\u4F7F\u5728\u627E\u5230JSON\u5757\u4E4B\u540E\u3002\u9519\u8BEF: ${parseError.message}`);
            }
          }
          throw new Error(`\u65E0\u6CD5\u4ECELLM\u54CD\u5E94\u4E2D\u89E3\u6790\u8BC4\u4F30\u7ED3\u679C\u3002\u9519\u8BEF: ${e.message}`);
        }
      }
    };
    module2.exports = { EvaluatorAgent: EvaluatorAgent2 };
  }
});

// src/agents/critiqueAggregationAgent.js
var require_critiqueAggregationAgent = __commonJS({
  "src/agents/critiqueAggregationAgent.js"(exports2, module2) {
    "use strict";
    var { BaseAgent } = require_baseAgent();
    var SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4F4D\u201C\u9996\u5E2D\u8BC4\u5BA1\u5458\u201D\u3002\u4F60\u6536\u5230\u4E86\u4E00\u7CFB\u5217\u9488\u5BF9\u67D0\u4E2A\u8F6F\u4EF6\u4EA7\u7269\u7684\u8BC4\u5BA1\u610F\u89C1\uFF0C\u6BCF\u4E00\u6761\u90FD\u6765\u81EA\u4E0D\u540C\u7684AI\u52A9\u624B\u3002\u4F60\u7684\u5DE5\u4F5C\u662F\u5C06\u6240\u6709\u8FD9\u4E9B\u53CD\u9988\u6574\u5408\u6210\u4E00\u4E2A\u5355\u4E00\u3001\u6E05\u6670\u3001\u53EF\u64CD\u4F5C\u7684\u6700\u7EC8\u8BC4\u5BA1\u3002

\u4F60\u5C06\u6536\u5230\u539F\u59CB\u7684\u7528\u6237\u8BF7\u6C42\u548C\u4E00\u7CFB\u5217\u8BC4\u4F30\u7ED3\u679C\uFF0C\u6BCF\u4E2A\u8BC4\u4F30\u90FD\u5305\u542B\u4E00\u4E2A\u5206\u6570\u548C\u4E00\u4E9B\u5EFA\u8BAE\u3002

\u4F60\u7684\u4EFB\u52A1\u662F\uFF1A
1.  **\u6574\u5408\u5EFA\u8BAE\uFF1A** \u5C06\u6240\u6709\u5EFA\u8BAE\u5408\u5E76\u6210\u4E00\u4E2A\u5355\u4E00\u3001\u53BB\u91CD\u4E14\u8FDE\u8D2F\u7684\u6539\u8FDB\u5217\u8868\u3002\u5220\u9664\u5197\u4F59\u7684\u89C2\u70B9\uFF0C\u5408\u5E76\u76F8\u4F3C\u7684\u60F3\u6CD5\u3002
2.  **\u51B3\u5B9A\u6700\u7EC8\u5206\u6570\uFF1A** \u57FA\u4E8E\u6240\u63D0\u4F9B\u7684\u5206\u6570\u548C\u4F60\u5BF9\u53CD\u9988\u7684\u8BC4\u4F30\uFF0C\u786E\u5B9A\u4E00\u4E2A\u6700\u7EC8\u7684\u3001\u5355\u4E00\u7684\u4EA7\u7269\u5206\u6570\u3002\u8FD9\u53EF\u4EE5\u662F\u5E73\u5747\u5206\u3001\u52A0\u6743\u5E73\u5747\u5206\uFF0C\u6216\u8005\u5728\u53CD\u9988\u6307\u51FA\u4E25\u91CD\u95EE\u9898\u65F6\u7684\u6700\u4F4E\u5206\u3002
3.  **\u63D0\u4F9B\u603B\u7ED3\uFF1A** \u64B0\u5199\u4E00\u4E2A\u7B80\u77ED\u3001\u9AD8\u5EA6\u6982\u62EC\u7684\u603B\u4F53\u8BC4\u4F30\u603B\u7ED3\u3002

\u4F60\u5FC5\u987B\u4EE5\u4E00\u4E2A\u5305\u542B\u4E09\u4E2A\u952E\u7684JSON\u5BF9\u8C61\u7684\u5F62\u5F0F\u8F93\u51FA\u4F60\u7684\u6700\u7EC8\u8BC4\u5BA1\uFF1A"score" (\u4E00\u4E2A\u6570\u5B57)\uFF0C"suggestions" (\u4E00\u4E2A\u5B57\u7B26\u4E32\u6570\u7EC4)\uFF0C\u548C "summary" (\u4E00\u4E2A\u5B57\u7B26\u4E32)\u3002

\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u89E3\u91CA\u3002\u53EA\u8F93\u51FAJSON\u5BF9\u8C61\u3002`;
    var CritiqueAggregationAgent2 = class extends BaseAgent {
      constructor(modelConfig) {
        super(modelConfig, SYSTEM_PROMPT);
      }
      /**
       * Aggregates multiple evaluations into a single critique.
       * @param {Array<{score: number, suggestions: string[]}>} evaluations An array of evaluation objects.
       * @param {import('./taskContext').TaskContext} taskContext The current task context.
       * @returns {Promise<{score: number, suggestions: string[], summary: string}>} The aggregated critique.
       */
      async executeTask(evaluations, taskContext) {
        let userPrompt = `\u539F\u59CB\u7528\u6237\u8BF7\u6C42\u662F: "${taskContext.originalUserRequest}"`;
        userPrompt += `

\u8FD9\u662F\u6765\u81EA\u56E2\u961F\u7684\u8BC4\u4F30\u7ED3\u679C:
${JSON.stringify(evaluations, null, 2)}`;
        userPrompt += `

\u8BF7\u5C06\u8FD9\u4E9B\u8BC4\u4F30\u6574\u5408\u6210\u4E00\u4E2A\u5355\u4E00\u7684\u3001\u6700\u7EC8\u7684\u8BC4\u5BA1\uFF0C\u5E76\u4EE5\u6307\u5B9A\u7684JSON\u683C\u5F0F\u8F93\u51FA\u3002`;
        const responseJson = await this.llmRequest(userPrompt, true);
        try {
          const responseObject = JSON.parse(responseJson);
          if (responseObject && typeof responseObject.score === "number" && Array.isArray(responseObject.suggestions) && typeof responseObject.summary === "string") {
            return responseObject;
          } else {
            throw new Error("\u6765\u81EA\u8BC4\u5BA1\u805A\u5408\u8005\u7684\u54CD\u5E94\u4E0D\u662F\u4E00\u4E2A\u6709\u6548\u7684\u8BC4\u5BA1\u7ED3\u679C\u3002");
          }
        } catch (e) {
          const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              const parsed = JSON.parse(jsonMatch[1]);
              if (parsed && typeof parsed.score === "number" && Array.isArray(parsed.suggestions) && typeof parsed.summary === "string") {
                return parsed;
              }
            } catch (parseError) {
              throw new Error(`\u65E0\u6CD5\u4ECELLM\u54CD\u5E94\u4E2D\u89E3\u6790\u8BC4\u5BA1\u7ED3\u679C\uFF0C\u5373\u4F7F\u5728\u627E\u5230JSON\u5757\u4E4B\u540E\u3002\u9519\u8BEF: ${parseError.message}`);
            }
          }
          throw new Error(`\u65E0\u6CD5\u4ECELLM\u54CD\u5E94\u4E2D\u89E3\u6790\u8BC4\u5BA1\u7ED3\u679C\u3002\u9519\u8BEF: ${e.message}`);
        }
      }
    };
    module2.exports = { CritiqueAggregationAgent: CritiqueAggregationAgent2 };
  }
});

// src/agents/codebaseScannerAgent.js
var require_codebaseScannerAgent = __commonJS({
  "src/agents/codebaseScannerAgent.js"(exports2, module2) {
    "use strict";
    var { BaseAgent } = require_baseAgent();
    var SYSTEM_PROMPT = `\u4F60\u662F\u4E00\u4E2A\u201C\u4EE3\u7801\u5E93\u626B\u63CF\u5458\u201D\u667A\u80FD\u4F53\u3002\u4F60\u552F\u4E00\u7684\u76EE\u7684\u662F\u8BFB\u53D6\u4E00\u4E2A\u6587\u4EF6\u7684\u6E90\u4EE3\u7801\uFF0C\u5E76\u63D0\u4F9B\u4E00\u4E2A\u5173\u4E8E\u5176\u4E3B\u8981\u529F\u80FD\u6216\u7528\u9014\u7684\u3001\u7B80\u6D01\u7684\u4E00\u53E5\u8BDD\u603B\u7ED3\u3002

\u4E0D\u8981\u9010\u884C\u63CF\u8FF0\u4EE3\u7801\u3002\u4E13\u6CE8\u4E8E\u9AD8\u5C42\u6B21\u7684\u804C\u8D23\u3002
\u4F8B\u5982\uFF0C\u5982\u679C\u4F60\u770B\u5230\u4E00\u4E2A\u8BBE\u7F6EWeb\u670D\u52A1\u5668\u7684\u6587\u4EF6\uFF0C\u4E00\u4E2A\u597D\u7684\u603B\u7ED3\u662F\u201C\u6B64\u6587\u4EF6\u914D\u7F6E\u5E76\u542F\u52A8\u4E00\u4E2AExpress Web\u670D\u52A1\u5668\u3002\u201D
\u5982\u679C\u4E00\u4E2A\u6587\u4EF6\u5BFC\u51FA\u4E86\u4E00\u7EC4\u8F85\u52A9\u51FD\u6570\uFF0C\u4E00\u4E2A\u597D\u7684\u603B\u7ED3\u662F\u201C\u6B64\u6587\u4EF6\u63D0\u4F9B\u7528\u4E8E\u5B57\u7B26\u4E32\u64CD\u4F5C\u548C\u65E5\u671F\u683C\u5F0F\u5316\u7684\u5B9E\u7528\u51FD\u6570\u3002\u201D

\u4F60\u5FC5\u987B\u53EA\u8F93\u51FA\u8FD9\u53E5\u603B\u7ED3\u3002\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u5176\u4ED6\u6587\u672C\u6216\u89E3\u91CA\u3002`;
    var CodebaseScannerAgent2 = class extends BaseAgent {
      constructor(modelConfig) {
        super(modelConfig, SYSTEM_PROMPT);
      }
      /**
       * Summarizes the purpose of a file based on its content.
       * @param {string} fileContent The source code of the file.
       * @returns {Promise<string>} A one-sentence summary.
       */
      async executeTask(fileContent) {
        if (!fileContent || fileContent.trim() === "") {
          return "\u6B64\u6587\u4EF6\u4E3A\u7A7A\u3002";
        }
        const contentSnippet = fileContent.substring(0, 4e3);
        let userPrompt = `\u8BF7\u603B\u7ED3\u4EE5\u4E0B\u4EE3\u7801\u6587\u4EF6\u7684\u7528\u9014:

\`\`\`
${contentSnippet}
\`\`\``;
        const summary = await this.llmRequest(userPrompt);
        return summary.trim();
      }
    };
    module2.exports = { CodebaseScannerAgent: CodebaseScannerAgent2 };
  }
});

// src/ui/mainPanel.js
var require_mainPanel = __commonJS({
  "src/ui/mainPanel.js"(exports2, module2) {
    "use strict";
    var vscode2 = require("vscode");
    var path2 = require("path");
    var fs2 = require("fs");
    var MainPanel2 = class _MainPanel {
      static currentPanel = void 0;
      static viewType = "multiAgentStatus";
      static createOrShow(extensionPath) {
        const column = vscode2.window.activeTextEditor ? vscode2.window.activeTextEditor.viewColumn : void 0;
        if (_MainPanel.currentPanel) {
          _MainPanel.currentPanel.panel.reveal(column);
          return;
        }
        const panel = vscode2.window.createWebviewPanel(
          _MainPanel.viewType,
          "Multi-Agent Status",
          column || vscode2.ViewColumn.Two,
          {
            enableScripts: true,
            localResourceRoots: [vscode2.Uri.file(path2.join(extensionPath, "dist", "assets"))]
          }
        );
        _MainPanel.currentPanel = new _MainPanel(panel, extensionPath);
      }
      static update(message) {
        if (_MainPanel.currentPanel) {
          _MainPanel.currentPanel.panel.webview.postMessage(message);
        }
      }
      constructor(panel, extensionPath) {
        this.panel = panel;
        this.extensionPath = extensionPath;
        this.panel.webview.html = this._getHtmlForWebview();
        this.panel.onDidDispose(() => this.dispose(), null, []);
      }
      dispose() {
        _MainPanel.currentPanel = void 0;
        this.panel.dispose();
      }
      _getHtmlForWebview() {
        const assetsPath = path2.join(this.extensionPath, "dist", "assets");
        const htmlPath = path2.join(assetsPath, "index.html");
        let htmlContent = fs2.readFileSync(htmlPath, "utf8");
        htmlContent = htmlContent.replace(/(href|src)="([^"]+)"/g, (match, p1, p2) => {
          const assetUri = vscode2.Uri.file(path2.join(assetsPath, p2));
          const webviewUri = this.panel.webview.asWebviewUri(assetUri);
          return `${p1}="${webviewUri}"`;
        });
        return htmlContent;
      }
    };
    module2.exports = {
      MainPanel: MainPanel2
    };
  }
});

// src/extension.js
var vscode = require("vscode");
var fs = require("fs").promises;
var path = require("path");
var { getModelsForRole } = require_config();
var logger = require_logger();
var { executeTool } = require_toolRegistry();
var { TaskContext } = require_taskContext();
var { OrchestratorAgent } = require_orchestratorAgent();
var { WorkerAgent } = require_workerAgent();
var { SynthesizerAgent } = require_synthesizerAgent();
var { EvaluatorAgent } = require_evaluatorAgent();
var { CritiqueAggregationAgent } = require_critiqueAggregationAgent();
var { CodebaseScannerAgent } = require_codebaseScannerAgent();
var { MainPanel } = require_mainPanel();
async function scanProject(scannerAgent) {
  MainPanel.update({ command: "log", text: "\u6B63\u5728\u626B\u63CF\u9879\u76EE\u4EE3\u7801\u5E93..." });
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return "\u6CA1\u6709\u6253\u5F00\u7684\u5DE5\u4F5C\u533A\u3002";
  }
  const rootPath = workspaceFolders[0].uri.fsPath;
  let projectContext = "\u9879\u76EE\u7ED3\u6784:\n";
  const ignoreDirs = /* @__PURE__ */ new Set([".git", "node_modules", "dist", "out", ".vscode"]);
  const ignoreExtensions = /* @__PURE__ */ new Set([".lock", ".svg", ".png", ".jpg", ".jpeg", ".gif"]);
  async function walk(dir, indent = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoreDirs.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        projectContext += `${indent}- ${entry.name}/
`;
        await walk(fullPath, indent + "  ");
      } else {
        if (ignoreExtensions.has(path.extname(entry.name))) continue;
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          const summary = await scannerAgent.executeTask(content);
          projectContext += `${indent}- ${entry.name}: ${summary}
`;
        } catch (e) {
          projectContext += `${indent}- ${entry.name}: (\u65E0\u6CD5\u8BFB\u53D6\u6216\u603B\u7ED3\u6587\u4EF6)
`;
        }
      }
    }
  }
  await walk(rootPath);
  MainPanel.update({ command: "log", text: "\u9879\u76EE\u626B\u63CF\u5B8C\u6210\u3002" });
  return projectContext;
}
function activate(context) {
  const a_key = "multiAgentHelper.hasBeenActivated";
  if (!context.globalState.get(a_key)) {
    vscode.window.showInformationMessage("\u6B22\u8FCE\u4F7F\u7528\u591A\u667A\u80FD\u4F53\u52A9\u624B\uFF01\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u60A8\u7684AI\u6A21\u578B\u4EE5\u5F00\u59CB\u4F7F\u7528\u3002");
    context.globalState.update(a_key, true);
  }
  let disposable = vscode.commands.registerCommand("multi-agent-helper.startTask", async () => {
    try {
      logger.createLogChannel();
      MainPanel.createOrShow(context.extensionPath);
      const userRequest = await vscode.window.showInputBox({ prompt: "\u8BF7\u8F93\u5165\u60A8\u7684\u603B\u4F53\u4EFB\u52A1\u76EE\u6807" });
      if (!userRequest) {
        MainPanel.update({ command: "log", text: "\u4EFB\u52A1\u88AB\u7528\u6237\u53D6\u6D88\u3002" });
        return;
      }
      MainPanel.update({ command: "updateGoal", text: userRequest });
      const scannerConfigs = getModelsForRole("codebaseScanner");
      if (!scannerConfigs) {
        vscode.window.showErrorMessage("\u4EE3\u7801\u5E93\u626B\u63CF\u5458\u7684\u6A21\u578B\u914D\u7F6E\u7F3A\u5931\u3002");
        return;
      }
      const scannerAgent = new CodebaseScannerAgent(scannerConfigs[0]);
      const projectContextStr = await scanProject(scannerAgent);
      const orchestratorConfigs = getModelsForRole("orchestrator");
      const workerConfigs = getModelsForRole("worker");
      const synthesizerConfigs = getModelsForRole("synthesizer");
      const evaluationTeamConfigs = getModelsForRole("evaluationTeam");
      const critiqueAggregatorConfigs = getModelsForRole("critiqueAggregator");
      if (!orchestratorConfigs || !workerConfigs || !synthesizerConfigs || !evaluationTeamConfigs || !critiqueAggregatorConfigs) {
        vscode.window.showErrorMessage("\u6A21\u578B\u914D\u7F6E\u4E0D\u5B8C\u6574\u3002\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u4E3A\u6240\u6709\u89D2\u8272\u5B9A\u4E49\u6A21\u578B\u3002");
        return;
      }
      const orchestrator = new OrchestratorAgent(orchestratorConfigs[0]);
      const worker = new WorkerAgent(workerConfigs[0]);
      const synthesizer = new SynthesizerAgent(synthesizerConfigs[0]);
      const critiqueAggregator = new CritiqueAggregationAgent(critiqueAggregatorConfigs[0]);
      const taskContext = new TaskContext(userRequest);
      taskContext.projectContext = projectContextStr;
      const MAX_ITERATIONS = 10;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        MainPanel.update({ command: "log", text: `--- \u7B2C ${taskContext.currentIteration} \u8F6E\u8FED\u4EE3 ---` });
        const plan = await orchestrator.executeTask(taskContext);
        taskContext.setNewPlanForIteration(plan);
        MainPanel.update({ command: "updatePlan", plan: taskContext.subTasks });
        let subTask = taskContext.getNextPendingTask();
        while (subTask) {
          taskContext.updateTaskStatus(subTask.id, "in_progress");
          MainPanel.update({ command: "updatePlan", plan: taskContext.subTasks });
          MainPanel.update({ command: "log", text: `\u6B63\u5728\u6267\u884C\u4EFB\u52A1: ${subTask.description.split("\n\n")[0]}` });
          let attempts = 0;
          const MAX_ATTEMPTS_PER_TASK = 3;
          let lastError = "";
          while (attempts < MAX_ATTEMPTS_PER_TASK) {
            const workerResult = await worker.executeTask(subTask, taskContext);
            try {
              if (workerResult.toolName === "terminal.executeCommand") {
                const userApproval = await vscode.window.showWarningMessage(
                  `\u667A\u80FD\u4F53\u60F3\u8981\u6267\u884C\u4EE5\u4E0B\u547D\u4EE4:

${workerResult.args.command}

\u60A8\u662F\u5426\u6279\u51C6?`,
                  { modal: true },
                  "\u6279\u51C6"
                );
                if (userApproval !== "\u6279\u51C6") throw new Error("\u7528\u6237\u62D2\u7EDD\u4E86\u7EC8\u7AEF\u547D\u4EE4\u7684\u6267\u884C\u3002");
              }
              const toolResult = await executeTool(workerResult.toolName, workerResult.args, logger);
              taskContext.updateTaskStatus(subTask.id, "completed", toolResult);
              MainPanel.update({ command: "log", text: `\u4EFB\u52A1\u6210\u529F\u5B8C\u6210\u3002` });
              lastError = "";
              break;
            } catch (e) {
              attempts++;
              lastError = e.message;
              MainPanel.update({ command: "log", text: `\u7B2C ${attempts} \u6B21\u5C1D\u8BD5\u5931\u8D25: ${lastError}` });
              if (attempts < MAX_ATTEMPTS_PER_TASK) {
                const originalDescription = subTask.description.split("\n\n")[0];
                subTask.description = `${originalDescription}

(\u524D\u4E00\u6B21\u5C1D\u8BD5\u5931\u8D25\uFF0C\u9519\u8BEF\u4FE1\u606F: ${lastError}). \u8BF7\u5206\u6790\u6B64\u9519\u8BEF\u5E76\u5C1D\u8BD5\u4E0D\u540C\u7684\u65B9\u6CD5\u3002`;
                MainPanel.update({ command: "log", text: `\u6B63\u5728\u91CD\u8BD5...` });
              }
            }
          }
          if (lastError) {
            taskContext.updateTaskStatus(subTask.id, "failed", `\u5C1D\u8BD5 ${MAX_ATTEMPTS_PER_TASK} \u6B21\u540E\u4EFB\u52A1\u5931\u8D25\u3002\u6700\u540E\u9519\u8BEF: ${lastError}`);
          }
          MainPanel.update({ command: "updatePlan", plan: taskContext.subTasks });
          subTask = taskContext.getNextPendingTask();
        }
        const artifact = await synthesizer.executeTask(taskContext);
        MainPanel.update({ command: "showArtifact", artifact });
        const evaluationPromises = evaluationTeamConfigs.map((config) => {
          const evaluator = new EvaluatorAgent(config);
          return evaluator.executeTask(artifact, taskContext);
        });
        const evaluations = await Promise.all(evaluationPromises);
        const finalCritique = await critiqueAggregator.executeTask(evaluations, taskContext);
        MainPanel.update({ command: "log", text: `\u6700\u7EC8\u5F97\u5206: ${finalCritique.score}/10. \u603B\u7ED3: ${finalCritique.summary}` });
        taskContext.archiveCurrentIteration(artifact, finalCritique);
        if (finalCritique.score === 10) {
          vscode.window.showInformationMessage("\u4EFB\u52A1\u5DF2\u5B8C\u6210\uFF0C\u8BC4\u5206\u4E3A10/10\uFF01");
          break;
        }
        if (i === MAX_ITERATIONS - 1) {
          vscode.window.showWarningMessage("\u5DF2\u8FBE\u5230\u6700\u5927\u8FED\u4EE3\u6B21\u6570\uFF0C\u4EFB\u52A1\u7EC8\u6B62\u3002");
          break;
        }
        const choice = await vscode.window.showInformationMessage(
          `\u7B2C ${taskContext.currentIteration - 1} \u8F6E\u5B8C\u6210\uFF0C\u5F97\u5206 ${finalCritique.score}/10\u3002
\u603B\u7ED3: ${finalCritique.summary}

\u662F\u5426\u7EE7\u7EED\u4F18\u5316?`,
          { modal: true },
          "\u7EE7\u7EED",
          "\u7EC8\u6B62"
        );
        if (choice !== "\u7EE7\u7EED") break;
      }
      const report = generateReport(taskContext);
      const reportDocument = await vscode.workspace.openTextDocument({ content: report, language: "markdown" });
      await vscode.window.showTextDocument(reportDocument);
    } catch (error) {
      vscode.window.showErrorMessage(`\u53D1\u751F\u4E25\u91CD\u9519\u8BEF: ${error.message}`);
      logger.logLine(`
--- \u53D1\u751F\u4E25\u91CD\u9519\u8BEF ---
${error.stack}`);
    }
  });
  context.subscriptions.push(disposable);
}
function generateReport(taskContext) {
  let report = `# \u591A\u667A\u80FD\u4F53\u4EFB\u52A1\u62A5\u544A

`;
  report += `**\u539F\u59CB\u9700\u6C42:** ${taskContext.originalUserRequest}

`;
  const finalIteration = taskContext.getLatestIteration();
  if (finalIteration) {
    report += `**\u6700\u7EC8\u5F97\u5206:** ${finalIteration.evaluation.score}/10
`;
    if (finalIteration.evaluation.summary) {
      report += `**\u6700\u7EC8\u603B\u7ED3:** ${finalIteration.evaluation.summary}

`;
    }
    report += `## \u6700\u7EC8\u4EA7\u7269

\`\`\`
${finalIteration.artifact}
\`\`\`

`;
  }
  report += `## \u8FED\u4EE3\u5386\u53F2

`;
  for (const iter of taskContext.history) {
    report += `### \u7B2C ${iter.iteration} \u8F6E (\u5F97\u5206: ${iter.evaluation.score}/10)
`;
    if (iter.evaluation.summary) {
      report += `**\u603B\u7ED3:** ${iter.evaluation.summary}
`;
    }
    if (iter.evaluation.suggestions && iter.evaluation.suggestions.length > 0) {
      report += `**\u5EFA\u8BAE:**
` + iter.evaluation.suggestions.map((s) => `- ${s}`).join("\n") + "\n";
    }
    report += `
`;
  }
  return report;
}
function deactivate() {
  MainPanel.currentPanel?.dispose();
}
module.exports = { activate, deactivate };

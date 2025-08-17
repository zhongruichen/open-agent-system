const globals = require("globals");

module.exports = [
  {
    // Configuration for Node.js files (most of the project)
    files: ["src/**/*.js", "!src/ui/assets/main.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        "vscode": "readonly"
      }
    },
    rules: {
      "semi": ["error", "always"],
      "no-unused-vars": ["warn", { "args": "none" }],
      "no-undef": "error",
      "no-prototype-builtins": "off",
      "no-useless-escape": "warn"
    }
  },
  {
    // Configuration specifically for the browser-side UI script
    files: ["src/ui/assets/main.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        "acquireVsCodeApi": "readonly",
        "hljs": "readonly"
      }
    },
    rules: {
      "semi": ["error", "always"],
      "no-unused-vars": "warn",
      "no-undef": "error"
    }
  }
];

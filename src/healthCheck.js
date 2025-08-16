function runHealthCheck(config) {
    const results = {
        errors: [],
        warnings: [],
        success: [],
    };

    const models = config.get('models', []);
    const roles = config.get('roles', []);

    // Check 1: Are there any models defined?
    if (models.length === 0) {
        results.errors.push('配置错误：没有定义任何模型。请在“设置”中至少添加一个模型。');
        // Stop further checks if there are no models
        return results;
    } else {
        results.success.push(`检测到 ${models.length} 个已定义的模型。`);
    }

    // Check 2: Do all models have the required fields?
    const modelNames = new Set();
    models.forEach((model, index) => {
        if (!model.name || !model.provider || !model.modelName || !model.apiKey) {
            results.errors.push(`模型 #${index + 1} 配置不完整。缺少 "name", "provider", "modelName", 或 "apiKey" 字段。`);
        } else {
            results.success.push(`模型 "${model.name}" 的基本字段完整。`);
        }
        if (model.name) {
            if (modelNames.has(model.name)) {
                results.errors.push(`模型名称重复: "${model.name}"。模型名称必须是唯一的。`);
            }
            modelNames.add(model.name);
        }
    });

    // Check 3: Are there any roles defined?
    if (roles.length === 0) {
        results.warnings.push('配置警告：没有定义任何角色。插件将使用默认角色。');
    } else {
        results.success.push(`检测到 ${roles.length} 个已定义的角色。`);
    }

    // Check 4: Do all roles have a valid, existing model assigned?
    const essentialRoles = new Set(['Orchestrator', 'Worker', 'Synthesizer', 'Evaluator', 'CritiqueAggregator', 'CodebaseScanner']);
    const definedRoleNames = new Set(roles.map(r => r.name));

    roles.forEach(role => {
        if (!role.model) {
            results.warnings.push(`角色 "${role.name}" 没有分配模型。它将无法工作。`);
        } else if (!modelNames.has(role.model)) {
            results.errors.push(`配置错误：角色 "${role.name}" 分配的模型 "${role.model}" 不存在于模型列表中。`);
        } else {
            results.success.push(`角色 "${role.name}" 已成功链接到模型 "${role.model}"。`);
        }
    });

    // Check 5: Are all essential roles defined?
    essentialRoles.forEach(essentialRole => {
        if (!definedRoleNames.has(essentialRole)) {
            results.warnings.push(`关键角色 "${essentialRole}" 未定义。插件功能可能会受限。`);
        }
    });

    // Check 6: Does the Worker role have necessary tools?
    const workerRole = roles.find(r => r.name === 'Worker');
    if (workerRole) {
        const workerTools = new Set(workerRole.allowedTools || []);
        if (!workerTools.has('fileSystem.readFile') || !workerTools.has('fileSystem.writeFile')) {
            results.warnings.push('“工人”角色可能缺少基本的文件系统工具（如 readFile, writeFile），这可能会影响其核心功能。');
        } else {
            results.success.push('“工人”角色已配置基本的文件系统工具。');
        }
        if (!workerTools.has('terminal.executeCommand')) {
            results.warnings.push('“工人”角色未被授权使用 `terminal.executeCommand` 工具。编译或运行脚本等任务将无法执行。');
        } else {
            results.success.push('“工人”角色已配置终端工具。');
        }
    }


    return results;
}

module.exports = { runHealthCheck };

const vscode = require('vscode');

/**
 * @returns {Array<object>}
 */
function getModelConfigs() {
    return vscode.workspace.getConfiguration('multiAgent').get('models', []);
}

/**
 * @returns {object}
 */
function getRoleAssignments() {
    return vscode.workspace.getConfiguration('multiAgent').get('roleAssignments', {});
}

/**
 * Gets the model configuration(s) for a given role or team.
 * If the role assignment is a string, it returns an array with a single model config.
 * If the role assignment is an array of strings, it returns an array with all corresponding model configs.
 * Provides a fallback to the first defined model if a specific assignment is not found.
 * @param {string} role The role name (e.g., 'orchestrator', 'evaluationTeam').
 * @returns {Array<object> | null} An array of deep-copied model configuration objects, or null if no models are defined.
 */
function getModelsForRole(role) {
    const assignments = getRoleAssignments();
    const allModels = getModelConfigs();

    if (allModels.length === 0) {
        return null;
    }

    let modelNames = assignments[role];

    // Backward compatibility for users who still have the old 'evaluator' key
    if (role === 'evaluationTeam' && (!modelNames || modelNames.length === 0)) {
        const oldEvaluator = assignments['evaluator'];
        if (oldEvaluator) {
            console.warn("Using deprecated 'evaluator' role assignment. Please migrate to 'evaluationTeam'.");
            modelNames = [oldEvaluator];
        }
    }

    if (!modelNames || modelNames.length === 0) {
        // Fallback to the first model in the list
        return [JSON.parse(JSON.stringify(allModels[0]))];
    }

    const modelNamesArray = Array.isArray(modelNames) ? modelNames : [modelNames];

    const models = modelNamesArray.map(name => {
        const model = allModels.find(m => m.name === name);
        return model ? JSON.parse(JSON.stringify(model)) : null;
    }).filter(Boolean); // Filter out any nulls if a model name wasn't found

    if (models.length > 0) {
        return models;
    }

    // Fallback if assigned models were not found in the list
    return [JSON.parse(JSON.stringify(allModels[0]))];
}

module.exports = {
    getModelsForRole
};

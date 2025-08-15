const vscode = require('vscode');

/**
 * @returns {Array<object>}
 */
function getModelConfigs() {
    return vscode.workspace.getConfiguration('multiAgent').get('models', []);
}

/**
 * @returns {Array<object>}
 */
function getRoleProfiles() {
    return vscode.workspace.getConfiguration('multiAgent').get('roles', []);
}

/**
 * Gets a specific role profile by name.
 * @param {string} roleName The name of the role to find (case-insensitive).
 * @returns {object | undefined} The role profile object.
 */
function getRoleProfile(roleName) {
    const roles = getRoleProfiles();
    return roles.find(r => r.name.toLowerCase() === roleName.toLowerCase());
}

/**
 * Gets the full model configuration for a given role name.
 * @param {string} roleName The role name (e.g., 'Orchestrator').
 * @returns {object | null} The model configuration object, or null if not found.
 */
function getModelForRole(roleName) {
    const allModels = getModelConfigs();
    if (allModels.length === 0) {
        return null;
    }

    const roleProfile = getRoleProfile(roleName);
    if (!roleProfile || !roleProfile.model) {
        // Fallback to the first model if role or model assignment is missing
        return JSON.parse(JSON.stringify(allModels[0]));
    }

    const model = allModels.find(m => m.name === roleProfile.model);
    if (model) {
        return JSON.parse(JSON.stringify(model));
    }

    // Fallback if the assigned model is not found
    return JSON.parse(JSON.stringify(allModels[0]));
}

/**
 * Gets the model configurations for a team role (which can have multiple models).
 * This is specifically for the 'Evaluator' role, which is treated as a team.
 * @returns {Array<object>} An array of model configuration objects.
 */
function getModelsForTeam(teamName = 'Evaluator') {
    // For now, the "team" is just the single configured Evaluator.
    // This can be expanded later to support multiple models for one role.
    const model = getModelForRole(teamName);
    return model ? [model] : [];
}


module.exports = {
    getModelForRole,
    getModelsForTeam,
    getRoleProfile
};

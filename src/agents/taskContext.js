/**
 * @typedef {{id: number, description: string, dependencies: number[], status: 'pending' | 'in_progress' | 'completed' | 'failed', result: string | null, error: string | null}} SubTask
 * @typedef {{score: number, suggestions: string[]}} Evaluation
 * @typedef {{iteration: number, artifact: string, evaluation: Evaluation, subTasks: SubTask[]}} IterationHistory
 */

/**
 * Manages the state of the multi-agent task across all steps and iterations.
 */
class TaskContext {
    /**
     * @param {string} originalUserRequest The user's initial request.
     */
    constructor(originalUserRequest) {
        this.originalUserRequest = originalUserRequest;
        /** @type {SubTask[]} */
        this.subTasks = [];
        /** @type {IterationHistory[]} */
        this.history = [];
        this.currentIteration = 1;
        this.overallProgress = ""; // A summary of what has been done so far.
        this.projectContext = ""; // A summary of the existing codebase.
    }

    /**
     * Adds retrieved knowledge to the beginning of the project context.
     * @param {string} knowledge The knowledge string retrieved from the knowledge base.
     */
    addRelevantKnowledge(knowledge) {
        if (knowledge && typeof knowledge === 'string' && knowledge.trim().length > 0) {
            this.projectContext = `${knowledge}\n\n---\n\n${this.projectContext}`;
        }
    }

    /**
     * Sets the plan for the new iteration.
     * @param {object[]} planObjects An array of objects from the orchestrator.
     */
    setNewPlanForIteration(planObjects) {
        this.subTasks = planObjects.map(planObj => ({
            id: planObj.id,
            description: planObj.description,
            dependencies: planObj.dependencies || [],
            status: 'pending',
            result: null,
            error: null,
        }));
    }

    /**
     * Gets all tasks that are currently able to run (i.e., their dependencies are met).
     * @returns {SubTask[]} An array of runnable sub-tasks.
     */
    getRunnableTasks() {
        const completedTaskIds = new Set(
            this.subTasks
                .filter(t => t.status === 'completed')
                .map(t => t.id)
        );

        return this.subTasks.filter(task => {
            if (task.status !== 'pending') {
                return false;
            }
            return task.dependencies.every(depId => completedTaskIds.has(depId));
        });
    }

    /**
     * Checks if all tasks for the current iteration are finished (either completed or failed).
     * @returns {boolean}
     */
    areAllTasksDone() {
        return this.subTasks.every(t => t.status === 'completed' || t.status === 'failed');
    }


    /**
     * Updates the status of a sub-task.
     * @param {number} taskId
     * @param {'in_progress' | 'completed' | 'failed'} status
     * @param {string | null} [resultOrError] The result of the task or an error message.
     */
    updateTaskStatus(taskId, status, resultOrError = null) {
        const task = this.subTasks.find(t => t.id === taskId);
        if (task) {
            task.status = status;
            if (status === 'completed') {
                task.result = resultOrError;
                // Update overall progress summary
                this.overallProgress += `Completed Task ${task.id}: ${task.description}\nResult: ${resultOrError}\n\n`;
            } else if (status === 'failed') {
                task.error = resultOrError;
                this.overallProgress += `Failed Task ${task.id}: ${task.description}\nError: ${resultOrError}\n\n`;
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
            artifact: artifact,
            evaluation: evaluation,
            subTasks: JSON.parse(JSON.stringify(this.subTasks)) // Deep copy
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
        return this.subTasks
            .filter(task => task.status === 'completed' && task.result)
            .map(task => `Sub-task ${task.id}: ${task.description}\nResult:\n${task.result}`)
            .join('\n\n---\n\n');
    }
}

module.exports = { TaskContext };

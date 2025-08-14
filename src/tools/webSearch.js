/**
 * Performs a web search using the built-in google_search tool.
 * @param {string} query The search query.
 * @returns {Promise<string>} A string containing the search results.
 */
async function search(query) {
    if (!query) {
        return "Error: A search query must be provided.";
    }

    try {
        // The 'google_search' function is a built-in tool available in my environment.
        const results = await google_search(query);
        return results;
    } catch (error) {
        // console.error is not available in this environment
        // console.error(`Error during web search: ${error.message}`);
        return `Error: Failed to perform web search for query "${query}".`;
    }
}

module.exports = {
    search
};

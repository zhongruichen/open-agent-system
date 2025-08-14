const https = require('https');

/**
 * A provider class for making chat completion requests to an OpenAI-compatible API.
 */
class OpenAICompatibleProvider {
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

        // Determine the correct API endpoint URL
        const url = new URL(baseUrl || 'https://api.openai.com');
        url.pathname = url.pathname.replace(/\/v1\/?$/, '') + '/v1/chat/completions';

        const requestBody = {
            model: modelName,
            messages: messages,
        };

        if (jsonMode) {
            requestBody.response_format = { type: 'json_object' };
        }

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const responseJson = JSON.parse(data);
                            const content = responseJson.choices[0]?.message?.content;
                            if (content) {
                                resolve(content);
                            } else {
                                reject(new Error('API response did not contain valid content.'));
                            }
                        } catch (e) {
                            reject(new Error(`Failed to parse API response: ${e.message}`));
                        }
                    } else {
                        reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (e) => {
                reject(new Error(`API request error: ${e.message}`));
            });

            req.write(JSON.stringify(requestBody));
            req.end();
        });
    }
}

module.exports = { OpenAICompatibleProvider };

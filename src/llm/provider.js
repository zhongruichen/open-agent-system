const https = require('https');
const { URL } = require('url');

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
     * @param {(chunk: string) => void} [onStreamChunk=null] A callback for handling streaming chunks.
     * @returns {Promise<string>} The full content of the assistant's response.
     */
    async chatCompletion(messages, jsonMode = false, onStreamChunk = null) {
        const { apiKey, baseUrl, modelName } = this.modelConfig;

        const url = new URL(baseUrl || 'https://api.openai.com');
        url.pathname = url.pathname.replace(/\/v1\/?$/, '') + '/v1/chat/completions';

        const requestBody = {
            model: modelName,
            messages: messages,
        };

        if (jsonMode) {
            requestBody.response_format = { type: 'json_object' };
        }

        const useStream = !!onStreamChunk;
        if (useStream) {
            requestBody.stream = true;
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
                let fullContent = '';

                if (res.statusCode < 200 || res.statusCode >= 300) {
                    let errorData = '';
                    res.on('data', chunk => errorData += chunk);
                    res.on('end', () => reject(new Error(`API request failed with status ${res.statusCode}: ${errorData}`)));
                    return;
                }

                res.on('data', (chunk) => {
                    const chunkStr = chunk.toString();
                    if (useStream) {
                        // Process Server-Sent Events (SSE)
                        const lines = chunkStr.split('\n').filter(line => line.trim() !== '');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const dataStr = line.substring(6);
                                if (dataStr === '[DONE]') {
                                    // Stream finished
                                    return;
                                }
                                try {
                                    const data = JSON.parse(dataStr);
                                    const deltaContent = data.choices[0]?.delta?.content;
                                    if (deltaContent) {
                                        fullContent += deltaContent;
                                        onStreamChunk(deltaContent);
                                    }
                                } catch (e) {
                                    // Ignore parsing errors for non-JSON chunks
                                }
                            }
                        }
                    } else {
                        fullContent += chunkStr;
                    }
                });

                res.on('end', () => {
                    if (useStream) {
                        resolve(fullContent);
                    } else {
                        try {
                            const responseJson = JSON.parse(fullContent);
                            const content = responseJson.choices[0]?.message?.content;
                            if (content) {
                                resolve(content);
                            } else {
                                reject(new Error('API response did not contain valid content.'));
                            }
                        } catch (e) {
                            reject(new Error(`Failed to parse API response: ${e.message}`));
                        }
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

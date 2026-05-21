const {
  isRecoverableProviderError,
  sanitizeProviderError,
  toString,
} = require('../llm-validation');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function extractText(response) {
  const candidates = response?.data?.candidates || response?.candidates || [];
  const candidate = candidates[0];
  const parts = candidate?.content?.parts || [];

  return parts
    .map(part => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function buildErrorResponse(provider, model, error, raw = null) {
  const sanitized = sanitizeProviderError(error);
  return {
    ok: false,
    provider,
    model,
    recoverable: isRecoverableProviderError(error),
    code: sanitized.status ? `HTTP_${sanitized.status}` : (sanitized.code || 'GEMINI_ERROR'),
    message: sanitized.message,
    raw: raw || sanitized,
  };
}

function createGeminiAdapter(providerConfig = {}, options = {}) {
  const provider = 'gemini';

  async function request(url, requestConfig) {
    if (typeof options.request === 'function') {
      return options.request(url, requestConfig);
    }

    let axios;
    try {
      axios = require('axios');
    } catch (error) {
      throw new Error('Axios is not installed.');
    }

    return axios.request({ url, ...requestConfig });
  }

  async function generateText(requestInput = {}) {
    const apiKey = toString(providerConfig.apiKey);
    const model = toString(requestInput.model || providerConfig.model);

    if (!apiKey) {
      return {
        ok: false,
        provider,
        model,
        recoverable: false,
        code: 'MISSING_API_KEY',
        message: 'Missing Gemini API key.',
        raw: null,
      };
    }

    if (!model) {
      return {
        ok: false,
        provider,
        model: null,
        recoverable: false,
        code: 'MISSING_MODEL',
        message: 'Missing Gemini model.',
        raw: null,
      };
    }

    const baseUrl = providerConfig.baseUrl || GEMINI_BASE_URL;
    const url = `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`;

    try {
      const response = await request(url, {
        method: 'POST',
        params: {
          key: apiKey,
        },
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        data: {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: requestInput.prompt || '',
                },
              ],
            },
          ],
          ...(toString(requestInput.systemPrompt)
            ? {
                systemInstruction: {
                  parts: [{ text: requestInput.systemPrompt }],
                },
              }
            : {}),
          generationConfig: {
            temperature: typeof requestInput.temperature === 'number' ? requestInput.temperature : undefined,
            maxOutputTokens: Number.isInteger(requestInput.maxOutputTokens) ? requestInput.maxOutputTokens : undefined,
            responseMimeType: requestInput.jsonMode ? 'application/json' : undefined,
          },
        },
        timeout: options.timeoutMs || 10000,
      });

      const text = extractText(response);
      if (!toString(text)) {
        return {
          ok: false,
          provider,
          model,
          recoverable: false,
          code: 'EMPTY_RESPONSE',
          message: 'Gemini returned an empty response.',
          raw: response?.data || response,
        };
      }

      return {
        ok: true,
        text,
        json: null,
        provider,
        model,
        usage: response?.data?.usageMetadata || response?.usageMetadata || null,
        raw: response?.data || response,
      };
    } catch (error) {
      return buildErrorResponse(provider, model, error, error?.response?.data || null);
    }
  }

  return {
    provider,
    generateText,
  };
}

module.exports = {
  createGeminiAdapter,
  GEMINI_BASE_URL,
};

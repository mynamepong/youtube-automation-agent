const {
  isRecoverableProviderError,
  sanitizeProviderError,
  toString,
} = require('../llm-validation');

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

function extractText(response) {
  const content = response?.data?.content || response?.content || [];

  if (Array.isArray(content)) {
    return content
      .map(block => (typeof block?.text === 'string' ? block.text : ''))
      .filter(Boolean)
      .join('\n');
  }

  if (typeof response?.data?.text === 'string') {
    return response.data.text;
  }

  return '';
}

function buildErrorResponse(provider, model, error, raw = null) {
  const sanitized = sanitizeProviderError(error);
  return {
    ok: false,
    provider,
    model,
    recoverable: isRecoverableProviderError(error),
    code: sanitized.status ? `HTTP_${sanitized.status}` : (sanitized.code || 'ANTHROPIC_ERROR'),
    message: sanitized.message,
    raw: raw || sanitized,
  };
}

function createAnthropicAdapter(providerConfig = {}, options = {}) {
  const provider = 'anthropic';

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
        message: 'Missing Anthropic API key.',
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
        message: 'Missing Anthropic model.',
        raw: null,
      };
    }

    const baseUrl = providerConfig.baseUrl || ANTHROPIC_BASE_URL;

    try {
      const response = await request(`${baseUrl.replace(/\/$/, '')}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          Accept: 'application/json',
        },
        data: {
          model,
          max_tokens: Number.isInteger(requestInput.maxOutputTokens) ? requestInput.maxOutputTokens : 1024,
          temperature: typeof requestInput.temperature === 'number' ? requestInput.temperature : undefined,
          system: toString(requestInput.systemPrompt) || undefined,
          messages: [
            {
              role: 'user',
              content: requestInput.prompt || '',
            },
          ],
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
          message: 'Anthropic returned an empty response.',
          raw: response?.data || response,
        };
      }

      return {
        ok: true,
        text,
        json: null,
        provider,
        model,
        usage: response?.data?.usage || response?.usage || null,
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
  createAnthropicAdapter,
  ANTHROPIC_BASE_URL,
};

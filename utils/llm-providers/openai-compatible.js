const {
  isRecoverableProviderError,
  sanitizeProviderError,
  toString,
} = require('../llm-validation');

function extractText(response) {
  const choice = response?.data?.choices?.[0] || response?.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
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
    code: sanitized.status ? `HTTP_${sanitized.status}` : (sanitized.code || 'OPENAI_COMPATIBLE_ERROR'),
    message: sanitized.message,
    raw: raw || sanitized,
  };
}

function createOpenAICompatibleAdapter(providerId, providerConfig = {}, options = {}) {
  const provider = providerId;

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
    const baseUrl = toString(providerConfig.baseUrl || options.baseUrl);

    if (!baseUrl) {
      return {
        ok: false,
        provider,
        model,
        recoverable: false,
        code: 'MISSING_BASE_URL',
        message: `Missing base URL for ${provider}.`,
        raw: null,
      };
    }

    if (!apiKey) {
      return {
        ok: false,
        provider,
        model,
        recoverable: false,
        code: 'MISSING_API_KEY',
        message: `Missing API key for ${provider}.`,
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
        message: `Missing model for ${provider}.`,
        raw: null,
      };
    }

    try {
      const response = await request(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        data: {
          model,
          messages: [
            ...(toString(requestInput.systemPrompt)
              ? [{ role: 'system', content: requestInput.systemPrompt }]
              : []),
            {
              role: 'user',
              content: requestInput.prompt || '',
            },
          ],
          temperature: typeof requestInput.temperature === 'number' ? requestInput.temperature : undefined,
          max_tokens: Number.isInteger(requestInput.maxOutputTokens) ? requestInput.maxOutputTokens : undefined,
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
          message: `${provider} returned an empty response.`,
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
  createOpenAICompatibleAdapter,
};

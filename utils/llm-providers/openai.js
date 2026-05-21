const {
  isRecoverableProviderError,
  sanitizeProviderError,
  toString,
} = require('../llm-validation');

function extractText(response) {
  const choice = response?.choices?.[0];
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
    code: sanitized.status ? `HTTP_${sanitized.status}` : (sanitized.code || 'OPENAI_ERROR'),
    message: sanitized.message,
    raw: raw || sanitized,
  };
}

function createOpenAIAdapter(providerConfig = {}, options = {}) {
  const provider = 'openai';

  async function createClient() {
    if (typeof options.clientFactory === 'function') {
      return options.clientFactory(providerConfig, options);
    }

    let OpenAI;
    try {
      OpenAI = require('openai');
    } catch (error) {
      throw new Error('OpenAI SDK is not installed.');
    }

    return new OpenAI({
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseUrl || undefined,
    });
  }

  async function generateText(request = {}) {
    const model = toString(request.model || providerConfig.model);
    if (!toString(providerConfig.apiKey)) {
      return {
        ok: false,
        provider,
        model,
        recoverable: false,
        code: 'MISSING_API_KEY',
        message: 'Missing OpenAI API key.',
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
        message: 'Missing OpenAI model.',
        raw: null,
      };
    }

    try {
      const client = await createClient();
      const messages = [];
      if (toString(request.systemPrompt)) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      messages.push({ role: 'user', content: request.prompt || '' });

      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: typeof request.temperature === 'number' ? request.temperature : undefined,
        max_tokens: Number.isInteger(request.maxOutputTokens) ? request.maxOutputTokens : undefined,
        response_format: request.jsonMode ? { type: 'json_object' } : undefined,
      });

      const text = extractText(response);
      if (!toString(text)) {
        return {
          ok: false,
          provider,
          model,
          recoverable: false,
          code: 'EMPTY_RESPONSE',
          message: 'OpenAI returned an empty response.',
          raw: response,
        };
      }

      return {
        ok: true,
        text,
        json: null,
        provider,
        model,
        usage: response?.usage || null,
        raw: response,
      };
    } catch (error) {
      return buildErrorResponse(provider, model, error);
    }
  }

  return {
    provider,
    generateText,
  };
}

module.exports = {
  createOpenAIAdapter,
};

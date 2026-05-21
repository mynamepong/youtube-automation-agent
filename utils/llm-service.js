const { Logger } = require('./logger');
const { getProvider } = require('./llm-provider-registry');
const { createProviderAdapter } = require('./llm-providers');
const {
  isNonEmptyString,
  isPlainObject,
  isRecoverableProviderError,
  normalizeStringArray,
  safeParseJson,
  sanitizeProviderError,
  stripMarkdownJsonFence,
  validateSchemaValue,
  redactSensitiveText,
} = require('./llm-validation');

function toString(value) {
  return isNonEmptyString(value) ? value.trim() : '';
}

function isTaskMap(value) {
  return isPlainObject(value) ? value : null;
}

class LLMService {
  constructor(credentials = {}, options = {}) {
    this.credentials = credentials || {};
    this.logger = options.logger || new Logger('LLMService');
    this.adapterOverrides = isPlainObject(options.adapterOverrides) ? options.adapterOverrides : {};
    this.adapterOptions = isPlainObject(options.adapterOptions) ? options.adapterOptions : {};
    this.currentAIConfig = null;
    this.activeProvider = null;
    this.activeModel = null;
    this.activeTask = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      await this.refreshAIConfig();
      this.initialized = true;
      return true;
    } catch (error) {
      this.logger.warn(`[LLMService] initialization skipped: ${this._sanitizeMessage(error)}`);
      return false;
    }
  }

  async refreshAIConfig() {
    this.currentAIConfig = await this._loadAIConfig();
    return this.currentAIConfig;
  }

  async _loadAIConfig() {
    try {
      if (typeof this.credentials?.getAIConfig === 'function') {
        return await this.credentials.getAIConfig();
      }
    } catch (error) {
      this.logger.warn(`[LLMService] failed to read AI config: ${this._sanitizeMessage(error)}`);
      return null;
    }

    if (isPlainObject(this.credentials?.ai)) {
      return this.credentials.ai;
    }

    return null;
  }

  async _getAIConfig() {
    if (!this.currentAIConfig) {
      await this.refreshAIConfig();
    }

    return this.currentAIConfig;
  }

  async _loadProviderConfig(providerId) {
    if (!providerId) {
      return null;
    }

    try {
      if (typeof this.credentials?.getProviderConfig === 'function') {
        return await this.credentials.getProviderConfig(providerId);
      }
    } catch (error) {
      this.logger.warn(`[LLMService] failed to read provider config for ${providerId}: ${this._sanitizeMessage(error)}`);
      return null;
    }

    const aiConfig = await this._getAIConfig();
    const providerConfig = aiConfig?.providers?.[providerId];
    const providerMeta = getProvider(providerId);
    const selectedModel = aiConfig?.selectedModels?.[providerId] || null;

    if (!providerMeta && !providerConfig) {
      return null;
    }

    if (providerConfig && isPlainObject(providerConfig)) {
      return {
        providerId,
        apiKey: toString(providerConfig.apiKey),
        model: toString(providerConfig.model) || selectedModel || null,
        baseUrl: toString(providerConfig.baseUrl) || providerMeta?.defaultBaseUrl || null,
        enabled: providerConfig.enabled !== false,
      };
    }

    const apiKey = '';
    return {
      providerId,
      apiKey,
      model: selectedModel,
      baseUrl: providerMeta?.defaultBaseUrl || null,
      enabled: false,
    };
  }

  _sanitizeMessage(error) {
    const sanitized = sanitizeProviderError(error);
    const parts = [];

    if (sanitized.status) {
      parts.push(`HTTP_${sanitized.status}`);
    }

    if (sanitized.code && sanitized.code !== 'UNKNOWN_ERROR') {
      parts.push(sanitized.code);
    }

    if (parts.length > 0) {
      return parts.join(' ');
    }

    return 'Unknown error.';
  }

  _logAttemptFailure({ provider, model, task, error }) {
    const message = this._sanitizeMessage(error);
    this.logger.warn(`[LLMService] ${task || 'task'} failed for ${provider || 'unknown'}:${model || 'unknown'} - ${message}`);
  }

  _getConfiguredDefaultProvider(aiConfig) {
    if (!aiConfig || !isPlainObject(aiConfig)) {
      return null;
    }

    if (aiConfig.mode === 'single' || aiConfig.mode === 'fallback') {
      return toString(aiConfig.primaryProvider) || null;
    }

    return null;
  }

  _getConfiguredDefaultModel(aiConfig, providerId) {
    if (!aiConfig || !providerId) {
      return null;
    }

    return toString(aiConfig.selectedModels?.[providerId] || aiConfig.providers?.[providerId]?.model) || null;
  }

  _buildAttemptError(provider, model, error) {
    const sanitized = sanitizeProviderError(error);
    const recoverable = isRecoverableProviderError(error);
    return {
      ok: false,
      provider,
      model: model || null,
      recoverable,
      code: sanitized.status ? `HTTP_${sanitized.status}` : (sanitized.code || 'ADAPTER_THROWN_ERROR'),
      message: this._sanitizeMessage(error) || 'LLM adapter threw an error.',
      raw: sanitized,
    };
  }

  getActiveProvider() {
    if (this.activeProvider) {
      return this.activeProvider;
    }

    if (this.currentAIConfig && (this.currentAIConfig.mode === 'single' || this.currentAIConfig.mode === 'fallback')) {
      return toString(this.currentAIConfig.primaryProvider) || null;
    }

    return null;
  }

  getActiveModel() {
    if (this.activeModel) {
      return this.activeModel;
    }

    const provider = this.getActiveProvider();
    if (!provider || !this.currentAIConfig) {
      return null;
    }

    return toString(
      this.currentAIConfig.selectedModels?.[provider]
      || this.currentAIConfig.providers?.[provider]?.model,
    ) || null;
  }

  async _resolveInvocation(request = {}) {
    const aiConfig = await this._getAIConfig();
    if (!aiConfig) {
      return {
        ok: false,
        provider: null,
        model: null,
        recoverable: false,
        code: 'LLM_NOT_CONFIGURED',
        message: 'LLM service is not configured.',
        raw: null,
      };
    }

    const mode = toString(aiConfig.mode) || 'single';
    const task = toString(request.task) || null;
    let provider = null;

    if (mode === 'multi') {
      provider = toString(request.provider) || toString(isTaskMap(aiConfig.taskProviderMap)?.[task]) || null;
      if (!provider) {
        return {
          ok: false,
          provider: null,
          model: null,
          recoverable: false,
          code: 'NO_PROVIDER_SELECTED',
          message: 'No provider selected for multi-provider mode.',
          raw: null,
        };
      }
    } else {
      provider = this._getConfiguredDefaultProvider(aiConfig);
    }

    if (!provider) {
      return {
        ok: false,
        provider: null,
        model: null,
        recoverable: false,
        code: 'NO_PROVIDER_SELECTED',
        message: 'No provider selected for multi-provider mode.',
        raw: null,
      };
    }

    const providerConfig = await this._loadProviderConfig(provider);
    if (!providerConfig || providerConfig.enabled === false) {
      return {
        ok: false,
        provider,
        model: null,
        recoverable: false,
        code: 'PROVIDER_NOT_AVAILABLE',
        message: `Provider ${provider} is not available.`,
        raw: null,
      };
    }

    if (!providerConfig.apiKey) {
      return {
        ok: false,
        provider,
        model: null,
        recoverable: false,
        code: 'MISSING_API_KEY',
        message: `Provider ${provider} is missing an API key.`,
        raw: null,
      };
    }

    const configuredModel = toString(request.model) || toString(providerConfig.model) || this._getConfiguredDefaultModel(aiConfig, provider) || null;
    if (!configuredModel) {
      return {
        ok: false,
        provider,
        model: null,
        recoverable: false,
        code: 'MISSING_MODEL',
        message: `Provider ${provider} is missing a model.`,
        raw: null,
      };
    }

    const providerMeta = getProvider(provider);
    if (providerMeta?.requiresBaseUrl && !toString(providerConfig.baseUrl)) {
      return {
        ok: false,
        provider,
        model: configuredModel,
        recoverable: false,
        code: 'MISSING_BASE_URL',
        message: `Provider ${provider} requires a base URL.`,
        raw: null,
      };
    }

    const fallbackProvider = mode === 'fallback'
      ? toString(aiConfig.fallbackProvider) || null
      : null;

    const attempts = [provider];
    if (mode === 'fallback' && fallbackProvider && fallbackProvider !== provider) {
      attempts.push(fallbackProvider);
    }

    return {
      ok: true,
      mode,
      task,
      provider,
      model: configuredModel,
      providerConfig,
      fallbackProvider,
      attempts,
      aiConfig,
    };
  }

  _getAdapter(providerId, providerConfig) {
    if (this.adapterOverrides[providerId]) {
      return this.adapterOverrides[providerId];
    }

    return createProviderAdapter(providerId, providerConfig, this.adapterOptions);
  }

  async generateText({
    prompt,
    systemPrompt,
    task,
    temperature,
    maxOutputTokens,
    provider,
    model,
    jsonMode,
  } = {}) {
    const resolved = await this._resolveInvocation({ prompt, systemPrompt, task, temperature, maxOutputTokens, provider, model });
    if (!resolved.ok) {
      return resolved;
    }

    let lastError = null;

    for (const attemptProvider of resolved.attempts) {
      const providerConfig = attemptProvider === resolved.provider
        ? resolved.providerConfig
        : await this._loadProviderConfig(attemptProvider);

      if (!providerConfig || providerConfig.enabled === false || !providerConfig.apiKey) {
        lastError = {
          ok: false,
          provider: attemptProvider,
          model: null,
          recoverable: false,
          code: 'PROVIDER_NOT_AVAILABLE',
          message: `Provider ${attemptProvider} is not available.`,
          raw: null,
        };
        this._logAttemptFailure({ provider: attemptProvider, model: null, task: resolved.task, error: lastError });
        break;
      }

      const attemptModel = attemptProvider === resolved.provider
        ? resolved.model
        : toString(providerConfig.model) || this._getConfiguredDefaultModel(resolved.aiConfig, attemptProvider) || null;

      if (!attemptModel) {
        lastError = {
          ok: false,
          provider: attemptProvider,
          model: null,
          recoverable: false,
          code: 'MISSING_MODEL',
          message: `Provider ${attemptProvider} is missing a model.`,
          raw: null,
        };
        this._logAttemptFailure({ provider: attemptProvider, model: null, task: resolved.task, error: lastError });
        break;
      }

      const adapter = this._getAdapter(attemptProvider, providerConfig);
      if (!adapter || typeof adapter.generateText !== 'function') {
        lastError = {
          ok: false,
          provider: attemptProvider,
          model: null,
          recoverable: false,
          code: 'UNSUPPORTED_PROVIDER',
          message: `No adapter registered for provider ${attemptProvider}.`,
          raw: null,
        };
        this._logAttemptFailure({ provider: attemptProvider, model: null, task: resolved.task, error: lastError });
        break;
      }

      let attempt;
      try {
        attempt = await adapter.generateText({
          prompt,
          systemPrompt,
          task: resolved.task,
          temperature,
          maxOutputTokens,
          provider: attemptProvider,
          model: attemptModel,
          jsonMode,
        });
      } catch (error) {
        attempt = this._buildAttemptError(attemptProvider, attemptModel, error);
      }

      if (attempt?.ok) {
        this.activeProvider = attempt.provider;
        this.activeModel = attempt.model;
        this.activeTask = resolved.task;
        return attempt;
      }

      lastError = attempt;
      this._logAttemptFailure({ provider: attempt?.provider || attemptProvider, model: attempt?.model || null, task: resolved.task, error: attempt });

      if (!attempt?.recoverable) {
        break;
      }
    }

    return lastError || {
      ok: false,
      provider: resolved.provider,
      model: resolved.model,
      recoverable: false,
      code: 'UNKNOWN_ERROR',
      message: 'LLM generation failed.',
      raw: null,
    };
  }

  async generateJSON({
    prompt,
    systemPrompt,
    schema,
    task,
    temperature,
    maxOutputTokens,
    provider,
    model,
  } = {}) {
    const jsonPrompt = [
      prompt,
      '',
      'Return only valid JSON. Do not include markdown fences or commentary.',
      'If you include any nested arrays or objects, ensure the result is valid JSON.',
    ]
      .filter(Boolean)
      .join('\n');

    const textResult = await this.generateText({
      prompt: jsonPrompt,
      systemPrompt,
      task,
      temperature,
      maxOutputTokens,
      provider,
      model,
      jsonMode: true,
    });

    if (!textResult.ok) {
      return textResult;
    }

    const parsed = safeParseJson(textResult.text);
    if (!parsed.ok) {
      return {
        ok: false,
        provider: textResult.provider,
        model: textResult.model,
        recoverable: false,
        code: 'INVALID_JSON',
        message: 'Provider returned invalid JSON.',
        raw: {
          text: redactSensitiveText(stripMarkdownJsonFence(textResult.text).slice(0, 500)),
          parseError: parsed.error,
        },
      };
    }

    if (schema) {
      const validation = validateSchemaValue(parsed.value, schema);
      if (!validation.valid) {
        return {
          ok: false,
          provider: textResult.provider,
          model: textResult.model,
          recoverable: false,
          code: 'SCHEMA_VALIDATION_FAILED',
          message: validation.errors.join('; '),
          raw: {
            errors: validation.errors,
          },
        };
      }
    }

    this.activeProvider = textResult.provider;
    this.activeModel = textResult.model;
    this.activeTask = task || null;

    return {
      ok: true,
      text: textResult.text,
      json: parsed.value,
      provider: textResult.provider,
      model: textResult.model,
      usage: textResult.usage || null,
      raw: textResult.raw,
    };
  }
}

module.exports = { LLMService };

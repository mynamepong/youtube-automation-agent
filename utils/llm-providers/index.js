const { getProvider, isOpenAICompatibleProvider } = require('../llm-provider-registry');
const { createOpenAIAdapter } = require('./openai');
const { createGeminiAdapter } = require('./gemini');
const { createAnthropicAdapter } = require('./anthropic');
const { createOpenAICompatibleAdapter } = require('./openai-compatible');

function createProviderAdapter(providerId, providerConfig = {}, options = {}) {
  if (providerId === 'openai') {
    return createOpenAIAdapter(providerConfig, options);
  }

  if (providerId === 'gemini') {
    return createGeminiAdapter(providerConfig, options);
  }

  if (providerId === 'anthropic') {
    return createAnthropicAdapter(providerConfig, options);
  }

  if (providerId === 'deepseek' || providerId === 'qwen' || isOpenAICompatibleProvider(providerId)) {
    const providerMeta = getProvider(providerId);
    return createOpenAICompatibleAdapter(providerId, providerConfig, {
      ...options,
      baseUrl: providerConfig.baseUrl || providerMeta?.defaultBaseUrl || null,
    });
  }

  return null;
}

module.exports = {
  createProviderAdapter,
};

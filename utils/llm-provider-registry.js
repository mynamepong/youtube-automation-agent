const PROVIDERS = Object.freeze([
  {
    id: 'openai',
    displayName: 'OpenAI',
    type: 'native',
    envKey: 'OPENAI_API_KEY',
    supportsModelDiscovery: true,
    requiresBaseUrl: false,
    defaultBaseUrl: null,
    docsUrl: 'https://platform.openai.com/docs/models',
    apiKeyHelpText: 'Create an API key in the OpenAI dashboard under API keys.',
  },
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    type: 'native',
    envKey: 'GEMINI_API_KEY',
    supportsModelDiscovery: true,
    requiresBaseUrl: false,
    defaultBaseUrl: null,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/quickstart',
    apiKeyHelpText: 'Create an API key in Google AI Studio or the Gemini API docs.',
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    type: 'native',
    envKey: 'ANTHROPIC_API_KEY',
    supportsModelDiscovery: true,
    requiresBaseUrl: false,
    defaultBaseUrl: null,
    docsUrl: 'https://docs.anthropic.com/en/api/overview',
    apiKeyHelpText: 'Create an API key in the Anthropic Console under account settings.',
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    type: 'openai-compatible',
    envKey: 'DEEPSEEK_API_KEY',
    supportsModelDiscovery: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.deepseek.com',
    docsUrl: 'https://api-docs.deepseek.com/',
    apiKeyHelpText: 'Create an API key in the DeepSeek API console.',
  },
  {
    id: 'qwen',
    displayName: 'Qwen / Alibaba Model Studio',
    type: 'openai-compatible',
    envKey: 'QWEN_API_KEY',
    supportsModelDiscovery: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/regions/',
    apiKeyHelpText: 'Create an API key in Alibaba Cloud Model Studio / DashScope.',
  },
  {
    id: 'openai_compatible_custom',
    displayName: 'Custom OpenAI-compatible API',
    type: 'openai-compatible',
    envKey: 'CUSTOM_LLM_API_KEY',
    supportsModelDiscovery: true,
    requiresBaseUrl: true,
    defaultBaseUrl: null,
    docsUrl: 'https://platform.openai.com/docs/api-reference/introduction',
    apiKeyHelpText: 'Use the API key issued by your OpenAI-compatible provider.',
  },
]);

const PROVIDER_MAP = new Map(PROVIDERS.map(provider => [provider.id, provider]));

function getProvider(providerId) {
  return PROVIDER_MAP.get(providerId) || null;
}

function listProviders() {
  return PROVIDERS.map(provider => ({ ...provider }));
}

function listProviderChoices() {
  return PROVIDERS.map(provider => ({
    name: provider.displayName,
    value: provider.id,
  }));
}

function isSupportedProvider(providerId) {
  return PROVIDER_MAP.has(providerId);
}

function isOpenAICompatibleProvider(providerId) {
  return getProvider(providerId)?.type === 'openai-compatible';
}

function getEnvKeyForProvider(providerId) {
  return getProvider(providerId)?.envKey || null;
}

module.exports = {
  PROVIDERS,
  getProvider,
  listProviders,
  listProviderChoices,
  isSupportedProvider,
  isOpenAICompatibleProvider,
  getEnvKeyForProvider,
};

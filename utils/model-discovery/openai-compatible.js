const { getProvider } = require('../llm-provider-registry');

function toString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}

function extractModels(response) {
  const container = response?.data ?? response;

  if (Array.isArray(container)) {
    return container;
  }

  if (Array.isArray(container?.data)) {
    return container.data;
  }

  if (Array.isArray(container?.models)) {
    return container.models;
  }

  if (Array.isArray(container?.items)) {
    return container.items;
  }

  return [];
}

function getModelText(rawModel) {
  return [
    rawModel?.id,
    rawModel?.name,
    rawModel?.displayName,
    rawModel?.description,
    rawModel?.object,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isSupportedOpenAICompatibleModel(rawModel) {
  const text = getModelText(rawModel);
  if (!text) {
    return false;
  }

  if (rawModel?.deprecated === true) {
    return false;
  }

  if (/(embedding|moderation|whisper|tts|audio|realtime|image|dall-?e|sora)/.test(text)) {
    return false;
  }

  if (/(preview|deprecated)/.test(text)) {
    return false;
  }

  return true;
}

async function listOpenAICompatibleModels(providerId, providerConfig = {}, options = {}) {
  const providerMeta = getProvider(providerId);
  const apiKey = toString(providerConfig.apiKey || options.apiKey);
  const baseUrl = toString(providerConfig.baseUrl || options.baseUrl || providerMeta?.defaultBaseUrl);

  if (!baseUrl) {
    return {
      ok: false,
      source: 'fallback',
      models: [],
      warning: `Missing base URL for provider ${providerId}.`,
    };
  }

  if (!apiKey && typeof options.request !== 'function') {
    return {
      ok: false,
      source: 'fallback',
      models: [],
      warning: `Missing API key for provider ${providerId}.`,
    };
  }

  try {
    const request = typeof options.request === 'function'
      ? options.request
      : async (url, requestConfig) => {
          let axios;
          try {
            axios = require('axios');
          } catch (error) {
            throw new Error('Axios is not installed.');
          }

          return axios.get(url, requestConfig);
        };

    const response = await request(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      timeout: options.timeoutMs || 10000,
    });

    const models = extractModels(response);

    return {
      ok: true,
      source: 'live',
      models,
      warning: null,
    };
  } catch (error) {
    return {
      ok: false,
      source: 'fallback',
      models: [],
      warning: `Live model discovery failed: ${error.message}`,
    };
  }
}

module.exports = {
  listOpenAICompatibleModels,
  isSupportedOpenAICompatibleModel,
  extractModels,
};

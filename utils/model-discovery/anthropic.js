const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

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
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isSupportedAnthropicModel(rawModel, options = {}) {
  const text = getModelText(rawModel);
  if (!text || !/claude/.test(text)) {
    return false;
  }

  if (rawModel?.deprecated === true || String(rawModel?.state || '').toUpperCase() === 'DEPRECATED') {
    return false;
  }

  if (/(embedding|audio|tts|realtime|image|vision)/.test(text)) {
    return false;
  }

  const allowLegacy = Boolean(options.allowLegacy);
  const modernPattern = /claude-(opus-4|sonnet-4|3-7-sonnet|3-5-sonnet|3-5-haiku)/;
  const legacyPattern = /claude-(3|2|instant)/;

  if (!allowLegacy && legacyPattern.test(text) && !modernPattern.test(text)) {
    return false;
  }

  return true;
}

function hasModernAnthropicModel(models) {
  return models.some(model => {
    const text = getModelText(model);
    return /claude-(opus-4|sonnet-4|3-7-sonnet|3-5-sonnet|3-5-haiku)/.test(text);
  });
}

async function listAnthropicModels(providerConfig = {}, options = {}) {
  const apiKey = toString(providerConfig.apiKey || options.apiKey);

  if (!apiKey && typeof options.request !== 'function') {
    return {
      ok: false,
      source: 'fallback',
      models: [],
      warning: 'Missing Anthropic API key for model discovery.',
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

    const response = await request(`${ANTHROPIC_BASE_URL}/models`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        Accept: 'application/json',
      },
      timeout: options.timeoutMs || 10000,
    });

    const rawModels = extractModels(response);
    const allowLegacy = !hasModernAnthropicModel(rawModels);
    const models = rawModels.filter(model => isSupportedAnthropicModel(model, { allowLegacy }));

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
  listAnthropicModels,
  isSupportedAnthropicModel,
  extractModels,
  hasModernAnthropicModel,
  ANTHROPIC_BASE_URL,
};

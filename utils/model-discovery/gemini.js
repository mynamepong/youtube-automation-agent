const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function toString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}

function extractModels(response) {
  const container = response?.data ?? response;

  if (Array.isArray(container)) {
    return container;
  }

  if (Array.isArray(container?.models)) {
    return container.models;
  }

  if (Array.isArray(container?.data)) {
    return container.data;
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
    rawModel?.display_name,
    rawModel?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isSupportedGeminiModel(rawModel) {
  const text = getModelText(rawModel);
  if (!text) {
    return false;
  }

  if (rawModel?.deprecated === true || String(rawModel?.state || '').toUpperCase() === 'DEPRECATED') {
    return false;
  }

  const methods = Array.isArray(rawModel?.supportedGenerationMethods)
    ? rawModel.supportedGenerationMethods.map(method => String(method).toLowerCase())
    : [];

  const textGenerationSupported = methods.includes('generatecontent') || methods.includes('streamgeneratecontent');
  if (!textGenerationSupported) {
    return false;
  }

  if (/(embedding|embed|tts|audio|live|realtime|deprecated)/.test(text)) {
    return false;
  }

  return true;
}

async function listGeminiModels(providerConfig = {}, options = {}) {
  const apiKey = toString(providerConfig.apiKey || options.apiKey);

  if (!apiKey && typeof options.request !== 'function') {
    return {
      ok: false,
      source: 'fallback',
      models: [],
      warning: 'Missing Gemini API key for model discovery.',
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

    const response = await request(`${GEMINI_BASE_URL}/models`, {
      params: {
        key: apiKey,
      },
      headers: {
        Accept: 'application/json',
      },
      timeout: options.timeoutMs || 10000,
    });

    const models = extractModels(response).filter(isSupportedGeminiModel);

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
  listGeminiModels,
  isSupportedGeminiModel,
  extractModels,
  GEMINI_BASE_URL,
};

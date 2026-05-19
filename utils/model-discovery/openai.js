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

function isSupportedOpenAIModel(rawModel) {
  const text = getModelText(rawModel);
  if (!text) {
    return false;
  }

  if (rawModel?.deprecated === true) {
    return false;
  }

  if (/(embedding|moderation|whisper|tts|realtime|audio|image|dall-?e|sora)/.test(text)) {
    return false;
  }

  if (/gpt-3\.5/.test(text)) {
    return false;
  }

  if (/(preview|deprecated)/.test(text)) {
    return false;
  }

  if (/^(babbage|davinci|curie|ada)([\s._-]|$)/.test(text)) {
    return false;
  }

  return true;
}

async function listOpenAIModels(providerConfig = {}, options = {}) {
  const apiKey = toString(providerConfig.apiKey || options.apiKey);
  const hasLiveTransport = typeof options.listModels === 'function' || Boolean(options.client) || Boolean(apiKey);

  if (!apiKey && !hasLiveTransport) {
    return {
      ok: false,
      source: 'fallback',
      models: [],
      warning: 'Missing OpenAI API key for model discovery.',
    };
  }

  try {
    let response;

    if (typeof options.listModels === 'function') {
      response = await options.listModels(providerConfig, options);
    } else if (options.client) {
      response = await options.client.models.list();
    } else {
      let OpenAI;
      try {
        OpenAI = require('openai');
      } catch (error) {
        return {
          ok: false,
          source: 'fallback',
          models: [],
          warning: 'OpenAI SDK is not installed.',
        };
      }

      const client = new OpenAI({
        apiKey,
      });

      response = await client.models.list();
    }

    const models = extractModels(response).filter(isSupportedOpenAIModel);

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
  listOpenAIModels,
  isSupportedOpenAIModel,
  extractModels,
};

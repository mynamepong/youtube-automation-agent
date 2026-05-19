const { getProvider, isOpenAICompatibleProvider } = require('../llm-provider-registry');
const { listOpenAIModels } = require('./openai');
const { listGeminiModels } = require('./gemini');
const { listAnthropicModels } = require('./anthropic');
const { listOpenAICompatibleModels } = require('./openai-compatible');
const {
  classifyModel,
  filterUsableModels,
  sortRecommendedModels,
  groupModelsByTier,
} = require('./tiering');
const fallbackCatalog = require('../../config/model-fallbacks.json');

function toString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}

function titleCaseFromId(id) {
  return id
    .replace(/^models\//, '')
    .replace(/^model\//, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
}

function isTextModel(providerId, modelId, rawModel, providerMeta) {
  const textHints = [
    modelId,
    rawModel?.displayName,
    rawModel?.description,
    rawModel?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (providerId === 'openai') {
    return !/(embedding|moderation|whisper|tts|realtime|audio|image|dall-?e|sora)/.test(textHints);
  }

  if (providerId === 'gemini') {
    const methods = Array.isArray(rawModel?.supportedGenerationMethods)
      ? rawModel.supportedGenerationMethods.map(method => String(method).toLowerCase())
      : [];
    return methods.includes('generatecontent') || methods.includes('streamgeneratecontent');
  }

  if (providerId === 'anthropic') {
    return /claude/.test(textHints);
  }

  if (providerId === 'deepseek' || providerId === 'qwen' || isOpenAICompatibleProvider(providerId)) {
    return !/(embedding|moderation|whisper|tts|audio|realtime|image|dall-?e|sora)/.test(textHints);
  }

  return Boolean(providerMeta);
}

function inferCapabilities(providerId, modelId, rawModel) {
  const text = [
    modelId,
    rawModel?.displayName,
    rawModel?.description,
    rawModel?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const textCapable = isTextModel(providerId, modelId, rawModel);
  const vision = /vision|multimodal|image|video|pdf|gemini|4o|4\.1|5\./.test(text) && textCapable;
  const audio = /(audio|speech|tts|transcribe|whisper|realtime)/.test(text) && textCapable;
  const reasoning = inferTier(providerId, modelId, rawModel) === 'reasoning';
  const json = textCapable && !/(embedding|moderation|audio|realtime|image)/.test(text);

  return {
    text: textCapable,
    vision,
    audio,
    reasoning,
    json,
  };
}

function inferTier(providerId, modelId, rawModel) {
  return classifyModel(providerId, modelId, rawModel);
}

function inferDeprecated(providerId, modelId, rawModel, providerModels) {
  const text = [
    modelId,
    rawModel?.displayName,
    rawModel?.description,
    rawModel?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(deprecated|preview)/.test(text)) {
    return true;
  }

  if (providerId === 'openai') {
    if (/gpt-3\.5/.test(text)) {
      return true;
    }
    if (/legacy/.test(text)) {
      return true;
    }
  }

  if (providerId === 'anthropic') {
    const modernPresent = providerModels.some(model => /claude-(opus-4|sonnet-4|3-7-sonnet|3-5-sonnet|3-5-haiku)/.test(model.id));
    if (modernPresent) {
      return !/claude-(opus-4|sonnet-4|3-7-sonnet|3-5-sonnet|3-5-haiku)/.test(text);
    }
  }

  return false;
}

function normalizeModel(providerId, rawModel, providerModels) {
  const modelId = toString(rawModel?.id || rawModel?.name || rawModel?.model_id || rawModel?.model) || '';
  if (!modelId) {
    return null;
  }

  const displayName = toString(rawModel?.displayName || rawModel?.display_name || rawModel?.name || rawModel?.id) || titleCaseFromId(modelId);
  const explicitCapabilities = rawModel?.capabilities && typeof rawModel.capabilities === 'object'
    ? rawModel.capabilities
    : null;
  const capabilities = explicitCapabilities
    ? {
        text: Boolean(explicitCapabilities.text),
        vision: Boolean(explicitCapabilities.vision),
        audio: Boolean(explicitCapabilities.audio),
        reasoning: Boolean(explicitCapabilities.reasoning),
        json: Boolean(explicitCapabilities.json),
      }
    : inferCapabilities(providerId, modelId, rawModel);
  const deprecated = inferDeprecated(providerId, modelId, rawModel, providerModels || []);
  const source = rawModel?.source === 'fallback' ? 'fallback' : 'live';

  return {
    id: modelId,
    displayName,
    provider: providerId,
    tier: inferTier(providerId, modelId, rawModel),
    capabilities,
    deprecated,
    source,
    raw: rawModel,
  };
}

function sortModels(models) {
  return sortRecommendedModels(null, models);
}

function getFallbackEntries(providerId) {
  return Array.isArray(fallbackCatalog?.[providerId]) ? fallbackCatalog[providerId] : [];
}

function normalizeFallbackModels(providerId, fallbackEntries) {
  return fallbackEntries
    .map(entry => normalizeModel(providerId, {
      ...entry,
      source: 'fallback',
    }, fallbackEntries))
    .filter(Boolean);
}

function buildFallbackResult(providerId, warning) {
  return {
    providerId,
    ok: false,
    source: 'fallback',
    recommendedModels: [],
    allModels: [],
    warning,
  };
}

async function discoverModels(providerId, providerConfig = {}, options = {}) {
  const providerMeta = getProvider(providerId);
  if (!providerMeta) {
    return buildFallbackResult(providerId, `Unsupported provider: ${providerId}`);
  }

  let adapterResult;
  try {
    if (providerId === 'openai') {
      adapterResult = await listOpenAIModels(providerConfig, options);
    } else if (providerId === 'gemini') {
      adapterResult = await listGeminiModels(providerConfig, options);
    } else if (providerId === 'anthropic') {
      adapterResult = await listAnthropicModels(providerConfig, options);
    } else if (isOpenAICompatibleProvider(providerId)) {
      adapterResult = await listOpenAICompatibleModels(providerId, providerConfig, options);
    } else {
      return buildFallbackResult(providerId, `No discovery adapter registered for provider: ${providerId}`);
    }
  } catch (error) {
    adapterResult = {
      ok: false,
      source: 'fallback',
      models: [],
      warning: `Live model discovery failed: ${error.message}`,
    };
  }

  const rawModels = Array.isArray(adapterResult?.models) ? adapterResult.models : [];
  const allModels = sortModels(
    rawModels
      .map(model => normalizeModel(providerId, model, rawModels))
      .filter(Boolean),
  );
  const maxAllModels = Number.isInteger(options.maxAllModels) && options.maxAllModels > 0
    ? options.maxAllModels
    : null;
  const visibleAllModels = maxAllModels ? allModels.slice(0, maxAllModels) : allModels;
  const recommendedLive = sortRecommendedModels(providerId, filterUsableModels(providerId, visibleAllModels));
  const maxRecommendedModels = Number.isInteger(options.maxRecommendedModels) && options.maxRecommendedModels > 0
    ? options.maxRecommendedModels
    : 10;

  if (recommendedLive.length > 0) {
    return {
      providerId,
      ok: true,
      source: adapterResult?.source || 'live',
      recommendedModels: recommendedLive.slice(0, maxRecommendedModels),
      allModels: visibleAllModels,
      warning: adapterResult?.warning || null,
    };
  }

  const fallbackModels = normalizeFallbackModels(providerId, getFallbackEntries(providerId));
  const sortedFallbackModels = sortRecommendedModels(providerId, filterUsableModels(providerId, fallbackModels));
  if (sortedFallbackModels.length > 0) {
    const warning = adapterResult?.ok === false
      ? `${adapterResult?.warning || 'Live model discovery failed.'} Showing verified fallback model list.`
      : 'Live model discovery failed or returned no usable models. Showing verified fallback model list.';

    return {
      providerId,
      ok: true,
      source: 'fallback',
      recommendedModels: sortedFallbackModels.slice(0, maxRecommendedModels),
      allModels: visibleAllModels,
      warning,
    };
  }

  const warning = adapterResult?.ok === false
    ? `${adapterResult?.warning || 'Live model discovery failed.'} No usable model list found. Please manually enter a model ID.`
    : 'No usable model list found. Please manually enter a model ID.';

  return {
    providerId,
    ok: false,
    source: adapterResult?.ok === false ? 'fallback' : (adapterResult?.source || 'live'),
    recommendedModels: [],
    allModels: visibleAllModels,
    warning,
  };
}

module.exports = {
  discoverModels,
  normalizeModel,
  inferTier,
  inferCapabilities,
  inferDeprecated,
  sortModels,
  getFallbackEntries,
  normalizeFallbackModels,
};

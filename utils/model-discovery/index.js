const { getProvider, isOpenAICompatibleProvider } = require('../llm-provider-registry');
const { listOpenAIModels } = require('./openai');
const { listGeminiModels } = require('./gemini');
const { listAnthropicModels } = require('./anthropic');
const { listOpenAICompatibleModels } = require('./openai-compatible');

const TIER_ORDER = Object.freeze({
  reasoning: 0,
  premium: 1,
  balanced: 2,
  cheap: 3,
  unknown: 4,
});

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
    return methods.includes('generatecontent');
  }

  if (providerId === 'anthropic') {
    return /claude/.test(textHints);
  }

  if (isOpenAICompatibleProvider(providerId)) {
    return !/(embedding|moderation|whisper|tts|audio|realtime|image|embedding)/.test(textHints);
  }

  return Boolean(providerMeta);
}

function inferTier(providerId, modelId, rawModel) {
  const text = [
    modelId,
    rawModel?.displayName,
    rawModel?.description,
    rawModel?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (providerId === 'anthropic') {
    if (/opus/.test(text)) return 'premium';
    if (/sonnet/.test(text)) return 'balanced';
    if (/haiku/.test(text)) return 'cheap';
    return 'unknown';
  }

  if (providerId === 'gemini') {
    if (/flash-lite|lite/.test(text)) return 'cheap';
    if (/flash/.test(text)) return 'balanced';
    if (/pro/.test(text)) return 'reasoning';
    return 'unknown';
  }

  if (providerId === 'openai') {
    if (/mini|nano/.test(text)) return 'cheap';
    if (/o[134]\b/.test(text) || /gpt-5/.test(text) || /reason/.test(text)) return 'reasoning';
    if (/gpt-4\.1|gpt-4o|gpt-4-turbo|gpt-4\b/.test(text)) return 'premium';
    if (/turbo/.test(text)) return 'balanced';
    return 'unknown';
  }

  if (providerId === 'deepseek') {
    if (/reasoner|reasoning/.test(text)) return 'reasoning';
    if (/v4-pro|pro/.test(text)) return 'premium';
    if (/flash|chat|plus|turbo/.test(text)) return /flash/.test(text) ? 'balanced' : 'balanced';
    return 'unknown';
  }

  if (providerId === 'qwen') {
    if (/max/.test(text)) return 'premium';
    if (/plus|flash/.test(text)) return /flash/.test(text) ? 'cheap' : 'balanced';
    if (/turbo/.test(text)) return 'cheap';
    if (/qwq|reason/.test(text)) return 'reasoning';
    return 'unknown';
  }

  if (isOpenAICompatibleProvider(providerId)) {
    if (/reason/.test(text)) return 'reasoning';
    if (/pro|max/.test(text)) return 'premium';
    if (/flash|plus|turbo/.test(text)) return /flash/.test(text) ? 'balanced' : 'balanced';
    if (/mini|nano|lite/.test(text)) return 'cheap';
    return 'unknown';
  }

  return 'unknown';
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
  const capabilities = inferCapabilities(providerId, modelId, rawModel);
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
  return [...models].sort((left, right) => {
    const tierDelta = TIER_ORDER[left.tier] - TIER_ORDER[right.tier];
    if (tierDelta !== 0) {
      return tierDelta;
    }

    const leftName = left.displayName.toLowerCase();
    const rightName = right.displayName.toLowerCase();
    return leftName.localeCompare(rightName);
  });
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

  try {
    let adapterResult;
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

    if (!adapterResult?.ok) {
      return {
        providerId,
        ok: false,
        source: adapterResult?.source || 'fallback',
        recommendedModels: [],
        allModels: [],
        warning: adapterResult?.warning || 'Live model discovery failed.',
      };
    }

    const rawModels = Array.isArray(adapterResult.models) ? adapterResult.models : [];
    const allModels = sortModels(
      rawModels
        .map(model => normalizeModel(providerId, model, rawModels))
        .filter(Boolean),
    );
    const recommendedModels = sortModels(
      allModels.filter(model => model.capabilities.text && !model.deprecated),
    );

    return {
      providerId,
      ok: true,
      source: adapterResult.source || 'live',
      recommendedModels,
      allModels,
      warning: adapterResult.warning || null,
    };
  } catch (error) {
    return buildFallbackResult(providerId, `Live model discovery failed: ${error.message}`);
  }
}

module.exports = {
  discoverModels,
  normalizeModel,
  inferTier,
  inferCapabilities,
  inferDeprecated,
  sortModels,
};

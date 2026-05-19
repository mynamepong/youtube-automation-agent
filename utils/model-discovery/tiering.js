const { isOpenAICompatibleProvider } = require('../llm-provider-registry');

const VALID_TIERS = new Set(['premium', 'balanced', 'cheap', 'reasoning', 'unknown']);
const TIER_ORDER = Object.freeze({
  premium: 0,
  balanced: 1,
  cheap: 2,
  reasoning: 3,
  unknown: 4,
});

const TIER_LABELS = Object.freeze({
  premium: 'Premium / highest quality',
  balanced: 'Balanced',
  cheap: 'Cheap / fast',
  reasoning: 'Reasoning',
  unknown: 'Unknown',
});

function toText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}

function normalizeTier(value) {
  const tier = toText(value).toLowerCase();
  return VALID_TIERS.has(tier) ? tier : 'unknown';
}

function modelText(modelId, rawModel = {}) {
  return [
    modelId,
    rawModel.displayName,
    rawModel.display_name,
    rawModel.description,
    rawModel.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function classifyModel(providerId, modelId, rawModel = {}) {
  const tierFromRaw = normalizeTier(rawModel.tier);
  if (tierFromRaw !== 'unknown') {
    return tierFromRaw;
  }

  const text = modelText(modelId, rawModel);
  if (!text) {
    return 'unknown';
  }

  if (providerId === 'openai') {
    if (/mini|nano/.test(text)) return 'cheap';
    if (/o[134]\b/.test(text) || /reason/.test(text) || /gpt-5/.test(text)) return 'reasoning';
    if (/gpt-4\.1|gpt-4o|gpt-4-turbo|gpt-4\b/.test(text)) return 'premium';
    if (/turbo/.test(text)) return 'balanced';
    return 'unknown';
  }

  if (providerId === 'gemini') {
    if (/flash-lite|lite/.test(text)) return 'cheap';
    if (/flash/.test(text)) return 'balanced';
    if (/pro/.test(text)) return 'reasoning';
    return 'unknown';
  }

  if (providerId === 'anthropic') {
    if (/haiku/.test(text)) return 'cheap';
    if (/sonnet/.test(text)) return 'balanced';
    if (/opus/.test(text)) return 'premium';
    return 'unknown';
  }

  if (providerId === 'deepseek') {
    if (/reasoner|reasoning/.test(text)) return 'reasoning';
    if (/v4-pro|pro/.test(text)) return 'premium';
    if (/v4-flash|flash|chat|plus|turbo/.test(text)) return /flash/.test(text) ? 'balanced' : 'balanced';
    if (/mini|nano/.test(text)) return 'cheap';
    return 'unknown';
  }

  if (providerId === 'qwen') {
    if (/reason|qwq/.test(text)) return 'reasoning';
    if (/max/.test(text)) return 'premium';
    if (/plus/.test(text)) return 'balanced';
    if (/flash|turbo/.test(text)) return 'cheap';
    return 'unknown';
  }

  if (providerId === 'openai_compatible_custom' || isOpenAICompatibleProvider(providerId)) {
    if (/reason|thinking/.test(text)) return 'reasoning';
    if (/pro|max/.test(text)) return 'premium';
    if (/flash|plus|turbo/.test(text)) return /flash/.test(text) ? 'balanced' : 'balanced';
    if (/mini|nano|lite/.test(text)) return 'cheap';
    return 'unknown';
  }

  return 'unknown';
}

function isPreviewOrLegacy(text) {
  return /(preview|legacy|deprecated)/.test(text);
}

function isUsableModel(providerId, model) {
  if (!model || typeof model !== 'object') {
    return false;
  }

  const text = modelText(model.id, model.raw || model);
  if (!model.id || !text) {
    return false;
  }

  if (!model.capabilities?.text) {
    return false;
  }

  if (model.deprecated) {
    return false;
  }

  if (isPreviewOrLegacy(text)) {
    return false;
  }

  if (providerId === 'openai' && /gpt-3\.5/.test(text)) {
    return false;
  }

  if (providerId === 'anthropic' && /claude-(2|instant)/.test(text)) {
    return false;
  }

  return true;
}

function filterUsableModels(providerId, models = []) {
  const seen = new Set();
  const usable = [];

  for (const model of models) {
    if (!isUsableModel(providerId, model)) {
      continue;
    }

    if (seen.has(model.id)) {
      continue;
    }

    seen.add(model.id);
    usable.push(model);
  }

  return usable;
}

function sortRecommendedModels(providerId, models = []) {
  return [...models].sort((left, right) => {
    const leftTier = normalizeTier(left?.tier);
    const rightTier = normalizeTier(right?.tier);
    const tierDelta = TIER_ORDER[leftTier] - TIER_ORDER[rightTier];
    if (tierDelta !== 0) {
      return tierDelta;
    }

    const leftName = toText(left?.displayName || left?.id).toLowerCase();
    const rightName = toText(right?.displayName || right?.id).toLowerCase();
    const nameDelta = leftName.localeCompare(rightName);
    if (nameDelta !== 0) {
      return nameDelta;
    }

    return toText(left?.id).localeCompare(toText(right?.id));
  });
}

function groupModelsByTier(models = []) {
  const grouped = {
    premium: [],
    balanced: [],
    cheap: [],
    reasoning: [],
    unknown: [],
  };

  const sorted = sortRecommendedModels(null, models);
  for (const model of sorted) {
    const tier = normalizeTier(model?.tier);
    grouped[tier].push(model);
  }

  return grouped;
}

module.exports = {
  TIER_ORDER,
  TIER_LABELS,
  classifyModel,
  filterUsableModels,
  sortRecommendedModels,
  groupModelsByTier,
};

const assert = require('assert');

const {
  discoverModels,
} = require('./utils/model-discovery');
const {
  classifyModel,
  filterUsableModels,
  sortRecommendedModels,
  groupModelsByTier,
} = require('./utils/model-discovery/tiering');

function modelIds(result) {
  return result.allModels.map(model => model.id);
}

function recommendedIds(result) {
  return result.recommendedModels.map(model => model.id);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function assertContainsAll(actualIds, expectedIds) {
  for (const id of expectedIds) {
    assert.ok(actualIds.includes(id), `Expected to find ${id} in discovery results.`);
  }
}

function makeOpenAIClient(models) {
  return {
    models: {
      list: async () => ({ data: models }),
    },
  };
}

async function runValidation() {
  const openaiFixture = [
    {
      id: 'provider-premium-live-model',
      object: 'model',
      displayName: 'Provider Premium Live Model',
      tier: 'premium',
      capabilities: { text: true, vision: true, audio: false, reasoning: true, json: true },
    },
    {
      id: 'provider-balanced-live-model',
      object: 'model',
      displayName: 'Provider Balanced Live Model',
      tier: 'balanced',
      capabilities: { text: true, vision: true, audio: false, reasoning: false, json: true },
    },
    {
      id: 'provider-cheap-live-model',
      object: 'model',
      displayName: 'Provider Cheap Live Model',
      tier: 'cheap',
      capabilities: { text: true, vision: false, audio: false, reasoning: false, json: true },
    },
    {
      id: 'provider-reasoning-live-model',
      object: 'model',
      displayName: 'Provider Reasoning Live Model',
      tier: 'reasoning',
      capabilities: { text: true, vision: false, audio: false, reasoning: true, json: true },
    },
    {
      id: 'provider-embedding-model',
      object: 'model',
      displayName: 'Provider Embedding Model',
      tier: 'unknown',
      capabilities: { text: false, vision: false, audio: false, reasoning: false, json: false },
    },
    {
      id: 'provider-audio-model',
      object: 'model',
      displayName: 'Provider Audio Model',
      tier: 'unknown',
      capabilities: { text: false, vision: false, audio: true, reasoning: false, json: false },
    },
    {
      id: 'provider-preview-model',
      object: 'model',
      displayName: 'Provider Preview Model',
      tier: 'premium',
      capabilities: { text: true, vision: true, audio: false, reasoning: true, json: true },
      deprecated: true,
    },
    {
      id: 'provider-legacy-model',
      object: 'model',
      displayName: 'Provider Legacy Model',
      tier: 'balanced',
      capabilities: { text: true, vision: false, audio: false, reasoning: false, json: true },
    },
  ];

  const openaiResult = await discoverModels(
    'openai',
    { apiKey: 'sk-test' },
    { client: makeOpenAIClient(openaiFixture) },
  );
  assert.equal(openaiResult.ok, true);
  assert.equal(openaiResult.source, 'live');
  assertContainsAll(modelIds(openaiResult), [
    'provider-premium-live-model',
    'provider-balanced-live-model',
    'provider-cheap-live-model',
    'provider-reasoning-live-model',
    'provider-embedding-model',
    'provider-audio-model',
    'provider-preview-model',
    'provider-legacy-model',
  ]);
  assert.deepStrictEqual(sortedUnique(recommendedIds(openaiResult)), [
    'provider-balanced-live-model',
    'provider-cheap-live-model',
    'provider-premium-live-model',
    'provider-reasoning-live-model',
  ]);
  assert.ok(!recommendedIds(openaiResult).includes('provider-preview-model'));
  assert.ok(!recommendedIds(openaiResult).includes('provider-embedding-model'));
  assert.ok(!recommendedIds(openaiResult).includes('provider-audio-model'));
  assert.ok(!recommendedIds(openaiResult).includes('provider-legacy-model'));

  const fallbackOpenAIResult = await discoverModels(
    'openai',
    { apiKey: 'sk-test' },
    {
      client: makeOpenAIClient([
        {
          id: 'provider-embedding-model',
          object: 'model',
          displayName: 'Provider Embedding Model',
          capabilities: { text: false, vision: false, audio: false, reasoning: false, json: false },
        },
        {
          id: 'provider-preview-model',
          object: 'model',
          displayName: 'Provider Preview Model',
          capabilities: { text: true, vision: false, audio: false, reasoning: false, json: true },
          deprecated: true,
        },
      ]),
    },
  );
  assert.equal(fallbackOpenAIResult.ok, false);
  assert.equal(fallbackOpenAIResult.source, 'live');
  assert.match(fallbackOpenAIResult.warning, /manual entry required/i);
  assert.deepStrictEqual(fallbackOpenAIResult.recommendedModels, []);

  const emptyFallbackResult = await discoverModels(
    'openai_compatible_custom',
    { apiKey: 'custom-test', baseUrl: 'https://example.invalid' },
    {
      request: async () => {
        throw new Error('network down');
      },
    },
  );
  assert.equal(emptyFallbackResult.ok, false);
  assert.equal(emptyFallbackResult.source, 'fallback');
  assert.deepStrictEqual(emptyFallbackResult.recommendedModels, []);
  assert.match(emptyFallbackResult.warning, /manual entry required/i);

  const geminiFixture = [
    {
      name: 'models/provider-premium-live-model',
      displayName: 'Provider Premium Live Model',
      supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
      capabilities: { text: true, vision: true, audio: false, reasoning: true, json: true },
    },
    {
      name: 'models/provider-balanced-live-model',
      displayName: 'Provider Balanced Live Model',
      supportedGenerationMethods: ['generateContent'],
      capabilities: { text: true, vision: true, audio: false, reasoning: false, json: true },
    },
    {
      name: 'models/provider-embedding-model',
      displayName: 'Provider Embedding Model',
      supportedGenerationMethods: ['embedContent'],
      capabilities: { text: false, vision: false, audio: false, reasoning: false, json: false },
    },
    {
      name: 'models/provider-preview-model',
      displayName: 'Provider Preview Model',
      supportedGenerationMethods: ['generateContent'],
      deprecated: true,
    },
  ];

  let geminiRequestUrl = null;
  let geminiRequestConfig = null;
  const geminiResult = await discoverModels(
    'gemini',
    { apiKey: 'gemini-test' },
    {
      request: async (url, requestConfig) => {
        geminiRequestUrl = url;
        geminiRequestConfig = requestConfig;
        return { data: { models: geminiFixture } };
      },
    },
  );
  assert.equal(geminiResult.ok, true);
  assert.equal(geminiResult.source, 'live');
  assert.equal(geminiRequestUrl, 'https://generativelanguage.googleapis.com/v1beta/models');
  assert.equal(geminiRequestConfig.params.key, 'gemini-test');
  assertContainsAll(modelIds(geminiResult), [
    'models/provider-premium-live-model',
    'models/provider-balanced-live-model',
    'models/provider-embedding-model',
    'models/provider-preview-model',
  ]);
  assert.deepStrictEqual(sortedUnique(recommendedIds(geminiResult)), [
    'models/provider-balanced-live-model',
    'models/provider-premium-live-model',
  ]);
  assert.ok(!recommendedIds(geminiResult).includes('models/provider-embedding-model'));
  assert.ok(!recommendedIds(geminiResult).includes('models/provider-preview-model'));

  const anthropicFixture = [
    {
      id: 'provider-premium-live-model',
      display_name: 'Provider Premium Live Model',
      supported_generation_methods: ['generateContent'],
      capabilities: { text: true, vision: true, audio: false, reasoning: true, json: true },
      tier: 'premium',
    },
    {
      id: 'provider-balanced-live-model',
      display_name: 'Provider Balanced Live Model',
      supported_generation_methods: ['generateContent'],
      capabilities: { text: true, vision: true, audio: false, reasoning: false, json: true },
      tier: 'balanced',
    },
    {
      id: 'provider-cheap-live-model',
      display_name: 'Provider Cheap Live Model',
      supported_generation_methods: ['generateContent'],
      capabilities: { text: true, vision: true, audio: false, reasoning: false, json: true },
      tier: 'cheap',
    },
    {
      id: 'provider-preview-model',
      display_name: 'Provider Preview Model',
      supported_generation_methods: ['generateContent'],
      capabilities: { text: true, vision: true, audio: false, reasoning: false, json: true },
      deprecated: true,
    },
  ];

  const anthropicResult = await discoverModels(
    'anthropic',
    { apiKey: 'anthropic-test' },
    {
      request: async () => ({ data: { data: anthropicFixture } }),
    },
  );
  assert.equal(anthropicResult.ok, true);
  assert.equal(anthropicResult.source, 'live');
  assertContainsAll(modelIds(anthropicResult), [
    'provider-premium-live-model',
    'provider-balanced-live-model',
    'provider-cheap-live-model',
    'provider-preview-model',
  ]);
  assert.deepStrictEqual(recommendedIds(anthropicResult), [
    'provider-premium-live-model',
    'provider-balanced-live-model',
    'provider-cheap-live-model',
  ]);
  assert.ok(!recommendedIds(anthropicResult).includes('provider-preview-model'));

  const anthropicFailure = await discoverModels(
    'anthropic',
    { apiKey: 'anthropic-test' },
    {
      request: async () => {
        throw new Error('network down');
      },
    },
  );
  assert.equal(anthropicFailure.ok, true);
  assert.equal(anthropicFailure.source, 'fallback');
  assert.match(anthropicFailure.warning, /verified fallback model list/);

  const deepseekFixture = [
    {
      id: 'provider-premium-live-model',
      object: 'model',
      capabilities: { text: true, vision: false, audio: false, reasoning: true, json: true },
      tier: 'premium',
    },
    {
      id: 'provider-balanced-live-model',
      object: 'model',
      capabilities: { text: true, vision: false, audio: false, reasoning: true, json: true },
      tier: 'balanced',
    },
    {
      id: 'provider-embedding-model',
      object: 'model',
      capabilities: { text: false, vision: false, audio: false, reasoning: false, json: false },
    },
  ];

  let openaiCompatibleUrl = null;
  const deepseekResult = await discoverModels(
    'deepseek',
    { apiKey: 'deepseek-test', baseUrl: 'https://api.deepseek.com' },
    {
      request: async (url) => {
        openaiCompatibleUrl = url;
        return { data: { data: deepseekFixture } };
      },
    },
  );
  assert.equal(deepseekResult.ok, true);
  assert.equal(deepseekResult.source, 'live');
  assert.equal(openaiCompatibleUrl, 'https://api.deepseek.com/models');
  assertContainsAll(modelIds(deepseekResult), ['provider-premium-live-model', 'provider-balanced-live-model', 'provider-embedding-model']);
  assert.deepStrictEqual(recommendedIds(deepseekResult), ['provider-premium-live-model', 'provider-balanced-live-model']);

  const qwenFixture = [
    {
      id: 'provider-premium-live-model',
      object: 'model',
      capabilities: { text: true, vision: false, audio: false, reasoning: true, json: true },
      tier: 'premium',
    },
    {
      id: 'provider-balanced-live-model',
      object: 'model',
      capabilities: { text: true, vision: true, audio: false, reasoning: false, json: true },
      tier: 'balanced',
    },
    {
      id: 'provider-cheap-live-model',
      object: 'model',
      capabilities: { text: true, vision: true, audio: false, reasoning: false, json: true },
      tier: 'cheap',
    },
    {
      id: 'provider-audio-model',
      object: 'model',
      capabilities: { text: false, vision: false, audio: true, reasoning: false, json: false },
    },
  ];

  const qwenResult = await discoverModels(
    'qwen',
    { apiKey: 'qwen-test', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
    {
      request: async (url) => {
        assert.equal(url, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models');
        return { data: { data: qwenFixture } };
      },
    },
  );
  assert.equal(qwenResult.ok, true);
  assert.equal(qwenResult.source, 'live');
  assertContainsAll(modelIds(qwenResult), ['provider-premium-live-model', 'provider-balanced-live-model', 'provider-cheap-live-model', 'provider-audio-model']);
  assert.deepStrictEqual(recommendedIds(qwenResult), ['provider-premium-live-model', 'provider-balanced-live-model', 'provider-cheap-live-model']);

  const customMissingBaseUrl = await discoverModels(
    'openai_compatible_custom',
    { apiKey: 'custom-test' },
    {
      request: async () => ({ data: { data: deepseekFixture } }),
    },
  );
  assert.equal(customMissingBaseUrl.ok, false);
  assert.equal(customMissingBaseUrl.source, 'fallback');
  assert.match(customMissingBaseUrl.warning, /Missing base URL/);

  const tierInput = [
    { id: 'model-a', displayName: 'Alpha', tier: 'balanced', capabilities: { text: true } },
    { id: 'model-b', displayName: 'Beta', tier: 'premium', capabilities: { text: true } },
    { id: 'model-c', displayName: 'Gamma', tier: 'unknown', capabilities: { text: true } },
    { id: 'model-d', displayName: 'Delta', tier: 'cheap', capabilities: { text: true } },
    { id: 'model-e', displayName: 'Epsilon', tier: 'reasoning', capabilities: { text: true } },
  ];

  const grouped = groupModelsByTier(tierInput);
  assert.deepStrictEqual(Object.keys(grouped), ['premium', 'balanced', 'cheap', 'reasoning', 'unknown']);
  assert.deepStrictEqual(grouped.premium.map(model => model.id), ['model-b']);
  assert.deepStrictEqual(grouped.balanced.map(model => model.id), ['model-a']);
  assert.deepStrictEqual(grouped.cheap.map(model => model.id), ['model-d']);
  assert.deepStrictEqual(grouped.reasoning.map(model => model.id), ['model-e']);
  assert.deepStrictEqual(grouped.unknown.map(model => model.id), ['model-c']);

  const sortedA = sortRecommendedModels('openai', [
    { id: 'z', displayName: 'Zed', tier: 'balanced' },
    { id: 'a', displayName: 'Alpha', tier: 'premium' },
    { id: 'b', displayName: 'Beta', tier: 'balanced' },
    { id: 'c', displayName: 'Gamma', tier: 'cheap' },
  ]).map(model => model.id);
  const sortedB = sortRecommendedModels('openai', [
    { id: 'c', displayName: 'Gamma', tier: 'cheap' },
    { id: 'b', displayName: 'Beta', tier: 'balanced' },
    { id: 'z', displayName: 'Zed', tier: 'balanced' },
    { id: 'a', displayName: 'Alpha', tier: 'premium' },
  ]).map(model => model.id);
  assert.deepStrictEqual(sortedA, sortedB);
  assert.deepStrictEqual(sortedA, ['a', 'b', 'z', 'c']);

  const classifiedOpenAI = classifyModel('openai', 'provider-reasoning-live-model', { displayName: 'Provider Reasoning Live Model', tier: 'reasoning' });
  const classifiedGemini = classifyModel('gemini', 'provider-cheap-live-model', { displayName: 'Provider Cheap Live Model', tier: 'cheap' });
  assert.equal(classifiedOpenAI, 'reasoning');
  assert.equal(classifiedGemini, 'cheap');

  const usable = filterUsableModels('openai', [
    { id: 'provider-live-model', displayName: 'Provider Live Model', tier: 'reasoning', capabilities: { text: true }, deprecated: false },
    { id: 'provider-preview-model', displayName: 'Provider Preview Model', tier: 'premium', capabilities: { text: true }, deprecated: true },
    { id: 'provider-embedding-model', displayName: 'Provider Embedding Model', tier: 'unknown', capabilities: { text: false }, deprecated: false },
  ]);
  assert.deepStrictEqual(usable.map(model => model.id), ['provider-live-model']);

  console.log('Model discovery validation passed.');
}

if (require.main === module) {
  runValidation().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  runValidation,
};

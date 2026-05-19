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
    { id: 'gpt-5.5', object: 'model' },
    { id: 'gpt-5.4-mini', object: 'model' },
    { id: 'o3-mini', object: 'model' },
    { id: 'gpt-3.5-turbo', object: 'model' },
    { id: 'text-embedding-3-small', object: 'model' },
    { id: 'gpt-image-1', object: 'model' },
    { id: 'gpt-4-turbo-preview', object: 'model' },
  ];

  const openaiResult = await discoverModels(
    'openai',
    { apiKey: 'sk-test' },
    { client: makeOpenAIClient(openaiFixture) },
  );
  assert.equal(openaiResult.ok, true);
  assert.equal(openaiResult.source, 'live');
  assertContainsAll(modelIds(openaiResult), [
    'gpt-5.5',
    'gpt-5.4-mini',
    'o3-mini',
    'gpt-3.5-turbo',
    'text-embedding-3-small',
    'gpt-image-1',
    'gpt-4-turbo-preview',
  ]);
  assert.deepStrictEqual(sortedUnique(recommendedIds(openaiResult)), ['gpt-5.4-mini', 'gpt-5.5', 'o3-mini']);
  assert.ok(!recommendedIds(openaiResult).includes('gpt-3.5-turbo'));
  assert.ok(!recommendedIds(openaiResult).includes('gpt-4-turbo-preview'));
  assert.ok(!recommendedIds(openaiResult).includes('text-embedding-3-small'));
  assert.ok(!recommendedIds(openaiResult).includes('gpt-image-1'));

  const fallbackOpenAIResult = await discoverModels(
    'openai',
    { apiKey: 'sk-test' },
    {
      client: makeOpenAIClient([
        { id: 'text-embedding-3-small', object: 'model' },
        { id: 'gpt-3.5-turbo', object: 'model' },
      ]),
    },
  );
  assert.equal(fallbackOpenAIResult.ok, true);
  assert.equal(fallbackOpenAIResult.source, 'fallback');
  assert.ok(fallbackOpenAIResult.warning.includes('verified fallback model list'));
  assertContainsAll(modelIds(fallbackOpenAIResult), ['text-embedding-3-small', 'gpt-3.5-turbo']);
  assert.ok(fallbackOpenAIResult.recommendedModels.length > 0);
  assert.equal(fallbackOpenAIResult.recommendedModels[0].source, 'fallback');

  const geminiFixture = [
    {
      name: 'models/gemini-2.5-pro',
      displayName: 'Gemini 2.5 Pro',
      supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
    },
    {
      name: 'models/gemini-2.5-flash-lite',
      displayName: 'Gemini 2.5 Flash Lite',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-embedding-001',
      displayName: 'Gemini Embedding',
      supportedGenerationMethods: ['embedContent'],
    },
    {
      name: 'models/gemini-live-2.0-flash',
      displayName: 'Gemini Live',
      supportedGenerationMethods: ['liveGenerateContent'],
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
    'models/gemini-2.5-pro',
    'models/gemini-2.5-flash-lite',
    'models/gemini-embedding-001',
    'models/gemini-live-2.0-flash',
  ]);
  assert.deepStrictEqual(sortedUnique(recommendedIds(geminiResult)), ['models/gemini-2.5-flash-lite', 'models/gemini-2.5-pro']);
  assert.ok(!recommendedIds(geminiResult).includes('models/gemini-embedding-001'));
  assert.ok(!recommendedIds(geminiResult).includes('models/gemini-live-2.0-flash'));

  const anthropicFixture = [
    { id: 'claude-opus-4-1-20250805', display_name: 'Claude Opus 4.1' },
    { id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-haiku-20241022', display_name: 'Claude Haiku 3.5' },
    { id: 'claude-instant-1.2', display_name: 'Claude Instant' },
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
    'claude-opus-4-1-20250805',
    'claude-sonnet-4-20250514',
    'claude-3-5-haiku-20241022',
    'claude-instant-1.2',
  ]);
  assert.deepStrictEqual(recommendedIds(anthropicResult), [
    'claude-opus-4-1-20250805',
    'claude-sonnet-4-20250514',
    'claude-3-5-haiku-20241022',
  ]);
  assert.ok(!recommendedIds(anthropicResult).includes('claude-instant-1.2'));

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
    { id: 'deepseek-v4-pro', object: 'model' },
    { id: 'deepseek-v4-flash', object: 'model' },
    { id: 'deepseek-embedding', object: 'model' },
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
  assertContainsAll(modelIds(deepseekResult), ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-embedding']);
  assert.deepStrictEqual(recommendedIds(deepseekResult), ['deepseek-v4-pro', 'deepseek-v4-flash']);

  const qwenFixture = [
    { id: 'qwen3-max', object: 'model' },
    { id: 'qwen3.6-plus', object: 'model' },
    { id: 'qwen3.6-flash', object: 'model' },
    { id: 'qwen-tts', object: 'model' },
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
  assertContainsAll(modelIds(qwenResult), ['qwen3-max', 'qwen3.6-plus', 'qwen3.6-flash', 'qwen-tts']);
  assert.deepStrictEqual(recommendedIds(qwenResult), ['qwen3-max', 'qwen3.6-plus', 'qwen3.6-flash']);

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

  const classifiedOpenAI = classifyModel('openai', 'gpt-5.5', { displayName: 'GPT-5.5' });
  const classifiedGemini = classifyModel('gemini', 'gemini-2.5-flash-lite', { displayName: 'Gemini 2.5 Flash Lite' });
  assert.equal(classifiedOpenAI, 'reasoning');
  assert.equal(classifiedGemini, 'cheap');

  const usable = filterUsableModels('openai', [
    { id: 'gpt-5.5', displayName: 'GPT-5.5', tier: 'reasoning', capabilities: { text: true }, deprecated: false },
    { id: 'gpt-4-turbo-preview', displayName: 'GPT-4 Turbo Preview', tier: 'premium', capabilities: { text: true }, deprecated: true },
    { id: 'text-embedding-3-small', displayName: 'Text Embedding', tier: 'unknown', capabilities: { text: false }, deprecated: false },
  ]);
  assert.deepStrictEqual(usable.map(model => model.id), ['gpt-5.5']);

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

const assert = require('assert');

const { discoverModels } = require('./utils/model-discovery');

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

async function run() {
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
    {
      id: 'claude-opus-4-1-20250929',
      display_name: 'Claude Opus 4.1',
    },
    {
      id: 'claude-3-haiku-20240307',
      display_name: 'Claude 3 Haiku',
    },
    {
      id: 'claude-instant-1.2',
      display_name: 'Claude Instant',
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
  assertContainsAll(modelIds(anthropicResult), [
    'claude-opus-4-1-20250929',
    'claude-3-haiku-20240307',
    'claude-instant-1.2',
  ]);
  assert.deepStrictEqual(recommendedIds(anthropicResult), ['claude-opus-4-1-20250929']);
  assert.ok(!recommendedIds(anthropicResult).includes('claude-3-haiku-20240307'));
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
  assert.equal(anthropicFailure.ok, false);
  assert.equal(anthropicFailure.source, 'fallback');
  assert.match(anthropicFailure.warning, /Live model discovery failed:/);

  const deepseekFixture = [
    { id: 'deepseek-chat', object: 'model' },
    { id: 'deepseek-reasoner', object: 'model' },
    { id: 'deepseek-embedding', object: 'model' },
  ];

  const qwenFixture = [
    { id: 'qwen-plus', object: 'model' },
    { id: 'qwen-turbo', object: 'model' },
    { id: 'qwen-tts', object: 'model' },
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
  assert.equal(openaiCompatibleUrl, 'https://api.deepseek.com/models');
  assertContainsAll(modelIds(deepseekResult), ['deepseek-chat', 'deepseek-reasoner', 'deepseek-embedding']);
  assert.deepStrictEqual(sortedUnique(recommendedIds(deepseekResult)), ['deepseek-chat', 'deepseek-reasoner']);
  assert.ok(!recommendedIds(deepseekResult).includes('deepseek-embedding'));

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
  assertContainsAll(modelIds(qwenResult), ['qwen-plus', 'qwen-turbo', 'qwen-tts']);
  assert.deepStrictEqual(sortedUnique(recommendedIds(qwenResult)), ['qwen-plus', 'qwen-turbo']);
  assert.ok(!recommendedIds(qwenResult).includes('qwen-tts'));

  const customMissingBaseUrl = await discoverModels(
    'openai_compatible_custom',
    { apiKey: 'custom-test' },
    {
      request: async () => ({ data: { data: deepseekFixture } }),
    },
  );
  assert.equal(customMissingBaseUrl.ok, false);
  assert.match(customMissingBaseUrl.warning, /Missing base URL/);

  console.log('Model discovery validation passed.');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

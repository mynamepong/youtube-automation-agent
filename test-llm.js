const assert = require('assert/strict');
const Module = require('module');

function createIdentityChalk() {
  const identity = value => value;
  identity.bold = identity;
  identity.dim = identity;
  identity.italic = identity;
  identity.gray = identity;
  identity.red = identity;
  identity.green = identity;
  identity.yellow = identity;
  identity.blue = identity;
  identity.cyan = identity;
  identity.white = identity;
  identity.magenta = identity;
  identity.cyanBright = identity;
  return identity;
}

function createWinstonStub() {
  return {
    createLogger: () => ({
      info() {},
      warn() {},
      error() {},
      debug() {},
    }),
    format: {
      combine: () => ({}),
      timestamp: () => ({}),
      errors: () => ({}),
      json: () => ({}),
    },
    transports: {
      File: class FileTransport {},
    },
  };
}

function installDependencyStubs() {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'chalk') {
      return createIdentityChalk();
    }

    if (request === 'winston') {
      return createWinstonStub();
    }

    return originalLoad(request, parent, isMain);
  };

  return () => {
    Module._load = originalLoad;
  };
}

const restoreDependencies = installDependencyStubs();
const { LLMService } = require('./utils/llm-service');
const { createOpenAIAdapter } = require('./utils/llm-providers/openai');
const { createGeminiAdapter } = require('./utils/llm-providers/gemini');
const { createAnthropicAdapter } = require('./utils/llm-providers/anthropic');
const { createOpenAICompatibleAdapter } = require('./utils/llm-providers/openai-compatible');
const { ScriptWriterAgent } = require('./agents/script-writer-agent');
const { SEOOptimizerAgent } = require('./agents/seo-optimizer-agent');
const { ThumbnailDesignerAgent } = require('./agents/thumbnail-designer-agent');
restoreDependencies();

function createCaptureLogger() {
  const entries = [];
  return {
    entries,
    info(message, ...args) {
      entries.push({ level: 'info', message, args });
    },
    warn(message, ...args) {
      entries.push({ level: 'warn', message, args });
    },
    error(message, ...args) {
      entries.push({ level: 'error', message, args });
    },
    debug(message, ...args) {
      entries.push({ level: 'debug', message, args });
    },
  };
}

function createDbStub() {
  return {
    savedScript: null,
    savedSEO: null,
    savedThumbnail: null,
    async saveScript(script) {
      this.savedScript = script;
      return 'script-id';
    },
    async saveSEOData(seoData) {
      this.savedSEO = seoData;
      return 'seo-id';
    },
    async saveThumbnail(thumbnailData) {
      this.savedThumbnail = thumbnailData;
      return 'thumbnail-id';
    },
    async getKeywordHistory() {
      return [];
    },
  };
}

function baseStrategy() {
  return {
    topic: 'AI Productivity',
    angle: 'How to work faster',
    targetAudience: 'busy professionals',
    contentType: 'Explainer',
    keywords: ['ai productivity', 'workflow automation', 'time saving'],
  };
}

function baseScript() {
  return {
    title: 'AI Productivity: A Better Workflow',
    hook: { type: 'statement', text: 'Hook text', duration: '0:00-0:05' },
    introduction: {
      greeting: 'Hello',
      topicIntro: 'Intro',
      valueProposition: 'Value',
      credibility: 'Credibility',
      duration: '0:05-0:20',
    },
    mainContent: {
      sections: [
        {
          title: 'Section One',
          content: 'Content one',
          duration: 60,
        },
        {
          title: 'Section Two',
          content: 'Content two',
          duration: 75,
        },
      ],
      totalDuration: '2:15',
    },
    conclusion: {
      title: 'Wrapping Up',
      recap: ['Recap'],
      finalThought: 'Final thought',
      duration: '30 seconds',
    },
    callToAction: {
      subscribe: 'Subscribe',
      like: 'Like',
      comment: 'Comment',
      nextVideo: 'Watch next',
      duration: '15 seconds',
    },
    duration: '2:45',
    tone: 'informative',
    pacing: 'steady',
    keywords: ['ai productivity', 'workflow automation', 'time saving'],
    metadata: {
      strategy: baseStrategy(),
    },
    fullScript: 'Full script body',
  };
}

function createAiConfig({
  mode = 'single',
  primaryProvider = 'openai',
  fallbackProvider = null,
  providerModel = 'test-model',
  fallbackModel = 'fallback-model',
  taskProviderMap = null,
} = {}) {
  const providers = {
    openai: {
      enabled: true,
      apiKey: 'sk-openai-test',
      model: providerModel,
    },
    gemini: {
      enabled: true,
      apiKey: 'gemini-test',
      model: 'gemini-test-model',
    },
    anthropic: {
      enabled: true,
      apiKey: 'anthropic-test',
      model: 'claude-test-model',
    },
    deepseek: {
      enabled: true,
      apiKey: 'deepseek-test',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
    },
    qwen: {
      enabled: true,
      apiKey: 'qwen-test',
      model: 'qwen-plus',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    },
    openai_compatible_custom: {
      enabled: true,
      apiKey: 'custom-test',
      model: 'custom-model',
      baseUrl: 'https://llm.example.com/v1',
    },
  };

  const selectedModels = {
    openai: providerModel,
    gemini: 'gemini-test-model',
    anthropic: 'claude-test-model',
    deepseek: 'deepseek-chat',
    qwen: 'qwen-plus',
    openai_compatible_custom: 'custom-model',
  };

  return {
    mode,
    primaryProvider,
    fallbackProvider,
    enabledProviders: mode === 'multi'
      ? ['openai', 'gemini', 'anthropic', 'deepseek', 'qwen', 'openai_compatible_custom']
      : [primaryProvider].concat(fallbackProvider ? [fallbackProvider] : []).filter(Boolean),
    selectedModels,
    providers,
    ...(taskProviderMap ? { taskProviderMap } : {}),
  };
}

function createService(aiConfig, adapterOverrides = {}, logger = createCaptureLogger()) {
  const credentials = { ai: aiConfig };
  const service = new LLMService(credentials, {
    logger,
    adapterOverrides,
  });
  return { service, logger };
}

async function testSingleModeProviderSelection() {
  const calls = [];
  const { service } = createService(createAiConfig({ mode: 'single', primaryProvider: 'openai' }), {
    openai: {
      async generateText(request) {
        calls.push({ provider: 'openai', request });
        return {
          ok: true,
          text: 'single provider response',
          json: null,
          provider: 'openai',
          model: 'test-model',
          usage: { prompt_tokens: 1, completion_tokens: 2 },
          raw: { ok: true },
        };
      },
    },
  });

  await service.initialize();
  const result = await service.generateText({
    task: 'script',
    prompt: 'Write a script',
    systemPrompt: 'Be concise',
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'test-model');
  assert.equal(service.getActiveProvider(), 'openai');
  assert.equal(service.getActiveModel(), 'test-model');
  assert.equal(calls.length, 1);
}

async function testFallbackModeRetry() {
  const calls = [];
  const { service } = createService(createAiConfig({
    mode: 'fallback',
    primaryProvider: 'openai',
    fallbackProvider: 'gemini',
  }), {
    openai: {
      async generateText(request) {
        calls.push({ provider: 'openai', request });
        return {
          ok: false,
          provider: 'openai',
          model: 'test-model',
          recoverable: true,
          code: 'HTTP_500',
          message: 'Temporary outage',
          raw: {},
        };
      },
    },
    gemini: {
      async generateText(request) {
        calls.push({ provider: 'gemini', request });
        return {
          ok: true,
          text: 'fallback response',
          json: null,
          provider: 'gemini',
          model: 'gemini-test-model',
          usage: { total_tokens: 3 },
          raw: {},
        };
      },
    },
  });

  await service.initialize();
  const result = await service.generateText({
    task: 'seo',
    prompt: 'Optimize the metadata',
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-test-model');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].provider, 'openai');
  assert.equal(calls[1].provider, 'gemini');
}

async function testFallbackModeNoRetryOnNonRecoverable() {
  const calls = [];
  const { service } = createService(createAiConfig({
    mode: 'fallback',
    primaryProvider: 'openai',
    fallbackProvider: 'gemini',
  }), {
    openai: {
      async generateText(request) {
        calls.push({ provider: 'openai', request });
        return {
          ok: false,
          provider: 'openai',
          model: 'test-model',
          recoverable: false,
          code: 'INVALID_REQUEST',
          message: 'Bad request',
          raw: {},
        };
      },
    },
    gemini: {
      async generateText(request) {
        calls.push({ provider: 'gemini', request });
        return {
          ok: true,
          text: 'should not be called',
          json: null,
          provider: 'gemini',
          model: 'gemini-test-model',
          usage: null,
          raw: {},
        };
      },
    },
  });

  await service.initialize();
  const result = await service.generateText({
    task: 'seo',
    prompt: 'Optimize the metadata',
  });

  assert.equal(result.ok, false);
  assert.equal(result.provider, 'openai');
  assert.equal(result.code, 'INVALID_REQUEST');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, 'openai');
}

async function testMultiModeExplicitProviderSelection() {
  const calls = [];
  const { service } = createService(createAiConfig({
    mode: 'multi',
    primaryProvider: null,
    fallbackProvider: null,
  }), {
    anthropic: {
      async generateText(request) {
        calls.push({ provider: 'anthropic', request });
        return {
          ok: true,
          text: 'anthropic response',
          json: null,
          provider: 'anthropic',
          model: 'claude-test-model',
          usage: {},
          raw: {},
        };
      },
    },
  });

  await service.initialize();
  const result = await service.generateText({
    task: 'script',
    provider: 'anthropic',
    prompt: 'Write the script',
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'anthropic');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, 'anthropic');
}

async function testMultiModeTaskMapSelection() {
  const calls = [];
  const { service } = createService(createAiConfig({
    mode: 'multi',
    primaryProvider: null,
    fallbackProvider: null,
    taskProviderMap: {
      seo: 'gemini',
    },
  }), {
    gemini: {
      async generateText(request) {
        calls.push({ provider: 'gemini', request });
        return {
          ok: true,
          text: 'gemini task map response',
          json: null,
          provider: 'gemini',
          model: 'gemini-test-model',
          usage: {},
          raw: {},
        };
      },
    },
  });

  await service.initialize();
  const result = await service.generateText({
    task: 'seo',
    prompt: 'Optimize metadata',
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'gemini');
  assert.equal(calls.length, 1);
}

async function testMultiModeNoProviderError() {
  const { service } = createService(createAiConfig({
    mode: 'multi',
    primaryProvider: null,
    fallbackProvider: null,
  }));

  await service.initialize();
  const result = await service.generateText({
    task: 'script',
    prompt: 'Write a script',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'NO_PROVIDER_SELECTED');
  assert.equal(result.message, 'No provider selected for multi-provider mode.');
}

async function testGenerateJsonParsing() {
  const { service } = createService(createAiConfig({ mode: 'single', primaryProvider: 'openai' }), {
    openai: {
      async generateText() {
        return {
          ok: true,
          text: '{"title":"hello","tags":["a"]}',
          json: null,
          provider: 'openai',
          model: 'test-model',
          usage: {},
          raw: {},
        };
      },
    },
  });

  await service.initialize();
  const result = await service.generateJSON({
    task: 'seo',
    prompt: 'Return JSON',
    schema: {
      type: 'object',
      required: ['title', 'tags'],
      properties: {
        title: { type: 'string' },
        tags: { type: 'array', minItems: 1 },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.json.title, 'hello');
  assert.deepEqual(result.json.tags, ['a']);
}

async function testGenerateJsonFencedParsing() {
  const { service } = createService(createAiConfig({ mode: 'single', primaryProvider: 'openai' }), {
    openai: {
      async generateText() {
        return {
          ok: true,
          text: '```json\n{"title":"hello","tags":["a"]}\n```',
          json: null,
          provider: 'openai',
          model: 'test-model',
          usage: {},
          raw: {},
        };
      },
    },
  });

  await service.initialize();
  const result = await service.generateJSON({
    task: 'seo',
    prompt: 'Return JSON',
  });

  assert.equal(result.ok, true);
  assert.equal(result.json.title, 'hello');
}

async function testGenerateJsonInvalid() {
  const { service } = createService(createAiConfig({ mode: 'single', primaryProvider: 'openai' }), {
    openai: {
      async generateText() {
        return {
          ok: true,
          text: 'not json at all',
          json: null,
          provider: 'openai',
          model: 'test-model',
          usage: {},
          raw: {},
        };
      },
    },
  });

  await service.initialize();
  const result = await service.generateJSON({
    task: 'seo',
    prompt: 'Return JSON',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_JSON');
}

async function testSchemaValidationFailure() {
  const { service } = createService(createAiConfig({ mode: 'single', primaryProvider: 'openai' }), {
    openai: {
      async generateText() {
        return {
          ok: true,
          text: '{"title":"hello"}',
          json: null,
          provider: 'openai',
          model: 'test-model',
          usage: {},
          raw: {},
        };
      },
    },
  });

  await service.initialize();
  const result = await service.generateJSON({
    task: 'seo',
    prompt: 'Return JSON',
    schema: {
      type: 'object',
      required: ['title', 'tags'],
      properties: {
        title: { type: 'string' },
        tags: { type: 'array', minItems: 1 },
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SCHEMA_VALIDATION_FAILED');
}

async function testLoggingSanitization() {
  const logger = createCaptureLogger();
  const secret = 'sk-secret-123';
  const promptText = 'Do not leak this prompt';
  const { service } = createService(createAiConfig({ mode: 'single', primaryProvider: 'openai' }), {
    openai: {
      async generateText() {
        return {
          ok: false,
          provider: 'openai',
          model: 'test-model',
          recoverable: false,
          code: 'INVALID_REQUEST',
          message: `Authorization: ${secret} - ${promptText}`,
          raw: {
            headers: {
              authorization: secret,
            },
          },
        };
      },
    },
  }, logger);

  await service.initialize();
  const result = await service.generateText({
    task: 'script',
    prompt: promptText,
  });

  assert.equal(result.ok, false);
  const logText = logger.entries.map(entry => String(entry.message)).join(' ');
  assert.equal(logText.includes(secret), false);
  assert.equal(logText.includes(promptText), false);
  assert.equal(logText.includes('headers'), false);
}

async function testOpenAIAdapter() {
  const calls = [];
  const adapter = createOpenAIAdapter({
    apiKey: 'sk-openai-test',
    model: 'gpt-test',
  }, {
    clientFactory: async () => ({
      chat: {
        completions: {
          create: async options => {
            calls.push(options);
            return {
              choices: [{ message: { content: 'openai adapter text' } }],
              usage: { prompt_tokens: 2, completion_tokens: 4 },
            };
          },
        },
      },
    }),
  });

  const result = await adapter.generateText({
    prompt: 'hello',
    systemPrompt: 'system',
    temperature: 0.2,
    maxOutputTokens: 42,
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-test');
  assert.equal(result.text, 'openai adapter text');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'gpt-test');
  assert.equal(calls[0].messages[0].role, 'system');
}

async function testGeminiAdapter() {
  const calls = [];
  const adapter = createGeminiAdapter({
    apiKey: 'gemini-test',
    model: 'gemini-test-model',
  }, {
    request: async (url, requestConfig) => {
      calls.push({ url, requestConfig });
      return {
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: 'gemini adapter text' }],
              },
            },
          ],
          usageMetadata: { totalTokenCount: 9 },
        },
      };
    },
  });

  const result = await adapter.generateText({
    prompt: 'hello',
    systemPrompt: 'system',
    temperature: 0.1,
    maxOutputTokens: 64,
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-test-model');
  assert.equal(result.text, 'gemini adapter text');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestConfig.params.key, 'gemini-test');
}

async function testAnthropicAdapter() {
  const calls = [];
  const adapter = createAnthropicAdapter({
    apiKey: 'anthropic-test',
    model: 'claude-test-model',
  }, {
    request: async (url, requestConfig) => {
      calls.push({ url, requestConfig });
      return {
        data: {
          content: [{ text: 'anthropic adapter text' }],
          usage: { input_tokens: 3, output_tokens: 5 },
        },
      };
    },
  });

  const result = await adapter.generateText({
    prompt: 'hello',
    systemPrompt: 'system',
    temperature: 0.2,
    maxOutputTokens: 128,
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'anthropic');
  assert.equal(result.model, 'claude-test-model');
  assert.equal(result.text, 'anthropic adapter text');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestConfig.headers['x-api-key'], 'anthropic-test');
}

async function testOpenAICompatibleAdapterRouting() {
  const requests = [];

  const deepseekAdapter = createOpenAICompatibleAdapter('deepseek', {
    apiKey: 'deepseek-test',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
  }, {
    request: async (url, requestConfig) => {
      requests.push({ provider: 'deepseek', url, requestConfig });
      return {
        data: {
          choices: [{ message: { content: 'deepseek text' } }],
        },
      };
    },
  });

  const qwenAdapter = createOpenAICompatibleAdapter('qwen', {
    apiKey: 'qwen-test',
    model: 'qwen-plus',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  }, {
    request: async (url, requestConfig) => {
      requests.push({ provider: 'qwen', url, requestConfig });
      return {
        data: {
          choices: [{ message: { content: 'qwen text' } }],
        },
      };
    },
  });

  const customAdapter = createOpenAICompatibleAdapter('openai_compatible_custom', {
    apiKey: 'custom-test',
    model: 'custom-model',
    baseUrl: 'https://llm.example.com/v1',
  }, {
    request: async (url, requestConfig) => {
      requests.push({ provider: 'custom', url, requestConfig });
      return {
        data: {
          choices: [{ message: { content: 'custom text' } }],
        },
      };
    },
  });

  const deepseekResult = await deepseekAdapter.generateText({ prompt: 'hello' });
  const qwenResult = await qwenAdapter.generateText({ prompt: 'hello' });
  const customResult = await customAdapter.generateText({ prompt: 'hello' });

  assert.equal(deepseekResult.ok, true);
  assert.equal(qwenResult.ok, true);
  assert.equal(customResult.ok, true);
  assert.equal(requests[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(requests[1].url, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
  assert.equal(requests[2].url, 'https://llm.example.com/v1/chat/completions');
}

async function testScriptWriterTemplateFallback() {
  const db = createDbStub();
  const agent = new ScriptWriterAgent(db, {}, {
    async generateJSON() {
      return {
        ok: false,
        code: 'INVALID_JSON',
      };
    },
  });
  agent.logger = createCaptureLogger();

  const script = await agent.generateScript(baseStrategy());

  assert.equal(script.metadata.generationMode, 'template');
  assert.equal(typeof script.fullScript, 'string');
  assert.equal(db.savedScript.metadata.generationMode, 'template');
}

async function testSeoTemplateFallback() {
  const db = createDbStub();
  const agent = new SEOOptimizerAgent(db, {}, {
    async generateJSON() {
      return {
        ok: false,
        code: 'INVALID_JSON',
      };
    },
  });
  agent.logger = createCaptureLogger();

  const script = baseScript();
  const seo = await agent.optimize(script, baseStrategy());

  assert.equal(seo.metadata.generationMode, 'template');
  assert.equal(Array.isArray(seo.tags), true);
  assert.equal(Array.isArray(seo.hashtags), true);
  assert.equal(Array.isArray(seo.chapters), true);
  assert.equal(db.savedSEO.metadata.generationMode, 'template');
}

async function testThumbnailTemplateFallback() {
  const db = createDbStub();
  const agent = new ThumbnailDesignerAgent(db, {}, null);
  agent.logger = createCaptureLogger();
  agent.createThumbnail = async () => '/tmp/test-thumbnail.png';
  agent.addTextOverlay = async imagePath => imagePath;
  agent.optimizeForYouTube = async imagePath => imagePath;
  agent.getFileSize = async () => 1234;

  const thumbnail = await agent.generateThumbnail(baseScript());

  assert.equal(thumbnail.concept.generationMode, 'template');
  assert.equal(typeof thumbnail.prompt, 'string');
  assert.equal(db.savedThumbnail.path, '/tmp/test-thumbnail.png');
}

async function main() {
  const tests = [
    testSingleModeProviderSelection,
    testFallbackModeRetry,
    testFallbackModeNoRetryOnNonRecoverable,
    testMultiModeExplicitProviderSelection,
    testMultiModeTaskMapSelection,
    testMultiModeNoProviderError,
    testGenerateJsonParsing,
    testGenerateJsonFencedParsing,
    testGenerateJsonInvalid,
    testSchemaValidationFailure,
    testLoggingSanitization,
    testOpenAIAdapter,
    testGeminiAdapter,
    testAnthropicAdapter,
    testOpenAICompatibleAdapterRouting,
    testScriptWriterTemplateFallback,
    testSeoTemplateFallback,
    testThumbnailTemplateFallback,
  ];

  let passed = 0;

  for (const test of tests) {
    await test();
    passed += 1;
  }

  console.log(`LLM tests passed: ${passed}/${tests.length}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}


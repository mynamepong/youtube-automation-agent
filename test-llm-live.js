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

function createLiveCredentials() {
  const providerCandidates = [
    {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.LLM_LIVE_MODEL || process.env.OPENAI_MODEL,
    },
    {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.LLM_LIVE_MODEL || process.env.GEMINI_MODEL,
    },
    {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.LLM_LIVE_MODEL || process.env.ANTHROPIC_MODEL,
    },
    {
      provider: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.LLM_LIVE_MODEL || process.env.DEEPSEEK_MODEL,
      baseUrl: 'https://api.deepseek.com',
    },
    {
      provider: 'qwen',
      apiKey: process.env.QWEN_API_KEY,
      model: process.env.LLM_LIVE_MODEL || process.env.QWEN_MODEL,
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    },
    {
      provider: 'openai_compatible_custom',
      apiKey: process.env.CUSTOM_LLM_API_KEY,
      model: process.env.LLM_LIVE_MODEL || process.env.CUSTOM_LLM_MODEL,
      baseUrl: process.env.CUSTOM_LLM_BASE_URL,
    },
  ];

  for (const candidate of providerCandidates) {
    if (candidate.apiKey && candidate.model) {
      return {
        ai: {
          mode: 'single',
          primaryProvider: candidate.provider,
          fallbackProvider: null,
          enabledProviders: [candidate.provider],
          selectedModels: {
            [candidate.provider]: candidate.model,
          },
          providers: {
            [candidate.provider]: {
              enabled: true,
              apiKey: candidate.apiKey,
              model: candidate.model,
              ...(candidate.baseUrl ? { baseUrl: candidate.baseUrl } : {}),
            },
          },
        },
      };
    }
  }

  return null;
}

async function main() {
  if (process.env.LIVE_LLM_TESTS !== 'true') {
    console.log('Skipping live LLM smoke test. Set LIVE_LLM_TESTS=true to enable.');
    return;
  }

  const restoreDependencies = installDependencyStubs();
  const { LLMService } = require('./utils/llm-service');
  restoreDependencies();

  const credentials = createLiveCredentials();
  if (!credentials) {
    console.log('Skipping live LLM smoke test. No provider API key and model pair was found.');
    return;
  }

  const service = new LLMService(credentials, {
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
  });

  const initialized = await service.initialize();
  if (!initialized) {
    console.log('Skipping live LLM smoke test. LLM service could not initialize.');
    return;
  }

  const result = await service.generateText({
    task: 'script',
    prompt: 'Respond with a short sentence about focus.',
    systemPrompt: 'Be brief.',
    temperature: 0.2,
    maxOutputTokens: 64,
  });

  if (!result.ok) {
    throw new Error(`Live LLM smoke test failed: ${result.code} - ${result.message}`);
  }

  console.log(`Live LLM smoke test passed with ${result.provider}/${result.model}.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}

const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const Module = require('module');
const {
  getProvider,
  listProviderChoices,
  isSupportedProvider,
  isOpenAICompatibleProvider,
  getEnvKeyForProvider,
} = require('./utils/llm-provider-registry');

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

    if (request === 'inquirer') {
      return {
        prompt: async () => ({}),
      };
    }

    if (request === 'googleapis') {
      return {
        google: {
          auth: {
            OAuth2: class OAuth2 {
              constructor() {}
              generateAuthUrl() {
                return 'https://example.com/auth';
              }
              async getToken() {
                return { tokens: {} };
              }
              setCredentials() {}
            },
          },
          youtube: () => ({
            channels: {
              list: async () => ({ data: { items: [] } }),
            },
          }),
        },
      };
    }

    return originalLoad(request, parent, isMain);
  };

  return () => {
    Module._load = originalLoad;
  };
}

const restoreDependencies = installDependencyStubs();
const { CredentialManager } = require('./utils/credential-manager');
restoreDependencies();

const youtubeCredentials = {
  client_id: 'test-client-id.apps.googleusercontent.com',
  client_secret: 'test-client-secret',
  redirect_uris: ['http://localhost:8080/oauth2callback'],
};

const youtubeTokens = {
  youtube: {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    scope: 'https://www.googleapis.com/auth/youtube.upload',
    token_type: 'Bearer',
    expiry_date: Date.now() + 60 * 60 * 1000,
  },
};

function createSilentLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    success() {},
    debug() {},
  };
}

async function createManager(baseDir, credentials) {
  const credentialsPath = path.join(baseDir, 'credentials.json');
  const tokensPath = path.join(baseDir, 'tokens.json');

  await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2));
  await fs.writeFile(tokensPath, JSON.stringify(youtubeTokens, null, 2));

  const manager = new CredentialManager();
  manager.logger = createSilentLogger();
  manager.credentialsPath = credentialsPath;
  manager.tokensPath = tokensPath;
  manager.credentials = {};
  manager.tokens = {};
  manager._credentialsLoaded = false;
  manager._tokensLoaded = false;
  return manager;
}

function assertBaseRegistryMetadata() {
  const choices = listProviderChoices().map(choice => choice.value);
  for (const providerId of [
    'openai',
    'gemini',
    'anthropic',
    'deepseek',
    'qwen',
    'openai_compatible_custom',
  ]) {
    assert.ok(choices.includes(providerId), `Missing provider choice: ${providerId}`);
    assert.ok(isSupportedProvider(providerId), `Provider should be supported: ${providerId}`);
  }

  assert.equal(getProvider('deepseek').defaultBaseUrl, 'https://api.deepseek.com');
  assert.equal(getProvider('qwen').defaultBaseUrl, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1');
  assert.equal(getEnvKeyForProvider('anthropic'), 'ANTHROPIC_API_KEY');
  assert.equal(isOpenAICompatibleProvider('deepseek'), true);
  assert.equal(isOpenAICompatibleProvider('openai'), false);
}

function expectNormalizedConfig(config, expected) {
  assert.ok(config, 'Expected normalized AI config');
  assert.equal(config.mode, expected.mode);
  assert.equal(config.primaryProvider, expected.primaryProvider);
  assert.equal(config.fallbackProvider, expected.fallbackProvider);
  assert.deepEqual(config.enabledProviders, expected.enabledProviders);
  assert.deepEqual(config.selectedModels || {}, expected.selectedModels || {});

  for (const [providerId, providerExpectation] of Object.entries(expected.providers)) {
    const providerConfig = config.providers[providerId];
    assert.ok(providerConfig, `Missing provider config for ${providerId}`);
    assert.equal(providerConfig.enabled, providerExpectation.enabled);
    assert.equal(providerConfig.apiKey, providerExpectation.apiKey);
    assert.equal(providerConfig.model, providerExpectation.model);
    assert.equal(providerConfig.baseUrl || null, providerExpectation.baseUrl || null);
  }
}

async function runCase(name, credentials, expected) {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-llm-provider-'));

  try {
    const manager = await createManager(baseDir, credentials);
    const valid = await manager.validateAll();
    assert.equal(valid, expected.valid, `${name}: validateAll() mismatch`);

    const aiConfig = await manager.getAIConfig();
    expectNormalizedConfig(aiConfig, expected);

    await manager.saveCredentials();
    const persisted = JSON.parse(await fs.readFile(manager.credentialsPath, 'utf8'));
    assert.ok(persisted.ai, `${name}: normalized ai block should be persisted`);
    expectNormalizedConfig(persisted.ai, expected);
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
}

async function runFreshProviderConfigCase() {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-llm-provider-fresh-'));
  try {
    const manager = await createManager(baseDir, {
      youtube: youtubeCredentials,
      openai: {
        apiKey: 'sk-openai-fresh',
        model: 'MODEL_ID_SELECTED_DURING_SETUP',
      },
    });

    const providerConfig = await manager.getProviderConfig('openai');
    assert.equal(providerConfig.enabled, true);
    assert.equal(providerConfig.apiKey, 'sk-openai-fresh');
    assert.equal(providerConfig.model, 'MODEL_ID_SELECTED_DURING_SETUP');
    assert.equal(providerConfig.baseUrl, null);
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
}

async function main() {
  assertBaseRegistryMetadata();

  await runCase(
    'legacy-openai-only',
    {
      youtube: youtubeCredentials,
      openai: {
        apiKey: 'sk-openai-legacy',
        model: 'MODEL_ID_SELECTED_DURING_SETUP',
      },
    },
    {
      valid: true,
      mode: 'single',
      primaryProvider: 'openai',
      fallbackProvider: null,
      enabledProviders: ['openai'],
      selectedModels: {
        openai: 'MODEL_ID_SELECTED_DURING_SETUP',
      },
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai-legacy',
          model: 'MODEL_ID_SELECTED_DURING_SETUP',
          baseUrl: null,
        },
      },
    },
  );

  await runCase(
    'legacy-gemini-only',
    {
      youtube: youtubeCredentials,
      gemini: {
        apiKey: 'gemini-legacy',
      },
    },
    {
      valid: true,
      mode: 'single',
      primaryProvider: 'gemini',
      fallbackProvider: null,
      enabledProviders: ['gemini'],
      selectedModels: {},
      providers: {
        gemini: {
          enabled: true,
          apiKey: 'gemini-legacy',
          model: null,
          baseUrl: null,
        },
      },
    },
  );

  await runCase(
    'legacy-openai-and-gemini',
    {
      youtube: youtubeCredentials,
      openai: {
        apiKey: 'sk-openai-legacy',
        model: 'MODEL_ID_SELECTED_DURING_SETUP',
      },
      gemini: {
        apiKey: 'gemini-legacy',
      },
    },
    {
      valid: true,
      mode: 'fallback',
      primaryProvider: 'openai',
      fallbackProvider: 'gemini',
      enabledProviders: ['openai', 'gemini'],
      selectedModels: {
        openai: 'MODEL_ID_SELECTED_DURING_SETUP',
      },
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai-legacy',
          model: 'MODEL_ID_SELECTED_DURING_SETUP',
          baseUrl: null,
        },
        gemini: {
          enabled: true,
          apiKey: 'gemini-legacy',
          model: null,
          baseUrl: null,
        },
      },
    },
  );

  await runCase(
    'explicit-selected-model-backfill',
    {
      youtube: youtubeCredentials,
      ai: {
        mode: 'single',
        primaryProvider: 'anthropic',
        fallbackProvider: null,
        enabledProviders: ['anthropic'],
        selectedModels: {
          anthropic: 'claude-sonnet-4-20250514',
        },
        providers: {
          anthropic: {
            enabled: true,
            apiKey: 'anthropic-key',
            model: null,
          },
        },
      },
    },
    {
      valid: true,
      mode: 'single',
      primaryProvider: 'anthropic',
      fallbackProvider: null,
      enabledProviders: ['anthropic'],
      selectedModels: {
        anthropic: 'claude-sonnet-4-20250514',
      },
      providers: {
        anthropic: {
          enabled: true,
          apiKey: 'anthropic-key',
          model: 'claude-sonnet-4-20250514',
          baseUrl: null,
        },
      },
    },
  );

  await runCase(
    'multi-provider-remains-multi',
    {
      youtube: youtubeCredentials,
      ai: {
        mode: 'multi',
        primaryProvider: 'openai',
        fallbackProvider: 'gemini',
        enabledProviders: ['openai', 'gemini', 'anthropic'],
        selectedModels: {
          openai: 'MODEL_ID_SELECTED_DURING_SETUP',
          gemini: 'gemini-model',
          anthropic: 'claude-sonnet-4-20250514',
        },
        providers: {
          openai: {
            enabled: true,
            apiKey: 'sk-openai',
            model: null,
          },
          gemini: {
            enabled: true,
            apiKey: 'gemini-key',
            model: null,
          },
          anthropic: {
            enabled: true,
            apiKey: 'anthropic-key',
            model: null,
          },
        },
      },
    },
    {
      valid: true,
      mode: 'multi',
      primaryProvider: 'openai',
      fallbackProvider: 'gemini',
      enabledProviders: ['openai', 'gemini', 'anthropic'],
      selectedModels: {
        openai: 'MODEL_ID_SELECTED_DURING_SETUP',
        gemini: 'gemini-model',
        anthropic: 'claude-sonnet-4-20250514',
      },
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai',
          model: 'MODEL_ID_SELECTED_DURING_SETUP',
          baseUrl: null,
        },
        gemini: {
          enabled: true,
          apiKey: 'gemini-key',
          model: 'gemini-model',
          baseUrl: null,
        },
        anthropic: {
          enabled: true,
          apiKey: 'anthropic-key',
          model: 'claude-sonnet-4-20250514',
          baseUrl: null,
        },
      },
    },
  );

  await runCase(
    'custom-openai-compatible-needs-base-url',
    {
      youtube: youtubeCredentials,
      ai: {
        mode: 'single',
        primaryProvider: 'openai_compatible_custom',
        fallbackProvider: null,
        enabledProviders: ['openai_compatible_custom'],
        selectedModels: {
          openai_compatible_custom: 'custom-model',
        },
        providers: {
          openai_compatible_custom: {
            enabled: true,
            apiKey: 'custom-key',
            model: 'custom-model',
          },
        },
      },
    },
    {
      valid: false,
      mode: 'single',
      primaryProvider: 'openai_compatible_custom',
      fallbackProvider: null,
      enabledProviders: ['openai_compatible_custom'],
      selectedModels: {
        openai_compatible_custom: 'custom-model',
      },
      providers: {
        openai_compatible_custom: {
          enabled: true,
          apiKey: 'custom-key',
          model: 'custom-model',
          baseUrl: null,
        },
      },
    },
  );

  await runCase(
    'selected-gemini-needs-api-key',
    {
      youtube: youtubeCredentials,
      ai: {
        mode: 'single',
        primaryProvider: 'gemini',
        fallbackProvider: null,
        enabledProviders: ['gemini'],
        selectedModels: {},
        providers: {
          gemini: {
            enabled: true,
            apiKey: '',
            model: null,
          },
        },
      },
    },
    {
      valid: false,
      mode: 'single',
      primaryProvider: 'gemini',
      fallbackProvider: null,
      enabledProviders: ['gemini'],
      selectedModels: {},
      providers: {
        gemini: {
          enabled: true,
          apiKey: '',
          model: null,
          baseUrl: null,
        },
      },
    },
  );

  await runCase(
    'unsupported-provider-is-removed',
    {
      youtube: youtubeCredentials,
      ai: {
        mode: 'multi',
        primaryProvider: 'openai',
        fallbackProvider: 'gemini',
        enabledProviders: ['openai', 'made_up_provider'],
        selectedModels: {
          openai: 'MODEL_ID_SELECTED_DURING_SETUP',
        },
        providers: {
          openai: {
            enabled: true,
            apiKey: 'sk-openai',
            model: null,
          },
          made_up_provider: {
            enabled: true,
            apiKey: 'nope',
            model: 'fake-model',
          },
        },
      },
    },
    {
      valid: true,
      mode: 'multi',
      primaryProvider: 'openai',
      fallbackProvider: null,
      enabledProviders: ['openai'],
      selectedModels: {
        openai: 'MODEL_ID_SELECTED_DURING_SETUP',
      },
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai',
          model: 'MODEL_ID_SELECTED_DURING_SETUP',
          baseUrl: null,
        },
      },
    },
  );

  await runFreshProviderConfigCase();

  console.log('AI provider registry and normalization checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

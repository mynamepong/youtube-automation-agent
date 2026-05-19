const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {
  getProvider,
  listProviderChoices,
  isSupportedProvider,
  isOpenAICompatibleProvider,
  getEnvKeyForProvider,
} = require('./utils/llm-provider-registry');
const Module = require('module');

function createIdentityChalk() {
  const identity = input => input;
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
  assert.equal(
    getProvider('qwen').defaultBaseUrl,
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  );
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
    assert.equal(valid, true, `${name}: validateAll() should pass`);

    const aiConfig = await manager.getAIConfig();
    expectNormalizedConfig(aiConfig, expected);

    const providerConfig = manager.getProviderConfig(expected.primaryProvider);
    assert.equal(providerConfig.enabled, true, `${name}: provider should be enabled`);
    assert.equal(providerConfig.apiKey, expected.providers[expected.primaryProvider].apiKey);

    await manager.saveCredentials();
    const persisted = JSON.parse(await fs.readFile(manager.credentialsPath, 'utf8'));
    assert.ok(persisted.ai, `${name}: normalized ai block should be persisted`);
    expectNormalizedConfig(persisted.ai, expected);
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
        model: 'gpt-4.1',
      },
    },
    {
      mode: 'single',
      primaryProvider: 'openai',
      fallbackProvider: null,
      enabledProviders: ['openai'],
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai-legacy',
          model: 'gpt-4.1',
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
      mode: 'single',
      primaryProvider: 'gemini',
      fallbackProvider: null,
      enabledProviders: ['gemini'],
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
        model: 'gpt-4.1',
      },
      gemini: {
        apiKey: 'gemini-legacy',
      },
    },
    {
      mode: 'fallback',
      primaryProvider: 'openai',
      fallbackProvider: 'gemini',
      enabledProviders: ['openai', 'gemini'],
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai-legacy',
          model: 'gpt-4.1',
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
    'new-anthropic-single',
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
            model: 'claude-sonnet-4-20250514',
          },
        },
      },
    },
    {
      mode: 'single',
      primaryProvider: 'anthropic',
      fallbackProvider: null,
      enabledProviders: ['anthropic'],
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
    'new-deepseek-config',
    {
      youtube: youtubeCredentials,
      ai: {
        mode: 'single',
        primaryProvider: 'deepseek',
        fallbackProvider: null,
        enabledProviders: ['deepseek'],
        selectedModels: {
          deepseek: 'deepseek-v4-pro',
        },
        providers: {
          deepseek: {
            enabled: true,
            apiKey: 'deepseek-key',
            model: 'deepseek-v4-pro',
          },
        },
      },
    },
    {
      mode: 'single',
      primaryProvider: 'deepseek',
      fallbackProvider: null,
      enabledProviders: ['deepseek'],
      providers: {
        deepseek: {
          enabled: true,
          apiKey: 'deepseek-key',
          model: 'deepseek-v4-pro',
          baseUrl: 'https://api.deepseek.com',
        },
      },
    },
  );

  await runCase(
    'new-custom-openai-compatible',
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
            baseUrl: 'https://proxy.example.com/v1',
          },
        },
      },
    },
    {
      mode: 'single',
      primaryProvider: 'openai_compatible_custom',
      fallbackProvider: null,
      enabledProviders: ['openai_compatible_custom'],
      providers: {
        openai_compatible_custom: {
          enabled: true,
          apiKey: 'custom-key',
          model: 'custom-model',
          baseUrl: 'https://proxy.example.com/v1',
        },
      },
    },
  );

  console.log('AI provider registry and normalization checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

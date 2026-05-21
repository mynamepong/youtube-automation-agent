const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const Module = require('module');

const {
  listProviderChoices,
  isSupportedProvider,
  isOpenAICompatibleProvider,
  getProvider,
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

function createDatabaseStub() {
  return class Database {
    async initialize() {}
    async getStats() {
      return {};
    }
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

    if (request === './database/db') {
      return { Database: createDatabaseStub() };
    }

    return originalLoad(request, parent, isMain);
  };

  return () => {
    Module._load = originalLoad;
  };
}

const restoreDependencies = installDependencyStubs();
const { CredentialManager } = require('./utils/credential-manager');
const { YouTubeAutomationSetup } = require('./setup');
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

const providerEnvKeys = [
  'AI_PROVIDER',
  'AI_PRIMARY_PROVIDER',
  'AI_FALLBACK_PROVIDER',
  'AI_MODEL',
  'AI_ENABLED_PROVIDERS',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'QWEN_API_KEY',
  'CUSTOM_LLM_API_KEY',
  'CUSTOM_LLM_BASE_URL',
  'YOUTUBE_REGION',
  'DEFAULT_PRIVACY_STATUS',
  'CHANNEL_NAME',
  'TARGET_AUDIENCE',
  'POSTING_FREQUENCY',
];

function createSilentLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    success() {},
    debug() {},
  };
}

function snapshotEnv(keys) {
  const saved = new Map();
  for (const key of keys) {
    saved.set(key, process.env[key]);
  }
  return saved;
}

function restoreEnv(snapshot) {
  for (const [key, value] of snapshot.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function withEnv(overrides, fn) {
  const snapshot = snapshotEnv([...providerEnvKeys, ...Object.keys(overrides)]);
  for (const key of providerEnvKeys) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    restoreEnv(snapshot);
  }
}

async function createTempManager(credentials, { includeTokens = true } = {}) {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-setup-ai-'));
  const credentialsPath = path.join(baseDir, 'credentials.json');
  const tokensPath = path.join(baseDir, 'tokens.json');

  await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2));
  if (includeTokens) {
    await fs.writeFile(tokensPath, JSON.stringify(youtubeTokens, null, 2));
  }

  const manager = new CredentialManager();
  manager.logger = createSilentLogger();
  manager.credentialsPath = credentialsPath;
  manager.tokensPath = tokensPath;
  manager.credentials = {};
  manager.tokens = {};
  manager._credentialsLoaded = false;
  manager._tokensLoaded = false;

  return { manager, baseDir, credentialsPath, tokensPath };
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
}

function expectNormalizedConfig(config, expected) {
  assert.ok(config, 'Expected normalized AI config');
  assert.equal(config.mode, expected.mode);
  assert.equal(config.primaryProvider, expected.primaryProvider);
  assert.equal(config.fallbackProvider, expected.fallbackProvider);
  assert.deepEqual(config.enabledProviders, expected.enabledProviders);

  if (expected.selectedModels) {
    assert.deepEqual(config.selectedModels || {}, expected.selectedModels);
  }

  for (const [providerId, providerExpectation] of Object.entries(expected.providers)) {
    const providerConfig = config.providers[providerId];
    assert.ok(providerConfig, `Missing provider config for ${providerId}`);
    assert.equal(providerConfig.enabled, providerExpectation.enabled);
    assert.equal(providerConfig.apiKey, providerExpectation.apiKey || '');
    assert.equal(providerConfig.model, providerExpectation.model || null);
    assert.equal(providerConfig.baseUrl || null, providerExpectation.baseUrl || null);
  }
}

async function runValidationCase(name, credentials, expected, envOverrides = {}, { includeTokens = true } = {}) {
  await withEnv(envOverrides, async () => {
    const { manager, baseDir } = await createTempManager(credentials, { includeTokens });

    try {
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
  });
}

async function runNegativeValidationCase(name, credentials, envOverrides = {}, { includeTokens = true } = {}) {
  await withEnv(envOverrides, async () => {
    const { manager, baseDir } = await createTempManager(credentials, { includeTokens });

    try {
      const valid = await manager.validateAll();
      assert.equal(valid, false, `${name}: expected validation failure`);
    } finally {
      await fs.rm(baseDir, { recursive: true, force: true });
    }
  });
}

async function runMigrationCase(name, credentials, envOverrides, expected) {
  await withEnv(envOverrides, async () => {
    const { manager, baseDir } = await createTempManager(credentials);

    try {
      const aiConfig = await manager.getAIConfig();
      expectNormalizedConfig(aiConfig, expected);

      await manager.saveCredentials();
      const persisted = JSON.parse(await fs.readFile(manager.credentialsPath, 'utf8'));
      assert.ok(persisted.ai, `${name}: expected ai block to be saved`);
      expectNormalizedConfig(persisted.ai, expected);
    } finally {
      await fs.rm(baseDir, { recursive: true, force: true });
    }
  });
}

async function runEnvMergeCase() {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-env-merge-'));
  const envPath = path.join(baseDir, '.env');
  const existingContent = [
    '# Existing file',
    'KEEP_ME=1',
    'OPENAI_API_KEY=old-openai-key',
    'UNRELATED_FLAG=true',
    'TARGET_AUDIENCE=existing audience',
    'AI_PROVIDER=openai',
    'AI_ENABLED_PROVIDERS=openai',
  ].join('\n');

  await fs.writeFile(envPath, existingContent);

  const setup = new YouTubeAutomationSetup();
  setup.logger = createSilentLogger();
  setup.database = {
    initialize() {},
    async getStats() {
      return {};
    },
  };
  setup.generateJWTSecret = () => 'generated-jwt-secret';
  setup.credentialManager = {
    credentials: {
      channel: {
        channelName: 'New Channel Name',
        targetAudience: 'Updated audience',
        postingFrequency: 'weekly',
        defaultPrivacy: 'unlisted',
      },
    },
    getAIConfig: async () => ({
      mode: 'fallback',
      primaryProvider: 'gemini',
      fallbackProvider: 'deepseek',
      enabledProviders: ['gemini', 'deepseek'],
      selectedModels: {
        gemini: 'gemini-2.5-flash',
        deepseek: 'deepseek-chat',
      },
      providers: {
        gemini: {
          enabled: true,
          apiKey: 'gemini-secret-value',
          model: 'gemini-2.5-flash',
        },
        deepseek: {
          enabled: true,
          apiKey: 'deepseek-secret-value',
          model: 'deepseek-chat',
        },
      },
    }),
  };

  const loggedLines = [];
  const originalLog = console.log;
  try {
    console.log = (...args) => {
      loggedLines.push(args.join(' '));
    };

    await setup.createEnvironmentFile(envPath);
  } finally {
    console.log = originalLog;
  }

  const merged = await fs.readFile(envPath, 'utf8');
  assert.match(merged, /KEEP_ME=1/);
  assert.match(merged, /UNRELATED_FLAG=true/);
  assert.match(merged, /AI_PROVIDER=gemini/);
  assert.match(merged, /AI_PRIMARY_PROVIDER=gemini/);
  assert.match(merged, /AI_FALLBACK_PROVIDER=deepseek/);
  assert.match(merged, /AI_ENABLED_PROVIDERS=gemini,deepseek/);
  assert.match(merged, /GEMINI_API_KEY=gemini-secret-value/);
  assert.match(merged, /DEEPSEEK_API_KEY=deepseek-secret-value/);
  assert.match(merged, /TARGET_AUDIENCE=Updated audience/);
  assert.match(merged, /POSTING_FREQUENCY=weekly/);
  assert.match(merged, /CHANNEL_NAME=New Channel Name/);
  assert.match(merged, /DEFAULT_PRIVACY_STATUS=unlisted/);
  assert.match(merged, /OPENAI_API_KEY=old-openai-key/);
  assert.ok(loggedLines.every(line => !line.includes('gemini-secret-value') && !line.includes('deepseek-secret-value')), 'API keys should not be printed in logs');

  await fs.rm(baseDir, { recursive: true, force: true });
}

function buildBaseCredentials(ai = null, extra = {}) {
  return {
    youtube: youtubeCredentials,
    ...(ai ? { ai } : {}),
    ...extra,
  };
}

async function runValidationMatrix() {
  await runValidationCase(
    'youtube-openai-only',
    buildBaseCredentials({
      mode: 'single',
      primaryProvider: 'openai',
      fallbackProvider: null,
      enabledProviders: ['openai'],
      selectedModels: {
        openai: 'gpt-5.5',
      },
      providers: {
        openai: {
          enabled: true,
          model: 'gpt-5.5',
        },
      },
    }),
    {
      valid: true,
      mode: 'single',
      primaryProvider: 'openai',
      fallbackProvider: null,
      enabledProviders: ['openai'],
      selectedModels: {
        openai: 'gpt-5.5',
      },
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai-env',
          model: 'gpt-5.5',
          baseUrl: null,
        },
      },
    },
    {
      OPENAI_API_KEY: 'sk-openai-env',
    },
  );

  await runValidationCase(
    'youtube-gemini-only',
    buildBaseCredentials({
      mode: 'single',
      primaryProvider: 'gemini',
      fallbackProvider: null,
      enabledProviders: ['gemini'],
      selectedModels: {
        gemini: 'gemini-2.5-flash',
      },
      providers: {
        gemini: {
          enabled: true,
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
        },
      },
    }),
    {
      valid: true,
      mode: 'single',
      primaryProvider: 'gemini',
      fallbackProvider: null,
      enabledProviders: ['gemini'],
      selectedModels: {
        gemini: 'gemini-2.5-flash',
      },
      providers: {
        gemini: {
          enabled: true,
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
          baseUrl: null,
        },
      },
    },
  );

  await runValidationCase(
    'youtube-anthropic-only',
    buildBaseCredentials({
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
    }),
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

  await runValidationCase(
    'youtube-deepseek-only',
    buildBaseCredentials({
      mode: 'single',
      primaryProvider: 'deepseek',
      fallbackProvider: null,
      enabledProviders: ['deepseek'],
      selectedModels: {
        deepseek: 'deepseek-chat',
      },
      providers: {
        deepseek: {
          enabled: true,
          apiKey: 'deepseek-key',
          model: 'deepseek-chat',
          baseUrl: 'https://api.deepseek.com',
        },
      },
    }),
    {
      valid: true,
      mode: 'single',
      primaryProvider: 'deepseek',
      fallbackProvider: null,
      enabledProviders: ['deepseek'],
      selectedModels: {
        deepseek: 'deepseek-chat',
      },
      providers: {
        deepseek: {
          enabled: true,
          apiKey: 'deepseek-key',
          model: 'deepseek-chat',
          baseUrl: 'https://api.deepseek.com',
        },
      },
    },
  );

  await runValidationCase(
    'youtube-qwen-only',
    buildBaseCredentials({
      mode: 'single',
      primaryProvider: 'qwen',
      fallbackProvider: null,
      enabledProviders: ['qwen'],
      selectedModels: {
        qwen: 'qwen-plus',
      },
      providers: {
        qwen: {
          enabled: true,
          apiKey: 'qwen-key',
          model: 'qwen-plus',
          baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        },
      },
    }),
    {
      valid: true,
      mode: 'single',
      primaryProvider: 'qwen',
      fallbackProvider: null,
      enabledProviders: ['qwen'],
      selectedModels: {
        qwen: 'qwen-plus',
      },
      providers: {
        qwen: {
          enabled: true,
          apiKey: 'qwen-key',
          model: 'qwen-plus',
          baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        },
      },
    },
  );

  await runValidationCase(
    'youtube-custom-openai-compatible',
    buildBaseCredentials({
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
          baseUrl: 'https://example.invalid/v1',
        },
      },
    }),
    {
      valid: true,
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
          baseUrl: 'https://example.invalid/v1',
        },
      },
    },
  );

  await runValidationCase(
    'openai-primary-gemini-fallback',
    buildBaseCredentials({
      mode: 'fallback',
      primaryProvider: 'openai',
      fallbackProvider: 'gemini',
      enabledProviders: ['openai', 'gemini'],
      selectedModels: {
        openai: 'gpt-5.5',
        gemini: 'gemini-2.5-flash',
      },
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai',
          model: 'gpt-5.5',
        },
        gemini: {
          enabled: true,
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
        },
      },
    }),
    {
      valid: true,
      mode: 'fallback',
      primaryProvider: 'openai',
      fallbackProvider: 'gemini',
      enabledProviders: ['openai', 'gemini'],
      selectedModels: {
        openai: 'gpt-5.5',
        gemini: 'gemini-2.5-flash',
      },
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai',
          model: 'gpt-5.5',
          baseUrl: null,
        },
        gemini: {
          enabled: true,
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
          baseUrl: null,
        },
      },
    },
  );

  await runValidationCase(
    'gemini-primary-deepseek-fallback',
    buildBaseCredentials({
      mode: 'fallback',
      primaryProvider: 'gemini',
      fallbackProvider: 'deepseek',
      enabledProviders: ['gemini', 'deepseek'],
      selectedModels: {
        gemini: 'gemini-2.5-flash',
        deepseek: 'deepseek-chat',
      },
      providers: {
        gemini: {
          enabled: true,
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
        },
        deepseek: {
          enabled: true,
          apiKey: 'deepseek-key',
          model: 'deepseek-chat',
          baseUrl: 'https://api.deepseek.com',
        },
      },
    }),
    {
      valid: true,
      mode: 'fallback',
      primaryProvider: 'gemini',
      fallbackProvider: 'deepseek',
      enabledProviders: ['gemini', 'deepseek'],
      selectedModels: {
        gemini: 'gemini-2.5-flash',
        deepseek: 'deepseek-chat',
      },
      providers: {
        gemini: {
          enabled: true,
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
          baseUrl: null,
        },
        deepseek: {
          enabled: true,
          apiKey: 'deepseek-key',
          model: 'deepseek-chat',
          baseUrl: 'https://api.deepseek.com',
        },
      },
    },
  );
}

async function runNegativeValidationMatrix() {
  await runNegativeValidationCase(
    'missing-gemini-key',
    buildBaseCredentials({
      mode: 'single',
      primaryProvider: 'gemini',
      fallbackProvider: null,
      enabledProviders: ['gemini'],
      selectedModels: {
        gemini: 'gemini-2.5-flash',
      },
      providers: {
        gemini: {
          enabled: true,
          model: 'gemini-2.5-flash',
        },
      },
    }),
  );

  await runNegativeValidationCase(
    'missing-openai-key',
    buildBaseCredentials({
      mode: 'single',
      primaryProvider: 'openai',
      fallbackProvider: null,
      enabledProviders: ['openai'],
      selectedModels: {
        openai: 'gpt-5.5',
      },
      providers: {
        openai: {
          enabled: true,
          model: 'gpt-5.5',
        },
      },
    }),
  );

  await runNegativeValidationCase(
    'custom-missing-base-url',
    buildBaseCredentials({
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
    }),
  );

  await runNegativeValidationCase(
    'missing-youtube-token',
    buildBaseCredentials({
      mode: 'single',
      primaryProvider: 'gemini',
      fallbackProvider: null,
      enabledProviders: ['gemini'],
      selectedModels: {
        gemini: 'gemini-2.5-flash',
      },
      providers: {
        gemini: {
          enabled: true,
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
        },
      },
    }),
    {},
    { includeTokens: false },
  );
}

async function runMigrationMatrix() {
  await runMigrationCase(
    'legacy-openai-only',
    {
      youtube: youtubeCredentials,
      openai: {
        apiKey: 'sk-openai-legacy',
        model: 'gpt-5.5',
      },
    },
    {},
    {
      valid: true,
      mode: 'single',
      primaryProvider: 'openai',
      fallbackProvider: null,
      enabledProviders: ['openai'],
      selectedModels: {
        openai: 'gpt-5.5',
      },
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai-legacy',
          model: 'gpt-5.5',
          baseUrl: null,
        },
      },
    },
  );

  await runMigrationCase(
    'legacy-gemini-only',
    {
      youtube: youtubeCredentials,
      gemini: {
        apiKey: 'gemini-legacy',
        model: 'gemini-2.5-flash',
      },
    },
    {},
    {
      valid: true,
      mode: 'single',
      primaryProvider: 'gemini',
      fallbackProvider: null,
      enabledProviders: ['gemini'],
      selectedModels: {
        gemini: 'gemini-2.5-flash',
      },
      providers: {
        gemini: {
          enabled: true,
          apiKey: 'gemini-legacy',
          model: 'gemini-2.5-flash',
          baseUrl: null,
        },
      },
    },
  );

  await runMigrationCase(
    'legacy-openai-and-gemini',
    {
      youtube: youtubeCredentials,
      openai: {
        apiKey: 'sk-openai-legacy',
        model: 'gpt-5.5',
      },
      gemini: {
        apiKey: 'gemini-legacy',
        model: 'gemini-2.5-flash',
      },
    },
    {},
    {
      valid: true,
      mode: 'fallback',
      primaryProvider: 'openai',
      fallbackProvider: 'gemini',
      enabledProviders: ['openai', 'gemini'],
      selectedModels: {
        openai: 'gpt-5.5',
        gemini: 'gemini-2.5-flash',
      },
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai-legacy',
          model: 'gpt-5.5',
          baseUrl: null,
        },
        gemini: {
          enabled: true,
          apiKey: 'gemini-legacy',
          model: 'gemini-2.5-flash',
          baseUrl: null,
        },
      },
    },
  );

  await runMigrationCase(
    'env-backed-ai-config',
    {
      youtube: youtubeCredentials,
    },
    {
      AI_PRIMARY_PROVIDER: 'openai',
      AI_ENABLED_PROVIDERS: 'openai,gemini',
      AI_MODEL: 'gpt-5.5',
      OPENAI_API_KEY: 'sk-openai-env',
      GEMINI_API_KEY: 'gemini-env',
    },
    {
      valid: true,
      mode: 'fallback',
      primaryProvider: 'openai',
      fallbackProvider: 'gemini',
      enabledProviders: ['openai', 'gemini'],
      selectedModels: {
        openai: 'gpt-5.5',
      },
      providers: {
        openai: {
          enabled: true,
          apiKey: 'sk-openai-env',
          model: 'gpt-5.5',
          baseUrl: null,
        },
        gemini: {
          enabled: true,
          apiKey: 'gemini-env',
          model: null,
          baseUrl: null,
        },
      },
    },
  );
}

async function main() {
  assertBaseRegistryMetadata();
  await runEnvMergeCase();
  await runValidationMatrix();
  await runNegativeValidationMatrix();
  await runMigrationMatrix();
  console.log('Setup and provider hardening tests passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

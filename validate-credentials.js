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

async function main() {
  const manager = new CredentialManager();
  const aiConfig = await manager.getAIConfig();
  const valid = await manager.validateAll();

  if (aiConfig) {
    const providers = Array.isArray(aiConfig.enabledProviders) ? aiConfig.enabledProviders.join(', ') : 'none';
    console.log(`AI mode: ${aiConfig.mode}`);
    console.log(`Enabled providers: ${providers}`);
  } else {
    console.log('AI mode: not configured');
  }

  if (valid) {
    console.log('Credential validation passed.');
    process.exit(0);
  }

  console.error('Credential validation failed.');
  process.exit(1);
}

main().catch(error => {
  console.error('Credential validation failed with an unexpected error:');
  console.error(error);
  process.exit(1);
});

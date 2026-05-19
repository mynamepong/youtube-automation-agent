function failWithDependencyMessage(error) {
  if (error && error.code === 'MODULE_NOT_FOUND') {
    console.error('Dependencies are not installed. Run npm install first.');
    process.exit(1);
  }

  console.error('Credential validation failed with an unexpected error:');
  console.error(error);
  process.exit(1);
}

async function main() {
  let CredentialManager;

  try {
    ({ CredentialManager } = require('./utils/credential-manager'));
  } catch (error) {
    failWithDependencyMessage(error);
  }

  try {
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
  } catch (error) {
    failWithDependencyMessage(error);
  }
}

main();

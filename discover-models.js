function failWithDependencyMessage(error) {
  if (error && error.code === 'MODULE_NOT_FOUND') {
    console.error('Dependencies are not installed. Run npm install first.');
    process.exit(1);
  }

  console.error('Model discovery failed with an unexpected error:');
  console.error(error);
  process.exit(1);
}

function formatCapabilities(capabilities) {
  const labels = [];

  if (capabilities?.reasoning) labels.push('reasoning');
  if (capabilities?.vision) labels.push('vision');
  if (capabilities?.audio) labels.push('audio');
  if (capabilities?.json) labels.push('json');

  return labels.length > 0 ? ` [${labels.join(', ')}]` : '';
}

function formatTierLabel(tier) {
  return ({
    premium: 'Premium / highest quality',
    balanced: 'Balanced',
    cheap: 'Cheap / fast',
    reasoning: 'Reasoning',
    unknown: 'Unknown',
  }[tier] || tier);
}

async function main() {
  let CredentialManager;
  let discoverModels;
  let getProvider;
  let groupModelsByTier;

  try {
    ({ CredentialManager } = require('./utils/credential-manager'));
    ({ discoverModels } = require('./utils/model-discovery'));
    ({ groupModelsByTier } = require('./utils/model-discovery/tiering'));
    ({ getProvider } = require('./utils/llm-provider-registry'));
  } catch (error) {
    failWithDependencyMessage(error);
  }

  try {
    const manager = new CredentialManager();
    const aiConfig = await manager.getAIConfig();

    if (!aiConfig || !Array.isArray(aiConfig.enabledProviders) || aiConfig.enabledProviders.length === 0) {
      console.log('No enabled AI providers are configured.');
      process.exit(0);
    }

    console.log(`AI mode: ${aiConfig.mode}`);
    console.log(`Enabled providers: ${aiConfig.enabledProviders.join(', ')}`);

    for (const providerId of aiConfig.enabledProviders) {
      const providerMeta = getProvider(providerId);
      const providerConfig = aiConfig.providers?.[providerId] || {};
      const result = await discoverModels(providerId, providerConfig);

      console.log('');
      console.log(`${providerMeta?.displayName || providerId} (${providerId})`);
      console.log(`  Source: ${result.source}`);

      if (result.warning) {
        console.log(`  Warning: ${result.warning}`);
      }

      if (!Array.isArray(result.recommendedModels) || result.recommendedModels.length === 0) {
        console.log('  No recommended models found.');
        console.log('  Manually enter a model ID in setup if needed.');
        continue;
      }

      const grouped = groupModelsByTier(result.recommendedModels);
      for (const tier of ['premium', 'balanced', 'cheap', 'reasoning', 'unknown']) {
        const models = grouped[tier];
        if (!models || models.length === 0) {
          continue;
        }

        console.log(`  ${formatTierLabel(tier)}`);
        for (const model of models) {
          const deprecated = model.deprecated ? ' (deprecated)' : '';
          console.log(`    - ${model.displayName} (${model.id})${formatCapabilities(model.capabilities)}${deprecated}`);
        }
      }
    }

    process.exit(0);
  } catch (error) {
    failWithDependencyMessage(error);
  }
}

main();

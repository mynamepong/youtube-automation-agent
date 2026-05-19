const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { discoverModels } = require('./utils/model-discovery');
const { runValidation } = require('./validate-model-discovery');

function statSnapshot(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false };
  }

  const stat = fs.statSync(filePath);
  return {
    exists: true,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function assertSnapshotEqual(before, after, label) {
  assert.deepStrictEqual(after, before, `${label} changed during discovery`);
}

async function runReadOnlyCheck() {
  const repoRoot = __dirname;
  const trackedFiles = [
    path.join(repoRoot, 'config', 'credentials.json'),
    path.join(repoRoot, 'config', 'tokens.json'),
    path.join(repoRoot, '.env'),
    path.join(repoRoot, 'config', 'model-fallbacks.json'),
  ];

  const before = new Map(trackedFiles.map(filePath => [filePath, statSnapshot(filePath)]));

  await discoverModels(
    'openai',
    { apiKey: 'sk-test' },
    {
      client: {
        models: {
          list: async () => ({
            data: [
              { id: 'gpt-5.5', object: 'model' },
              { id: 'gpt-3.5-turbo', object: 'model' },
            ],
          }),
        },
      },
    },
  );

  await discoverModels(
    'openai_compatible_custom',
    { apiKey: 'custom-test' },
    {
      request: async () => {
        throw new Error('network down');
      },
    },
  );

  for (const filePath of trackedFiles) {
    const after = statSnapshot(filePath);
    assertSnapshotEqual(before.get(filePath), after, filePath);
  }
}

async function main() {
  await runValidation();
  await runReadOnlyCheck();
  console.log('Model discovery smoke test passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

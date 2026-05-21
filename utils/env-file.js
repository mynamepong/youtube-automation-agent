const REQUIRED_SETUP_ENV_KEYS = Object.freeze([
  'AI_PROVIDER',
  'AI_MODE',
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
]);

const ASSIGNMENT_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function serializeEnvValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map(item => serializeEnvValue(item))
      .filter(item => item !== '')
      .join(',');
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value);
}

function mergeEnvContent(existingContent, updates = {}, requiredKeys = REQUIRED_SETUP_ENV_KEYS) {
  const updateEntries = Object.entries(updates)
    .filter(([key]) => requiredKeys.includes(key));
  const updateMap = new Map(updateEntries);
  const lines = typeof existingContent === 'string' && existingContent.length > 0
    ? existingContent.split(/\r?\n/)
    : [];
  const seen = new Set();

  const mergedLines = lines.map(line => {
    const match = line.match(ASSIGNMENT_PATTERN);
    if (!match) {
      return line;
    }

    const [, key] = match;
    if (!requiredKeys.includes(key) || !updateMap.has(key)) {
      return line;
    }

    seen.add(key);
    return `${key}=${serializeEnvValue(updateMap.get(key))}`;
  });

  for (const key of requiredKeys) {
    if (seen.has(key)) {
      continue;
    }

    if (updateMap.has(key)) {
      mergedLines.push(`${key}=${serializeEnvValue(updateMap.get(key))}`);
      seen.add(key);
      continue;
    }

    const existingLine = lines.find(line => line.startsWith(`${key}=`));
    if (existingLine) {
      continue;
    }

    mergedLines.push(`${key}=`);
  }

  return mergedLines.join('\n');
}

function renderEnvTemplate(entries) {
  return entries.map(([key, value]) => `${key}=${serializeEnvValue(value)}`).join('\n');
}

module.exports = {
  REQUIRED_SETUP_ENV_KEYS,
  mergeEnvContent,
  renderEnvTemplate,
  serializeEnvValue,
};

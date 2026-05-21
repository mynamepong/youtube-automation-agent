const TEMPORARY_MODEL_PRESETS = Object.freeze({
  openai: Object.freeze([
    { name: 'MODEL_ID_SELECTED_DURING_SETUP', value: 'MODEL_ID_SELECTED_DURING_SETUP' },
    { name: 'provider-live-model', value: 'provider-live-model' },
    { name: 'provider-balanced-live-model', value: 'provider-balanced-live-model' },
    { name: 'provider-cheap-live-model', value: 'provider-cheap-live-model' },
    { name: 'provider-fallback-test-model', value: 'provider-fallback-test-model' },
  ]),
  gemini: Object.freeze([
    { name: 'MODEL_ID_SELECTED_DURING_SETUP', value: 'MODEL_ID_SELECTED_DURING_SETUP' },
    { name: 'gemini-2.5-pro', value: 'gemini-2.5-pro' },
    { name: 'gemini-2.5-flash', value: 'gemini-2.5-flash' },
    { name: 'gemini-2.5-flash-lite', value: 'gemini-2.5-flash-lite' },
  ]),
  anthropic: Object.freeze([
    { name: 'MODEL_ID_SELECTED_DURING_SETUP', value: 'MODEL_ID_SELECTED_DURING_SETUP' },
    { name: 'claude-opus-4.1', value: 'claude-opus-4.1' },
    { name: 'claude-sonnet-4.5', value: 'claude-sonnet-4.5' },
    { name: 'claude-haiku-4.5', value: 'claude-haiku-4.5' },
  ]),
  deepseek: Object.freeze([
    { name: 'MODEL_ID_SELECTED_DURING_SETUP', value: 'MODEL_ID_SELECTED_DURING_SETUP' },
    { name: 'deepseek-chat', value: 'deepseek-chat' },
    { name: 'deepseek-reasoner', value: 'deepseek-reasoner' },
  ]),
  qwen: Object.freeze([
    { name: 'MODEL_ID_SELECTED_DURING_SETUP', value: 'MODEL_ID_SELECTED_DURING_SETUP' },
    { name: 'qwen-plus', value: 'qwen-plus' },
    { name: 'qwen-turbo', value: 'qwen-turbo' },
    { name: 'qwen-max', value: 'qwen-max' },
  ]),
});

function getTemporaryModelChoices(providerId) {
  const choices = TEMPORARY_MODEL_PRESETS[providerId];
  if (!choices) {
    return null;
  }

  return choices.map(choice => ({ ...choice }));
}

function isManualModelEntryProvider(providerId) {
  return providerId === 'openai_compatible_custom';
}

module.exports = {
  TEMPORARY_MODEL_PRESETS,
  getTemporaryModelChoices,
  isManualModelEntryProvider,
};

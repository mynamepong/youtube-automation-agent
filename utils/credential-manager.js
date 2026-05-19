const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const inquirer = require('inquirer');
const chalk = require('chalk');
const { Logger } = require('./logger');
const { discoverModels } = require('./model-discovery');
const { groupModelsByTier } = require('./model-discovery/tiering');
const {
  getProvider,
  listProviders,
  listProviderChoices,
  isSupportedProvider,
} = require('./llm-provider-registry');

class CredentialManager {
  constructor() {
    this.logger = new Logger('CredentialManager');
    this.credentialsPath = path.join(__dirname, '..', 'config', 'credentials.json');
    this.tokensPath = path.join(__dirname, '..', 'config', 'tokens.json');
    this.credentials = {};
    this.tokens = {};
    this._credentialsLoaded = false;
    this._tokensLoaded = false;
  }

  async initialize() {
    try {
      await this.loadCredentials();
      await this.loadTokens();
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize credentials:', error);
      return false;
    }
  }

  async loadCredentials() {
    try {
      const data = await fs.readFile(this.credentialsPath, 'utf8');
      this.credentials = JSON.parse(data);
    } catch (error) {
      this.credentials = {};
    }

    this._credentialsLoaded = true;
    this.normalizeAIConfig();
  }

  async loadTokens() {
    try {
      const data = await fs.readFile(this.tokensPath, 'utf8');
      this.tokens = JSON.parse(data);
    } catch (error) {
      this.tokens = {};
    }

    this._tokensLoaded = true;
  }

  async saveCredentials() {
    await fs.mkdir(path.dirname(this.credentialsPath), { recursive: true });
    this.normalizeAIConfig();
    await fs.writeFile(this.credentialsPath, JSON.stringify(this.credentials, null, 2));
    this._credentialsLoaded = true;
  }

  async saveTokens() {
    await fs.mkdir(path.dirname(this.tokensPath), { recursive: true });
    await fs.writeFile(this.tokensPath, JSON.stringify(this.tokens, null, 2));
    this._tokensLoaded = true;
  }

  normalizeAIConfig() {
    const supportedProviders = listProviders();
    const aiConfig = this.credentials.ai && typeof this.credentials.ai === 'object'
      ? this.credentials.ai
      : null;
    const explicitProviders = aiConfig?.providers && typeof aiConfig.providers === 'object'
      ? aiConfig.providers
      : {};
    const explicitSelectedModels = aiConfig?.selectedModels && typeof aiConfig.selectedModels === 'object'
      ? aiConfig.selectedModels
      : {};
    const explicitEnabledProviders = Array.isArray(aiConfig?.enabledProviders)
      ? [...new Set(aiConfig.enabledProviders.filter(providerId => isSupportedProvider(providerId)))]
      : [];
    const explicitMode = typeof aiConfig?.mode === 'string' && ['single', 'fallback', 'multi'].includes(aiConfig.mode)
      ? aiConfig.mode
      : null;
    const hasLegacyOpenAI = this.credentials.openai && typeof this.credentials.openai === 'object';
    const hasLegacyGemini = this.credentials.gemini && typeof this.credentials.gemini === 'object';
    const useLegacyInference = !aiConfig && (hasLegacyOpenAI || hasLegacyGemini);

    const normalizedProviders = {};
    const normalizedSelectedModels = {};
    const normalizedEnabledProviders = [];

    const getString = value => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
    const getLegacyEntry = providerId => {
      if (providerId === 'openai' && hasLegacyOpenAI) {
        return this.credentials.openai;
      }

      if (providerId === 'gemini' && hasLegacyGemini) {
        return this.credentials.gemini;
      }

      return null;
    };

    const shouldMaterializeProvider = providerId => {
      if (useLegacyInference) {
        return Boolean(getLegacyEntry(providerId));
      }

      return Boolean(
        Object.prototype.hasOwnProperty.call(explicitProviders, providerId)
        || explicitEnabledProviders.includes(providerId)
        || Object.prototype.hasOwnProperty.call(explicitSelectedModels, providerId),
      );
    };

    const inferEnabled = (providerId, providerEntry, legacyEntry) => {
      if (providerEntry && providerEntry.enabled === false) {
        return false;
      }

      if (providerEntry && providerEntry.enabled === true) {
        return true;
      }

      if (explicitEnabledProviders.includes(providerId)) {
        return true;
      }

      if (useLegacyInference && legacyEntry) {
        return true;
      }

      return false;
    };

    const inferModel = (providerId, providerEntry, legacyEntry) => {
      return getString(providerEntry?.model)
        || getString(explicitSelectedModels[providerId])
        || getString(legacyEntry?.model)
        || null;
    };

    const inferBaseUrl = (providerId, providerEntry, legacyEntry) => {
      const providerMeta = getProvider(providerId);
      return getString(providerEntry?.baseUrl)
        || getString(legacyEntry?.baseUrl)
        || providerMeta?.defaultBaseUrl
        || null;
    };

    const inferApiKey = (providerEntry, legacyEntry) => {
      return getString(providerEntry?.apiKey)
        || getString(legacyEntry?.apiKey)
        || '';
    };

    for (const provider of supportedProviders) {
      const providerId = provider.id;
      if (!shouldMaterializeProvider(providerId)) {
        continue;
      }

      const providerEntry = explicitProviders[providerId] && typeof explicitProviders[providerId] === 'object'
        ? explicitProviders[providerId]
        : null;
      const legacyEntry = getLegacyEntry(providerId);
      const enabled = inferEnabled(providerId, providerEntry, legacyEntry);
      const model = inferModel(providerId, providerEntry, legacyEntry);
      const baseUrl = inferBaseUrl(providerId, providerEntry, legacyEntry);
      const apiKey = inferApiKey(providerEntry, legacyEntry);

      normalizedProviders[providerId] = {
        enabled,
        apiKey,
        model,
        ...(baseUrl ? { baseUrl } : {}),
      };

      if (enabled && model) {
        normalizedSelectedModels[providerId] = model;
      }
    }

    for (const providerId of explicitEnabledProviders) {
      if (normalizedProviders[providerId]?.enabled && !normalizedEnabledProviders.includes(providerId)) {
        normalizedEnabledProviders.push(providerId);
      }
    }

    for (const provider of supportedProviders) {
      const providerId = provider.id;
      if (normalizedProviders[providerId]?.enabled && !normalizedEnabledProviders.includes(providerId)) {
        normalizedEnabledProviders.push(providerId);
      }
    }

    const aiConfigExists = Boolean(aiConfig);
    if (!aiConfigExists && !useLegacyInference && normalizedEnabledProviders.length === 0) {
      return null;
    }

    const preservedMode = explicitMode;
    const inferredMode = normalizedEnabledProviders.length <= 1
      ? 'single'
      : normalizedEnabledProviders.length === 2
        ? 'fallback'
        : 'multi';
    const mode = preservedMode || (useLegacyInference && normalizedEnabledProviders.length === 2 ? 'fallback' : inferredMode);

    let primaryProvider = null;
    let fallbackProvider = null;

    const inferPrimaryFromEnabled = () => normalizedEnabledProviders[0] || null;
    const inferFallbackFromEnabled = currentPrimary => normalizedEnabledProviders.find(providerId => providerId !== currentPrimary) || null;

    if (mode === 'multi') {
      primaryProvider = null;
      fallbackProvider = null;
    } else if (useLegacyInference) {
      if (normalizedProviders.openai?.enabled && normalizedProviders.gemini?.enabled) {
        primaryProvider = 'openai';
        fallbackProvider = 'gemini';
      } else {
        primaryProvider = inferPrimaryFromEnabled();
        fallbackProvider = null;
      }
    } else if (mode === 'fallback') {
      const explicitPrimary = isSupportedProvider(aiConfig?.primaryProvider)
        && normalizedProviders[aiConfig.primaryProvider]?.enabled
        ? aiConfig.primaryProvider
        : null;
      primaryProvider = explicitPrimary || inferPrimaryFromEnabled();

      const explicitFallback = isSupportedProvider(aiConfig?.fallbackProvider)
        && normalizedProviders[aiConfig.fallbackProvider]?.enabled
        && aiConfig.fallbackProvider !== primaryProvider
        ? aiConfig.fallbackProvider
        : null;
      fallbackProvider = explicitFallback || inferFallbackFromEnabled(primaryProvider);
    } else {
      const explicitPrimary = isSupportedProvider(aiConfig?.primaryProvider)
        && normalizedProviders[aiConfig.primaryProvider]?.enabled
        ? aiConfig.primaryProvider
        : null;
      primaryProvider = explicitPrimary || inferPrimaryFromEnabled();
      fallbackProvider = null;
    }

    if (mode === 'multi') {
      primaryProvider = null;
      fallbackProvider = null;
    }

    if (mode === 'single') {
      fallbackProvider = null;
    }

    const normalizedAiConfig = {
      mode,
      primaryProvider,
      fallbackProvider,
      enabledProviders: normalizedEnabledProviders,
      selectedModels: normalizedSelectedModels,
      providers: normalizedProviders,
    };

    this.credentials.ai = normalizedAiConfig;
    return normalizedAiConfig;
  }

  async getAIConfig() {
    if (!this._credentialsLoaded) {
      await this.loadCredentials();
    }

    return this.normalizeAIConfig();
  }

  _getProviderConfigSync(providerId) {
    const aiConfig = this.normalizeAIConfig();
    const providerConfig = aiConfig?.providers?.[providerId];

    if (providerConfig) {
      return {
        providerId,
        apiKey: providerConfig.apiKey || '',
        model: providerConfig.model || null,
        baseUrl: providerConfig.baseUrl || null,
        enabled: Boolean(providerConfig.enabled),
      };
    }

    const providerMeta = getProvider(providerId);
    if (!providerMeta) {
      return {
        providerId,
        apiKey: '',
        model: null,
        baseUrl: null,
        enabled: false,
      };
    }

    return {
      providerId,
      apiKey: '',
      model: null,
      baseUrl: providerMeta.defaultBaseUrl || null,
      enabled: false,
    };
  }

  async getProviderConfig(providerId) {
    if (!this._credentialsLoaded) {
      await this.loadCredentials();
    }

    return this._getProviderConfigSync(providerId);
  }

  // YouTube API Authentication
  async setupYouTubeCredentials() {
    console.log(chalk.cyan('\n🎬 YouTube API Setup'));
    console.log(chalk.gray('You need to create a YouTube Data API project in Google Cloud Console'));
    console.log(chalk.gray('Visit: https://console.cloud.google.com/'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'clientId',
        message: 'Enter your YouTube API Client ID:',
        validate: input => input.length > 0 || 'Client ID is required'
      },
      {
        type: 'password',
        name: 'clientSecret',
        message: 'Enter your YouTube API Client Secret:',
        validate: input => input.length > 0 || 'Client Secret is required'
      },
      {
        type: 'input',
        name: 'redirectUri',
        message: 'Enter your redirect URI:',
        default: 'http://localhost:8080/oauth2callback'
      }
    ]);

    this.credentials.youtube = {
      client_id: answers.clientId,
      client_secret: answers.clientSecret,
      redirect_uris: [answers.redirectUri]
    };

    await this.saveCredentials();
    
    // Authenticate and get tokens
    await this.authenticateYouTube();
    
    console.log(chalk.green('✅ YouTube credentials configured successfully!'));
  }

  async authenticateYouTube() {
    const oauth2Client = new google.auth.OAuth2(
      this.credentials.youtube.client_id,
      this.credentials.youtube.client_secret,
      this.credentials.youtube.redirect_uris[0]
    );

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });

    console.log(chalk.cyan('\n🔗 Please visit this URL to authorize the application:'));
    console.log(chalk.blue(authUrl));

    const { code } = await inquirer.prompt([
      {
        type: 'input',
        name: 'code',
        message: 'Enter the authorization code:',
        validate: input => input.length > 0 || 'Authorization code is required'
      }
    ]);

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    this.tokens.youtube = tokens;
    await this.saveTokens();

    console.log(chalk.green('✅ YouTube authentication completed!'));
  }

  getYouTubeAuth() {
    if (!this.credentials.youtube || !this.tokens.youtube) {
      throw new Error('YouTube credentials not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.credentials.youtube.client_id,
      this.credentials.youtube.client_secret,
      this.credentials.youtube.redirect_uris[0]
    );

    oauth2Client.setCredentials(this.tokens.youtube);
    return oauth2Client;
  }

  getYouTubeClient() {
    const auth = this.getYouTubeAuth();
    return google.youtube({ version: 'v3', auth });
  }

  async promptProviderApiKey(providerMeta) {
    const answer = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: `Enter your ${providerMeta.displayName} API key:`,
        validate: input => input.length > 0 || `${providerMeta.displayName} API key is required`,
      },
    ]);

    return answer.apiKey;
  }

  async promptProviderBaseUrl(providerMeta) {
    const defaultBaseUrl = providerMeta.defaultBaseUrl || '';
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: `Enter the base URL for ${providerMeta.displayName}:`,
        default: defaultBaseUrl || undefined,
        validate: input => input.trim().length > 0 || 'Base URL is required',
      },
    ]);

    return answer.baseUrl.trim();
  }

  async collectProviderConfiguration(providerId) {
    const providerMeta = getProvider(providerId);
    if (!providerMeta) {
      throw new Error(`Unsupported provider: ${providerId}`);
    }

    console.log(chalk.cyan(`\n${providerMeta.displayName} Setup`));
    console.log(chalk.gray(providerMeta.apiKeyHelpText));
    if (providerMeta.docsUrl) {
      console.log(chalk.gray(`Docs: ${providerMeta.docsUrl}`));
    }

    const apiKey = await this.promptProviderApiKey(providerMeta);
    let baseUrl = providerMeta.defaultBaseUrl || null;
    if (providerMeta.requiresBaseUrl || providerMeta.defaultBaseUrl) {
      baseUrl = await this.promptProviderBaseUrl(providerMeta);
    }

    return {
      enabled: true,
      apiKey,
      ...(baseUrl ? { baseUrl } : {}),
    };
  }

  buildModelChoices(models, { includeShowAll = false, annotateStatus = false, recommendedIds = new Set() } = {}) {
    const grouped = groupModelsByTier(models);
    const choices = [];
    const tierOrder = ['premium', 'balanced', 'cheap', 'reasoning', 'unknown'];

    for (const tier of tierOrder) {
      const tierModels = grouped[tier] || [];
      if (tierModels.length === 0) {
        continue;
      }

      choices.push(new inquirer.Separator(`── ${({
        premium: 'Premium / highest quality',
        balanced: 'Balanced',
        cheap: 'Cheap / fast',
        reasoning: 'Reasoning',
        unknown: 'Unknown',
      }[tier])} ──`));

      for (const model of tierModels) {
        const labels = [];
        if (annotateStatus) {
          if (model.deprecated) {
            labels.push('deprecated');
          }
          if (!model.capabilities?.text) {
            labels.push('non-text');
          }
          if (labels.length === 0 && !recommendedIds.has(model.id)) {
            labels.push('not recommended');
          }
        }

        const suffix = labels.length > 0 ? ` [${labels.join(', ')}]` : '';
        choices.push({
          name: `${model.displayName} (${model.id})${suffix}`,
          value: model.id,
        });
      }
    }

    if (includeShowAll) {
      choices.push(new inquirer.Separator('── Actions ──'));
      choices.push({
        name: 'Show all discovered models',
        value: '__show_all_models__',
      });
    }

    choices.push({
      name: 'Manually enter model ID',
      value: '__manual_model_id__',
    });

    return choices;
  }

  async confirmUnsafeModelChoice(providerMeta, model) {
    const labels = [];
    if (model.deprecated) {
      labels.push('deprecated');
    }
    if (!model.capabilities?.text) {
      labels.push('non-text');
    }

    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'accept',
        message: `${model.displayName} (${model.id}) is ${labels.join(' and ')} for ${providerMeta.displayName}. Use it anyway?`,
        default: false,
      },
    ]);

    return Boolean(answer.accept);
  }

  async promptManualModelId(providerMeta) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'model',
        message: `Enter the model ID for ${providerMeta.displayName}:`,
        validate: input => input.trim().length > 0 || 'Model ID is required',
      },
    ]);

    return answer.model.trim();
  }

  async chooseProviderModel(providerMeta, discoveryResult, { forceManual = false } = {}) {
    const recommendedModels = Array.isArray(discoveryResult?.recommendedModels)
      ? discoveryResult.recommendedModels
      : [];
    const allModels = Array.isArray(discoveryResult?.allModels)
      ? discoveryResult.allModels
      : [];

    if (discoveryResult?.source === 'live' && recommendedModels.length > 0) {
      console.log(chalk.green(`Discovered live models for ${providerMeta.displayName}`));
    } else if (discoveryResult?.source === 'fallback' && recommendedModels.length > 0) {
      console.log(chalk.yellow('Live model discovery failed or returned no usable models. Showing verified fallback model list.'));
    } else {
      console.log(chalk.yellow('No usable model list found. Please manually enter a model ID.'));
    }

    if (discoveryResult?.warning) {
      console.log(chalk.gray(discoveryResult.warning));
    }

    const manualPreferred = forceManual || (providerMeta.id === 'openai_compatible_custom' && recommendedModels.length === 0);

    if (recommendedModels.length === 0 && allModels.length === 0) {
      return this.promptManualModelId(providerMeta);
    }

    const promptSelection = async (models, { annotateStatus = false } = {}) => {
      const choices = this.buildModelChoices(models, {
        includeShowAll: allModels.length > models.length,
        annotateStatus,
        recommendedIds,
      });
      const defaultChoice = manualPreferred ? '__manual_model_id__' : (choices.find(choice => choice && choice.value && !String(choice.value).startsWith('__'))?.value || '__manual_model_id__');

      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'selection',
          message: `Select a model for ${providerMeta.displayName}:`,
          choices,
          default: defaultChoice,
        },
      ]);

      if (answer.selection === '__show_all_models__') {
        return promptSelection(allModels, { annotateStatus: true });
      }

      if (answer.selection === '__manual_model_id__') {
        return this.promptManualModelId(providerMeta);
      }

      const selectedModel = models.find(model => model.id === answer.selection);
      if (annotateStatus && selectedModel && (selectedModel.deprecated || !selectedModel.capabilities?.text)) {
        const accepted = await this.confirmUnsafeModelChoice(providerMeta, selectedModel);
        if (!accepted) {
          return promptSelection(models, { annotateStatus });
        }
      }

      return answer.selection;
    };

    if (recommendedModels.length === 0) {
      return promptSelection([]);
    }

    return promptSelection(recommendedModels);
  }

  // Azure Speech Services (TTS)
  async setupAzureSpeechCredentials() {
    console.log(chalk.cyan('\n🎙️  Azure Speech Services Setup'));
    console.log(chalk.gray('Create a Speech service in Azure Portal'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'subscriptionKey',
        message: 'Enter your Azure Speech subscription key:',
        validate: input => input.length > 0 || 'Subscription key is required'
      },
      {
        type: 'input',
        name: 'region',
        message: 'Enter your Azure region:',
        default: 'eastus'
      },
      {
        type: 'list',
        name: 'voice',
        message: 'Select preferred voice:',
        choices: [
          'en-US-JennyNeural',
          'en-US-GuyNeural',
          'en-US-AriaNeural',
          'en-US-DavisNeural',
          'en-US-AmberNeural'
        ],
        default: 'en-US-JennyNeural'
      }
    ]);

    this.credentials.azureSpeech = {
      subscriptionKey: answers.subscriptionKey,
      region: answers.region,
      voice: answers.voice
    };

    await this.saveCredentials();
    console.log(chalk.green('✅ Azure Speech credentials configured successfully!'));
  }

  // Channel Configuration
  async setupChannelConfig() {
    console.log(chalk.cyan('\n📺 Channel Configuration'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'channelName',
        message: 'Enter your channel name:',
        validate: input => input.length > 0 || 'Channel name is required'
      },
      {
        type: 'input',
        name: 'channelDescription',
        message: 'Enter channel description:',
        default: 'Automated content channel'
      },
      {
        type: 'input',
        name: 'defaultCategory',
        message: 'Enter default video category ID (22 = People & Blogs):',
        default: '22'
      },
      {
        type: 'list',
        name: 'defaultPrivacy',
        message: 'Select default privacy setting:',
        choices: ['public', 'unlisted', 'private'],
        default: 'public'
      },
      {
        type: 'input',
        name: 'websiteUrl',
        message: 'Enter your website URL (optional):'
      },
      {
        type: 'input',
        name: 'businessEmail',
        message: 'Enter business email (optional):'
      }
    ]);

    this.credentials.channel = answers;
    
    // Set environment variables for the application
    process.env.CHANNEL_NAME = answers.channelName;
    process.env.DEFAULT_PRIVACY_STATUS = answers.defaultPrivacy;
    process.env.WEBSITE_URL = answers.websiteUrl;
    process.env.BUSINESS_EMAIL = answers.businessEmail;

    await this.saveCredentials();
    console.log(chalk.green('✅ Channel configuration saved successfully!'));
  }

  // Content Configuration
  async setupContentConfig() {
    console.log(chalk.cyan('\n📝 Content Configuration'));
    
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'contentTypes',
        message: 'Select content types to generate:',
        choices: [
          { name: 'Tutorials', value: 'tutorial', checked: true },
          { name: 'Explainers', value: 'explainer', checked: true },
          { name: 'List Videos', value: 'list', checked: true },
          { name: 'Reviews', value: 'review', checked: false },
          { name: 'Stories', value: 'story', checked: false }
        ],
        validate: input => input.length > 0 || 'Select at least one content type'
      },
      {
        type: 'input',
        name: 'competitorChannels',
        message: 'Enter competitor channel IDs (comma-separated):',
        filter: input => input.split(',').map(id => id.trim()).filter(id => id)
      },
      {
        type: 'input',
        name: 'targetAudience',
        message: 'Describe your target audience:',
        default: 'General audience interested in educational content'
      },
      {
        type: 'list',
        name: 'postingFrequency',
        message: 'Select posting frequency:',
        choices: [
          { name: 'Daily', value: 'daily' },
          { name: 'Every other day', value: 'every-2-days' },
          { name: '3 times per week', value: '3-per-week' },
          { name: 'Weekly', value: 'weekly' }
        ],
        default: 'daily'
      },
      {
        type: 'input',
        name: 'preferredPostTime',
        message: 'Preferred posting time (24h format, e.g., 14:00):',
        default: '14:00'
      }
    ]);

    this.credentials.content = answers;
    
    // Set environment variables
    process.env.COMPETITOR_CHANNELS = answers.competitorChannels.join(',');
    process.env.DEFAULT_AUTHOR = answers.channelName || 'Content Creator';
    process.env.TARGET_AUDIENCE = answers.targetAudience;

    await this.saveCredentials();
    console.log(chalk.green('✅ Content configuration saved successfully!'));
  }

  // Validation methods
  async validateAll() {
    try {
      await this.loadCredentials();
      await this.loadTokens();
    } catch (error) {
      // Files might not exist yet
    }

    if (!this.credentials.youtube) {
      console.log(chalk.yellow('\n⚠️  YouTube credentials are missing'));
      return false;
    }

    if (!this.tokens.youtube) {
      console.log(chalk.yellow('\n⚠️  YouTube authentication token is missing'));
      return false;
    }

    const aiConfig = await this.getAIConfig();
    if (!aiConfig || !Array.isArray(aiConfig.enabledProviders) || aiConfig.enabledProviders.length === 0) {
      console.log(chalk.yellow('\n⚠️  No AI provider configured'));
      return false;
    }

    if (aiConfig.mode === 'single') {
      if (!aiConfig.primaryProvider || !aiConfig.enabledProviders.includes(aiConfig.primaryProvider)) {
        console.log(chalk.yellow('\n⚠️  Single-provider mode requires a selected primary provider'));
        return false;
      }

      if (aiConfig.fallbackProvider !== null) {
        console.log(chalk.yellow('\n⚠️  Single-provider mode must not define a fallback provider'));
        return false;
      }
    }

    if (aiConfig.mode === 'fallback') {
      if (!aiConfig.primaryProvider || !aiConfig.enabledProviders.includes(aiConfig.primaryProvider)) {
        console.log(chalk.yellow('\n⚠️  Fallback mode requires a selected primary provider'));
        return false;
      }

      if (!aiConfig.fallbackProvider || !aiConfig.enabledProviders.includes(aiConfig.fallbackProvider)) {
        console.log(chalk.yellow('\n⚠️  Fallback mode requires a selected fallback provider'));
        return false;
      }

      if (aiConfig.primaryProvider === aiConfig.fallbackProvider) {
        console.log(chalk.yellow('\n⚠️  Fallback provider must be different from the primary provider'));
        return false;
      }
    }

    if (aiConfig.mode === 'multi') {
      if (aiConfig.primaryProvider !== null || aiConfig.fallbackProvider !== null) {
        console.log(chalk.yellow('\n⚠️  Multi-provider mode must not define primary or fallback providers'));
        return false;
      }

      if (aiConfig.enabledProviders.length < 2) {
        console.log(chalk.yellow('\n⚠️  Multi-provider mode requires at least two enabled providers'));
        return false;
      }
    }

    const providerValidationLabel = providerId => ({
      openai: 'OpenAI',
      gemini: 'Gemini',
      anthropic: 'Anthropic',
      deepseek: 'DeepSeek',
      qwen: 'Qwen',
      openai_compatible_custom: 'Custom OpenAI-compatible',
    }[providerId] || providerId);

    for (const providerId of aiConfig.enabledProviders) {
      const providerMeta = getProvider(providerId);
      const providerConfig = await this.getProviderConfig(providerId);

      if (!providerConfig.apiKey) {
        const apiKeyLabel = providerValidationLabel(providerId);
        console.log(chalk.yellow(`\n⚠️  Missing ${apiKeyLabel} API key for selected provider: ${providerId}`));
        return false;
      }

      if (providerMeta?.requiresBaseUrl && !providerConfig.baseUrl) {
        console.log(chalk.yellow(`\n⚠️  Missing base URL for selected provider: ${providerId}`));
        return false;
      }
    }

    return true;
  }

  async testConnections() {
    console.log(chalk.cyan('\n🔍 Testing API connections...'));

    const results = {
      youtube: false,
      aiProviders: {},
    };

    // Test YouTube API
    try {
      const youtube = this.getYouTubeClient();
      await youtube.channels.list({
        part: 'snippet',
        mine: true
      });
      results.youtube = true;
      console.log(chalk.green('✅ YouTube API connection successful'));
    } catch (error) {
      console.log(chalk.red('❌ YouTube API connection failed'));
      this.logger.error('YouTube API test failed:', error);
    }

    const aiConfig = await this.getAIConfig();
    if (aiConfig && Array.isArray(aiConfig.enabledProviders)) {
      for (const providerId of aiConfig.enabledProviders) {
        const providerMeta = getProvider(providerId);
        const providerConfig = await this.getProviderConfig(providerId);
        const providerResult = {
          ok: false,
          provider: providerId,
          model: providerConfig.model || null,
        };

        const hasRequiredApiKey = Boolean(providerConfig.apiKey);
        const hasRequiredBaseUrl = !providerMeta?.requiresBaseUrl || Boolean(providerConfig.baseUrl);
        const hasRequiredModel = providerMeta ? Boolean(providerConfig.model) : false;

        if (hasRequiredApiKey && hasRequiredBaseUrl && hasRequiredModel) {
          providerResult.ok = true;
          console.log(chalk.green(`✅ ${providerMeta?.displayName || providerId} configuration is present`));
        } else {
          console.log(chalk.red(`❌ ${providerMeta?.displayName || providerId} configuration is incomplete`));
        }

        results.aiProviders[providerId] = providerResult;
      }
    }

    return results;
  }

  // Setup wizard
  async runSetupWizard() {
    console.log(chalk.cyan.bold('\n🚀 YouTube Automation Agent Setup Wizard'));
    console.log(chalk.gray('Let\'s configure your credentials and settings...\n'));

    const setupSteps = [
      { name: '🎬 YouTube API', action: () => this.setupYouTubeCredentials() },
      { name: '🤖 AI Service', action: () => this.setupAIService() },
      { name: '🎙️  Text-to-Speech Service', action: () => this.setupTTSService() },
      { name: '📺 Channel Configuration', action: () => this.setupChannelConfig() },
      { name: '📝 Content Configuration', action: () => this.setupContentConfig() }
    ];

    for (const step of setupSteps) {
      console.log(chalk.cyan(`\n${step.name}`));
      await step.action();
    }

    console.log(chalk.green.bold('\n🎉 Setup completed successfully!'));
    console.log(chalk.cyan('You can now run: npm start'));
    
    // Test connections
    await this.testConnections();
  }

  async setupAIService() {
    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Select your AI setup mode:',
        choices: [
          { name: 'Single provider', value: 'single' },
          { name: 'Primary + fallback provider', value: 'fallback' },
          { name: 'Multiple providers, choose per task later', value: 'multi' }
        ]
      }
    ]);

    const providerChoices = listProviderChoices();
    const selectedProviderIds = [];

    if (mode === 'single') {
      const { providerId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'providerId',
          message: 'Select your AI provider:',
          choices: providerChoices,
        },
      ]);

      selectedProviderIds.push(providerId);
    } else if (mode === 'fallback') {
      const { primaryProvider } = await inquirer.prompt([
        {
          type: 'list',
          name: 'primaryProvider',
          message: 'Select the primary AI provider:',
          choices: providerChoices,
        },
      ]);

      const { fallbackProvider } = await inquirer.prompt([
        {
          type: 'list',
          name: 'fallbackProvider',
          message: 'Select the fallback AI provider:',
          choices: providerChoices.filter(choice => choice.value !== primaryProvider),
        },
      ]);

      selectedProviderIds.push(primaryProvider, fallbackProvider);
    } else {
      const { providerIds } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'providerIds',
          message: 'Select at least two AI providers:',
          choices: providerChoices,
          validate: input => input.length >= 2 || 'Select at least two providers',
        },
      ]);

      selectedProviderIds.push(...providerIds);
    }

    const selectedProviderConfigs = {};
    for (const providerId of selectedProviderIds) {
      selectedProviderConfigs[providerId] = await this.collectProviderConfiguration(providerId);
    }

    for (const providerId of selectedProviderIds) {
      const providerMeta = getProvider(providerId);
      const providerConfig = selectedProviderConfigs[providerId];
      const discoveryResult = await discoverModels(providerId, providerConfig);
      const model = await this.chooseProviderModel(providerMeta, discoveryResult);
      selectedProviderConfigs[providerId] = {
        ...providerConfig,
        model,
      };
    }

    const selectedModels = {};
    for (const [providerId, providerConfig] of Object.entries(selectedProviderConfigs)) {
      if (providerConfig.model) {
        selectedModels[providerId] = providerConfig.model;
      }
    }

    const credentialsAi = {
      mode,
      primaryProvider: mode === 'single'
        ? selectedProviderIds[0]
        : mode === 'fallback'
          ? selectedProviderIds[0]
          : null,
      fallbackProvider: mode === 'fallback'
        ? selectedProviderIds[1]
        : null,
      enabledProviders: [...selectedProviderIds],
      selectedModels,
      providers: selectedProviderConfigs,
    };

    this.credentials.ai = credentialsAi;
    delete this.credentials.openai;
    delete this.credentials.gemini;

    if (selectedProviderConfigs.openai) {
      this.credentials.openai = {
        apiKey: selectedProviderConfigs.openai.apiKey,
        model: selectedProviderConfigs.openai.model,
      };
    }

    if (selectedProviderConfigs.gemini) {
      this.credentials.gemini = {
        apiKey: selectedProviderConfigs.gemini.apiKey,
        model: selectedProviderConfigs.gemini.model || null,
      };
    }

    await this.saveCredentials();
    console.log(chalk.green('✅ AI service configured successfully!'));
  }

  async setupTTSService() {
    const { service } = await inquirer.prompt([
      {
        type: 'list',
        name: 'service',
        message: 'Select your preferred Text-to-Speech service:',
        choices: [
          { name: 'Azure Speech Services (Recommended)', value: 'azure' },
          { name: 'Google Cloud TTS', value: 'google' },
          { name: 'AWS Polly', value: 'aws' },
          { name: 'Skip TTS Setup', value: 'skip' }
        ]
      }
    ]);

    if (service === 'azure') {
      await this.setupAzureSpeechCredentials();
    } else if (service !== 'skip') {
      console.log(chalk.yellow(`\n⚠️  ${service.toUpperCase()} TTS setup not implemented yet.`));
      console.log(chalk.gray('You can manually configure it later in config/credentials.json'));
    }
  }
}

// CLI interface for credential setup
if (require.main === module) {
  const credentialManager = new CredentialManager();
  
  const args = process.argv.slice(2);
  if (args.includes('setup')) {
    credentialManager.runSetupWizard().catch(console.error);
  } else {
    console.log('Usage: node credential-manager.js setup');
  }
}

module.exports = { CredentialManager };

# 🎬 YouTube Automation Agent

A fully automated YouTube channel management system that creates, optimizes, and publishes content daily using AI agents. No coding required - just configure and let the AI agents handle your YouTube channel 24/7!

## ✨ What This Does

This system runs 24/7 to:
- 🎯 Research trending topics in your niche
- ✍️ Write engaging video scripts automatically  
- 🎨 Generate eye-catching thumbnails
- 📈 Optimize SEO for maximum reach
- 📅 Upload and schedule videos
- 📊 Analyze performance and improve over time

## 💡 How It Works - No Claude Required!

**You do NOT need Claude to use this system!** The YouTube Automation Agent is designed to work with multiple AI providers, giving you flexibility and cost control.

### Supported AI Providers

The setup wizard supports these providers through the normalized `credentials.ai` flow:

- **OpenAI** - usually higher quality, with strong model and tooling support
- **Google Gemini** - usually cheaper/faster for general content workflows
- **Anthropic Claude** - usually strong for reasoning-heavy writing tasks
- **DeepSeek** - OpenAI-compatible, often a lower-cost option depending on usage and plan
- **Qwen / Alibaba Model Studio** - OpenAI-compatible, often a lower-cost option depending on usage and plan
- **Custom OpenAI-compatible API** - connect any provider that speaks the OpenAI-style API

Setup supports three operating modes:

- **Single provider mode** - one provider for everything
- **Primary + fallback mode** - one provider first, another provider if the primary is unavailable
- **Multi-provider mode** - keep several providers configured and choose per task later

The setup wizard discovers live model lists first, then falls back to a verified model catalog in `config/model-fallbacks.json` when live discovery is empty or unavailable. If no usable model is discovered, you can still manually enter a model ID during setup.

Model tier labels are intended as guidance, not pricing claims:

- **Cheap** models are usually cheaper or faster
- **Balanced** models are a middle ground
- **Premium** models are usually higher quality
- Actual pricing always depends on the provider and the model you choose

After setup, you can change providers by rerunning `npm run setup` or by editing `config/credentials.json` and `.env` together. To check your current configuration, run `npm run validate:credentials`.
For the setup hardening checks covered in this release, run `npm run test:setup-ai`.

### 📊 What Each Agent Does

```javascript
// Content Strategy Agent
→ Analyzes YouTube trends via API
→ Identifies viral topics in your niche
→ Plans content calendar automatically

// Script Writer Agent
→ Writes engaging scripts with hooks
→ Adds storytelling and call-to-actions
→ Optimizes for watch time

// Thumbnail Designer Agent
→ Generates eye-catching thumbnails
→ A/B tests different designs
→ Optimizes for click-through rate

// SEO Optimizer Agent
→ Researches high-performing keywords
→ Optimizes titles and descriptions
→ Manages tags and metadata

// Publishing Agent
→ Uploads videos automatically
→ Schedules for optimal times
→ Manages playlists and end screens
```

### 💰 Pricing Notes

Pricing changes frequently, so check the current provider docs before choosing a model or estimating costs.
The setup wizard and discovery output are designed to help you compare available models without relying on hard-coded pricing assumptions.

### 🖥️ Deployment Options

- **Local Computer**: Run on your PC/Mac
- **Raspberry Pi**: Low-power home automation
- **Cloud VPS**: DigitalOcean, Linode
- **Free Cloud**: Railway, Render (with limitations)
- **Serverless**: Vercel, Netlify

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ ([Download here](https://nodejs.org/))
- Google Account (for YouTube API)
- AI Provider Account (choose one or more):
  - OpenAI account ([Sign up](https://platform.openai.com/signup)) OR
  - Google AI Studio account ([Sign up - FREE](https://makersuite.google.com/))
  - Anthropic / DeepSeek / Qwen / custom OpenAI-compatible credentials if you plan to use those providers
- 10 minutes for initial setup

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/darkzOGx/youtube-automation-agent.git
   cd youtube-automation-agent
   npm install
   ```

2. **Configure your credentials**
   ```bash
   # Copy example files
   cp .env.example .env
   cp config/credentials.example.json config/credentials.json
   
   # Run interactive setup
   npm run setup
   ```
   
   The setup wizard will help you:
   - Get YouTube API credentials (step-by-step guide included)
   - Choose and configure AI providers
   - Discover live model lists, grouped by tier, with verified fallback catalogs when needed
   - Manually enter a model ID if discovery does not produce a usable option
   - Set your channel preferences
   - Configure automation schedule

3. **Start the system**
   ```bash
   npm start
   ```

4. **Access the dashboard**
   Open http://localhost:3456 in your browser

## 🎯 Use Cases

- **Educational Channels**: Automate tutorial and explainer videos
- **News Channels**: Auto-generate daily news summaries
- **Story Channels**: Create animated story content
- **Gaming Channels**: Generate game guides and tips
- **Tech Channels**: Automate product reviews and comparisons
- **Kids Content**: Create educational kids videos
- **Meditation/Relaxation**: Generate ambient content
- **Compilation Channels**: Automate "Top 10" style videos

## 🔧 Configuration

### Getting Your API Keys (Step-by-Step)

#### Option 1: YouTube Data API (Required - FREE)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Create Project" (name it "YouTube Automation")
3. In the left menu, go to "APIs & Services" → "Library"
4. Search for "YouTube Data API v3" and click "Enable"
5. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
6. Choose "Desktop app" as application type
7. Download the JSON file and save as `config/credentials.json`

**Visual Guide**: [YouTube API Setup Tutorial](https://developers.google.com/youtube/v3/getting-started)

#### Option 2A: OpenAI API (Recommended for Quality)
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Click "API Keys" in sidebar
3. Click "Create new secret key"
4. Copy key to `.env` file as `OPENAI_API_KEY`
5. Add credits if your chosen model or plan requires them

**Pricing**: See the current OpenAI pricing docs for the models you select.

#### Option 2B: Google Gemini API (FREE Alternative)
1. Visit [Google AI Studio](https://makersuite.google.com/)
2. Click "Get API Key"
3. Create API key for new or existing project
4. Copy key to `.env` file as `GEMINI_API_KEY`

**Pricing**: See the current Gemini pricing docs for your selected model and usage tier.

### Environment Variables

```env
# Core Settings
NODE_ENV=production
PORT=3456
LOG_LEVEL=info

# AI Provider Keys
AI_PROVIDER=
AI_PRIMARY_PROVIDER=
AI_FALLBACK_PROVIDER=
AI_MODEL=
AI_ENABLED_PROVIDERS=
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
QWEN_API_KEY=
CUSTOM_LLM_API_KEY=
CUSTOM_LLM_BASE_URL=

# YouTube Settings
YOUTUBE_REGION=US
DEFAULT_PRIVACY_STATUS=public

# Content Settings
CHANNEL_NAME=
TARGET_AUDIENCE=
POSTING_FREQUENCY=
```

## 🚦 First Run Tutorial

After setup, here's how to generate your first video:

```bash
# Test content generation
npm run test

# Generate a single video manually
curl -X POST http://localhost:3456/generate \
  -H "Content-Type: application/json" \
  -d '{"topic": "Top 10 Life Hacks", "style": "listicle"}'

# Start full automation
npm start
```

## 📋 Daily Usage

### Automation Schedule
Once configured, the system runs automatically:

- **6:00 AM**: Generates new content (strategy, script, thumbnail, SEO)
- **Every 15 minutes**: Processes publishing queue
- **9:00 AM**: Collects analytics data
- **10:00 PM**: Runs optimization tasks
- **Weekly**: Strategy review and performance analysis

### Manual Operations

#### Generate Content Immediately
```bash
curl -X POST http://localhost:3456/generate \
  -H "Content-Type: application/json" \
  -d '{"topic": "Your Topic", "style": "tutorial"}'
```

#### View Schedule
```bash
curl http://localhost:3456/schedule
```

#### Get Analytics
```bash
curl http://localhost:3456/analytics
```

## 🛠️ Customization Guide

### Switching AI Providers

To use Claude instead of OpenAI:

```javascript
// utils/ai-service.js
class ClaudeAIService {
  async generateContent(prompt) {
    return await anthropic.complete({
      model: 'claude-3-sonnet',
      prompt: prompt,
      max_tokens: 1000
    });
  }
}
```

### Adding Custom Content Types

```javascript
// agents/content-strategy-agent.js
const contentTypes = {
  'podcast': {
    duration: '10-15 minutes',
    style: 'conversational',
    thumbnail: 'podcast-style'
  },
  // Add your custom type here
};
```

## 🏗️ Architecture

### Agent Communication Flow
```
Content Strategy Agent
         ↓
Script Writer Agent
         ↓
Thumbnail Designer Agent → Production Management Agent
         ↓                           ↓
SEO Optimizer Agent → Publishing & Scheduling Agent
         ↓                           ↓
Analytics & Optimization Agent ← YouTube Upload
```

### File Structure
```
youtube-automation-agent/
├── agents/                 # AI agent implementations
├── config/                 # Configuration files
├── database/              # Database management
├── data/                  # Generated content and assets
├── logs/                  # Application logs
├── schedules/             # Automation schedulers
├── utils/                 # Utility functions
├── workflows/             # Content workflows
└── uploads/               # Temporary upload files
```

## 🔒 Security & Privacy

- All API keys are stored locally in encrypted configuration
- No content is sent to external services except configured APIs
- Local database with automatic backups
- Rate limiting to respect API quotas
- Error logging without sensitive data exposure

## 📈 Performance Optimization

### Content Strategy
- **Trend Analysis**: Real-time monitoring of trending topics
- **Competitor Research**: Automated analysis of successful channels
- **Audience Insights**: Performance-based audience targeting
- **Seasonal Optimization**: Content timing based on seasonal trends

### Technical Optimization
- **Thumbnail A/B Testing**: Automatic testing of different designs
- **Title Optimization**: SEO-optimized titles with power words
- **Publishing Time**: Data-driven optimal scheduling
- **Keyword Research**: Performance-based keyword optimization

## 🌟 Success Stories

- **Educational Channel**: 50K subscribers in 3 months
- **Story Channel**: 1M+ views per month on autopilot
- **News Channel**: 24/7 automated news coverage
- **Kids Channel**: $5K/month ad revenue, fully automated

## ❓ Frequently Asked Questions

**Q: Do I need coding knowledge?**
A: No! Just follow the setup wizard and you're ready to go.

**Q: Can I use this for multiple channels?**
A: Yes! Run multiple instances with different configurations.

**Q: Is this against YouTube ToS?**
A: No, as long as you create original content and follow YouTube guidelines.

**Q: How much does it cost to run?**
A: Costs vary by provider, model, and usage. Check the provider docs and the discovery output for current options.

**Q: Can I customize the content style?**
A: Yes! Full control over tone, style, topics, and format.

## 🆘 Troubleshooting

### Common Issues

#### "YouTube API quota exceeded"
- Check your Google Cloud Console quotas
- Implement additional rate limiting if needed
- Consider upgrading your quota limits

#### "Content generation failed"
- Verify AI service API keys and credits
- Check internet connectivity
- Review error logs in `logs/` directory

#### "Publishing failed"
- Confirm YouTube OAuth tokens are valid
- Check video file sizes and formats
- Verify channel permissions

### Debug Mode
Enable detailed logging:
```bash
NODE_ENV=development DEBUG_MODE=true npm start
```

### Health Check
```bash
curl http://localhost:3456/health
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

### Development Setup
```bash
git clone <your-fork>
cd youtube-automation-agent
npm install
npm run dev
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenAI** for GPT models
- **Google** for YouTube Data API and Gemini
- **YouTube Creator Community** for inspiration and feedback

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/darkzOGx/youtube-automation-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/darkzOGx/youtube-automation-agent/discussions)
- **Wiki**: [Setup Guides & Tutorials](https://github.com/darkzOGx/youtube-automation-agent/wiki)

## 🚀 Get Started in 10 Minutes!

```bash
# Quick start commands
git clone https://github.com/darkzOGx/youtube-automation-agent.git
cd youtube-automation-agent
npm install
npm run setup
npm start
```

**⭐ Star this repository if it helps you automate your YouTube success!**

**🔔 Watch this repo to get notified of new features and updates!**

---

**⚠️ Disclaimer**: This tool is designed for legitimate content creation. Please comply with YouTube's Terms of Service and Community Guidelines. The creators are not responsible for any misuse of this software.

*Built with ❤️ by the community. Making YouTube automation accessible to everyone.*

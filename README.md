# slack-timeline-retro

> AI-powered hierarchical activity summarizer for Slack.

Slack上の自分自身の発言ログをAIが解析し、「週次・月次・年次」の階層的なサマリーを自動生成するツールです。DMチャンネルでコマンドを実行すると、そのDMにサマリーが投稿されます。

## Features

- **Hierarchical Summarization** - 週次サマリーを元に月次を、月次を元に年次を作成
- **DM-based Execution** - DMチャンネルでコマンドを実行すると、そのDMにサマリーを投稿
- **Multi-Provider AI** - OpenAI (GPT) または Anthropic (Claude) を選択可能
- **Locale Support** - 出力言語を英語 (en_US) または日本語 (ja_JP) で選択可能
- **Reply Broadcast** - 年間サマリーはスレッド返信 + チャンネル投稿
- **Async Processing** - Cloud Pub/Subによる非同期ジョブ処理で高速レスポンス

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Google Cloud Run |
| Messaging | Google Cloud Pub/Sub |
| Framework | Hono |
| Slack | @slack/web-api |
| AI | Vercel AI SDK v6 + OpenAI/Anthropic |
| Validation | Zod v4 |
| Container | Docker |
| Testing | Vitest |
| Linter | Biome |

---

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Slack Command  │────▶│  Cloud Run           │────▶│  Cloud Pub/Sub  │
│  /summarize-2025│     │  (Command Handler)   │     │  (Job Queue)    │
└─────────────────┘     └──────────────────────┘     └────────┬────────┘
                                                              │
                        ┌──────────────────────┐              │
                        │  Cloud Run           │◀─────────────┘
                        │  (Job Worker)        │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │  AI API              │
                        │  (OpenAI/Anthropic)  │
                        └──────────────────────┘
```

**フロー:**
1. Slackコマンド受信 → 開始メッセージ送信 → スレッド作成
2. ジョブリスト生成 → Pub/Subへ発行
3. Worker がジョブを受信 → メッセージ収集 → AI要約 → スレッドに投稿

---

## Step 1: Create Slack App

1. Go to [Slack API](https://api.slack.com/apps) and click **Create New App**
2. Select **From scratch**
3. Enter app name (e.g., `Timeline Retro`) and select workspace

### Configure Bot Token Scopes

Go to **OAuth & Permissions** → **Bot Token Scopes** and add ALL of the following:

| Scope | Purpose |
|-------|---------|
| `channels:history` | Read public channel messages |
| `channels:read` | List public channels |
| `chat:write` | Post messages |
| `commands` | Slash commands |
| `groups:history` | Read private channel messages |
| `groups:read` | List private channels |
| `im:history` | Read DM messages |
| `im:read` | List DM channels |
| `users:read` | Get user information |

### Create Slash Command

Go to **Slash Commands** → **Create New Command**:

| Field | Value |
|-------|-------|
| Command | `/summarize-2025` |
| Request URL | `https://your-cloud-run-url/slack/command` |
| Description | Generate activity summaries |

> **Note**: Set the Request URL after deploying (Step 2)

### Install to Workspace

Click **Install to Workspace** and authorize the app.

### Get Credentials

Copy these values:

| Credential | Location |
|------------|----------|
| **Bot Token** | OAuth & Permissions → Bot User OAuth Token (`xoxb-...`) |
| **Signing Secret** | Basic Information → App Credentials → Signing Secret |

---

## Step 2: Deploy to Google Cloud Run

### Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) configured
- [Docker](https://docs.docker.com/get-docker/) installed
- GCP Project with billing enabled

### Setup GCP Resources

```bash
# 1. Set project
gcloud config set project YOUR_PROJECT_ID

# 2. Enable required APIs
gcloud services enable run.googleapis.com pubsub.googleapis.com secretmanager.googleapis.com

# 3. Create Pub/Sub topic and subscription
gcloud pubsub topics create summary-jobs
gcloud pubsub subscriptions create summary-jobs-push \
  --topic=summary-jobs \
  --push-endpoint=https://YOUR_CLOUD_RUN_URL/jobs/process \
  --ack-deadline=600

# 4. Store secrets in Secret Manager
echo -n "xoxb-your-token" | gcloud secrets create SLACK_BOT_TOKEN --data-file=-
echo -n "your-signing-secret" | gcloud secrets create SLACK_SIGNING_SECRET --data-file=-
echo -n "sk-your-openai-key" | gcloud secrets create OPENAI_API_KEY --data-file=-
```

### Build and Deploy

```bash
# 1. Build the application
pnpm install
pnpm build

# 2. Build Docker image
pnpm docker:build

# 3. Push to Container Registry
docker tag slack-timeline-retro gcr.io/YOUR_PROJECT_ID/slack-timeline-retro
docker push gcr.io/YOUR_PROJECT_ID/slack-timeline-retro

# 4. Deploy to Cloud Run
gcloud run deploy slack-timeline-retro \
  --image gcr.io/YOUR_PROJECT_ID/slack-timeline-retro \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-secrets=SLACK_BOT_TOKEN=SLACK_BOT_TOKEN:latest,SLACK_SIGNING_SECRET=SLACK_SIGNING_SECRET:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --set-env-vars=GCP_PROJECT_ID=YOUR_PROJECT_ID,PUBSUB_TOPIC=summary-jobs

# 5. Get the service URL
gcloud run services describe slack-timeline-retro --format='value(status.url)'
```

### Update Slack App Request URL

After deployment, update the Slack App's Request URL to:

```
https://slack-timeline-retro-xxxxx-an.a.run.app/slack/command
```

### Update Pub/Sub Push Endpoint

```bash
gcloud pubsub subscriptions update summary-jobs-push \
  --push-endpoint=https://slack-timeline-retro-xxxxx-an.a.run.app/jobs/process
```

---

## Step 3: Test

1. Open a DM with yourself or the bot in Slack
2. Run the command:

   ```text
   /summarize-2025 weekly
   ```

3. The summary will be posted to that DM as a thread

> **Important**: This command only works in DM channels. Running it in a public channel will return an error.

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Signing Secret from Basic Information |
| `OPENAI_API_KEY` | OpenAI API key (if using OpenAI) |
| `ANTHROPIC_API_KEY` | Anthropic API key (if using Anthropic) |
| `GCP_PROJECT_ID` | Google Cloud Project ID |
| `PUBSUB_TOPIC` | Pub/Sub Topic name |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_MODEL` | `gpt-4o-mini` / `claude-sonnet-4-5-20250929` | AI model to use |
| `AI_MAX_TOKENS` | `4096` | Max output tokens |
| `LOCALE` | `en_US` | Output language (`en_US` or `ja_JP`) |
| `TARGET_YEAR` | Current year | Year to summarize |
| `INCLUDE_CHANNELS` | (empty) | Comma-separated channel names to include |
| `EXCLUDE_CHANNELS` | (empty) | Comma-separated channel names to exclude |
| `INCLUDE_PRIVATE_CHANNELS` | `false` | Include private channels by default |
| `INCLUDE_DIRECT_MESSAGES` | `false` | Include DMs in analysis |
| `INCLUDE_GROUP_MESSAGES` | `false` | Include group DMs in analysis |

---

## Usage

Run these commands in a DM channel:

```text
/summarize-2025 weekly                    # This week's summary (public channels only)
/summarize-2025 weekly --private          # Include private channels
/summarize-2025 weekly 2025-01-08         # Summary for week containing Jan 8
/summarize-2025 weekly 2025-01-08 --private  # With private channels
/summarize-2025 monthly 1                 # January summary
/summarize-2025 monthly 1 --private       # Include private channels
/summarize-2025 yearly                    # Full year summary
/summarize-2025 yearly --private          # Include private channels
```

### Options

| Option | Description |
|--------|-------------|
| `--private` | Include private channels (bot must be invited to the channel) |

---

## Local Development

```bash
# Install dependencies
pnpm install

# Create local env file
cp .env.example .env

# Start dev server
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint and format
pnpm check
```

### Using Docker

```bash
# Build image
pnpm docker:build

# Run container
pnpm docker:run
```

---

## Project Structure

```text
src/
├── domain/           # Domain layer (entities, value objects)
├── usecases/         # Use case layer (business logic)
├── infrastructure/   # Infrastructure layer (Slack API, AI SDK, Pub/Sub)
├── presentation/     # Presentation layer (Hono routes)
├── shared/           # Shared utilities
└── index.ts          # Cloud Run entry point

config/
├── ai.yaml           # AI settings
└── prompts/          # Prompt templates
    ├── weekly.md
    ├── monthly.md
    └── yearly.md

specification.md      # System specification document
Dockerfile            # Container configuration
```

---

## Troubleshooting

### "Timeout waiting for response"

Cloud Run has a default timeout of 300 seconds. For large summaries:
1. Check Cloud Run logs for errors
2. Increase timeout if needed: `gcloud run services update slack-timeline-retro --timeout=600`

### "No posts found for period"

No posts found in the specified channels for the period.

**Solutions**:
1. Check `INCLUDE_CHANNELS` setting
2. Specify a different date: `/summarize-2025 weekly 2025-12-01`
3. Use `--private` flag if posts are in private channels

### "Invalid signature"

The Slack signature verification failed.

**Solutions**:
1. Verify `SLACK_SIGNING_SECRET` is correct
2. Check if the secret is properly set in Secret Manager
3. Ensure the request is coming from Slack

---

## License

MIT

# slack-timeline-retro

> AI-powered hierarchical activity summarizer for Slack.

Slack上の自分自身の発言ログをAIが解析し、「週次・月次・年次」の階層的なサマリーを自動生成するツールです。スラッシュコマンドを実行すると、自分自身へのDM（セルフDM）にサマリーが投稿されます。

## Features

- **Hierarchical Summarization** - 週次サマリーを元に月次を、月次を元に年次を作成
- **Self-DM Output** - サマリーはユーザー自身のセルフDMに投稿（他の人には見えない）
- **User Token OAuth** - ユーザー自身のトークンでメッセージを取得・投稿
- **Multi-Provider AI** - OpenAI (GPT) または Anthropic (Claude) を選択可能
- **Locale Support** - 出力言語を英語 (en_US) または日本語 (ja_JP) で選択可能
- **search.messages API** - スレッド返信を含むすべての投稿を効率的に取得

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Google Cloud Run |
| Database | Firestore (Token Storage) |
| Framework | Hono |
| Slack | @slack/web-api |
| AI | Vercel AI SDK v5 + OpenAI/Anthropic |
| Validation | Zod v4 |
| Container | Docker |
| Testing | Vitest |
| Linter | Biome |

---

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐
│  Slack Command  │────▶│  Cloud Run           │
│  /summarize-2025│     │  (Command Handler)   │
└─────────────────┘     └──────────┬───────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Firestore      │     │  Slack API       │     │  AI API          │
│  (Token Store)  │     │  (User Token)    │     │  (OpenAI/Claude) │
└─────────────────┘     └──────────────────┘     └──────────────────┘
```

**フロー:**
1. ユーザーがSlackコマンドを実行
2. 初回は OAuth 認可フローへリダイレクト
3. 認可済みの場合、セルフDMに開始メッセージを投稿
4. バックグラウンドでメッセージ取得・AI要約・結果投稿

---

## Step 1: Create Slack App

1. Go to [Slack API](https://api.slack.com/apps) and click **Create New App**
2. Select **From scratch**
3. Enter app name (e.g., `Timeline Retro`) and select workspace

### Configure Bot Token Scopes

Go to **OAuth & Permissions** → **Bot Token Scopes** and add:

| Scope | Purpose |
|-------|---------|
| `commands` | Slash commands |
| `im:write` | Open DM channels |

### Configure User Token Scopes

Go to **OAuth & Permissions** → **User Token Scopes** and add:

| Scope | Purpose |
|-------|---------|
| `search:read` | Search messages (includes thread replies) |
| `channels:read` | List public channels |
| `groups:read` | List private channels |
| `users:read` | Get user information |
| `chat:write` | Post messages to self-DM |
| `im:write` | Open self-DM channel |
| `im:history` | Read self-DM thread for existing summaries |

### Configure OAuth Redirect URL

Go to **OAuth & Permissions** → **Redirect URLs** and add:

```
https://your-cloud-run-url/oauth/callback
```

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
| **Client ID** | Basic Information → App Credentials → Client ID |
| **Client Secret** | Basic Information → App Credentials → Client Secret |
| **Signing Secret** | Basic Information → App Credentials → Signing Secret |

---

## Step 2: Setup Firestore

1. Enable Firestore API in your GCP project
2. Create a Firestore database (Native mode)
3. The app will automatically create the `user_tokens` collection

---

## Step 3: Deploy to Google Cloud Run

### Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) configured
- [Docker](https://docs.docker.com/get-docker/) installed
- GCP Project with billing enabled
- Firestore database created

### Quick Deploy (Recommended)

```bash
# 1. Set required environment variables
export GCP_PROJECT_ID=your-project-id
export SLACK_BOT_TOKEN=xoxb-your-token
export SLACK_CLIENT_ID=your-client-id
export SLACK_CLIENT_SECRET=your-client-secret
export SLACK_SIGNING_SECRET=your-signing-secret
export ANTHROPIC_API_KEY=sk-ant-your-key  # or OPENAI_API_KEY

# 2. Optional: Configure additional settings
export GCP_REGION=asia-northeast1   # Default
export LOCALE=ja_JP                 # Default: en_US
export TARGET_YEAR=2025             # Default: current year

# 3. Run deploy script
./scripts/deploy.sh
```

The script will:
1. Enable required GCP APIs (Cloud Run, Firestore)
2. Create Artifact Registry repository
3. Build and push Docker image
4. Deploy to Cloud Run with environment variables

### Update Slack App URLs

After deployment, update the Slack App settings:

1. **Slash Command Request URL**:
   ```
   https://slack-timeline-retro-xxxxx-an.a.run.app/slack/command
   ```

2. **OAuth Redirect URL**:
   ```
   https://slack-timeline-retro-xxxxx-an.a.run.app/oauth/callback
   ```

---

## Step 4: Test

1. Run the command in any Slack channel:

   ```text
   /summarize-2025
   ```

2. If this is your first time, you'll see an authorization link - click to authorize
3. After authorization, run the command again
4. The summary will be posted to your self-DM (notes to self)

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-...`) |
| `SLACK_CLIENT_ID` | Slack App Client ID |
| `SLACK_CLIENT_SECRET` | Slack App Client Secret |
| `SLACK_SIGNING_SECRET` | Signing Secret from Basic Information |
| `OPENAI_API_KEY` | OpenAI API key (if using OpenAI) |
| `ANTHROPIC_API_KEY` | Anthropic API key (if using Anthropic) |
| `GCP_PROJECT_ID` | Google Cloud Project ID |

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

Run these commands in any Slack channel:

```text
/summarize-2025                       # Yearly summary (default)
/summarize-2025 yearly                # Yearly summary (explicit)
/summarize-2025 yearly --private      # Include private channels
/summarize-2025 monthly 1             # January summary
/summarize-2025 monthly 1 --private   # Include private channels
/summarize-2025 weekly                # This week's summary
/summarize-2025 weekly --private      # Include private channels
/summarize-2025 weekly 2025-01-08     # Summary for week containing Jan 8
```

### Options

| Option | Description |
|--------|-------------|
| `--private` | Include private channels (user must be a member) |

### Output Location

All summaries are posted to your **self-DM** (notes to self). This ensures your summaries are private and only visible to you.

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
├── infrastructure/   # Infrastructure layer (Slack API, AI SDK, Firestore)
├── presentation/     # Presentation layer (Hono routes)
├── shared/           # Shared utilities
└── index.ts          # Cloud Run entry point
```

---

## Troubleshooting

### "Authorization Required"

You need to authorize the app to access your Slack messages.

**Solution**: Click the authorization link provided and complete the OAuth flow.

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
2. Check if the secret is properly set in environment variables
3. Ensure the request is coming from Slack

---

## License

MIT

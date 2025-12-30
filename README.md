# slack-timeline-retro

[English](#english) | [日本語](#日本語)

---

## English

> AI-powered hierarchical activity summarizer for Slack.

This tool analyzes your own Slack posts using AI and automatically generates hierarchical summaries (weekly, monthly, yearly). When you run the slash command, the summary is posted to your self-DM (notes to self).

### Features

- **Hierarchical Summarization** - Monthly summaries are built from weekly ones, yearly from monthly
- **Self-DM Output** - Summaries are posted to your self-DM (private, only visible to you)
- **User Token OAuth** - Messages are fetched using your own token
- **Multi-Provider AI** - Choose between OpenAI (GPT) or Anthropic (Claude)
- **Locale Support** - Output in English (en_US) or Japanese (ja_JP)
- **search.messages API** - Efficiently fetches all posts including thread replies

### Tech Stack

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

### Architecture

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

**Flow:**
1. User runs Slack command
2. First-time users are redirected to OAuth authorization
3. If authorized, a start message is posted to self-DM
4. Background: fetch messages → AI summarization → post results

### Quick Start

#### Step 1: Create Slack App

1. Go to [Slack API](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Enter app name (e.g., `Timeline Retro`) and select workspace

**Bot Token Scopes** (OAuth & Permissions):

| Scope | Purpose |
|-------|---------|
| `commands` | Slash commands |
| `im:write` | Open DM channels |

**User Token Scopes** (OAuth & Permissions):

| Scope | Purpose |
|-------|---------|
| `search:read` | Search messages (includes thread replies) |
| `channels:read` | List public channels |
| `groups:read` | List private channels |
| `users:read` | Get user information |
| `chat:write` | Post messages to self-DM |
| `im:write` | Open self-DM channel |
| `im:history` | Read self-DM thread for existing summaries |

**Slash Command** (Slash Commands → Create New Command):

| Field | Value |
|-------|-------|
| Command | `/summarize-2025` |
| Request URL | `https://your-cloud-run-url/slack/command` |
| Description | Generate activity summaries |

#### Step 2: Setup Firestore

1. Enable Firestore API in your GCP project
2. Create a Firestore database (Native mode)
3. The app will automatically create the `user_tokens` collection

#### Step 3: Deploy to Cloud Run

```bash
# 1. Set required environment variables
export GCP_PROJECT_ID=your-project-id
export SLACK_BOT_TOKEN=xoxb-your-token
export SLACK_CLIENT_ID=your-client-id
export SLACK_CLIENT_SECRET=your-client-secret
export SLACK_SIGNING_SECRET=your-signing-secret
export ANTHROPIC_API_KEY=sk-ant-your-key  # or OPENAI_API_KEY

# 2. Optional settings
export GCP_REGION=asia-northeast1   # Default
export LOCALE=en_US                 # Default: en_US
export TARGET_YEAR=2025             # Default: current year

# 3. Deploy
./scripts/deploy.sh
```

After deployment, update Slack App URLs:
- Slash Command Request URL: `https://your-service-url/slack/command`
- OAuth Redirect URL: `https://your-service-url/oauth/callback`

> **Important**: The deploy script sets `--min-instances 1` to keep background processing alive. This incurs ~$10-20/month in idle costs.

#### Step 4: Test

1. Run `/summarize-2025` in any Slack channel
2. First time: click the authorization link
3. After authorization, run the command again
4. Check your self-DM for the summary

### Usage

```text
/summarize-2025                       # Yearly summary (default)
/summarize-2025 yearly                # Yearly summary (explicit)
/summarize-2025 yearly --private      # Include private channels
/summarize-2025 yearly --dm           # Include DMs
/summarize-2025 yearly --group        # Include group DMs
/summarize-2025 yearly --private --dm --group  # Include all
/summarize-2025 monthly 1             # January summary
/summarize-2025 monthly 1 --private   # Include private channels
/summarize-2025 weekly                # This week's summary
/summarize-2025 weekly --private      # Include private channels
/summarize-2025 weekly 2025-01-08     # Summary for week containing Jan 8
```

#### Options

| Option | Description |
|--------|-------------|
| `--private` | Include private channels (user must be a member) |
| `--dm` | Include direct messages |
| `--group` | Include group direct messages |

### Environment Variables

#### Required

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-...`) |
| `SLACK_CLIENT_ID` | Slack App Client ID |
| `SLACK_CLIENT_SECRET` | Slack App Client Secret |
| `SLACK_SIGNING_SECRET` | Signing Secret from Basic Information |
| `OPENAI_API_KEY` | OpenAI API key (if using OpenAI) |
| `ANTHROPIC_API_KEY` | Anthropic API key (if using Anthropic) |
| `GCP_PROJECT_ID` | Google Cloud Project ID |

#### Optional

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

### Local Development

```bash
pnpm install          # Install dependencies
cp .env.example .env  # Create local env file
pnpm dev              # Start dev server
pnpm test             # Run tests
pnpm typecheck        # Type check
pnpm check            # Lint and format
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Authorization Required" | Click the authorization link and complete OAuth flow |
| "Timeout" | Try monthly summaries first, or use `INCLUDE_CHANNELS` to reduce scope |
| "No posts found" | Check `INCLUDE_CHANNELS`, try `--private` flag, or specify different date |
| "Invalid signature" | Verify `SLACK_SIGNING_SECRET` is correct |

---

## 日本語

> Slack投稿をAIで解析し、階層的なサマリーを自動生成するツール

Slack上の自分自身の発言ログをAIが解析し、「週次・月次・年次」の階層的なサマリーを自動生成します。スラッシュコマンドを実行すると、自分自身へのDM（セルフDM）にサマリーが投稿されます。

### 特徴

- **階層的サマリー** - 週次サマリーを元に月次を、月次を元に年次を作成
- **セルフDM出力** - サマリーはユーザー自身のセルフDMに投稿（他の人には見えない）
- **User Token OAuth** - ユーザー自身のトークンでメッセージを取得・投稿
- **AI選択可能** - OpenAI (GPT) または Anthropic (Claude) を選択可能
- **言語対応** - 出力言語を英語 (en_US) または日本語 (ja_JP) で選択可能
- **search.messages API** - スレッド返信を含むすべての投稿を効率的に取得

### 技術スタック

| カテゴリ | 技術 |
|----------|------|
| ランタイム | Google Cloud Run |
| データベース | Firestore (Token Storage) |
| フレームワーク | Hono |
| Slack | @slack/web-api |
| AI | Vercel AI SDK v5 + OpenAI/Anthropic |
| バリデーション | Zod v4 |
| コンテナ | Docker |
| テスト | Vitest |
| リンター | Biome |

### アーキテクチャ

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

**処理フロー:**
1. ユーザーがSlackコマンドを実行
2. 初回は OAuth 認可フローへリダイレクト
3. 認可済みの場合、セルフDMに開始メッセージを投稿
4. バックグラウンドでメッセージ取得・AI要約・結果投稿

### クイックスタート

#### Step 1: Slack App作成

1. [Slack API](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. アプリ名（例：`Timeline Retro`）を入力し、ワークスペースを選択

**Bot Token Scopes** (OAuth & Permissions):

| Scope | 用途 |
|-------|------|
| `commands` | スラッシュコマンド |
| `im:write` | DMチャンネルを開く |

**User Token Scopes** (OAuth & Permissions):

| Scope | 用途 |
|-------|------|
| `search:read` | メッセージ検索（スレッド返信含む） |
| `channels:read` | パブリックチャンネル一覧 |
| `groups:read` | プライベートチャンネル一覧 |
| `users:read` | ユーザー情報取得 |
| `chat:write` | セルフDMへの投稿 |
| `im:write` | セルフDMチャンネルを開く |
| `im:history` | セルフDMスレッドの読み取り |

**Slash Command** (Slash Commands → Create New Command):

| フィールド | 値 |
|------------|-----|
| Command | `/summarize-2025` |
| Request URL | `https://your-cloud-run-url/slack/command` |
| Description | Generate activity summaries |

#### Step 2: Firestore設定

1. GCPプロジェクトでFirestore APIを有効化
2. Firestoreデータベースを作成（Nativeモード）
3. `user_tokens` コレクションは自動作成されます

#### Step 3: Cloud Runデプロイ

```bash
# 1. 必須環境変数を設定
export GCP_PROJECT_ID=your-project-id
export SLACK_BOT_TOKEN=xoxb-your-token
export SLACK_CLIENT_ID=your-client-id
export SLACK_CLIENT_SECRET=your-client-secret
export SLACK_SIGNING_SECRET=your-signing-secret
export ANTHROPIC_API_KEY=sk-ant-your-key  # または OPENAI_API_KEY

# 2. オプション設定
export GCP_REGION=asia-northeast1   # デフォルト
export LOCALE=ja_JP                 # デフォルト: en_US
export TARGET_YEAR=2025             # デフォルト: 現在の年

# 3. デプロイ実行
./scripts/deploy.sh
```

デプロイ後、Slack AppのURLを更新:
- Slash Command Request URL: `https://your-service-url/slack/command`
- OAuth Redirect URL: `https://your-service-url/oauth/callback`

> **重要**: デプロイスクリプトは `--min-instances 1` を設定し、バックグラウンド処理を維持します。アイドル時に約$10-20/月のコストが発生します。

#### Step 4: テスト

1. Slackの任意のチャンネルで `/summarize-2025` を実行
2. 初回：認可リンクをクリック
3. 認可後、再度コマンドを実行
4. セルフDMでサマリーを確認

### 使い方

```text
/summarize-2025                       # 年次サマリー（デフォルト）
/summarize-2025 yearly                # 年次サマリー（明示的）
/summarize-2025 yearly --private      # プライベートチャンネルも含む
/summarize-2025 yearly --dm           # DMも含む
/summarize-2025 yearly --group        # グループDMも含む
/summarize-2025 yearly --private --dm --group  # すべて含む
/summarize-2025 monthly 1             # 1月のサマリー
/summarize-2025 monthly 1 --private   # プライベートチャンネルも含む
/summarize-2025 weekly                # 今週のサマリー
/summarize-2025 weekly --private      # プライベートチャンネルも含む
/summarize-2025 weekly 2025-01-08     # 1/8を含む週のサマリー
```

#### オプション

| オプション | 説明 |
|------------|------|
| `--private` | プライベートチャンネルを含める（メンバーである必要あり） |
| `--dm` | DMを含める |
| `--group` | グループDMを含める |

### 環境変数

#### 必須

| 変数 | 説明 |
|------|------|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-...`) |
| `SLACK_CLIENT_ID` | Slack App Client ID |
| `SLACK_CLIENT_SECRET` | Slack App Client Secret |
| `SLACK_SIGNING_SECRET` | Basic InformationのSigning Secret |
| `OPENAI_API_KEY` | OpenAI APIキー（OpenAI使用時） |
| `ANTHROPIC_API_KEY` | Anthropic APIキー（Anthropic使用時） |
| `GCP_PROJECT_ID` | Google Cloud Project ID |

#### オプション

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `AI_MODEL` | `gpt-4o-mini` / `claude-sonnet-4-5-20250929` | 使用するAIモデル |
| `AI_MAX_TOKENS` | `4096` | 最大出力トークン数 |
| `LOCALE` | `en_US` | 出力言語 (`en_US` or `ja_JP`) |
| `TARGET_YEAR` | 現在の年 | 対象年 |
| `INCLUDE_CHANNELS` | (空) | 対象チャンネル（カンマ区切り） |
| `EXCLUDE_CHANNELS` | (空) | 除外チャンネル（カンマ区切り） |
| `INCLUDE_PRIVATE_CHANNELS` | `false` | デフォルトでプライベートチャンネルを含める |
| `INCLUDE_DIRECT_MESSAGES` | `false` | DMを分析対象に含める |
| `INCLUDE_GROUP_MESSAGES` | `false` | グループDMを分析対象に含める |

### ローカル開発

```bash
pnpm install          # 依存関係インストール
cp .env.example .env  # ローカル環境ファイル作成
pnpm dev              # 開発サーバー起動
pnpm test             # テスト実行
pnpm typecheck        # 型チェック
pnpm check            # リント・フォーマット
```

### トラブルシューティング

| 問題 | 解決策 |
|------|--------|
| "Authorization Required" | 認可リンクをクリックしてOAuthフローを完了 |
| "Timeout" | まず月次サマリーを試す、または `INCLUDE_CHANNELS` でスコープを絞る |
| "No posts found" | `INCLUDE_CHANNELS` を確認、`--private` フラグを試す、別の日付を指定 |
| "Invalid signature" | `SLACK_SIGNING_SECRET` が正しいか確認 |

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

## License

MIT

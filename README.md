# slack-activity-recap

> AI-powered hierarchical activity summarizer for Slack.

Slack上の自分自身の発言ログをAIが解析し、「週次・月次・年次」の階層的なサマリーを自動生成するツールです。自分自身のDMスレッドをデータベースとして活用し、一年の振り返りをシームレスに積み上げます。

## 🚀 Features

- **Hierarchical Summarization** - 週次サマリーを元に月次を、月次を元に年次を作成することで、コンテキストを維持した精度の高い要約を実現
- **Thread-based Storage** - すべてのサマリーを自分宛のDMの単一スレッドに集約。ログが散らからず、時系列での振り返りが容易
- **Smart Month Boundary** - 月の境界にある週（月跨ぎの週）を両方の月に含めて集計するロジックを搭載
- **Built for Modern Tech** - TypeScript + Hono による軽量・高速な動作と、Vercel AI SDKによる型安全なAI連携
- **Reply Broadcast** - 年間の最終サマリーはスレッドに返信しつつ、チャンネルにも同時投稿して成果を共有

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Hono |
| Slack Integration | @slack/web-api |
| AI Engine | Vercel AI SDK (v5+) + Anthropic Claude |
| Validation | Zod |
| Runtime | Cloudflare Workers / Node.js |
| Testing | Vitest |
| Linter/Formatter | Biome |
| Package Manager | pnpm |

## 📦 Project Structure

```
src/
├── domain/           # ドメイン層（エンティティ、値オブジェクト、リポジトリIF）
├── usecases/         # ユースケース層（ビジネスロジック）
├── infrastructure/   # インフラ層（Slack API、AI SDK実装）
├── presentation/     # プレゼンテーション層（Honoルーター）
└── shared/           # 共通ユーティリティ

config/
├── ai.yaml           # AI設定（モデル、生成パラメータ）
└── prompts/          # プロンプトテンプレート
    ├── weekly.md
    ├── monthly.md
    └── yearly.md

tests/
├── unit/            # ユニットテスト
├── integration/     # 統合テスト
└── e2e/             # E2Eテスト
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Cloudflare Workers account
- Slack Bot Token
- Anthropic API Key

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint and format
pnpm check
```

### Environment Variables

```bash
# Required (set via wrangler secret put)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
ANTHROPIC_API_KEY=your-anthropic-key
DM_CHANNEL_ID=D0123456789
THREAD_TS=1736000000.000000

# Optional AI settings
AI_MODEL=claude-3-5-sonnet-20241022
AI_MAX_TOKENS=4096

# Optional workspace filtering
INCLUDE_CHANNELS=project-a,project-b    # Only include these channels
EXCLUDE_CHANNELS=general,random          # Exclude these channels
INCLUDE_PRIVATE_CHANNELS=true            # Include private channels
INCLUDE_DIRECT_MESSAGES=false            # Include DMs
INCLUDE_GROUP_MESSAGES=false             # Include group DMs
```

### AI Configuration

AI model and generation parameters can be configured in `config/ai.yaml`:

```yaml
model:
  provider: anthropic
  id: claude-3-5-sonnet-20241022

generation:
  maxTokens: 4096
  temperature: 0.7
  topP: 0.9
```

Prompts can be customized by editing the markdown files in `config/prompts/`.

### Slack App Setup

1. [Slack API](https://api.slack.com/apps)でアプリを作成
2. Bot Token Scopes を設定:
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `users:read`
3. Slash Command を作成: `/summarize-2025`
4. Request URL にデプロイ先のURLを設定

## 📋 Usage

```
/summarize-2025 weekly           # 今週の週次サマリーを生成
/summarize-2025 weekly 2025-01-08  # 指定日の週のサマリーを生成
/summarize-2025 monthly 1        # 1月の月次サマリーを生成
/summarize-2025 yearly           # 年次サマリーを生成（チャンネルにも投稿）
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# With coverage
pnpm test:coverage

# With UI (Vitest UI)
pnpm test:ui
```

## 🏗 Architecture

クリーンアーキテクチャを採用し、以下の4層構造で設計されています：

1. **Domain Layer** - ビジネスロジックの中核（外部依存なし）
2. **Use Case Layer** - アプリケーションのビジネスルール
3. **Infrastructure Layer** - 外部サービスとの連携
4. **Presentation Layer** - HTTPリクエストのハンドリング

詳細は [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) を参照してください。

## 📄 License

MIT

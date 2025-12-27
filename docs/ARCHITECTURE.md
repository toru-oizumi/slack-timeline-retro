# アーキテクチャ設計書

## 1. 概要

本プロジェクトはクリーンアーキテクチャを採用し、以下の4層構造で設計されています。

```
┌─────────────────────────────────────────────────────┐
│                  Presentation Layer                  │
│              (Hono Router, Slack Handlers)           │
├─────────────────────────────────────────────────────┤
│                   Use Case Layer                     │
│    (GenerateWeeklySummary, GenerateMonthlySummary,  │
│              GenerateYearlySummary)                  │
├─────────────────────────────────────────────────────┤
│                    Domain Layer                      │
│     (Summary, Post, DateRange, SummaryType)         │
├─────────────────────────────────────────────────────┤
│                Infrastructure Layer                  │
│     (SlackRepository, AIService, DateService)       │
└─────────────────────────────────────────────────────┘
```

## 2. ディレクトリ構成

```
src/
├── index.ts                    # エントリーポイント
├── domain/                     # ドメイン層
│   ├── entities/               # エンティティ
│   │   ├── Summary.ts          # サマリーエンティティ
│   │   └── Post.ts             # 投稿エンティティ
│   ├── value-objects/          # 値オブジェクト
│   │   ├── DateRange.ts        # 日付範囲
│   │   ├── SummaryType.ts      # サマリー種別
│   │   └── SlackChannel.ts     # チャンネル情報
│   └── repositories/           # リポジトリインターフェース
│       ├── ISlackRepository.ts
│       └── IAIService.ts
├── usecases/                   # ユースケース層
│   ├── GenerateWeeklySummary.ts
│   ├── GenerateMonthlySummary.ts
│   ├── GenerateYearlySummary.ts
│   └── shared/
│       └── SummaryGenerator.ts
├── infrastructure/             # インフラ層
│   ├── slack/
│   │   ├── SlackRepository.ts
│   │   └── SlackMessageParser.ts
│   ├── ai/
│   │   ├── AIService.ts
│   │   └── prompts/
│   │       ├── weekly.ts
│   │       ├── monthly.ts
│   │       └── yearly.ts
│   └── date/
│       └── DateService.ts
├── presentation/               # プレゼンテーション層
│   ├── routes/
│   │   └── slack.ts
│   └── handlers/
│       └── SlashCommandHandler.ts
└── shared/                     # 共通ユーティリティ
    ├── types.ts
    ├── errors.ts
    └── config.ts

tests/
├── unit/
│   ├── domain/
│   ├── usecases/
│   └── infrastructure/
├── integration/
└── e2e/
```

## 3. 各層の責務

### 3.1 Domain Layer (ドメイン層)

ビジネスロジックの中核。外部依存なし。

**エンティティ:**
- `Summary`: サマリーの集約ルート（週次/月次/年次）
- `Post`: Slack投稿の表現

**値オブジェクト:**
- `DateRange`: 期間（開始日〜終了日）
- `SummaryType`: サマリー種別（WEEKLY/MONTHLY/YEARLY）
- `SlackChannel`: チャンネル情報

**リポジトリインターフェース:**
- `ISlackRepository`: Slack操作の抽象化
- `IAIService`: AI呼び出しの抽象化

### 3.2 Use Case Layer (ユースケース層)

アプリケーションのビジネスルールを実装。

- `GenerateWeeklySummary`: 週次サマリー生成
- `GenerateMonthlySummary`: 月次サマリー生成
- `GenerateYearlySummary`: 年次サマリー生成

### 3.3 Infrastructure Layer (インフラ層)

外部サービスとの連携を実装。

- `SlackRepository`: Slack Web API操作
- `AIService`: Vercel AI SDK経由のLLM呼び出し
- `DateService`: 日付計算ユーティリティ

### 3.4 Presentation Layer (プレゼンテーション層)

HTTPリクエストのハンドリング。

- Honoルーター設定
- Slash Commandハンドラー
- リクエスト/レスポンス変換

## 4. データフロー

### 4.1 週次サマリー生成フロー

```
[Slack Command]
    → SlashCommandHandler.handleWeekly()
    → GenerateWeeklySummary.execute()
    → SlackRepository.fetchPosts(dateRange)
    → AIService.generateSummary(posts, "weekly")
    → SlackRepository.postToThread(summary)
```

### 4.2 月次サマリー生成フロー

```
[Slack Command]
    → SlashCommandHandler.handleMonthly()
    → GenerateMonthlySummary.execute()
    → SlackRepository.fetchWeeklySummaries(month)  # タグベース検索
    → AIService.generateSummary(weeklySummaries, "monthly")
    → SlackRepository.postToThread(summary)
```

### 4.3 年次サマリー生成フロー

```
[Slack Command]
    → SlashCommandHandler.handleYearly()
    → GenerateYearlySummary.execute()
    → SlackRepository.fetchMonthlySummaries(year)
    → AIService.generateSummary(monthlySummaries, "yearly")
    → SlackRepository.broadcastToChannel(summary)  # reply_broadcast: true
```

## 5. 依存性注入

```typescript
// DI Container (簡易版)
const container = {
  slackRepository: new SlackRepository(env.SLACK_BOT_TOKEN),
  aiService: new AIService(env.ANTHROPIC_API_KEY),
  dateService: new DateService(),
};

// ユースケースへの注入
const generateWeekly = new GenerateWeeklySummary(
  container.slackRepository,
  container.aiService,
  container.dateService
);
```

## 6. エラーハンドリング戦略

### 6.1 ドメインエラー

- `InvalidDateRangeError`: 無効な日付範囲
- `SummaryNotFoundError`: サマリーが見つからない

### 6.2 インフラエラー

- `SlackAPIError`: Slack API呼び出し失敗
- `AIServiceError`: AI生成失敗

### 6.3 エラー伝播

```typescript
Result<T, E> パターンを使用
- 成功: { ok: true, value: T }
- 失敗: { ok: false, error: E }
```

## 7. テスト戦略

### 7.1 ユニットテスト

- **ドメイン層**: エンティティ・値オブジェクトのロジック検証
- **ユースケース層**: モックを使用したビジネスロジック検証

### 7.2 統合テスト

- **インフラ層**: 実際のAPI呼び出しを伴うテスト（モック可）
- **リポジトリ**: Slack APIとの連携確認

### 7.3 E2Eテスト

- Slash Commandからの全フロー検証
- 実際のSlack環境でのテスト

## 8. 非同期処理

Cloudflare Workersの制約（3秒レスポンス）に対応:

```typescript
app.post('/slack/command', async (c) => {
  // 即座に200を返す
  c.executionCtx.waitUntil(
    processCommand(c.req.body)  // バックグラウンド処理
  );
  return c.text('処理を開始しました...');
});
```

## 9. 設定管理

環境変数:
- `SLACK_BOT_TOKEN`: Slack Bot Token
- `SLACK_SIGNING_SECRET`: リクエスト検証用
- `ANTHROPIC_API_KEY`: Claude API Key
- `DM_CHANNEL_ID`: サマリー投稿先のDMチャンネルID
- `THREAD_TS`: サマリースレッドのタイムスタンプ

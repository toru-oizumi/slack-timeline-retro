# Slack Timeline Retro - システム仕様書 v3

## 1. 概要

Slackの自分自身の投稿ログをAIで解析し、週次・月次・年次の階層的なサマリーを作成するツール。DMチャンネルでコマンドを実行すると、そのDMにサマリースレッドを作成し、結果を投稿する。

## 2. システムアーキテクチャ

### 2.1 技術スタック

| カテゴリ | 技術 |
|----------|------|
| ランタイム | Google Cloud Run |
| メッセージング | Google Cloud Pub/Sub |
| 言語 | TypeScript |
| フレームワーク | Hono |
| Slack SDK | @slack/web-api |
| AI SDK | Vercel AI SDK v6 |
| バリデーション | Zod v4 |
| コンテナ | Docker |
| IaC | Terraform (optional) |

### 2.2 アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Slack Workspace                                 │
│  ┌─────────────────┐                              ┌─────────────────────┐   │
│  │  User DM        │                              │  Summary Thread     │   │
│  │  /summarize-2025│                              │  ├─ Start message   │   │
│  └────────┬────────┘                              │  ├─ Week 1 summary  │   │
│           │                                       │  ├─ Week 2 summary  │   │
│           ▼                                       │  └─ Complete message│   │
└───────────┼───────────────────────────────────────┴─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Google Cloud Platform                              │
│                                                                              │
│  ┌──────────────────────────────────────┐                                   │
│  │         Cloud Run (Command Handler)   │                                   │
│  │  POST /slack/command                  │                                   │
│  │  ┌────────────────────────────────┐  │                                   │
│  │  │ 1. Verify Slack signature      │  │                                   │
│  │  │ 2. Parse command & options     │  │                                   │
│  │  │ 3. Post start message (thread) │  │                                   │
│  │  │ 4. Generate job list           │  │                                   │
│  │  │ 5. Publish jobs to Pub/Sub     │  │                                   │
│  │  └────────────────────────────────┘  │                                   │
│  └──────────────────┬───────────────────┘                                   │
│                     │                                                        │
│                     ▼                                                        │
│  ┌──────────────────────────────────────┐                                   │
│  │           Cloud Pub/Sub               │                                   │
│  │  Topic: summary-jobs                  │                                   │
│  │  ┌────────────────────────────────┐  │                                   │
│  │  │ Job: { type, range, threadTs } │  │                                   │
│  │  └────────────────────────────────┘  │                                   │
│  └──────────────────┬───────────────────┘                                   │
│                     │ Push subscription                                      │
│                     ▼                                                        │
│  ┌──────────────────────────────────────┐      ┌─────────────────────────┐  │
│  │         Cloud Run (Job Worker)        │      │     AI API              │  │
│  │  POST /jobs/process                   │      │  (OpenAI / Anthropic)   │  │
│  │  ┌────────────────────────────────┐  │      └────────────┬────────────┘  │
│  │  │ 1. Fetch messages from Slack   │◄─┼──────────────────►│               │
│  │  │ 2. Generate summary via AI     │  │                   │               │
│  │  │ 3. Post summary to thread      │  │                   │               │
│  │  │ 4. Update job status           │  │                   │               │
│  │  └────────────────────────────────┘  │                                   │
│  └──────────────────────────────────────┘                                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 3. 処理フロー詳細

### 3.1 Phase 1: コマンド受信 (Cloud Run - Command Handler)

```
POST /slack/command
```

#### Step 1: リクエスト検証
- Slack署名検証 (`X-Slack-Signature`, `X-Slack-Request-Timestamp`)
- DMチャンネル確認 (`channel_id.startsWith('D')`)

#### Step 2: コマンドパース
- サマリータイプ: `weekly` | `monthly` | `yearly`
- オプション:
  - `--private`: プライベートチャンネルを含める
  - 日付指定: `2025-01-15` (weekly)
  - 月指定: `1-12` (monthly)

#### Step 3: 開始メッセージ送信 & スレッド生成
- Slack APIで開始メッセージを投稿
- レスポンスから `thread_ts` を取得
- **これによりSlackの3秒ルールをクリア**

#### Step 4: ジョブリスト生成
- サマリータイプに応じてジョブを分割
  - `weekly`: 1ジョブ（指定週）
  - `monthly`: 4-5ジョブ（対象月の各週）
  - `yearly`: 12ジョブ（各月）

#### Step 5: Pub/Subへジョブ登録
- 各ジョブをPub/Subトピックに発行
- ジョブペイロード:
  ```typescript
  interface JobPayload {
    jobId: string;
    type: 'weekly' | 'monthly' | 'yearly';
    userId: string;
    channelId: string;
    threadTs: string;
    dateRange: { start: string; end: string };
    options: {
      includePrivateChannels: boolean;
      includeDirectMessages: boolean;
    };
    totalJobs: number;
    jobIndex: number;
  }
  ```

### 3.2 Phase 2: ジョブ処理 (Cloud Run - Job Worker)

```
POST /jobs/process
```

#### Step 1: ジョブペイロード受信
- Pub/SubからのPushリクエストを受信
- Base64デコードしてペイロードを取得

#### Step 2: Slackメッセージ収集
- `conversations.history` APIで対象期間のメッセージを取得
- 指定されたチャンネルタイプに応じてフィルタリング

#### Step 3: AI要約生成
- 収集したメッセージをAI APIに送信
- Vercel AI SDK v6 の `generateText` を使用
- プロンプトはサマリータイプ別に用意

#### Step 4: スレッドへ返信
- 生成されたサマリーを `thread_ts` 指定でSlackに投稿
- サマリータグを付与: `[WeeklySummary_2025]`, `[MonthlySummary_2025]`, `[YearlySummary_2025]`

#### Step 5: 完了通知（最終ジョブのみ）
- `jobIndex === totalJobs - 1` の場合、完了メッセージを投稿
- 年次サマリーの場合は `reply_broadcast: true` でチャンネルにも表示

## 4. エンドポイント定義

### 4.1 Command Handler

| Method | Path | Description |
|--------|------|-------------|
| POST | `/slack/command` | Slackスラッシュコマンド受信 |
| GET | `/health` | ヘルスチェック |
| GET | `/` | サービス情報 |

### 4.2 Job Worker

| Method | Path | Description |
|--------|------|-------------|
| POST | `/jobs/process` | Pub/Subジョブ処理 |
| GET | `/health` | ヘルスチェック |

## 5. データモデル

### 5.1 Slackコマンドペイロード

```typescript
interface SlackCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}
```

### 5.2 ジョブペイロード

```typescript
interface JobPayload {
  jobId: string;
  type: 'weekly' | 'monthly' | 'yearly';
  userId: string;
  channelId: string;
  threadTs: string;
  dateRange: {
    start: string; // ISO 8601
    end: string;   // ISO 8601
  };
  options: {
    includePrivateChannels: boolean;
    includeDirectMessages: boolean;
    includeGroupMessages: boolean;
    includeChannels: string[];
    excludeChannels: string[];
  };
  metadata: {
    totalJobs: number;
    jobIndex: number;
    parentJobId?: string; // 月次・年次の場合、元のジョブID
  };
}
```

### 5.3 サマリーエンティティ

```typescript
interface Summary {
  id: string;
  type: 'weekly' | 'monthly' | 'yearly';
  content: string;
  dateRange: DateRange;
  year: number;
  weekNumber?: number;
  month?: number;
  createdAt: Date;
}
```

## 6. コマンド仕様

### 6.1 基本構文

```
/summarize-2025 <type> [options] [--flags]
```

### 6.2 サマリータイプ

| Type | Description | Example |
|------|-------------|---------|
| `weekly` | 週次サマリー | `/summarize-2025 weekly` |
| `monthly` | 月次サマリー | `/summarize-2025 monthly 12` |
| `yearly` | 年次サマリー | `/summarize-2025 yearly` |

### 6.3 オプション

| Option | Description | Default |
|--------|-------------|---------|
| `--private` | プライベートチャンネルを含める | `false` |
| `--dm` | DMを含める | `false` |
| `--group` | グループDMを含める | `false` |

### 6.4 コマンド例

```
/summarize-2025 weekly                    # 今週のpublicチャンネルのみ
/summarize-2025 weekly --private          # privateチャンネルも含む
/summarize-2025 weekly 2025-01-15         # 1/15を含む週
/summarize-2025 monthly 1                 # 1月
/summarize-2025 monthly 1 --private --dm  # 1月、private+DM含む
/summarize-2025 yearly                    # 年間サマリー
```

## 7. 環境変数

### 7.1 必須

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Slack Bot Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Slack Signing Secret |
| `OPENAI_API_KEY` | OpenAI API Key (or ANTHROPIC_API_KEY) |
| `PUBSUB_TOPIC` | Pub/Sub Topic名 |
| `GCP_PROJECT_ID` | GCPプロジェクトID |

### 7.2 オプション

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_MODEL` | `gpt-4o-mini` | 使用するAIモデル |
| `AI_MAX_TOKENS` | `4096` | 最大出力トークン数 |
| `LOCALE` | `en_US` | 出力言語 |
| `TARGET_YEAR` | Current year | 対象年 |
| `INCLUDE_CHANNELS` | (empty) | 対象チャンネル（カンマ区切り） |
| `EXCLUDE_CHANNELS` | (empty) | 除外チャンネル（カンマ区切り） |

## 8. エラーハンドリング

### 8.1 エラーレスポンス

```typescript
interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}
```

### 8.2 エラーコード

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_SIGNATURE` | 401 | Slack署名検証失敗 |
| `DM_ONLY` | 400 | DMチャンネル以外での実行 |
| `INVALID_COMMAND` | 400 | コマンド構文エラー |
| `NO_POSTS_FOUND` | 404 | 対象期間に投稿なし |
| `AI_ERROR` | 500 | AI API呼び出しエラー |
| `SLACK_API_ERROR` | 500 | Slack API呼び出しエラー |
| `PUBSUB_ERROR` | 500 | Pub/Sub発行エラー |

## 9. セキュリティ

### 9.1 認証・認可

- **Slackリクエスト検証**: 署名ベース (HMAC-SHA256)
- **Pub/Sub認証**: GCP IAMベース (サービスアカウント)
- **Cloud Run認証**: Pub/Subからの呼び出しはIAM認証

### 9.2 シークレット管理

- **Secret Manager**: 本番環境のシークレット管理
- **環境変数**: 開発環境のみ

## 10. デプロイメント

### 10.1 コンテナイメージ

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

### 10.2 Cloud Run設定

| Setting | Value |
|---------|-------|
| CPU | 1 |
| Memory | 512Mi |
| Min instances | 0 |
| Max instances | 10 |
| Timeout | 300s |
| Concurrency | 80 |

### 10.3 Pub/Sub設定

| Setting | Value |
|---------|-------|
| Topic | `summary-jobs` |
| Subscription | `summary-jobs-push` |
| Ack deadline | 600s |
| Retry policy | Exponential backoff |

---

## 11. タスク分解

### Phase 1: インフラ準備

- [ ] **T1.1** GCPプロジェクトセットアップ
- [ ] **T1.2** Cloud Run サービス作成
- [ ] **T1.3** Pub/Sub トピック・サブスクリプション作成
- [ ] **T1.4** Secret Manager 設定
- [ ] **T1.5** IAM ロール・サービスアカウント設定

### Phase 2: コード移行

- [ ] **T2.1** Dockerfile 作成
- [ ] **T2.2** エントリーポイント変更 (`src/index.ts` → Node.js向け)
- [ ] **T2.3** Lambda/Cloudflare固有コード削除
- [ ] **T2.4** Pub/Sub クライアント実装

### Phase 3: Command Handler 実装

- [ ] **T3.1** 開始メッセージ送信・スレッド作成ロジック
- [ ] **T3.2** ジョブリスト生成ロジック
- [ ] **T3.3** Pub/Sub パブリッシュ実装
- [ ] **T3.4** レスポンス即時返却（3秒ルール対応）

### Phase 4: Job Worker 実装

- [ ] **T4.1** Pub/Sub メッセージ受信エンドポイント
- [ ] **T4.2** Slackメッセージ収集処理
- [ ] **T4.3** AI要約生成処理
- [ ] **T4.4** サマリー投稿処理
- [ ] **T4.5** 完了通知処理

### Phase 5: テスト・デプロイ

- [ ] **T5.1** ユニットテスト追加
- [ ] **T5.2** 統合テスト追加
- [ ] **T5.3** ローカル開発環境構築 (Pub/Sub emulator)
- [ ] **T5.4** CI/CD パイプライン構築
- [ ] **T5.5** 本番デプロイ・動作確認

---

## 12. 変更履歴

| Version | Date | Changes |
|---------|------|---------|
| v1 | - | 初期仕様 (Cloudflare Workers) |
| v2 | - | AI SDK v6対応、Zod v4対応 |
| v3 | 2025-12-30 | Cloud Run + Pub/Sub アーキテクチャへ移行 |

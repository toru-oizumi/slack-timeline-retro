# Pub/Sub イベント駆動アーキテクチャ

## 概要

Cloud Run の `--min-instances 0` 設定でコスト削減（月$10-20 → $1-5）を実現するため、Pub/Sub を使用したイベント駆動型アーキテクチャを採用。Slack APIレート制限を考慮し、AI生成は並列、Slack投稿は順次で処理する。

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────────┐
│  Slack: /summarize-2025 [weekly|monthly|yearly]                     │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Cloud Run: POST /slack/command (min-instances: 0)                  │
│  1. Slack署名検証                                                    │
│  2. ユーザートークン確認                                              │
│  3. Self-DM開いて「処理中...」投稿                                   │
│  4. Firestore に job 情報保存                                        │
│  5. Pub/Sub "summary-jobs" にジョブ発行                              │
│  6. Slack に即座に 200 返却（< 3秒）                                 │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Pub/Sub: summary-jobs → POST /pubsub/orchestrate                   │
│  1. Firestore から job 取得                                          │
│  2. 週タスクを計算（weekly: 1, monthly: 4-5, yearly: 52-53）         │
│  3. Firestore に週タスク作成                                         │
│  4. Pub/Sub "weekly-tasks" に並列発行                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │ (並列処理)
         ┌───────────────┼───────────────┬───────────────┐
         ▼               ▼               ▼               ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Week Worker │   │ Week Worker │   │ Week Worker │   │ Week Worker │
│   Week 1    │   │   Week 2    │   │   Week 3    │   │  ...W52     │
│ (投稿取得)   │   │ (投稿取得)   │   │ (投稿取得)   │   │ (投稿取得)   │
│ (AI生成)    │   │ (AI生成)    │   │ (AI生成)    │   │ (AI生成)    │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │                 │
       ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Firestore: summary_jobs/{jobId}/weeks/{weekNum}                    │
│  { content, status: "completed" }                                   │
│                                                                     │
│  完了時に completedTasks++ → 全完了で Posting Worker トリガー        │
└────────────────────────┬────────────────────────────────────────────┘
                         │ (全週完了)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Pub/Sub: posting-tasks → POST /pubsub/posting                      │
│  1. Firestore から週次サマリーを順番に取得                           │
│  2. 月ごとにグループ化して月次サマリー生成・投稿                      │
│  3. 年次サマリー生成・投稿（yearly の場合）                          │
│  4. 完了メッセージ投稿                                               │
│  5. job status を completed に更新                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Pub/Sub トピック構成

| トピック | サブスクリプション | エンドポイント | 用途 |
|---------|------------------|--------------|------|
| `summary-jobs` | `summary-jobs-push` | `/pubsub/orchestrate` | ジョブ開始 |
| `weekly-tasks` | `weekly-tasks-push` | `/pubsub/week-worker` | 週次処理 |
| `posting-tasks` | `posting-tasks-push` | `/pubsub/posting` | 結果投稿 |
| `summary-dlq` | `summary-dlq-sub` | - | Dead Letter |

## Firestore スキーマ

```typescript
// Collection: summary_jobs/{jobId}
interface JobDocument {
  id: string;
  type: 'weekly' | 'monthly' | 'yearly';
  year: number;
  month?: number;
  userId: string;
  channelId: string;
  threadTs: string;
  userToken: string;
  status: 'pending' | 'processing' | 'posting' | 'completed' | 'error';
  totalTasks: number;
  completedTasks: number;
  options: {
    includePrivate: boolean;
    includeDM: boolean;
    includeGroup: boolean;
  };
  errorMessage?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Subcollection: summary_jobs/{jobId}/weeks/{weekNum}
interface WeekTaskDocument {
  jobId: string;
  weekNumber: number;
  year: number;
  dateRange: { start: string; end: string };
  status: 'pending' | 'processing' | 'completed' | 'error';
  content?: string;
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## セットアップ手順

### 1. Cloud Run デプロイ

```bash
# 環境変数を設定
export GCP_PROJECT_ID=your-project-id
export SLACK_BOT_TOKEN=xoxb-xxx
export SLACK_SIGNING_SECRET=xxx
export SLACK_CLIENT_ID=xxx
export SLACK_CLIENT_SECRET=xxx
export ANTHROPIC_API_KEY=sk-xxx

# デプロイ
./scripts/deploy.sh
```

### 2. Pub/Sub セットアップ

```bash
# Pub/Sub トピック、サブスクリプション、IAM設定
./scripts/setup-pubsub.sh
```

### 3. 動作確認

```bash
# Health check
curl https://YOUR-SERVICE-URL/health

# Slack でテスト
/summarize-2025 weekly
```

## 設定値

### Pub/Sub
- ACK deadline: 600秒（10分）
- Retry policy: Exponential backoff (10s-600s)
- Max delivery attempts: 5
- Dead letter topic: `summary-dlq`

### Cloud Run
- min-instances: 0
- max-instances: 10
- Memory: 512Mi
- CPU: 1
- Timeout: 3600秒
- no-cpu-throttling: enabled

## コスト比較

| 項目 | 変更前 | 変更後 |
|-----|-------|-------|
| Cloud Run | $10-20/月 | $1-5/月 |
| Pub/Sub | $0 | ~$0.05/月 |
| Firestore | ~$0 | ~$0.01/月 |
| **合計** | **$10-20/月** | **$1-5/月** |

削減率: 80-95%

## レート制限対策

- Slack API: Tier 3 = 50+ requests/min
- conversations.history: Tier 3
- chat.postMessage: Tier 2 (20+ requests/min)

### 対策
1. 週次AI生成は並列実行（Slack API 呼び出しなし）
2. Slack 投稿は Posting Worker で順次実行
3. 投稿間に 1秒の delay を挿入
4. retry-after ヘッダーを尊重してリトライ

## トラブルシューティング

### ジョブが完了しない
1. Cloud Logging でエラーを確認
2. Firestore の job status を確認
3. Pub/Sub Dead Letter Topic を確認

### コールドスタートが遅い
- 初回リクエストは 5-30秒かかる場合があります
- 即座に ACK を返すため、ユーザー体験への影響は軽微

### 週次サマリーが空
- 対象週に投稿がない場合、空のコンテンツとして処理されます
- エラーではなく正常動作

## 関連ファイル

- `src/infrastructure/pubsub/` - Pub/Sub クライアント
- `src/infrastructure/firestore/JobRepository.ts` - ジョブ管理
- `src/presentation/routes/slack.ts` - Slack コマンドハンドラー
- `src/presentation/routes/pubsub.ts` - Pub/Sub ワーカーエンドポイント
- `scripts/setup-pubsub.sh` - Pub/Sub セットアップスクリプト
- `scripts/deploy.sh` - Cloud Run デプロイスクリプト

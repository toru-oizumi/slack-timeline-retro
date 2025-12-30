# Pub/Sub 2フェーズ処理アーキテクチャ（将来実装予定）

## 概要

Slack APIレート制限を考慮し、AI生成は並列、Slack投稿は順次で処理する。

## フロー

```
┌─────────────────────────────────────────────────────────────────────┐
│  /summarize-2025 monthly 12                                         │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Cloud Run: Slack Route                                             │
│  1. 即座にSlackにレスポンス                                          │
│  2. DMチャンネル作成、開始メッセージ投稿                              │
│  3. Pub/Sub "summary-jobs" にジョブ投稿                              │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Pub/Sub: summary-jobs                                              │
│  { jobId, type, year, month?, userId, channelId, threadTs }         │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Cloud Run: Job Orchestrator                                        │
│  1. 週を計算 (W49, W50, W51, W52, W1)                               │
│  2. Firestore に jobs/{jobId} 作成                                  │
│  3. 各週の Pub/Sub "weekly-tasks" に投稿                            │
└────────────────────────┬────────────────────────────────────────────┘
                         │ (並列でAI生成、Slack API呼び出しは順次)
         ┌───────────────┼───────────────┬───────────────┐
         ▼               ▼               ▼               ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Week Worker │   │ Week Worker │   │ Week Worker │   │ Week Worker │
│   Week 49   │   │   Week 50   │   │   Week 51   │   │   Week 52   │
│ (投稿取得)   │   │ (投稿取得)   │   │ (投稿取得)   │   │ (投稿取得)   │
│ (AI生成)    │   │ (AI生成)    │   │ (AI生成)    │   │ (AI生成)    │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │                 │
       ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Firestore: jobs/{jobId}/weeks/{weekNum}                            │
│  { content, status: "completed", completedAt }                      │
│                                                                     │
│  ※ 完了時に completedTasks++ → 全完了でPosting Workerトリガー       │
└────────────────────────┬────────────────────────────────────────────┘
                         │ (全週完了)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Pub/Sub: posting-tasks                                             │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Cloud Run: Posting Worker                                          │
│  1. Firestore から週次サマリーを順番に取得                           │
│  2. 順番に Slack 投稿（レート制限考慮して delay）                    │
│  3. 月次/年次サマリー生成・投稿                                      │
│  4. Firestore ジョブコレクション削除                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Firestore スキーマ

```typescript
// jobs/{jobId}
interface Job {
  type: 'weekly' | 'monthly' | 'yearly';
  year: number;
  month?: number;
  userId: string;
  channelId: string;
  threadTs: string;
  status: 'pending' | 'processing' | 'posting' | 'completed' | 'error';
  totalTasks: number;
  completedTasks: number;
  errorMessage?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// jobs/{jobId}/weeks/{weekNumber}
interface WeekTask {
  weekNumber: number;
  year: number;
  dateRange: { start: string; end: string };
  status: 'pending' | 'completed' | 'error';
  content?: string;
  error?: string;
  completedAt?: Timestamp;
}
```

## 必要なパッケージ

```bash
pnpm add @google-cloud/pubsub @google-cloud/firestore
```

## レート制限対策

- Slack API: Tier 3 = 50+ requests/min
- conversations.history: Tier 3
- chat.postMessage: Tier 2 (20+ requests/min)

### 対策
1. Week Worker間でSlack API呼び出しが並列にならないよう、Firestoreでロック
2. または、投稿取得も Posting Worker で順次実行
3. retry-after ヘッダーを尊重してリトライ

## 注意事項

- 完了 or エラー後に Firestore コレクション削除
- Cloud Run Jobs も選択肢（24時間タイムアウト）
- Pub/Sub Push は 10分制限あり

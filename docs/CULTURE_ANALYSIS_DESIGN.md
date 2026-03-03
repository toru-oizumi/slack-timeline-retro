# カルチャー分析パイプライン 設計書

## 概要

Slack の特定チャンネル群を対象に、組織のカルチャーを年単位で分析・レポーティングする機能。
複数年を指定することで経年変化も可視化できる。

## コマンド

```bash
/analyze-culture 2023 2024 2025
```

- 引数: 分析対象の年（複数可）
- 対象チャンネル: パイプライン YAML の `channelIds` で指定

## アーキテクチャ図

```
/analyze-culture 2023 2024 2025
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  Cloud Run: POST /slack/command                          │
│  1. PIPELINE_IDS から culture-analysis パイプライン特定  │
│  2. 引数から年リストをパース                              │
│  3. Firestore に job 保存（years: [2023, 2024, 2025]）   │
│  4. Pub/Sub "summary-jobs" にジョブ発行                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Pub/Sub: /pubsub/orchestrate                           │
│  1. channelIds × 年の週 でタスクを生成                   │
│     例: 3年 × 50週 × 3チャンネル = 450 週タスク          │
│  2. Pub/Sub "weekly-tasks" に並列発行                    │
└────────────────────────┬────────────────────────────────┘
                         │ (並列)
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │Week Worker │  │Week Worker │  │Week Worker │
   │2023 W01    │  │2023 W02    │  │2024 W01    │
   │↓各チャンネル│  │↓各チャンネル│  │↓各チャンネル│
   │スレッド取得│  │スレッド取得│  │スレッド取得│
   │サンプリング│  │サンプリング│  │サンプリング│
   │AI要約生成  │  │AI要約生成  │  │AI要約生成  │
   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
         │               │               │
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────────┐
│  Firestore: summary_jobs/{jobId}/weeks/{year_week_ch}   │
│  全タスク完了で Posting Worker トリガー                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Pub/Sub: /pubsub/posting                               │
│  stages[1..] をループ:                                   │
│  1. monthly_digest: 週次 → 月次集約（チャンネルごと）    │
│  2. yearly_culture: 月次 → 年次カルチャー分析            │
│  3. yoy_report:     年次 → all_years 集約（単年なら年次プロファイル、複数年なら経年比較）│
└─────────────────────────────────────────────────────────┘
```

## パイプライン設定（YAML）

```yaml
id: culture-analysis
command: /analyze-culture
description: "Org culture analysis with year-over-year comparison"

slackInput:
  type: channel_threads
  channelIds:
    - C0123456789   # #general
    - C9876543210   # #engineering
  sampling:
    strategy: top_engaged    # リアクション数 + 返信数でスコアリング
    maxThreadsPerWeek: 5     # チャンネルあたり・週あたりの上限

stages:
  - id: weekly_digest
    unit: week
    prompt:
      system: "Extract organizational signals from Slack threads. Focus on facts, not interpretation."
      user: |
        From these threads, extract:
        - Topics discussed
        - Communication patterns (how people interact)
        - Decision points or action items mentioned

        Threads:
        {{input}}

  - id: monthly_digest
    unit: month
    inputSource: weekly_digest
    prompt:
      system: "Consolidate weekly thread digests into a concise monthly summary."
      user: "Consolidate these weekly digests:\n\n{{input}}"

  - id: yearly_culture
    unit: year
    inputSource: monthly_digest
    prompt:
      system: "You are an organizational culture expert analyzing Slack communication patterns."
      user: |
        Based on 12 months of communication data, analyze org culture:
        - Communication style and norms
        - Decision-making patterns
        - Collaboration behaviors
        - Values expressed through behavior
        - Key themes and focus areas

        Monthly data:
        {{input}}

  - id: yoy_report
    unit: all_years
    inputSource: yearly_culture
    prompt:
      system: "You are an organizational culture change expert."
      user: |
        Compare org culture across years and identify:
        - How communication norms have evolved
        - Shifts in decision-making patterns
        - Changes in collaboration behaviors
        - Cultural turning points
        - Overall cultural trajectory

        Year-by-year culture profiles:
        {{input}}

output:
  destination: self_dm
  thread: false
  broadcastFinal: true
```

## 型定義の拡張

### `SlackInput`（discriminatedUnion に変更）

```typescript
// user_posts（既存）
{
  type: 'user_posts';
  userId: 'caller' | string;
}

// channel_threads（新規）
{
  type: 'channel_threads';
  channelIds: string[];
  sampling: {
    strategy: 'top_engaged' | 'random' | 'recent';
    maxThreadsPerWeek: number;
  };
}
```

### `StageUnit`（追加）

```typescript
'day' | 'week' | 'month' | 'quarter' | 'year' | 'all_years'
// all_years: 複数年の年次サマリーを横断集約する特殊ステージ
```

### `Thread` エンティティ（新規）

```typescript
interface Thread {
  id: string;          // 親メッセージの ts
  channelId: string;
  text: string;        // 親メッセージのテキスト
  replyCount: number;
  reactionCount: number;
  replies: Post[];     // スレッド内返信
  timestamp: Date;
}
```

## サンプリング戦略

### `top_engaged`（デフォルト）

```
スコア = reactionCount + replyCount
週あたり上位 maxThreadsPerWeek スレッドを取得
```

**メリット**: カルチャーを最もよく反映する「盛り上がった」会話を優先
**デメリット**: センセーショナルな話題に偏る可能性

### `random`

毎週均等にランダムサンプリング。バイアスを避けたい場合。

### `recent`

各週の最新スレッドを取得。タイムラグを最小化。

## コスト試算

| パラメータ | 値 |
|-----------|---|
| チャンネル数 | 3 |
| 週数（1年） | 52 |
| チャンネルあたり最大スレッド/週 | 5 |
| 1スレッドあたりトークン | ~200 |
| **week-worker 入力トークン（1年分）** | **3 × 52 × 5 × 200 = 156,000** |

3年分で約 500,000 トークン（入力）≈ Claude Sonnet で **$1.5〜2.0**

## Slack API 利用

| API | 用途 | レート制限 |
|-----|------|-----------|
| `conversations.history` | チャンネルのスレッド親メッセージ取得 | Tier 3 (50+/min) |
| `conversations.replies` | スレッド内返信取得 | Tier 3 |
| `reactions` フィールド | history レスポンスに含まれる | - |

**注意**: `reply_count` は `conversations.history` のレスポンスに含まれるため、
スレッド取得前にフィルタリング可能。

## 実装範囲

### 新規ファイル

| ファイル | 役割 |
|---------|------|
| `config/pipelines/culture-analysis.yaml` | パイプライン設定 |
| `src/domain/entities/Thread.ts` | Thread エンティティ |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/infrastructure/pipeline/types.ts` | `SlackInput` discriminatedUnion 化、`all_years` 追加、`SamplingConfig` 追加 |
| `src/domain/repositories/ISlackRepository.ts` | `fetchChannelThreads()` インターフェース追加 |
| `src/infrastructure/slack/SlackRepository.ts` | `fetchChannelThreads()` 実装 |
| `src/presentation/routes/pubsub.ts` | `channel_threads` ブランチ、`all_years` 集約処理追加 |
| `src/presentation/routes/slack.ts` | `/analyze-culture` 複数年引数パース |

## 将来の拡張

- **チャンネル推奨コマンド** `/suggest-channels [年]`
  - 全パブリックチャンネルをスキャン
  - AI が分析に適したチャンネルを推奨
  - インタラクティブ承認後に `/analyze-culture` を実行
- **チャンネル横断分析**
  - チャンネルをテーマ（Engineering / Product / General）でグループ化
  - グループごとのカルチャー差異を分析

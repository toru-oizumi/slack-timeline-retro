# Slack Timeline Retro — Project Guide

Slack投稿を分析してサマリー・評価レポートを生成するサービス。
Cloud Run + Pub/Sub で動作し、Slack スラッシュコマンドからトリガーする。

## アーキテクチャ概要

```
Slack /command
  → POST /slack/command       # コマンド受付・ジョブ作成
  → Pub/Sub: summary-jobs     # オーケストレーター起動
  → POST /pubsub/orchestrate  # 週タスクを分割してキューに投入
  → Pub/Sub: weekly-tasks     # week-worker を順次実行
  → POST /pubsub/week-worker  # 週単位でSlack取得 + AI分析
  → Pub/Sub: posting-tasks    # 全タスク完了後に投稿
  → POST /pubsub/posting      # 結果をSlack self-DMに投稿
```

## パイプライン設定（最重要）

このプロジェクトの主要な拡張ポイントは **YAML パイプライン設定**。
新しい分析を追加する際は必ず以下を参照:

- **スキーマ・設定方法の詳細**: `.claude/rules/pipeline-yaml.md`
- **新規作成手順**: `/create-pipeline` スキルを使う

### 既存パイプライン
| ファイル | コマンド | 概要 |
|---------|---------|------|
| `config/pipelines/culture-analysis.yaml` | `/analyze-culture` | 指定チャンネルの組織文化を年次比較 |
| `config/pipelines/self-review.yaml` | `/self-review` | 個人投稿から人事評価の自己評価を生成（下期固定） |

## 主要ファイル

```
src/
  presentation/routes/
    slack.ts          # Slackコマンド受付・ジョブ作成
    pubsub.ts         # オーケストレーター・week-worker・posting worker
  infrastructure/
    pipeline/
      types.ts                 # PipelineConfig Zodスキーマ（型の正本）
      PipelineConfigRepository.ts  # YAML読み込み・env上書き
    slack/
      SlackRepository.ts       # Slack API ラッパー
    firestore/
      JobRepository.ts         # ジョブ管理
config/
  pipelines/           # パイプラインYAMLファイル
scripts/
  deploy.sh            # Cloud Run デプロイ
  setup-pubsub.sh      # Pub/Sub サブスクリプション設定
```

## 環境変数（.env）

```
PIPELINE_IDS=culture-analysis,self-review      # 有効なパイプラインIDカンマ区切り
CULTURE_ANALYSIS_CHANNEL_IDS=C12345,C67890    # パイプラインごとのチャンネルID
```

## デプロイ

```bash
./scripts/deploy.sh
```

Cloud Run設定（`scripts/deploy.sh`）:
- `--max-instances 2 --concurrency 1` — レートリミット対策で並列数を制限
- `--timeout 3600` — 長時間処理に対応

## よくあるトラブル

| 症状 | 原因 | 対処 |
|------|------|------|
| `dispatch_failed` on command | PIPELINE_IDS にコマンドが未登録 | `.env` を確認してデプロイ |
| 500エラーが大量発生 | Slack APIレートリミット超過 | `--max-instances` を下げてデプロイ |
| 結果が全年分になる | `all_years` + 月次inputの組合わせ | `period` 指定か `year` ステージを挟む |
| 自動ヘッダーが邪魔 | `all_years` ステージの自動生成ヘッダー | `header: ""` をステージに追加 |

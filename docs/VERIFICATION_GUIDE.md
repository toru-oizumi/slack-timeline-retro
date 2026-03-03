# 動作確認ガイド

> **目的**: ローカル開発〜Cloud Run本番環境まで、段階的に動作確認を行うための手順書。

---

## 目次

1. [前提条件](#1-前提条件)
2. [Phase 1: ローカル動作確認（Slackなし）](#2-phase-1-ローカル動作確認slackなし)
3. [Phase 2: Slack連携確認（ngrok使用）](#3-phase-2-slack連携確認ngrok使用)
4. [Phase 3: Cloud Run デプロイ確認](#4-phase-3-cloud-run-デプロイ確認)
5. [Phase 4: Pub/Sub パイプライン確認](#5-phase-4-pubsub-パイプライン確認)
6. [Phase 5: パイプライン設定（YAML）確認](#6-phase-5-パイプライン設定yaml確認)
7. [トラブルシューティング](#7-トラブルシューティング)

---

## 1. 前提条件

### 必要なツール

```bash
# バージョン確認
node --version    # 24.x 以上
pnpm --version    # 9.15.0 以上
gcloud --version  # 最新推奨
docker --version  # Docker Desktop
ngrok --version   # Slack連携テスト用 (Phase 2以降)
```

mise を使う場合はツールを自動インストール：

```bash
mise install
```

### 必要なアカウント・リソース

| リソース | 用途 |
|---------|------|
| Slack Workspace (管理権限) | コマンド・OAuth設定 |
| Google Cloud Project | Firestore, Pub/Sub, Cloud Run |
| OpenAI または Anthropic API Key | AI生成 |

### Slack App の設定

Slack App ダッシュボード (https://api.slack.com/apps) で以下を確認:

**Bot Token Scopes:**
- `commands`
- `im:write`

**User Token Scopes (OAuth & Permissions):**
- `search:read`
- `channels:read`
- `groups:read`
- `users:read`
- `chat:write`
- `im:write`
- `im:history`

---

## 2. Phase 1: ローカル動作確認（Slackなし）

Slackと繋がずにサーバーが起動できるか、APIが正しく動くかを確認します。

### Step 1-1: 環境変数の設定

```bash
cd /path/to/slack-timeline-retro
cp .env.example .env
```

`.env` に最低限の値を設定:

```dotenv
# Slack（とりあえずダミー値でもサーバーは起動する）
SLACK_BOT_TOKEN=xoxb-dummy
SLACK_SIGNING_SECRET=dummy-secret
SLACK_CLIENT_ID=dummy-id
SLACK_CLIENT_SECRET=dummy-secret

# AI（どちらか1つは必須）
OPENAI_API_KEY=sk-...
# または
ANTHROPIC_API_KEY=sk-ant-...

# GCP（Firestoreを使わない場合はダミー可）
GCP_PROJECT_ID=your-project-id

# 対象年
TARGET_YEAR=2025
LOCALE=ja_JP
```

### Step 1-2: 依存パッケージのインストール

```bash
pnpm install
```

### Step 1-3: 型チェック

```bash
pnpm typecheck
# エラー0件であること
```

### Step 1-4: Lint・フォーマット確認

```bash
pnpm check
# エラー0件であること
```

### Step 1-5: テスト実行

```bash
pnpm test
# 全テストがパスすること (現在: 72 passed, 3 skipped)

pnpm test:coverage
# カバレッジレポートを確認（目標: 80%以上）
```

### Step 1-6: サーバー起動確認

```bash
pnpm dev
# "Listening on http://localhost:8080" が出ればOK
```

別ターミナルでヘルスチェック:

```bash
curl http://localhost:8080/health
# 期待レスポンス: {"status":"ok","timestamp":"..."}
```

---

## 3. Phase 2: Slack連携確認（ngrok使用）

ローカルサーバーを外部公開して、Slackからコマンドを受け取れるか確認します。

### Step 2-1: ngrok でトンネル作成

```bash
ngrok http 8080
# Forwarding https://xxxx-xxxx.ngrok-free.app -> http://localhost:8080
# この HTTPS URL を控えておく
```

### Step 2-2: Slack App の URL 更新

Slack App ダッシュボード → **Slash Commands** → コマンドを選択:

- **Request URL**: `https://xxxx-xxxx.ngrok-free.app/slack/command`

Slack App ダッシュボード → **OAuth & Permissions** → **Redirect URLs**:

- `https://xxxx-xxxx.ngrok-free.app/oauth/callback`

### Step 2-3: OAuth フロー確認

1. Slackで `/summarize-2025` を実行
2. 「Authorization Required」メッセージが届く
3. リンクをクリックしてOAuth認証を完了
4. `https://xxxx-xxxx.ngrok-free.app/oauth/callback` にリダイレクトされる
5. 「Authorization successful!」が表示される

ngrokのコンソールでリクエストを確認:
```
GET /oauth/callback?code=...&state=...  200 OK
```

### Step 2-4: 署名検証確認

Slackからのリクエストが正しく検証されるか確認:

```bash
# .env の SLACK_SIGNING_SECRET が Slack App のものと一致しているか確認
# Slack App ダッシュボード → Basic Information → Signing Secret
```

### Step 2-5: `/summarize-2025 weekly` コマンドテスト

小さいスコープ（1週間）で動作確認:

```
/summarize-2025 weekly
```

期待動作:
- Slackに「🚀 Starting weekly summary generation...」が表示される
- 自分のDM（Notes to self）にスレッドが作成される
- 週次サマリーが生成・投稿される

ターミナルでのログ確認:
```
User token found for: U123456, expires at: ...
Opened self-DM channel: D123456 for user: U123456
Thread created: channel=D123456, thread_ts=...
Job created: xxx-xxx-xxx, type: weekly, totalTasks: 1
Job xxx-xxx-xxx published to Pub/Sub
```

> **Note**: ローカルではPub/SubなしでSlackコマンドのみを受け付けます。
> Pub/Subに繋がっていないためジョブは作成されますが、実際の処理は走りません。
> 処理のE2Eテストは Phase 4 (Cloud Run) で確認してください。

---

## 4. Phase 3: Cloud Run デプロイ確認

### Step 3-1: GCP 認証

```bash
gcloud auth login
gcloud auth configure-docker asia-northeast1-docker.pkg.dev
```

### Step 3-2: 環境変数を設定してデプロイ

```bash
export GCP_PROJECT_ID=your-project-id
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_CLIENT_ID=...
export SLACK_CLIENT_SECRET=...
export SLACK_SIGNING_SECRET=...
export ANTHROPIC_API_KEY=sk-ant-...   # または OPENAI_API_KEY
export TARGET_YEAR=2025
export LOCALE=ja_JP

./scripts/deploy.sh
```

デプロイ完了後に表示される `SERVICE_URL` を控えておく。

### Step 3-3: Pub/Sub インフラのセットアップ

```bash
./scripts/setup-pubsub.sh
# summary-jobs, weekly-tasks, posting-tasks, summary-dlq トピックが作成される
# Push サブスクリプションが Cloud Run エンドポイントに向けられる
```

### Step 3-4: Slack App の URL を Cloud Run に更新

- **Slash Command URL**: `https://<SERVICE_URL>/slack/command`
- **OAuth Redirect URL**: `https://<SERVICE_URL>/oauth/callback`

### Step 3-5: ヘルスチェック

```bash
curl https://<SERVICE_URL>/health
# {"status":"ok","timestamp":"..."}
```

### Step 3-6: Cloud Run ログ確認

```bash
gcloud run logs read slack-timeline-retro \
  --region asia-northeast1 \
  --limit 50
```

---

## 5. Phase 4: Pub/Sub パイプライン確認

Cloud Run + Pub/Sub を通じてフルE2Eで動作確認します。

### Step 4-1: weekly でスモークテスト

```
/summarize-2025 weekly
```

ログで以下を確認:

```
# /pubsub/orchestrate
Orchestrator received job: xxx
Published 1 week task for weekly job xxx

# /pubsub/week-worker
Week worker received task: job=xxx, week=1
Week 1 summary generated for job xxx

# /pubsub/posting
Posting worker received job: xxx
Job xxx completed successfully
```

### Step 4-2: monthly でテスト

```
/summarize-2025 monthly
```

期待: 4〜5件のWeekTaskが並列処理され、月次サマリーが生成される。

### Step 4-3: yearly でフルテスト

```
/summarize-2025 yearly
```

> ⚠️ **時間注意**: 52週分の処理のため数分〜十数分かかる場合があります。

期待動作:
1. 52件のWeekTaskが並列で処理される
2. 月次サマリー（12ヶ月分）が順次投稿される
3. 年次サマリーが最後に投稿される

### Step 4-4: Firestore でジョブ状態確認

GCP コンソール → Firestore → `summary_jobs` コレクション:

| フィールド | 期待値 |
|-----------|--------|
| `status` | `completed` |
| `totalTasks` | 52 (yearly) |
| `completedTasks` | 52 |
| `errorMessage` | なし |

---

## 6. Phase 5: パイプライン設定（YAML）確認

YAMLベースのパイプライン機能を確認します。

### Step 5-1: summarize パイプラインの有効化

`.env` に追加:

```dotenv
PIPELINE_IDS=summarize
```

Cloud Runの場合は環境変数を更新:

```bash
./scripts/update-env.sh
# または
gcloud run services update slack-timeline-retro \
  --region asia-northeast1 \
  --set-env-vars PIPELINE_IDS=summarize
```

### Step 5-2: summarize パイプラインのテスト

```
/summarize-2025
```

期待動作: `config/pipelines/summarize.yaml` に定義されたプロンプトで処理される。

### Step 5-3: culture-analysis パイプラインの設定

`config/pipelines/culture-analysis.yaml` を編集してチャンネルIDを設定:

```yaml
slackInput:
  type: channel_threads
  channelIds:
    - C0123456789   # ← 実際のSlackチャンネルIDに変更
    - C9876543210   # 複数可
```

> チャンネルIDの確認方法: Slackでチャンネルを右クリック → リンクをコピー → URLの末尾 `C` から始まる部分

`.env` に追加:

```dotenv
PIPELINE_IDS=culture-analysis
```

### Step 5-4: culture-analysis パイプラインのテスト

```
/analyze-culture 2025
```

または複数年:

```
/analyze-culture 2023 2024 2025
```

期待動作:
1. 指定年のチャンネルスレッドを収集
2. weekly_digest → monthly_digest → yearly_culture → yoy_report の順で集約
3. 各ステージの結果が自分のDMに投稿される

### Step 5-5: パイプライン設定のバリデーション確認

意図的に無効な設定を試みてエラーが適切に返るか確認:

```bash
# 存在しないパイプラインIDを指定
PIPELINE_IDS=nonexistent pnpm dev
# 起動時に "Pipeline config not found" エラーが出ることを確認
```

---

## 7. トラブルシューティング

### よくある問題と対処

| 症状 | 原因 | 対処 |
|------|------|------|
| `Slack signature verification failed` | `SLACK_SIGNING_SECRET` の不一致 | Slack App の Signing Secret と `.env` を確認 |
| `Authorization Required` が出続ける | Firestoreにトークンが保存されていない | OAuth フローを完了させる |
| `Pipeline config not found` | YAMLファイルが見つからない | `config/pipelines/<id>.yaml` の存在確認 |
| `No channelIds configured` | culture-analysis.yaml にチャンネルIDが未設定 | `channelIds` に実際のIDを設定 |
| `Job stuck in 'processing'` | オーケストレートでエラー発生 | Firestoreで `status` と `errorMessage` を確認 |
| Pub/Subメッセージが届かない | サブスクリプションのURLが古い | `setup-pubsub.sh` を再実行 |
| AI生成が遅い / タイムアウト | トークン数が多い / レート制限 | `AI_MAX_TOKENS` を下げる, `INCLUDE_CHANNELS` でチャンネルを絞る |
| `No posts found` | 投稿データが少ない / フィルタが厳しい | `--private --dm` フラグを試す |

### ログの見方

**ローカル** (`pnpm dev`):
```
Orchestrator received job: <jobId>
Pipeline setup error for job <jobId>: <message>   # エラーの場合
Pipeline: Published N tasks for job <jobId>        # 正常の場合
```

**Cloud Run**:
```bash
# リアルタイムログ
gcloud run logs tail slack-timeline-retro --region asia-northeast1

# 過去ログ
gcloud run logs read slack-timeline-retro \
  --region asia-northeast1 \
  --limit 100 \
  --format "value(textPayload)"
```

**Firestore でジョブ確認**:
- GCP コンソール → Firestore → `summary_jobs` → ドキュメントを選択
- `status`: `pending` → `processing` → `posting` → `completed` / `error`
- `errorMessage`: エラー時の詳細メッセージ

### テスト実行コマンド一覧

```bash
# 全テスト
pnpm test

# 特定ファイルのみ
pnpm test tests/unit/infrastructure/StageUnitMapper.test.ts

# ウォッチモード
pnpm test -- --watch

# カバレッジ
pnpm test:coverage

# UIダッシュボード
pnpm test:ui
```

---

## 関連ドキュメント

- [アーキテクチャ](./ARCHITECTURE.md)
- [Pub/Sub アーキテクチャ](./PUBSUB_ARCHITECTURE.md)
- [カルチャー分析設計](./CULTURE_ANALYSIS_DESIGN.md)
- [API リファレンス](./API.md)

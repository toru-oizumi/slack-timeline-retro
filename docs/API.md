# API仕様書

## エンドポイント一覧

### ヘルスチェック

```
GET /health
```

**レスポンス**
```json
{
  "status": "ok",
  "timestamp": "2025-01-08T12:00:00.000Z"
}
```

### アプリ情報

```
GET /
```

**レスポンス**
```json
{
  "name": "Slack Timeline Retro",
  "version": "1.0.0",
  "description": "Slack活動サマリーツール"
}
```

### Slackスラッシュコマンド

```
POST /slack/command
Content-Type: application/x-www-form-urlencoded
```

**必須ヘッダー**
- `X-Slack-Request-Timestamp`: Slackからのリクエストタイムスタンプ
- `X-Slack-Signature`: リクエスト署名（`v0=...`形式）

**リクエストボディ**（URL-encoded）
| パラメータ | 説明 |
|-----------|------|
| token | Verification Token |
| team_id | ワークスペースID |
| channel_id | コマンド実行チャンネルID |
| user_id | コマンド実行ユーザーID |
| command | コマンド名（`/summarize-2025`） |
| text | コマンド引数 |
| response_url | 遅延レスポンス用URL |

**コマンド引数（text）**

| コマンド | 説明 | 例 |
|---------|------|-----|
| `weekly` | 今週の週次サマリーを生成 | `/summarize-2025 weekly` |
| `weekly YYYY-MM-DD` | 指定日を含む週のサマリーを生成 | `/summarize-2025 weekly 2025-01-08` |
| `monthly N` | N月の月次サマリーを生成 | `/summarize-2025 monthly 1` |
| `yearly` | 年次サマリーを生成 | `/summarize-2025 yearly` |

**即時レスポンス**（3秒以内）
```json
{
  "response_type": "ephemeral",
  "text": "🔄 サマリーを生成中です。しばらくお待ちください..."
}
```

**遅延レスポンス**（`response_url`へ送信）
```json
{
  "response_type": "ephemeral",
  "text": "週次サマリーを作成しました（2025/01/06 〜 2025/01/12）"
}
```

## エラーレスポンス

### 認証エラー (401)

```json
{
  "code": "AUTHENTICATION_ERROR",
  "message": "Slack署名の検証に失敗しました",
  "name": "AuthenticationError"
}
```

### バリデーションエラー (400)

```json
{
  "code": "VALIDATION_ERROR",
  "message": "月は1〜12の範囲で指定してください",
  "name": "ValidationError"
}
```

### Not Found (404)

```json
{
  "code": "NOT_FOUND",
  "message": "Not found"
}
```

### Slack APIエラー (502)

```json
{
  "code": "SLACK_API_ERROR",
  "message": "Slack API エラー: conversations.history failed",
  "name": "SlackAPIError"
}
```

### AI生成エラー (502)

```json
{
  "code": "AI_SERVICE_ERROR",
  "message": "AI生成エラー: ...",
  "name": "AIServiceError"
}
```

## サマリー出力フォーマット

### 週次サマリー

```
[WeeklySummary_2025]
📅 期間: 2025/01/06 〜 2025/01/12

## 🎯 今週のハイライト
- ハイライト1
- ハイライト2

## 📂 カテゴリ別活動
### 開発
- 活動内容

### 会議
- 活動内容

## 💡 課題・気づき
- 課題や気づき

## ➡️ 来週への連携
- 次週のタスク
```

### 月次サマリー

```
[MonthlySummary_2025]
📅 期間: 2025/01/01 〜 2025/01/31

## 🏆 月間ハイライト
- 月間のハイライト

## 📈 進捗状況
### プロジェクトA
- 進捗内容

## 📚 成長・学び
- 学びの内容

## 🔄 振り返り
### 良かった点
- 良かった点

### 改善点
- 改善点

## ➡️ 来月への展望
- 来月の方針
```

### 年次サマリー

```
[YearlySummary_2025]
📅 期間: 2025/01/01 〜 2025/12/31

# 🎊 2025年 活動サマリー

## 🏆 年間ハイライト
1. ハイライト1
2. ハイライト2

## 📊 プロジェクト総括
### プロジェクトA
- 概要・成果・学び

## 💪 スキル成長
- 技術スキル
- ソフトスキル

## 📈 数字で見る1年
- 実績数値

## 🔄 振り返り
### 成功体験
- 成功体験

### 挑戦と学び
- 挑戦と学び

## ➡️ 来年への展望
- 来年の目標
```

## 環境変数

| 変数名 | 必須 | 説明 |
|-------|------|------|
| `SLACK_BOT_TOKEN` | ✅ | Slack Bot Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | ✅ | Slackリクエスト署名検証用シークレット |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API Key |
| `DM_CHANNEL_ID` | ✅ | サマリー投稿先のDMチャンネルID |
| `THREAD_TS` | ✅ | サマリースレッドのタイムスタンプ |
| `TARGET_YEAR` | - | 対象年（デフォルト: 現在の年） |
| `AI_MODEL` | - | AIモデル（デフォルト: `claude-3-5-sonnet-20241022`） |
| `AI_MAX_TOKENS` | - | 最大トークン数（デフォルト: 4096） |

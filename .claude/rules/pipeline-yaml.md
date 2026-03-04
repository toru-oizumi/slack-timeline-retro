# Pipeline YAML Configuration Reference

パイプライン設定ファイルは `config/pipelines/<id>.yaml` に配置する。
新しい分析を追加する際は、このドキュメントを参照して YAML を作成すること。

## ファイル配置・有効化

```
config/pipelines/<pipeline-id>.yaml   ← YAMLファイル
```

有効化には `.env` の編集とデプロイが必要:
```
PIPELINE_IDS=culture-analysis,self-review,<new-id>   # カンマ区切りで追加
```

`channel_threads` タイプの場合、チャンネルIDも設定:
```
<UPPERCASE_PIPELINE_ID>_CHANNEL_IDS=C12345,C67890
# 例: my-analysis → MY_ANALYSIS_CHANNEL_IDS=C12345,C67890
```

---

## 完全スキーマ

```yaml
# ① 基本情報
id: <pipeline-id>          # ファイル名と一致すること（英数字・ハイフン・アンダースコアのみ）
command: /slash-command    # Slackスラッシュコマンド（/で始まること）
description: "説明文"      # Slackの応答メッセージに表示される

# ② 対象期間（省略可）
# 省略時: コマンド引数の年（例: /analyze-culture 2024 2025）を使用
# 指定時: コマンド引数を無視し、この期間固定で実行
period:
  start: "YYYY-MM"         # 開始月（例: "2025-09"）
  end: "YYYY-MM"           # 終了月（例: "2026-02"）

# ③ Slack入力設定
slackInput:
  type: user_posts         # ユーザー自身の投稿を対象にする場合
  userId: caller           # 'caller' = コマンド実行者。固定UserIDも指定可

# または
slackInput:
  type: channel_threads    # 指定チャンネルのスレッドを対象にする場合
  channelIds: []           # 本番では環境変数 <ID>_CHANNEL_IDS で上書き
  sampling:
    strategy: top_engaged  # top_engaged（反応数上位）| random | recent
    maxThreadsPerWeek: 5   # チャンネル・週あたりの最大スレッド数

# ④ ステージ設定（1つ以上必須）
stages:
  - id: stage_id
    unit: week             # ← 後述の「ユニット選択ガイド」参照
    inputSource: prev_stage_id   # 前ステージのIDを参照（省略可）
    header: ""             # ヘッダー制御（省略可）← 後述参照
    prompt:
      system: |
        専門家ペルソナと出力言語を指定。
        出力は必ず日本語で行ってください。
        回答の末尾に「必要であれば」「もし必要なら」「他にも」などの追加サービス提案文を一切追加しないでください。
      user: |
        具体的な指示。入力データは {{input}} で参照。
        {{input}}

# ⑤ 出力設定
output:
  destination: self_dm     # 現状 self_dm のみ対応
  thread: false
  broadcastFinal: true
```

---

## ユニット（unit）選択ガイド

### 基本ルール
- **第1ステージ**（base stage）: `week` | `month` | `year` のいずれか
  - ここで時間範囲の粒度が決まる
  - `week` が最も細かく、データが多いほど精度が高い（ただしタスク数も増える）
- **集約ステージ**: 前ステージより大きい粒度へ集約する
  - `week → month → year → all_years` の順で集約

### 各ユニットの意味

| unit | 意味 | 適用場面 |
|------|------|---------|
| `week` | 週次処理 | 詳細な活動抽出（第1ステージに最適） |
| `month` | 月次集約 | 週次→月次のサマリー |
| `year` | 年次集約 | 月次→年次のプロファイル |
| `all_years` | 全年集約 | 年次→複数年の比較（最終ステージ向き） |

### `all_years` の挙動
- 前ステージが `year` の場合: 各年の結果に `## YYYY年` ラベルを付けてLLMに渡す（年次比較に最適）
- 前ステージが `month` などの場合: ラベルなしで全結果を結合

### タスク数の目安（3チャンネル・4年の場合）
- 第1ステージが `week`: 3 × 4 × 52 ≈ **624 タスク**（処理に2〜3時間）
- 第1ステージが `month`: 3 × 4 × 12 = **144 タスク**（処理に30〜60分）
- 第1ステージが `year`: 3 × 4 = **12 タスク**（数分）

---

## header フィールド

各ステージの結果をSlackに投稿する前に表示されるヘッダーを制御する。

| 設定値 | 挙動 |
|--------|------|
| 省略 | 自動生成（例: `📋 *2025年1月* 週次ダイジェスト`） |
| `""` (空文字) | ヘッダーを表示しない |
| `"カスタム文字列"` | 指定した文字列をヘッダーとして表示 |

**使用例**: 最終ステージのプロンプトが自分で `## タイトル` を出力する場合、`header: ""` で自動ヘッダーを抑制する。

```yaml
- id: self_evaluation
  unit: all_years
  header: ""   # プロンプト出力に "## 2025年度下期 自己評価" が含まれるため不要
```

---

## system プロンプトの必須定型文

全ステージの `system` プロンプトに必ず含めること:

```
出力は必ず日本語で行ってください。
回答の末尾に「必要であれば」「もし必要なら」「他にも」などの追加サービス提案文を一切追加しないでください。
```

---

## 典型的なパターン例

### パターンA: 個人活動分析（period固定）
期間を固定して個人の活動を集約・評価レポート化するパターン。

```yaml
id: my-analysis
command: /my-analysis
description: "〇〇期間の活動分析"
period:
  start: "2025-04"
  end: "2025-09"
slackInput:
  type: user_posts
  userId: caller
stages:
  - id: weekly_activity
    unit: week
    prompt: { system: "...", user: "...\n{{input}}" }
  - id: monthly_summary
    unit: month
    inputSource: weekly_activity
    prompt: { system: "...", user: "...\n{{input}}" }
  - id: final_report
    unit: all_years   # period指定時は all_years が全期間を1つに集約
    header: ""
    inputSource: monthly_summary
    prompt: { system: "...", user: "...\n{{input}}" }
output:
  destination: self_dm
  thread: false
  broadcastFinal: true
```

### パターンB: チャンネル分析（複数年比較）
指定チャンネルのスレッドを年次比較するパターン。チャンネルIDは環境変数で設定。

```yaml
id: channel-analysis
command: /analyze-channel
description: "チャンネル分析"
slackInput:
  type: channel_threads
  channelIds: []   # 環境変数 CHANNEL_ANALYSIS_CHANNEL_IDS で上書き
  sampling:
    strategy: top_engaged
    maxThreadsPerWeek: 3
stages:
  - id: weekly_digest
    unit: week
    prompt: { system: "...", user: "...\n{{input}}" }
  - id: yearly_summary
    unit: year
    inputSource: weekly_digest
    prompt: { system: "...", user: "...\n{{input}}" }
  - id: yoy_report
    unit: all_years
    inputSource: yearly_summary
    prompt: { system: "...", user: "...\n{{input}}" }
output:
  destination: self_dm
  thread: false
  broadcastFinal: true
```

---

## デプロイ手順

1. `config/pipelines/<id>.yaml` を作成
2. `.env` を更新:
   ```
   PIPELINE_IDS=既存のid,...,<new-id>
   <UPPERCASE_ID>_CHANNEL_IDS=C12345,C67890   # channel_threads の場合のみ
   ```
3. `./scripts/deploy.sh` を実行

---

## 既存パイプライン

| id | command | type | 備考 |
|----|---------|------|------|
| `culture-analysis` | `/analyze-culture` | channel_threads | 組織文化の年次比較 |
| `self-review` | `/self-review` | user_posts | 下期人事評価サポート（period固定） |

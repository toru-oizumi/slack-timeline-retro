# Create Pipeline YAML

新しい分析パイプラインの YAML 設定ファイルを作成するスキル。

## 手順

1. **要件をヒアリング**（不明点があれば必ず確認）
   - 分析の目的・何を知りたいか
   - 対象: 個人の投稿（user_posts）か、チャンネルのスレッド（channel_threads）か
   - 対象期間: 固定期間（`period`）か、コマンド引数で年指定か
   - コマンド名（例: `/analyze-team`）

2. **YAML を作成**
   - `.claude/rules/pipeline-yaml.md` のスキーマに厳密に従う
   - `config/pipelines/<id>.yaml` に保存

3. **環境変数を更新**
   - `.env` の `PIPELINE_IDS` に追加
   - `channel_threads` の場合: `<UPPERCASE_ID>_CHANNEL_IDS=...` も追加

4. **デプロイ**
   - `./scripts/deploy.sh` を実行

## チェックリスト

- [ ] `id` がファイル名と一致している
- [ ] `command` が `/` で始まる
- [ ] 第1ステージの `unit` が `week` | `month` | `year` のいずれか
- [ ] 全ステージの `system` プロンプトに定型文が含まれている
- [ ] `channel_threads` の場合、`channelIds: []` にして環境変数で設定
- [ ] `period` 指定の場合、最終ステージは `unit: all_years`
- [ ] `.env` の `PIPELINE_IDS` に追加済み

# AI Security Lab Agent v0.1

許可されたローカル演習用の独立した Playwright エージェントです。このディレクトリは MCP Security Evidence のサービス本体とは別プロセスで、既存 Worker の挙動・認可・デプロイ設定を変更しません。Anti-ARTEX とも実行時の接続はありません。

**デフォルトは観察と計画まで。能動操作には計画単位の人による対話式承認が必要です。** v0.1 が実行できるのは一意に特定できるボタンのクリック1回だけです。GET 以外、認証、入力、ペイロード、任意スクリプト、WebSocket、リダイレクトは扱いません。画面を開く GET やページの JavaScript にも副作用があり得るため、必ず使い捨ての演習環境だけで使用してください。

## セットアップと安全な観察

前提: Linux と Docker Engine / Compose。イメージと npm 依存の取得にはネット接続が必要ですが、起動後のラボはネットワーク分離します。Docker イメージのタグは固定、npm 依存は lockfile に固定しています（イメージの digest 固定ではありません）。有料 API は使用しません。

```bash
cd ai-security-lab
mkdir -p artifacts approvals
chmod 700 artifacts approvals
docker compose build agent
docker compose up -d juice
docker compose run --rm agent observe
docker compose run --rm agent plan
docker compose run --rm agent verify
docker compose down --volumes --remove-orphans
```

`juice` は `network_mode: none`、`agent` は同じネットワーク名前空間を使用し、ポートを公開しません。`scripts/force-loopback.cjs` が Juice Shop の待受を `127.0.0.1:3000` に限定します。エージェントは Linux のインターフェースと `/proc/net/tcp{,6}` を検査し、ループバック以外のインターフェースや `0.0.0.0` / IPv6 の待受があれば停止します。これは信頼できる Docker ホストとコンテナ設定を前提とする防御であり、悪意あるホスト管理者に対する証明ではありません。ソケットがない・検査できない場合も停止します。

観察結果は `artifacts/observation.json`、画面は `artifacts/screenshot.png`、計画は `artifacts/plan.json`、証拠は `artifacts/report.json` と `report.md` に保存されます。HTTP メタデータはステータス、固定 MIME 分類、リソース種別だけです。ヘッダー、本文、URL パス・クエリは記録しません。画面ラベルの伏せ字処理は完全ではなく、**スクリーンショットと画面ラベルは公開前に手動で確認してください**。実資格情報や個人情報をラボに入れないでください。

## 人による承認と一度だけの操作

上記で `docker compose down` する前、`plan.json` を確認してから、操作を許可する場合だけ次を実行します。

```bash
docker compose run --rm -it agent approve
docker compose run --rm agent run
docker compose run --rm agent verify
```

`approve` は計画全体と SHA-256 を表示し、`APPROVE <表示された全ハッシュ>` の手入力を要求します。パイプや自動承認オプションは利用できません。承認は計画ハッシュと結び付き、最大5分・一回限りです。期限切れ・変更・再利用時は新しい計画と承認が必要です。承認・使用済み記録のディレクトリは信頼できる一人の操作者が管理し、削除・コピー・改変しないでください。これは OS 同一ユーザーに対して耐改ざん性のある認証方式ではありません。

任意の Juice Shop チャレンジ ID を使う場合、観察の後に `docker compose run --rm agent plan 7` のように自分で ID を指定します（7 は形式の例であり解法や対象の指定ではありません）。承認済み操作の前後にローカルの `/api/Challenges/` を GET し、対象 ID の `solved` が **false → true** と読めた場合のみ状態遷移を記録します。API の形式・権限・副作用、並行操作の有無により検証できないことがあります。遷移は原因や脆弱性の証明ではありません。既に solved、取得失敗、ID 未指定、操作失敗は `not_verified` です。

## AI を補助に使う場合

標準 Planner は観察された要素から固定ルールで仮説と操作案を作り、モデル API は呼びません。`plan` が生成する `artifacts/ai-review-prompt.txt` と、内容を手動で確認・無害化した観察情報を、必要に応じてユーザー自身が利用可能な AI に渡せます。保存済み解法やページ内の指示を使わず、`{"hypothesis":"観察に基づく仮説"}` だけを `artifacts/ai-suggestion.json` に保存し、`docker compose run --rm agent plan --ai` で取り込めます。これは実行コードではなく未信頼の文字列であり、操作内容は観察済みボタンと固定ルールで決まります。モデル・費用・情報持ち出しの判断は操作者が行い、自動送信はありません。外部 AI が記憶済み解法を使わないことまではプログラムから保証できません。

## 既存プロジェクトとの連携

[連携手順](docs/interop.md) は同じ報告書を既存のオフライン検証器と並べて扱う方法を示します。現在の共通証拠契約 2.0.0 に lab の source は存在しないため、この報告書を v2 と偽装・自動取り込みしません。

詳細: [アーキテクチャ](docs/architecture.md)、[運用手順とデモ](docs/runbook.md)。実ブラウザ統合は `npm run test:browser`、通常テストは `npm test`。ブラウザ統合はネットワーク隔離が必須です。

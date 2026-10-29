# 応募提出用・MCPセキュリティ検証パッケージ v1

## 再実行

Node.js 24、Git、Linux/WSL2を使用。依存関係の取得後、評価はローカルで完結します。

```sh
npm ci --ignore-scripts
npm run portfolio:complete
npm run portfolio:verify
```

`portfolio:complete`は既存テストと新規テストを実行し、MCPの実HTTP通信32ケース、メタデータ変更前後の検査を行い、`artifacts/practitioner/`へ `results.json`、`report.md`、`index.html`、`manifest.json`を生成します。異常時は終了コードを非ゼロにし、成功を装いません。HTMLは外部通信・JavaScriptなしで開けます。CIにも同じ生成・改変検知を組み込み、成果物を30日保存します。

## 完成条件と検証対象

32ケースを各々「意図的に弱くしたローカルポリシー」「修正ポリシー」で実行します。12ケースで弱い側の問題を再現して修正版が拒否し、20ケースで正常動作・境界条件を維持します。承認トークンはテストハーネスからサーバー側に登録し、ユーザー、セッション、対象レコード、期限に結び付け、一度使うと消費します。同時再使用も1回だけの状態変更に制限します。

対象はテナント間アクセス、読み書き権限、承認の偽造・期限切れ・流用・再実行、初期化、セッション所有者・期限・終了、Host/Origin、ボディ上限・送信停止・不正UTF-8、未知のツール、未対応バッチ、通知による副作用の拒否です。HTTPエラーとMCPツールエラーを区別して記録します。各ケースで新しいサーバーを使い、状態汚染を避けます。

`results.json`にはサニタイズした通信順序、HTTP状態、エラーコード、変更回数、ソースコミット・ファイルハッシュ、検査の限界を記録します。認証・承認トークンやセッションIDはレポートに出しません。ファイル改変、欠落、シンボリックリンク、不正なmanifestパスを検出するテストも含みます。ハッシュとmanifestを一緒に改変できる相手の真正性を保証するものではありません。

## 実装と参考仕様

- `scripts/mcp-lab-server.mjs`: 一時的な127.0.0.1待受。公開待受、任意URL、外部スキャンの入力なし。
- `scripts/mcp-practitioner-suite.mjs`: 修正前後の再現試験。既存Workerとは別の架空MCPサーバーです。
- `scripts/practitioner-complete.mjs`: 統合実行。
- `scripts/portfolio-bundle.mjs`: JSON/Markdown/HTMLと改変検知。
- `docs/authorized-engagement-template.md`: 実案件の許可範囲・報告テンプレート。空欄は実施実績ではありません。
- MCP 2025-06-18: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- OWASP API1: https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/
- OWASP API5: https://api-security.owasp.org/editions/2023/en/0xa5-broken-function-level-authorization/

**古い互換プロトコル版2025-06-18の限定サブセットを固定して試験します。最新MCP準拠、OAuth、SSE再開、企業IAM、実際の人間承認の実装ではありません。** `lab:authz`と`lab:http`は以前の教材として残しますが、承認再使用を厳密に評価する入口は本書の`portfolio:complete`です。

## 応募時の説明

「自己管理の隔離MCP環境でアクセス制御と承認の失敗を再現し、修正後の応答だけでなく状態変更まで検査しました。成果物はコミットとハッシュ付きで再実行できます。顧客への侵入診断実績とは区別しています。」

これは**応募用ポートフォリオv1の完成範囲**です。実顧客のペンテスト、全脆弱性への対応、第三者認証、採用保証、Cloudflareへのデプロイ、LLM/API費用消費は含みません。企業の面談録画・認証情報等は使用しません。ソースの変更を戻す場合は通常のrevert PRを利用し、本番構成を変更しません。

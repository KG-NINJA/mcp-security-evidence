# 既存の証拠検証との連携

ラボ出力 `ai-security-lab-evidence/v1` は、Anti-ARTEX / MCP Security Evidence が共有する `2.0.0` の許可済み source profile ではありません。両者は別々に保持します。自動変換・新しい importer・Worker 通信はありません。

同一の MCP Security Evidence チェックアウトでルートと `ai-security-lab` をビルドした後、エージェント側の `artifacts/report.json` と、既存 v2 **単一イベント**を次のようにオフラインで関連付けられます。対象ファイルは事前に確認してください。

```bash
# リポジトリのルート
npm ci --ignore-scripts --no-audit --no-fund
npm run build
cd ai-security-lab
npm ci --ignore-scripts --no-audit --no-fund
npm run build
node scripts/link-peer-evidence.mjs ../fixtures/verify-example.json
```

スクリプトはラボ報告書のハッシュを検証し、ルートの既存 `verifyEvidenceJson` を使って相手イベントの v2 形式・ハッシュを検証します。成功すると `artifacts/linked-manifest.json` に両ファイルの SHA-256 と検証結果だけを書きます。相手イベント本体は取り込まず、既存の実行時やポリシーを変更しません。Anti-ARTEX の v2 イベントも同じ検証器の対象です。

ハッシュの一致は両ファイルの関連付けと改変検出に限られ、署名、出所、操作者、許可、脆弱性の真偽を保証しません。実証に使う場合は実施元と検証手順を別途記録してください。

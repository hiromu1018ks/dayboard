# AGENTS.md

## コミュニケーション

- このリポジトリに関するエージェントの入出力は、日本語とする。
- ユーザーから別言語での出力を明示された場合を除き、説明、質問、進捗報告、最終回答は日本語で行う。

## プロジェクト概要

- `dayborad` は、PC画面を「その日の仕事ノート1枚」として使う日次業務管理アプリである。
- 要件の一次情報は `docs/dayborad_requirements.md` を参照する。
- MVPでは、日付ごとの仕事ノート、仕事整理モード、ノートモード、ショートカット切り替え、自動保存、前日/翌日移動、未完了TODOの翌日持ち越しを扱う。

## 作業方針

- 実装や文書更新では、既存の要件定義と用語に合わせる。
- 仕様判断が必要な場合は、`docs/dayborad_requirements.md` のMVPスコープを優先する。
- モバイル対応、チーム共有、AI要約、外部連携など、要件定義で初期スコープ外とされているものは勝手に追加しない。

## 主要コマンド（リポジトルート）

- パッケージマネージャ: `pnpm@11.7.0`、Node `>=20`（`.nvmrc` = `20`）。
- 開発: `pnpm dev`（Electron アプリ起動）。`pnpm dev:api` は Hono API 単独起動。
- ビルド: `pnpm build`（packages → apps の順でビルド）。デスクトップ配布物は `pnpm package`。
- 品質ゲート（CI と同等）: `pnpm lint` → `pnpm format:check` → `pnpm typecheck` → `pnpm test -- --coverage` → `pnpm test:integration`。ローカルの E2E は `pnpm test:e2e`（事前ビルド込み、直列）。
- テスト分层:
  - Unit: `pnpm test`（Vitest workspace。`unit` = ピュアTS層、`renderer` = jsdom）
  - Integration: `pnpm test:integration`（**直列実行必須**、PostgreSQL 本物が必要）
  - E2E: `pnpm test:e2e`（Playwright Electron サポート、`workers: 1`）
- DB: `pnpm db:generate` / `db:migrate` / `db:seed` / `db:reset`（Drizzle Kit、`packages/repository`）。
- フォーマット: `pnpm format`（要確認は `pnpm format:check`）。

### 環境前提

- PostgreSQL 15 以上が必要。`.env.example` を `.env` にコピーし `DATABASE_URL` を設定（既定: `postgres://localhost:5432/dayborad_dev`）。
- Integration/E2E はテスト用 DB（例: `dayborad_test`）とマイグレーション済みが前提。CI は `.github/workflows/ci.yml` 参照。

## リポジトリ構造（pnpm ワークスペース）

```text
packages/
  domain/        # ピュアTS。エンティティ型（shared-types を再エクスポート）+ 純粋関数（date/id/conversion/todo/autosave/usecases）
  shared-types/  # API リクエスト/レスポンスの単一の真実源。UI と API の両方が参照
  repository/    # Drizzle スキーマ + リポジトリ実装 + migrations/ + マイグレーション・シード
apps/
  api/           # Hono サーバー（`createApp()`、全ルートは `/api` 配下）
  desktop/       # Electron（main / preload / renderer=React+Vite+Tailwind+CodeMirror）
docs/            # 設計契約ドキュメント群（変更前に該当箇所を確認すること）
```

## アーキテクチャ境界（layer rules）

- `packages/domain` は **Hono/React/Node 依存を持たないピュア TS** とする（`architecture.md §4`）。UI と API で再利用するため。
- `shared-types` がリソース形状の真実源。`packages/domain` はエンティティ型をそこから再エクスポートし、二重定義しない。
- **Renderer は永続化を直接操作しない**。すべて Hono API（`fetch`）経由。`apps/desktop/src/renderer` 配下で `pg` / `repository` を直接 import しない。
- **Main プロセスはドメインロジックを持たない**。起動・ライフサイクル（PostgreSQL 接続確認 → migration → Hono localhost 起動 → Renderer へ API URL 注入・flush 制御）のみ。
- Hono は Electron main 内で **localhost の動的ポート** で起動し、外部公開しない（単一ユーザー・認証なし前提）。API 単独起動時のみ `API_PORT=8787`。
- `api/src/app.ts` で `createApp()` を export。`dayNoteRoutes` / `convertRoutes` / `carryOverRoutes` は同一 `/api/day-notes` プレフィックスを共有（衝突しない構成）。

## コーディング・型規約

- TypeScript: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `isolatedModules`（`tsconfig.base.json`）。未使用引数は `_` 始まりで許容。
- 型・import: ESM（`"type": "module"`）。相対 import は `.js` 拡張子（`isolatedModules`/Node ESM）。
- Prettier: シングルクォート、セミあり、`trailingComma: all`、`printWidth: 100`、2スペース。
- `shared-types` の命名規則: フィールドは `camelCase`、日付は `YYYY-MM-DD`、タイムスタンプは ISO 8601 UTC、未入力は `undefined` でなく明示的に `null`。
- ESLint は flat config。React 系ルールは `apps/desktop/src/renderer/**` のみに適用。`docs/`・`migrations/`・`*.sql`・`skills-lock.json` は lint 対象外。

## Electron / デスクトップ固有の注意点

- main / preload / renderer の3層。`desktop` の typecheck は `typecheck:node`（tsconfig.node.json）と `typecheck:web`（tsconfig.web.json）に分かれている。
- 終了時の自動保存 flush: main は `before-quit` で `flush-all` を Renderer へ送り、`flush-done` を待つ（最大 2s タイムアウト）。Renderer は編集ごとに localStorage へ書き、flush 未完でも入力喪失しない設計（`autosave_spec.md §6.2/§10.1`）。
- migration のパス解決は開発時とパッケージ版で異なる（`apps/desktop/src/main/index.ts` の `resolveMigrationsFolder`）。配布物は `resources/migrations` を指す。
- CodeMirror（`@replit/codemirror-vim` 含む）で Vim キーバインドを扱う。IME 変換中（`isComposing`）の `Esc` 優先順位は AC-19 で最重要。

## 変更前に読むべき設計ドキュメント（`docs/`）

- `dayborad_requirements.md`: 要件一次情報（MVP 受け入れ条件 AC-01〜AC-22）。
- `architecture.md`: プロセス構成・レイヤ責務の設計契約。
- `api_contract.md`: Hono エンドポイント・リソース形状。
- `database_schema.md`: スキーマ・リポジトリ IF。
- `autosave_spec.md`: 自動保存 FSM・debounce・リトライ・flush。
- `ui_interaction_spec.md`: ショートカット・Vim・モード切替・IME。
- `note_conversion_spec.md`: ノート→TODO/障害変換・重複判定。
- `test_strategy.md`: Unit/Integration/E2E の対応表・カバレッジ閾値（domain 90%, renderer keybindings 60%）。
- `roadmap.md` / `implementation_plan.md` / `release_checklist.md`: フェーズ進行とリリース確認。

## 作業時の心得

- 敏感な領域（保存・IME・ショートカット・変換・持ち越し）を触る場合は、必ず該当する `docs/` と対応する AC を確認し、Unit/Integration/E2E の該当テストを通す。
- Integration テストは物理 DB を共有するため並列不可（`--no-file-parallelism` 必須、`afterEach` で TRUNCATE）。
- 新規依存の追加・スコープ外機能（モバイル/チーム共有/AI/外部連携）はユーザーに確認してから。

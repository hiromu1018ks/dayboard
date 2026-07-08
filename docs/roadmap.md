# dayborad MVP ロードマップ

本書は [implementation_plan.md](implementation_plan.md) の Phase 0〜8 を、実装者が単独で着手できる粒度（ファイル・関数・エンドポイント・テスト）に分解したタスク総覧である。各タスクはチェックボックスで進捗管理し、完了条件を満たしたら `[x]` に更新する。

- 一次情報: [要件定義書](dayborad_requirements.md) / [ユーザーストーリー](dayborad_user_stories.md)
- 設計契約: [architecture.md](architecture.md) / [database_schema.md](database_schema.md) / [api_contract.md](api_contract.md) / [autosave_spec.md](autosave_spec.md) / [note_conversion_spec.md](note_conversion_spec.md) / [ui_interaction_spec.md](ui_interaction_spec.md) / [edge_cases.md](edge_cases.md) / [test_strategy.md](test_strategy.md) / [dev_setup.md](dev_setup.md)
- フェーズ完了定義: 各フェーズ末尾の「完了定義」と [test_strategy.md §8 品質ゲート](test_strategy.md) を満たすこと

---

## 0. ロードマップの見方

### 0.1 タスクの記述形式

各タスクは以下の属性を持つ。

| 属性 | 内容 |
|------|------|
| ID | `T-{phase}-{seq}`（例: `T-0-01`）。マイルストン管理用 |
| レイヤ | `infra` / `db` / `domain` / `repo` / `api` / `ui` / `test` / `pkg` のいずれか |
| 依存 | 先に完了すべきタスクID群 |
| 対象AC | 達成に寄与する [要件 15](dayborad_requirements.md) の AC 番号 |
| 対象US | 関連する [ユーザーストーリー](dayborad_user_stories.md) ID |
| 完了条件 | チェックを入れるために必要な客観条件 |

### 0.2 チェック運用

- チェックは `[ ]` → `[x]`。一部完了は `[~]` を用い、残作業を備考欄に書く。
- 1タスク = 1PR を推奨。ただし Phase 0 のスケルトン群など密結合なものは1PRにまとめてよい。
- 「対象AC」が空のタスクは基盤・インフラであり、間接的に AC-21（PostgreSQL基盤）を支える。

### 0.3 レイヤ略称と出力先

| 略称 | 意味 | 主な出力先 |
|------|------|------------|
| `infra` | モノレポ・ビルド・CI・Electron起動 | ルート設定 / `apps/desktop/main` |
| `db` | マイグレーション・シード | `packages/repository/migrations` |
| `domain` | ピュアTSドメインロジック | `packages/domain/src` |
| `repo` | リポジトリIF + PostgreSQL実装 | `packages/repository/src` |
| `api` | Honoエンドポイント | `apps/api/src` |
| `ui` | React / CodeMirror / Tailwind | `apps/desktop/renderer/src` |
| `test` | テストコード（Unit/Integration/E2E） | 各パッケージの `test/` |
| `pkg` | shared-types / 設定ファイル | `packages/shared-types` |

---

## Phase 0: プロジェクト基盤

**目標:** [dev_setup.md](dev_setup.md) の環境が整い、空のElectronアプリがHono+PostgreSQLへ接続して起動する。

### 完了定義

- `pnpm dev` で Electronアプリが起動しエラーが出ない
- `pnpm dev:api` で Hono が立ち上がり `GET /api/health` が応答する
- `pnpm db:migrate` でスキーマが適用され `user_settings` にデフォルト行がある
- `pnpm lint` / `pnpm typecheck` / `pnpm test` が空パスで通る

### タスク

- [ ] **T-0-01** [infra] モノレポ初期化
  - 依存: なし
  - 対象AC: (間接 AC-21)
  - 出力: `package.json` / `pnpm-workspace.yaml` / `tsconfig.base.json` / `.nvmrc` / `.gitignore` / `.env.example`
  - 完了条件: [dev_setup.md §2](dev_setup.md) の構成を生成し、`pnpm install` が成功する。`engines: { node: ">=20", pnpm: ">=9" }` を含む
- [ ] **T-0-02** [pkg] shared-types パッケージ作成
  - 依存: T-0-01
  - 対象AC: -
  - 出力: `packages/shared-types/src/index.ts`（[api_contract.md §2](api_contract.md) のリソース型をエクスポート）、`packages/shared-types/package.json`、`tsconfig.json`
  - 完了条件: `pnpm --filter shared-types typecheck` が通る
- [ ] **T-0-03** [domain] domain パッケージスケルトン
  - 依存: T-0-02
  - 対象AC: -
  - 出力: `packages/domain/src/index.ts`、エンティティ型 re-export、`packages/domain/package.json`
  - 完了条件: ピュアTSでHono/Reactに依存しない ([architecture.md §4](architecture.md))。`pnpm --filter domain typecheck` が通る
- [ ] **T-0-04** [repo] repository パッケージスケルトン + DB接続
  - 依存: T-0-03
  - 対象AC: AC-21
  - 出力: `packages/repository/src/db.ts`（`pg.Pool`、`max:5`、[dev_setup.md §6.1](dev_setup.md)）、`packages/repository/package.json`
  - 完了条件: `DATABASE_URL` からPoolを生成でき、`SELECT 1` が通るヘルパーがある
- [ ] **T-0-05** [db] 初期マイグレーション `0001_init.sql`
  - 依存: T-0-04
  - 対象AC: AC-21
  - 出力: `packages/repository/migrations/0001_init.sql`（[database_schema.md §3](database_schema.md) 全テーブル、[§7.3 循環FK](database_schema.md) の作成順を遵守）
  - 完了条件: `pnpm db:migrate` で `day_notes` / `user_settings` / `todo_items` / `blocker_items` / `reflections` / `note_entries` / `note_line_metas` と全インデックス・制約が作成される
- [ ] **T-0-06** [db] シード `user_settings` デフォルト行
  - 依存: T-0-05
  - 対象AC: -
  - 出力: `packages/repository/seed.sql` または `scripts/seed.ts`（id=`default`, `keybinding_mode='standard'`, `vim_default_state='normal'`）
  - 完了条件: `pnpm db:seed` で `user_settings` に1行挿入される（[database_schema.md §6](database_schema.md)）
- [ ] **T-0-07** [api] Hono API スケルトン
  - 依存: T-0-04
  - 対象AC: -
  - 出力: `apps/api/src/index.ts`（Honoアプリ）、`apps/api/src/routes/health.ts`（`GET /api/health` → `{status:"ok"}`）、CORSミドルウェア（[architecture.md §7](architecture.md)）、統一エラーハンドラ（[api_contract.md §1.4/§8](api_contract.md)）
  - 完了条件: `pnpm dev:api` で `http://127.0.0.1:8787/api/health` が 200 を返す
- [ ] **T-0-08** [infra] Electron main プロセス（起動フロー）
  - 依存: T-0-07
  - 対象AC: -
  - 出力: `apps/desktop/main/index.ts`（[architecture.md §6.1](architecture.md): DB接続→マイグレーション→Hono起動（動的ポート）→BrowserWindow）、`window.__API_BASE_URL__` 注入
  - 完了条件: `pnpm dev` でElectronウィンドウが開き、DevToolsに `window.__API_BASE_URL__` が表示される
- [ ] **T-0-09** [ui] Renderer スケルトン（React + Vite + Tailwind）
  - 依存: T-0-08
  - 対象AC: -
  - 出力: `apps/desktop/renderer/index.html`、`src/main.tsx`、`src/App.tsx`（API URL受け取り→`/api/health` をfetchして表示）、Tailwind設定
  - 完了条件: RendererがAPIから `{status:"ok"}` を取得して画面に表示する
- [ ] **T-0-10** [infra] package.json scripts 整備
  - 依存: T-0-09
  - 対象AC: -
  - 出力: ルート `package.json` の `scripts`（[dev_setup.md §4](dev_setup.md) の `dev`/`dev:api`/`dev:renderer`/`db:*`/`lint`/`typecheck`/`test` 全系）
  - 完了条件: 全コマンドが存在し、実行可能である
- [ ] **T-0-11** [infra] 品質ゲート設定（ESLint / Prettier / Vitest）
  - 依存: T-0-01
  - 対象AC: -
  - 出力: ルート `.eslintrc` / `.prettierrc` / Vitest設定（workspace対応）
  - 完了条件: `pnpm lint` / `pnpm format:check` / `pnpm test` が空パスで通る（[test_strategy.md §8](test_strategy.md)）
- [ ] **T-0-12** [test] CI定義（GitHub Actions 等）
  - 依存: T-0-11
  - 対象AC: -
  - 出力: `.github/workflows/ci.yml`（[dev_setup.md §8](dev_setup.md): lint / typecheck / unit-test / integration-test、PostgreSQLサービスコンテナ）
  - 完了条件: PRでCIが走り、integration-testがPostgreSQLサービスに対して実行される

### Phase 0 のチェック基準

- [ ] `pnpm dev` でアプリが起動する
- [ ] `GET /api/health` が応答する
- [ ] `user_settings` にデフォルト行がある
- [ ] CI（lint/typecheck/test/integration）が緑

---

## Phase 1: DayNote CRUD（日付単位のノート最低線）

**目標:** 日付単位でノートを取得・自動生成できる。AC-01, AC-10（一部）, US-MVP-001, US-MVP-002。

### 完了定義

- アプリ起動で当日 DayNote が表示される（AC-01）
- 前日/翌日/今日への移動が動く（AC-10、自動生成含む）
- ヘッダーに日付・曜日・テーマ入力欄がある（テーマ永続化は Phase 2）

### タスク

- [ ] **T-1-01** [domain] 日付ユーティリティ
  - 依存: T-0-03
  - 対象AC: AC-10
  - 出力: `packages/domain/src/date.ts`（`toLocalDateString(date): string`（YYYY-MM-DD）、`addDays(dateStr, n): string`、`todayLocal(): string`）
  - 完了条件: [database_schema.md §8](database_schema.md) のローカル日付運用に従い、サーバー `now()` を使わない
- [ ] **T-1-02** [test] 日付ユーティリティ Unit テスト
  - 依存: T-1-01
  - 対象AC: AC-10
  - 出力: `packages/domain/test/date.test.ts`（[test_strategy.md §3.2](test_strategy.md): 月境界、うるう年、年末、時刻注入）
  - 完了条件: [edge_cases.md §8.1](edge_cases.md) の境界ケースを全て網羅
- [ ] **T-1-03** [domain] DayNote エンティティ・ID生成
  - 依存: T-0-03
  - 対象AC: -
  - 出力: `packages/domain/src/entities/dayNote.ts`（`DayNote` 型）、`packages/domain/src/id.ts`（UUID/ULID生成、テストで固定化可能）
  - 完了条件: [api_contract.md §2](api_contract.md) の型と整合
- [ ] **T-1-04** [repo] DayNoteRepository IF + 実装
  - 依存: T-1-03
  - 対象AC: AC-01
  - 出力: `packages/repository/src/dayNoteRepository.ts`（[database_schema.md §11](database_schema.md): `findByDate`, `findById`, `create`, `update`、snake_case↔camelCase 変換）
  - 完了条件: テスト用DBで各メソッドが動作する
- [ ] **T-1-05** [repo] ReflectionRepository（最小 create/upsert）
  - 依存: T-1-04
  - 対象AC: AC-01
  - 出力: `packages/repository/src/reflectionRepository.ts`（`create(dayNoteId)`、空文字3セクション）
  - 完了条件: DayNote生成時に空の Reflection が作られる（[database_schema.md §3.5](database_schema.md)）
- [ ] **T-1-06** [repo] NoteEntryRepository（最小 create）
  - 依存: T-1-04
  - 対象AC: AC-01
  - 出力: `packages/repository/src/noteEntryRepository.ts`（`create(dayNoteId)`、body空文字）
  - 完了条件: DayNote生成時に空の NoteEntry が作られる（[database_schema.md §3.6](database_schema.md)）
- [ ] **T-1-07** [domain] DayNote 取得ユースケース（自動生成付き）
  - 依存: T-1-04, T-1-05, T-1-06
  - 対象AC: AC-01
  - 出力: `packages/domain/src/usecases/getOrCreateDayNote.ts`（存在しない日付→DayNote+Reflection+NoteEntryをトランザクション生成→`/full` 応答データ編成）
  - 完了条件: 存在しない日付呼び出しで3リソースが1トランザクションで作られる
- [ ] **T-1-08** [api] `GET /api/day-notes/:date/full` エンドポイント
  - 依存: T-1-07
  - 対象AC: AC-01
  - 対象US: US-MVP-001
  - 出力: `apps/api/src/routes/dayNotes.ts`（`GET /:date/full`、[api_contract.md §3](api_contract.md) のレスポンス形状）
  - 完了条件: 存在しない日付を自動生成して200を返す
- [ ] **T-1-09** [api] `GET /api/day-notes/today/full` エンドポイント
  - 依存: T-1-08
  - 対象AC: AC-10
  - 出力: `apps/api/src/routes/dayNotes.ts` に追加（[api_contract.md §3](api_contract.md): サーバー側ローカル日付で計算、307リダイレクトまたは直接応答）
  - 完了条件: 常に「今日」の `/full` を返す
- [ ] **T-1-10** [api] `PATCH /api/day-notes/:date` エンドポイント
  - 依存: T-1-04
  - 対象AC: AC-02（間接、テーマ）
  - 出力: `apps/api/src/routes/dayNotes.ts` に追加（`theme` は空文字→`null` 正規化、`lastOpenedMode` は `'work' | 'note'` のみ許可、[api_contract.md §4](api_contract.md)）
  - 完了条件: theme/lastOpenedMode の部分更新が動作し、`lastOpenedMode` の不正値や空文字は保存前に `VALIDATION_ERROR` になる
- [ ] **T-1-11** [test] DayNote系 Integration テスト
  - 依存: T-1-08, T-1-09, T-1-10
  - 対象AC: AC-01, AC-10
  - 出力: `apps/api/test/dayNotes.integration.test.ts`（[test_strategy.md §4.2](test_strategy.md): 自動生成、一意制約違反、存在しない日付の404、today リダイレクト）
  - 完了条件: [edge_cases.md §10.5](edge_cases.md) を含む主要ケースが通る
- [ ] **T-1-12** [ui] APIクライアント + useDayNote フック
  - 依存: T-0-09, T-0-02
  - 対象AC: AC-01
  - 出力: `apps/desktop/renderer/src/api/client.ts`（`window.__API_BASE_URL__` 取得）、`apps/desktop/renderer/src/hooks/useDayNote.ts`（`GET /full` を呼びUI状態へ反映）
  - 完了条件: 起動時に当日データを取得し、React stateへ格納する
- [ ] **T-1-13** [ui] ヘッダー（日付・曜日・テーマ入力・日付移動ボタン）
  - 依存: T-1-12
  - 対象AC: AC-01
  - 対象US: US-MVP-001, US-MVP-003
  - 出力: `apps/desktop/renderer/src/components/Header.tsx`（[要件 6.2](dayborad_requirements.md): 日付・曜日、テーマ入力欄、`‹` / `›` / 「今日」ボタン）
  - 完了条件: ヘッダーに日付・曜日が表示され、テーマ入力欄が配置される（テーマ永続化は Phase 2）
- [ ] **T-1-14** [ui] 日付移動ロジック
  - 依存: T-1-13
  - 対象AC: AC-10
  - 対象US: US-MVP-002
  - 出力: `apps/desktop/renderer/src/hooks/useDateNavigation.ts`（[ui_interaction_spec.md §7](ui_interaction_spec.md): 前日/翌日/今日で `currentDate` 更新、未保存flushは Phase 2 で接続）
  - 完了条件: ボタンと（Phase 7で）ショートカットから日付移動ができる

### Phase 1 のチェック基準

- [ ] 起動で当日 DayNote が表示される（AC-01）
- [ ] 前日/翌日/今日移動と自動生成が動く（AC-10）
- [ ] DayNote系 Integration テストが通る

---

## Phase 2: 自動保存（入力が失われない保証）

**目標:** 「自動保存失敗による入力喪失 0件」の基盤を確立する。AC-13, AC-14, US-MVP-011。**MVP成功指標に直結する最重要フェーズ**。

### 完了定義

- テーマ編集が800ms後に保存され `saving → saved` に遷移（AC-13）
- 保存失敗で `error` 表示、指数バックオフでリトライ（AC-14）
- アプリ強制終了後、再起動で未保存分が復元される（localStorageリカバリ）

### タスク

- [ ] **T-2-01** [domain] 自動保存 FSM（ステートマシン）
  - 依存: T-1-03
  - 対象AC: AC-13, AC-14
  - 出力: `packages/domain/src/autosave/saveStateMachine.ts`（`idle`/`saving`/`saved`/`error`、[autosave_spec.md §5](autosave_spec.md) の遷移表）
  - 完了条件: ピュアTSで状態遷移関数が実装され、副作用を持たない
- [ ] **T-2-02** [domain] デバウンス管理（per-field）
  - 依存: T-2-01
  - 対象AC: AC-13
  - 出力: `packages/domain/src/autosave/debounce.ts`（編集対象別タイマー、800ms、[autosave_spec.md §3](autosave_spec.md)）
  - 完了条件: 同対象の再入力でタイマーリセット、対象間で干渉しない
- [ ] **T-2-03** [domain] リトライポリシー（指数バックオフ）
  - 依存: T-2-01
  - 対象AC: AC-14
  - 出力: `packages/domain/src/autosave/retry.ts`（最大3回、1s/2s/4s、[autosave_spec.md §7.1](autosave_spec.md)、4xxはリトライしない）
  - 完了条件: ネットワークエラー/5xx でバックオフ動作、4xxで即時 `error`
- [ ] **T-2-04** [test] 自動保存 FSM/デバウンス/リトライ Unit テスト
  - 依存: T-2-01, T-2-02, T-2-03
  - 対象AC: AC-13, AC-14
  - 出力: `packages/domain/test/autosave/*.test.ts`（[test_strategy.md §3.7](test_strategy.md): 疑似タイマー `vi.useFakeTimers()`、モックfetch、全遷移パス）
  - 完了条件: [autosave_spec.md §5.2](autosave_spec.md) の全遷移と §7 のリトライ系列を網羅
- [ ] **T-2-05** [domain] PendingSnapshot 型と対象別マージ関数
  - 依存: T-2-01
  - 対象AC: AC-13, AC-14
  - 出力: `packages/domain/src/autosave/pendingSnapshot.ts`（[autosave_spec.md §6.2](autosave_spec.md) の `PendingSnapshot` 型、対象キー生成、対象別 upsert/remove/empty 判定。localStorage/Web Storage には触れない）
  - 完了条件: 同一日付内でテーマ保存成功してもノート本文/TODOの未同期分が消えない純粋関数が実装される
- [ ] **T-2-06** [test] PendingSnapshot 純粋関数 Unit テスト
  - 依存: T-2-05
  - 対象AC: AC-13, AC-14
  - 出力: `packages/domain/test/autosave/pendingSnapshot.test.ts`（対象別 upsert・部分成功時の対象単位削除・空判定、[test_strategy.md §6.1](test_strategy.md)）
  - 完了条件: 部分成功で対象単位削除が副作用なしに正しく動作する
- [ ] **T-2-07** [ui] 自動保存フック統合
  - 依存: T-2-01, T-2-02, T-2-03, T-2-05, T-1-12
  - 対象AC: AC-13, AC-14
  - 出力: `apps/desktop/renderer/src/hooks/useAutosave.ts`（デバウンス保存・即時保存・flush・リトライ・集約 `saveStatus` 表示用セレクタ）と `apps/desktop/renderer/src/autosave/pendingStore.ts`（domainの `PendingSnapshot` 純粋関数を使う localStorage アダプタ）
  - 完了条件: 任意の編集対象で `idle→saving→saved` または `→error→retry` が動作する
- [ ] **T-2-08** [ui] 保存状態表示
  - 依存: T-2-07
  - 対象AC: AC-13, AC-14
  - 出力: `apps/desktop/renderer/src/components/SaveStatus.tsx`（[ui_interaction_spec.md §10](ui_interaction_spec.md): 右上、`保存中...` / `保存済み` / `保存できませんでした` + 再試行ボタン）
  - 完了条件: 4状態が仕様どおり色・文言で表示される
- [ ] **T-2-09** [ui] テーマ入力の自動保存接続
  - 依存: T-2-07, T-1-13
  - 対象AC: AC-13
  - 対象US: US-MVP-003
  - 出力: `Header.tsx` のテーマ入力を `useAutosave({type:'dayNote', field:'theme'})` へ接続、`PATCH /api/day-notes/:date` の `theme` のみ送信
  - 完了条件: テーマ編集が800ms後に保存され、再起動後も維持される（AC-02 のテーマ部）
- [ ] **T-2-10** [ui] flush トリガ接続（日付移動）
  - 依存: T-2-07, T-1-14
  - 対象AC: AC-13
  - 対象US: US-MVP-011 AC-5（日付移動分）
  - 出力: `useDateNavigation` の日付移動直前に `flush()` を組み込み、localStorage同期書込成功をもって遷移（[autosave_spec.md §4/§9](autosave_spec.md)。モード切替は T-4-08 で接続）
  - 完了条件: サーバー保存失敗中でも localStorage 書込成功後は遷移が長時間ブロックされない
- [ ] **T-2-11** [ui] localStorage 書込失敗時の確認ダイアログ
  - 依存: T-2-10
  - 対象AC: AC-13
  - 出力: `apps/desktop/renderer/src/components/FlushFailDialog.tsx`（[autosave_spec.md §9.3](autosave_spec.md) の「移動する / キャンセル」）
  - 完了条件: localStorage書込失敗時のみ遷移を止めて確認する
- [ ] **T-2-12** [ui] 起動時リカバリ（pending 再送）
  - 依存: T-2-07, T-1-12
  - 対象AC: AC-13
  - 出力: `apps/desktop/renderer/src/autosave/recoverOnStartup.ts`（`dayborad:pending:*` 走査→再送→成功対象だけ削除、[autosave_spec.md §6.2](autosave_spec.md)）
  - 完了条件: クラッシュ後再起動で未保存分が復元される
- [ ] **T-2-13** [infra] Electron `before-quit` / `beforeunload` flush-all
  - 依存: T-2-07, T-0-08
  - 対象AC: AC-13
  - 出力: `apps/desktop/main` からRendererへ `flush-all` IPC、Rendererの `beforeunload` でlocalStorage同期書込（[autosave_spec.md §10](autosave_spec.md)）
  - 完了条件: 正常終了時に保留内容がlocalStorageへ保護される
- [ ] **T-2-14** [api] POST重複排除（推奨）
  - 依存: T-0-07
  - 依存(任意): T-2-07
  - 対象AC: AC-13
  - 出力: `apps/api/src/middleware/idempotency.ts`（リクエストIDベース60秒重複排除、[autosave_spec.md §8.2](autosave_spec.md)）
  - 完了条件: 同リクエストIDの再送で2回目を作成しない（TODO二重追加防止）
- [ ] **T-2-15** [test] 自動保存 Integration/E2E（段階導入）
  - 依存: T-2-07, T-2-12
  - 対象AC: AC-13, AC-14
  - 出力: Playwrightヘルパー `apps/desktop/e2e/autosave.spec.ts`（[test_strategy.md §5.2 4.1](test_strategy.md): 入力→再起動→保持、クラッシュ→復元）
  - 完了条件: 入力喪失0件の経路がE2Eで確認できる（CI必須化はしなくてよい）

### Phase 2 のチェック基準

- [ ] テーマ編集が800ms後に保存、状態が `saving → saved`（AC-13）
- [ ] 保存失敗で `error` + リトライ（AC-14）
- [ ] クラッシュ→再起動で未保存分が復元される
- [ ] テーマが再起動後も維持される

---

## Phase 3: 仕事整理モード（TODO / 障害 / 振り返り）

**目標:** 3カラムの仕事整理モードを完成させる。AC-02, AC-09, US-MVP-003, US-MVP-004, US-MVP-005, US-MVP-006。

### 完了定義

- テーマ・TODO・障害・振り返りの入力が日付に紐づいて保存され、再起動後も同じ内容（AC-02）
- TODO完了切替が動作（AC-09）
- 並替・削除が動作する

### タスク

- [ ] **T-3-01** [domain] TODO状態遷移ドメイン関数
  - 依存: T-1-03
  - 対象AC: AC-09
  - 出力: `packages/domain/src/todo/transitions.ts`（[database_schema.md §3.3](database_schema.md): `todo↔done`, `todo→carried`、`carried→*`/`done→carried` は `INVALID_TRANSITION`）
  - 完了条件: 全遷移と違反遷移の判定ができる
- [ ] **T-3-02** [test] TODO状態遷移 Unit テスト
  - 依存: T-3-01
  - 対象AC: AC-09
  - 出力: `packages/domain/test/todo/transitions.test.ts`（[test_strategy.md §3.4](test_strategy.md)）
  - 完了条件: [edge_cases.md §3.1](edge_cases.md) の `carried` 操作違反を含む全パスが通る
- [ ] **T-3-03** [repo] TodoRepository
  - 依存: T-1-04
  - 対象AC: AC-02, AC-09
  - 出力: `packages/repository/src/todoRepository.ts`（[database_schema.md §11](database_schema.md): `listByDayNote`(order順), `create`, `update`, `reorder`(再採番), `delete`, `findByCarriedFrom`）
  - 完了条件: `order` の0,1,2...再採番が正しく動作する
- [ ] **T-3-04** [api] TODO系エンドポイント
  - 依存: T-3-01, T-3-03
  - 対象AC: AC-02, AC-09
  - 対象US: US-MVP-004
  - 出力: `apps/api/src/routes/todos.ts`（`POST /api/day-notes/:date/todos`, `PATCH /api/todos/:id`(title/status), `POST /api/day-notes/:date/todos/reorder`, `DELETE /api/todos/:id`、[api_contract.md §5](api_contract.md)）
  - 完了条件: title検証（trim/1-200文字）、`INVALID_TRANSITION` の400、reorder過不足チェックが動作
- [ ] **T-3-05** [repo] BlockerRepository
  - 依存: T-1-04, T-3-03
  - 対象AC: AC-02
  - 出力: `packages/repository/src/blockerRepository.ts`（`listByDayNote`, `create`, `update`, `reorder`, `delete`）
  - 完了条件: `linkedTodoId`（任意）を扱える
- [ ] **T-3-06** [api] Blocker系エンドポイント
  - 依存: T-3-05
  - 対象AC: AC-02
  - 対象US: US-MVP-005
  - 出力: `apps/api/src/routes/blockers.ts`（`POST`, `PATCH`(text/resolved/linkedTodoId), `POST /reorder`, `DELETE`、[api_contract.md §6](api_contract.md)）
  - 完了条件: `linkedTodoId` が別日付のTODOなら `VALIDATION_ERROR`（[edge_cases.md §10.2](edge_cases.md)）
- [ ] **T-3-07** [repo/api] Reflection UPSERT
  - 依存: T-1-05
  - 対象AC: AC-02
  - 出力: `packages/repository/src/reflectionRepository.ts` に `upsert` 追加、`apps/api/src/routes/dayNotes.ts` に `PATCH /api/day-notes/:date/reflection`（[api_contract.md §7](api_contract.md)）
  - 完了条件: 3セクションの部分更新が動作する
- [ ] **T-3-08** [test] TODO/Blocker/Reflection Integration テスト
  - 依存: T-3-04, T-3-06, T-3-07
  - 対象AC: AC-02, AC-09
  - 出力: `apps/api/test/{todos,blockers,reflection}.integration.test.ts`（[test_strategy.md §4.2](test_strategy.md): CRUD, reorder, `INVALID_TRANSITION`, VALIDATION_ERROR, ON DELETE SET NULL/cascade）
  - 完了条件: [edge_cases.md §1.1/§1.2/§2.2/§2.3/§10.4](edge_cases.md) を含む
- [ ] **T-3-09** [ui] 3カラムレイアウト（仕事整理モード）
  - 依存: T-1-12
  - 対象AC: AC-02
  - 対象US: US-MVP-004/005/006
  - 出力: `apps/desktop/renderer/src/components/WorkMode.tsx`（[要件 6.2/14](dayborad_requirements.md): TODO/障害/振り返りの3カラム、Tailwindでノート風UI、紙ノート余白）
  - 完了条件: 3カラムが画面いっぱいに配置される
- [ ] **T-3-10** [ui] TODO リスト（追加・完了・編集・削除・並替）
  - 依存: T-3-04, T-3-09, T-2-07
  - 対象AC: AC-02, AC-09
  - 対象US: US-MVP-004
  - 出力: `apps/desktop/renderer/src/components/TodoColumn.tsx`、`TodoItem.tsx`（[ui_interaction_spec.md §5](ui_interaction_spec.md): 追加入力欄、`Enter`確定、完了切替、楽観的更新、並替）
  - 完了条件: 追加/完了/編集/削除/並替が動作し、即時保存・デバウンス保存を使い分ける
- [ ] **T-3-11** [ui] TODO 本文編集の確定・空時削除確認
  - 依存: T-3-10
  - 対象AC: AC-02
  - 出力: `TodoItem.tsx` の編集モード、空にして確定で [edge_cases.md §2.1](edge_cases.md) の削除確認ダイアログ
  - 完了条件: 空確定で削除確認、キャンセルで元に戻す
- [ ] **T-3-12** [ui] 障害リスト（追加・編集・解消・TODO紐付け）
  - 依存: T-3-06, T-3-09
  - 対象AC: AC-02
  - 対象US: US-MVP-005
  - 出力: `apps/desktop/renderer/src/components/BlockerColumn.tsx`、`BlockerItem.tsx`（[要件 7.4](dayborad_requirements.md): 編集、解消切替、`linkedTodoId` 任意）
  - 完了条件: 解消状態の視覚的区別、TODO紐付けが任意で動作
- [ ] **T-3-13** [ui] 振り返り（3セクション自由入力）
  - 依存: T-3-07, T-3-09
  - 対象AC: AC-02
  - 対象US: US-MVP-006
  - 出力: `apps/desktop/renderer/src/components/ReflectionColumn.tsx`（できたこと/止まったこと/明日の一手、[要件 7.5](dayborad_requirements.md)）
  - 完了条件: 3セクションがデバウンス保存される
- [ ] **T-3-14** [ui] `carried` / `done` 表示スタイル
  - 依存: T-3-10
  - 対象AC: AC-09
  - 出力: `TodoItem.tsx` の `done`（取り消し線+薄色）、`carried`（「→ 翌日へ持ち越し済み」ラベル、[要件 7.10 表示例](dayborad_requirements.md)）
  - 完了条件: 色だけでなくアイコン/テキスト併用（[ui_interaction_spec.md §12](ui_interaction_spec.md)）

### Phase 3 のチェック基準

- [ ] TODO/障害/振り返りの入力が永続化され再起動後も同じ（AC-02）
- [ ] TODO完了切替が動作（AC-09）
- [ ] 並替・削除が動作する
- [ ] TODO/Blocker Integration テストが通る

---

## Phase 4: ノートモード（会議メモ本文）

**目標:** ノートモードで会議メモ本文を書けるようにする。AC-03, AC-04, US-MVP-007, US-MVP-008。

### 完了定義

- `⌘/Ctrl+J` でノートモードに切替（AC-03）
- `Esc`/`⌘J` で戻り、入力途中の本文が失われない（AC-04）

### タスク

- [ ] **T-4-01** [repo/api] NoteEntry 本文更新
  - 依存: T-1-06
  - 対象AC: AC-04
  - 出力: `packages/repository/src/noteEntryRepository.ts` に `updateBody`、`apps/api/src/routes/dayNotes.ts` に `PATCH /api/day-notes/:date/note-entry`（全文一括、[api_contract.md §7](api_contract.md)）
  - 完了条件: CodeMirror全文を送って保存できる（上限50000文字で `VALIDATION_ERROR`）
- [ ] **T-4-02** [test] NoteEntry Integration テスト
  - 依存: T-4-01
  - 対象AC: AC-04
  - 出力: `apps/api/test/noteEntry.integration.test.ts`（[test_strategy.md §4.2](test_strategy.md): 本文更新、上限超過）
  - 完了条件: 本文UPSERTと上限検証が動作する
- [ ] **T-4-03** [ui] CodeMirror 統合
  - 依存: T-0-09
  - 対象AC: AC-03
  - 出力: `apps/desktop/renderer/src/components/NoteEditor.tsx`（CodeMirror 6、Tailwindで広いテキストエリア、[要件 6.3](dayborad_requirements.md)）
  - 完了条件: 数万文字でも実用上軽快（[edge_cases.md §6.1](edge_cases.md)）
- [ ] **T-4-04** [ui] ノート本文の自動保存接続
  - 依存: T-4-01, T-4-03, T-2-07
  - 対象AC: AC-04
  - 対象US: US-MVP-007
  - 出力: CodeMirror入力 → デバウンス800ms → `PATCH /note-entry`（[autosave_spec.md §3.4](autosave_spec.md)）
  - 完了条件: 入力停止800ms後に全文保存、状態表示が追従する
- [ ] **T-4-05** [ui] 表示モード（viewMode）state と切替
  - 依存: T-4-03
  - 対象AC: AC-03, AC-04
  - 対象US: US-MVP-008
  - 出力: `apps/desktop/renderer/src/state/viewMode.ts`（[ui_interaction_spec.md §2.1](ui_interaction_spec.md)）、`WorkMode`/`NoteMode` の切替ラッパー、`⌘/Ctrl+J` と（標準キーバインド時の）`Esc` の基本ハンドリング
  - 完了条件: `work ⇄ note` が体感即時に切り替わる
- [ ] **T-4-06** [ui] IME 保護（キーハンドラ先頭ガード）
  - 依存: T-4-05
  - 対象AC: AC-03, AC-19
  - 出力: `apps/desktop/renderer/src/keybindings/guardIme.ts`（`isComposing === true` / `keyCode === 229` でショートカット判定スキップ、[ui_interaction_spec.md §9.1](ui_interaction_spec.md)）
  - 完了条件: 日本語変換中のショートカット誤動作を防ぐ（Vim詳細は Phase 7）
- [ ] **T-4-07** [ui] Esc 優先順位（基本: IME→モーダル→モード戻り）
  - 依存: T-4-06
  - 対象AC: AC-04
  - 出力: `apps/desktop/renderer/src/keybindings/escPriority.ts`（[ui_interaction_spec.md §9.2](ui_interaction_spec.md) の優先順位。Vim Insert→Normal は Phase 7 で差し込み）
  - 完了条件: 標準キーバインドで `Esc` がノートモードから仕事整理へ戻す
- [ ] **T-4-08** [ui] モード切替前 flush 接続
  - 依存: T-4-05, T-2-10
  - 対象AC: AC-04
  - 出力: `viewMode` 切替の直前に `flush()` を呼び、localStorage同期書込成功で切替（[autosave_spec.md §9.1](autosave_spec.md)）
  - 完了条件: 切替直前の編集が失われない
- [ ] **T-4-09** [ui] ノートモード ヘッダー（戻る案内）
  - 依存: T-4-05, T-1-13
  - 対象AC: AC-03
  - 出力: `NoteMode.tsx` のヘッダー（[要件 6.3](dayborad_requirements.md): 日付、曜日、モード名、「Esc 戻る」）
  - 完了条件: 戻る操作の案内が表示される
- [ ] **T-4-10** [test] モード切替 E2E
  - 依存: T-4-05, T-4-08
  - 対象AC: AC-03, AC-04
  - 出力: `apps/desktop/e2e/modeSwitch.spec.ts`（[test_strategy.md §5.2 4.2](test_strategy.md)）
  - 完了条件: `⌘J`/`Esc` 切替と入力保持が確認できる

### Phase 4 のチェック基準

- [ ] `⌘/Ctrl+J` でノートモードへ（AC-03）
- [ ] `Esc`/`⌘J` で戻り、本文が失われない（AC-04）
- [ ] ノート本文がデバウンス保存される

---

## Phase 5: ノート変換（TODO化 / 障害化）

**目標:** dayborad のコア体験「④ → ①/②」を実装する。AC-05〜AC-08, US-MVP-009, US-MVP-010。**最もドメインロジックが集中するフェーズ**。

### 完了定義

- 選択行TODO化・障害化が動作、ノートモードに留まる（AC-05, AC-07）
- 重複確認が表示され、キャンセルで作成しない（AC-06）
- 元行編集後もTODO本文は変わらず、発生元スナップショットを確認可能（AC-08）

### タスク

- [ ] **T-5-01** [domain] `normalizeLineText`
  - 依存: T-1-03
  - 対象AC: AC-05, AC-07
  - 出力: `packages/domain/src/conversion/normalize.ts`（[note_conversion_spec.md §3](note_conversion_spec.md): 前後空白trim、半角/全角スペース・タブの連続空白を半角スペース1つに圧縮。全角英数字・全角カタカナ正規化と行頭記号除去は含めない）
  - 完了条件: [§3.1](note_conversion_spec.md) の正規化例を全て満たし、全角英数字・全角カタカナが保持される
- [ ] **T-5-02** [domain] `extractTitle`
  - 依存: T-5-01
  - 対象AC: AC-05, AC-07
  - 出力: `packages/domain/src/conversion/extractTitle.ts`（[note_conversion_spec.md §4](note_conversion_spec.md): リスト記号/番号リスト/特定ラベル除去、空時エラー、200文字超は先頭199+`…`）
  - 完了条件: [§4.2](note_conversion_spec.md) の適用例と [§4.3](note_conversion_spec.md) の除去対象外を全て満たす
- [ ] **T-5-03** [domain] `computeLineHash`
  - 依存: T-5-01
  - 対象AC: AC-05, AC-06
  - 出力: `packages/domain/src/conversion/lineHash.ts`（`sha256(noteEntryId + "\n" + normalizedLineText).slice(0,16)`、[note_conversion_spec.md §5](note_conversion_spec.md)）
  - 完了条件: 同一入力で同じハッシュ、異なる `noteEntryId` で別ハッシュ
- [ ] **T-5-04** [test] 変換ピュア関数 Unit テスト（重点）
  - 依存: T-5-01, T-5-02, T-5-03
  - 対象AC: AC-05, AC-06, AC-07
  - 出力: `packages/domain/test/conversion/*.test.ts`（[test_strategy.md §3.5](test_strategy.md) + [edge_cases.md §5](edge_cases.md) の全バリエーション）
  - 完了条件: 行頭記号バリエーション、ラベル除去、空行、200文字超を全ケース化
- [ ] **T-5-05** [repo] NoteLineMetaRepository
  - 依存: T-0-05, T-3-03
  - 対象AC: AC-05, AC-06, AC-08
  - 出力: `packages/repository/src/noteLineMetaRepository.ts`（`findByNoteEntryAndLineHash`, `create`、重複候補検索）
  - 完了条件: 重複インデックス（[database_schema.md §3.7](database_schema.md)）が効く
- [ ] **T-5-06** [domain/api] 変換ユースケース（TODO化）
  - 依存: T-5-01, T-5-02, T-5-03, T-5-05, T-3-03
  - 対象AC: AC-05, AC-06, AC-08
  - 出力: `packages/domain/src/usecases/convertLineToTodo.ts`、`apps/api/src/routes/convert.ts`（`POST /api/day-notes/:date/convert/todo`、`?force=1`、[api_contract.md §9](api_contract.md)）
  - 完了条件: 1トランザクションで TodoItem + NoteLineMeta 作成、重複時 409 `DUPLICATE_CONVERSION`（`details.existing` 添付）
- [ ] **T-5-07** [api] 変換ユースケース（障害化）
  - 依存: T-5-06, T-3-05
  - 対象AC: AC-07
  - 出力: `POST /api/day-notes/:date/convert/blocker`、`?force=1`（[api_contract.md §9](api_contract.md)）
  - 完了条件: TODO化と同じ構造・重複ルール
- [ ] **T-5-08** [test] 変換 Integration テスト
  - 依存: T-5-06, T-5-07
  - 対象AC: AC-05, AC-06, AC-07, AC-08
  - 出力: `apps/api/test/convert.integration.test.ts`（[test_strategy.md §4.2](test_strategy.md): 新規作成、409重複、`?force=1`、トランザクション失敗ロールバック、`ON DELETE SET NULL`）
  - 完了条件: [edge_cases.md §4.2/§10.3](edge_cases.md) を含む
- [ ] **T-5-09** [ui] 行選択とTODO化・障害化のキー操作
  - 依存: T-5-06, T-5-07, T-4-03
  - 対象AC: AC-05, AC-07
  - 対象US: US-MVP-009, US-MVP-010
  - 出力: `NoteEditor.tsx` の行選択（カーソル行取得）、`⌘/Ctrl+Enter` でTODO化、`⌘/Ctrl+Shift+B` で障害化（[ui_interaction_spec.md §6.2](ui_interaction_spec.md)）、空行は通知でAPI呼ばない
  - 完了条件: 変換後もノートモードに留まる（[要件 9.3](dayborad_requirements.md)）
- [ ] **T-5-10** [ui] 変換済みマーク（ガター `✓T` / `✓B`）
  - 依存: T-5-09
  - 対象AC: AC-05, AC-07
  - 出力: CodeMirrorガター拡張（[note_conversion_spec.md §8](note_conversion_spec.md)）、行編集後の `lineHash` 追従（編集行と前後のみ再計算、[edge_cases.md §6.2](edge_cases.md)）
  - 完了条件: マークが正しい行に追従する
- [ ] **T-5-11** [ui] 重複確認ダイアログ
  - 依存: T-5-09
  - 対象AC: AC-06
  - 出力: `apps/desktop/renderer/src/components/DuplicateConversionDialog.tsx`（409受領時、[note_conversion_spec.md §7](note_conversion_spec.md)）
  - 完了条件: キャンセルで作成しない、「別TODO作成」で `?force=1`
- [ ] **T-5-12** [ui] 変換成功トースト + 復帰時ハイライト
  - 依存: T-5-09, T-4-05
  - 対象AC: AC-05, AC-07
  - 出力: `Toast.tsx`（2s、[ui_interaction_spec.md §6.2](ui_interaction_spec.md)）、仕事整理モード復帰時の1.2sハイライト（[§4.3](ui_interaction_spec.md)）
  - 完了条件: 通知とハイライトが仕様時間で動作
- [ ] **T-5-13** [ui] 発生元スナップショット表示
  - 依存: T-5-06
  - 対象AC: AC-08
  - 出力: `TodoItem.tsx` / `BlockerItem.tsx` のホバーで `NoteLineMeta.lineText` ポップアップ（[note_conversion_spec.md §9.2](note_conversion_spec.md)）
  - 完了条件: 元行編集/削除後もTODO側に発生元原文が表示できる
- [ ] **T-5-14** [test] 変換 E2E
  - 依存: T-5-09, T-5-10, T-5-11
  - 対象AC: AC-05, AC-06, AC-07, AC-08
  - 出力: `apps/desktop/e2e/convert.spec.ts`（[test_strategy.md §5.2 4.3](test_strategy.md)）
  - 完了条件: 変換→マーク→ハイライト→発生元表示の一連が確認できる

### Phase 5 のチェック基準

- [ ] 選択行のTODO化・障害化が動作、ノートモードに留まる（AC-05, AC-07）
- [ ] 重複確認が表示されキャンセルで作成しない（AC-06）
- [ ] 元行編集後もTODO本文不変、発生元スナップショット確認可能（AC-08）
- [ ] 変換 Unit/Integration テストが通る

---

## Phase 6: 未完了TODOの翌日持ち越し

**目標:** 夕方の利用フローを完成させる。AC-11, AC-12, US-MVP-012。

### 完了定義

- 未完了TODOが翌日に持ち越され、元は `carried`、翌日に `carriedFromTodoId`/`carriedFromDate` 付き（AC-11）
- 重複持ち越しはスキップされる（AC-12）

### タスク

- [ ] **T-6-01** [domain] 持ち越しユースケース
  - 依存: T-3-01, T-3-03, T-1-07
  - 対象AC: AC-11, AC-12
  - 出力: `packages/domain/src/usecases/carryOver.ts`（[test_strategy.md §3.3](test_strategy.md): 翌日DayNote自動生成、未完了のみ、`carriedFromTodoId` 重複でスキップ、元TODO `carried` 化）
  - 完了条件: 部分成功（`carried`/`skipped`）を返す
- [ ] **T-6-02** [test] 持ち越し Unit テスト
  - 依存: T-6-01
  - 対象AC: AC-11, AC-12
  - 出力: `packages/domain/test/usecases/carryOver.test.ts`（[test_strategy.md §3.3](test_strategy.md): 未完了のみ、重複スキップ、翌日自動生成、`carriedFromDate` 保持）
  - 完了条件: [edge_cases.md §4.3/§4.4](edge_cases.md) を含む
- [ ] **T-6-03** [api] `POST /api/day-notes/:date/carry-over`
  - 依存: T-6-01
  - 対象AC: AC-11, AC-12
  - 対象US: US-MVP-012
  - 出力: `apps/api/src/routes/carryOver.ts`（1トランザクション、`carried`/`skipped` 部分成功応答、[api_contract.md §10](api_contract.md)）
  - 完了条件: HTTP 200 で部分成功、翌日DayNote自動生成を含む
- [ ] **T-6-04** [test] 持ち越し Integration テスト
  - 依存: T-6-03
  - 対象AC: AC-11, AC-12
  - 出力: `apps/api/test/carryOver.integration.test.ts`（[test_strategy.md §4.2](test_strategy.md)）
  - 完了条件: トランザクション・重複スキップ・翌日自動生成が実DBで確認できる
- [ ] **T-6-05** [ui] 持ち越しUI（一括 + 個別）
  - 依存: T-6-03, T-3-10
  - 対象AC: AC-11, AC-12
  - 対象US: US-MVP-012
  - 出力: `TodoColumn.tsx` に「未完了を翌日へ持ち越し」導線（[implementation_plan.md Phase 6](implementation_plan.md): 一括を主軸、個別は副導線）、`skipped` の通知表示
  - 完了条件: 持ち越し実行後、当日は `carried` 表示、翌日は「7/8から持ち越し」表示
- [ ] **T-6-06** [ui] 持ち越し先TODOの表示
  - 依存: T-6-05, T-3-14
  - 対象AC: AC-11
  - 出力: `TodoItem.tsx` で `carriedFromDate` を使い「M/Dから持ち越し」表示（[要件 7.10 表示例](dayborad_requirements.md)）
  - 完了条件: 翌日ノートを開いた際に持ち越し元日付が分かる

### Phase 6 のチェック基準

- [ ] 未完了TODOが翌日に持ち越され、元は `carried`、`carriedFromTodoId`/`carriedFromDate` 付き（AC-11）
- [ ] 重複持ち越しはスキップ（AC-12）
- [ ] 持ち越し Unit/Integration テストが通る

---

## Phase 7: キーバインド（標準 / Vim）

**目標:** 要件 8 の全ショートカットを完成させる。AC-15〜AC-20, AC-22, US-MVP-013, US-MVP-014, US-MVP-015。

### 完了定義

- 設定で `standard`/`vim` 切替、再起動後も維持（AC-15）
- Vim `i`/`Esc`/`h/j/k/l`/`x`/`Space系` 動作（AC-16〜AC-20）
- IME変換中の `Esc` が仕様どおり優先順位で処理（AC-19）
- Post-MVPショートカットが不発で入力破壊しない（AC-22）

### タスク

- [ ] **T-7-01** [repo/api] UserSettings エンドポイント
  - 依存: T-0-05
  - 対象AC: AC-15
  - 出力: `packages/repository/src/userSettingsRepository.ts`（`get`/`update`）、`apps/api/src/routes/settings.ts`（`GET`/`PATCH /api/settings`、[api_contract.md §11](api_contract.md)）
  - 完了条件: 未作成なら初期値で作成して返す
- [ ] **T-7-02** [ui] 設定モーダル
  - 依存: T-7-01
  - 対象AC: AC-15
  - 対象US: US-MVP-014
  - 出力: `apps/desktop/renderer/src/components/SettingsModal.tsx`（[ui_interaction_spec.md §8](ui_interaction_spec.md): 歯車アイコンから開く、`standard`/`vim` ラジオ、Vim時に `vimDefaultState`、Esc/背景クリックで閉じる）
  - 完了条件: 保存で `PATCH /api/settings`、即座にキーバインド切替
- [ ] **T-7-03** [ui] 標準キーバインド完成（仕事整理モード）
  - 依存: T-4-06, T-3-09, T-3-10
  - 対象AC: AC-02, AC-09
  - 対象US: US-MVP-013
  - 出力: `apps/desktop/renderer/src/keybindings/standard.ts`（[ui_interaction_spec.md §11.2](ui_interaction_spec.md): `⌘/Ctrl+1/2/3` 列フォーカス、`⌘/Ctrl+Enter` TODO追加、フォーカス制御）
  - 完了条件: 各列の入力可能最初の要素へフォーカス
- [ ] **T-7-04** [ui] 標準キーバインド（日付移動・基本）
  - 依存: T-7-03, T-1-14
  - 対象AC: AC-10
  - 出力: `⌘/Ctrl+T`（今日）、`Alt/Option+←/→`（前日/翌日）、`⌘/Ctrl+J`（モード切替）、[ui_interaction_spec.md §11.1](ui_interaction_spec.md)
  - 完了条件: ショートカットから日付移動・モード切替ができる（flush接続済み）
- [ ] **T-7-05** [ui] Vim 拡張の有効化（CodeMirror）
  - 依存: T-4-03, T-7-02
  - 対象AC: AC-16, AC-17, AC-18
  - 出力: `apps/desktop/renderer/src/keybindings/vim.ts`（`@codemirror/vim` 拡張の条件付き有効化、`vimState` と CodeMirror Normal/Insert の同期）
  - 完了条件: Vim時に CodeMirror が Vimモードで動く
- [ ] **T-7-06** [ui] Vim `h/j/k/l`（列/項目移動 vs カーソル移動）
  - 依存: T-7-05
  - 対象AC: AC-20
  - 対象US: US-MVP-015
  - 出力: [ui_interaction_spec.md §3.4](ui_interaction_spec.md) の優先ルール（Normal=列/項目、Insert=テキストカーソル）、仕事整理モードでの `theme↔todo↔blocker↔reflection`
  - 完了条件: ノートモードでは CodeMirror の `h/j/k/l` をそのまま利用
- [ ] **T-7-07** [ui] Vim `i`/`x`/`Space系`
  - 依存: T-7-05, T-7-06
  - 対象AC: AC-09, AC-16
  - 出力: `i`（Insertへ）、`x`（TODO完了切替、AC-09）、`Space n/1/2/3/t/b`（[ui_interaction_spec.md §3.5](ui_interaction_spec.md)、200msリーダー待ち）
  - 完了条件: Space リーダー後200ms超過でキャンセル（[edge_cases.md §9.4](edge_cases.md)）
- [ ] **T-7-08** [ui] Vim状態表示
  - 依存: T-7-05
  - 対象AC: AC-16
  - 出力: `apps/desktop/renderer/src/components/VimStateBadge.tsx`（右下に `VIM NORMAL`/`VIM INSERT`、[要件 9.4](dayborad_requirements.md)、控えめ）
  - 完了条件: 状態が分かりやすく、入力の邪魔にならない
- [ ] **T-7-09** [ui] Esc の4段優先順位（Vim対応）
  - 依存: T-4-07, T-7-05
  - 対象AC: AC-17, AC-18, AC-19
  - 出力: `escPriority.ts` に Vim Insert→Normal を差し込み（[ui_interaction_spec.md §9.2](ui_interaction_spec.md): IME→Vim Insert→モーダル→モード戻り）
  - 完了条件: Vim Insert中の `Esc` は Normal のみ（ノート離脱しない、AC-17）、Normal 中の `Esc` はモード戻り（AC-18）
- [ ] **T-7-10** [ui] Post-MVP ショートカットの無効化
  - 依存: T-7-03
  - 対象AC: AC-22
  - 出力: `⌘/Ctrl+K`、`⌘/Ctrl+Shift+R`、`⌘/Ctrl+Shift+M`、Vim Normal の `gg`, `G`, `A`, `o`, `O`, `dd`, `u`, `Ctrl+r`, `/`, `n`, `N`, `Space r`, `Space k` をハンドラで握りつぶす（[ui_interaction_spec.md §11.5](ui_interaction_spec.md) / [dayborad_requirements.md §8.6](dayborad_requirements.md)）
  - 完了条件: 押しても何も起きず、入力内容を破壊しない
- [ ] **T-7-11** [test] Vim/IME/Post-MVP E2E
  - 依存: T-7-05, T-7-09, T-7-10
  - 対象AC: AC-16〜AC-20, AC-22
  - 出力: `apps/desktop/e2e/{vim,ime,postMvpShortcuts}.spec.ts`（[test_strategy.md §5.2 4.4/4.5/4.6](test_strategy.md)、合成CompositionEventでIME擬似）
  - 完了条件: 各ACのシナリオが通る

### Phase 7 のチェック基準

- [ ] キーバインド切替が永続化（AC-15）
- [ ] Vimの基本操作と状態表示（AC-16〜AC-20）
- [ ] IME中の `Esc` 優先順位（AC-19）
- [ ] Post-MVPショートカットが不発（AC-22）

---

## Phase 8: 統合・E2E・リリース確認

**目標:** AC-01〜AC-22 をすべて満たし、[要件 4.3 成功指標](dayborad_requirements.md) を確認可能な状態にする。

### 完了定義

- AC-01〜AC-22 全合格
- 成功指標の測定準備完了（限定配布できる状態）
- [test_strategy.md §8](test_strategy.md) の品質ゲート全通過

### タスク

- [ ] **T-8-01** [test] E2Eシナリオ完全網羅
  - 依存: Phase 1〜7
  - 対象AC: AC-01〜AC-22
  - 出力: `apps/desktop/e2e/` 配下の全シナリオ（[test_strategy.md §5.2](test_strategy.md) と §6 重点領域）
  - 完了条件: 主要ACのクリティカルパスが全て通る
- [ ] **T-8-02** [test] エッジケース検証
  - 依存: Phase 1〜7
  - 対象AC: -
  - 出力: [edge_cases.md](edge_cases.md) 全節をテストケース化（TODO削除、本文編集、持ち越し後再編集、同名TODO、空行変換、巨大ノート、保存失敗復旧、日付境界）
  - 完了条件: [edge_cases.md §11](edge_cases.md) の対応表が全てテストに反映される
- [ ] **T-8-03** [test] 「自動保存失敗による入力喪失 0件」検証
  - 依存: T-2-15, T-8-01
  - 対象AC: AC-13, AC-14
  - 出力: クラッシュ→再起動で未保存分復元のE2E、localStorage保護経路の検証（[autosave_spec.md §6](autosave_spec.md)）
  - 完了条件: 入力喪失が起きないことをE2Eで確認
- [ ] **T-8-04** [test] パフォーマンス確認
  - 依存: Phase 1〜7
  - 対象AC: -
  - 出力: 起動時間、モード切替の体感即時性、入力中の保存で引っかからないことの計測（[要件 12.1](dayborad_requirements.md)）
  - 完了条件: 要件 12.1 のパフォーマンス要件を満たす
- [ ] **T-8-05** [infra] パッケージング
  - 依存: T-0-10, Phase 1〜7
  - 対象AC: -
  - 出力: `pnpm package`（electron-builder 等、[dev_setup.md §4.2](dev_setup.md)）、PostgreSQL同梱戦略の最終確認（[architecture.md §2.2 注記](architecture.md)）
  - 完了条件: 配布用バイナリが作成される
- [ ] **T-8-06** [test] 品質ゲート最終確認
  - 依存: T-8-01, T-8-02
  - 対象AC: -
  - 出力: [test_strategy.md §8.2](test_strategy.md) のゲート（lint / typecheck / test / integration、カバレッジ: domain 90%, api 80%, renderer 60%, repository 70%）
  - 完了条件: 全ゲートが緑、カバレッジ基準を満たす
- [ ] **T-8-07** [infra] リリース確認（限定配布準備）
  - 依存: T-8-05, T-8-06
  - 対象AC: -
  - 出力: [要件 4.3 成功指標](dayborad_requirements.md) の測定準備（計測方法の文書化、テストユーザーへの配布手順）
  - 完了条件: 限定配布できる状態

### Phase 8 のチェック基準

- [ ] AC-01〜AC-22 全合格
- [ ] 品質ゲート全通過
- [ ] 限定配布できる状態

---

## 依存関係マトリクス

フェーズ間の主依存（太線が強依存、点線は並行可能）。

```text
Phase 0 ─────► Phase 1 ─────► Phase 2 ─────► Phase 3 ─┐
                                                       │
                                                       ▼
                                          Phase 4 ──► Phase 5
                                              │           │
                                              │           ▼
                                              │       Phase 6
                                              │           │
                                              ▼           │
                                           Phase 7 ◄──────┘
                                              │
                                              ▼
                                           Phase 8
```

- **Phase 1 → Phase 2:** 自動保存は DayNote取得フックの上に乗る
- **Phase 2 → Phase 3:** TODO/障害/振り返りの編集を保存する基盤が要先
- **Phase 4 は Phase 2/3 と一部並行可能:** CodeMirror統合（T-4-03）と NoteEntry API（T-4-01）は Phase 3 と並行できる
- **Phase 5 は Phase 4 必須:** 変換はノート本文とTODO/障害の両方に依存
- **Phase 6 は Phase 5 と並行可能:** 持ち越しは Phase 3（TODO）にのみ依存
- **Phase 7 は Phase 4/5/6 の後:** 全ショートカット対象UIが揃ってから

### クリティカルパス

```
T-0-01 → T-0-05 → T-1-04 → T-1-07 → T-1-08 → T-2-07 → T-3-10 → T-4-03 → T-5-06 → T-5-09 → T-7-05 → T-8-01
```

この経路が最も依存が深く、後ろにずれると全体が遅延する。

---

## AC達成トラッカー

各ACがどのタスクで達成されるか。複数タスクが連携する場合は主タスクを `*` で示す。

| AC | 内容 | 主タスク |
|----|------|----------|
| AC-01 | 当日DayNote自動生成 | T-1-07*, T-1-08, T-1-11 |
| AC-02 | 入力内容の永続化 | T-2-09, T-3-04, T-3-10*, T-3-13 |
| AC-03 | `⌘/Ctrl+J` でノートモード | T-4-05*, T-4-09, T-7-04 |
| AC-04 | `Esc`/`⌘J` で戻る・入力保持 | T-4-01, T-4-05*, T-4-08 |
| AC-05 | 選択行TODO化・ノート留まる | T-5-06, T-5-09*, T-5-12 |
| AC-06 | 重複TODO化で確認 | T-5-06, T-5-11* |
| AC-07 | 選択行障害化 | T-5-07, T-5-09*, T-5-12 |
| AC-08 | 発生元スナップショット | T-5-05, T-5-06, T-5-13* |
| AC-09 | TODO完了切替 | T-3-01, T-3-04, T-3-10*, T-3-14 |
| AC-10 | 前日/翌日/今日移動 | T-1-01, T-1-09, T-1-14*, T-7-04 |
| AC-11 | 未完了TODO持ち越し | T-6-01, T-6-03, T-6-05* |
| AC-12 | 重複持ち越し防止 | T-6-01*, T-6-03 |
| AC-13 | 保存状態 `saving → saved` | T-2-01, T-2-07*, T-2-09 |
| AC-14 | 保存失敗で `error` | T-2-03, T-2-07*, T-2-08 |
| AC-15 | キーバインド設定の永続化 | T-7-01, T-7-02* |
| AC-16 | Vim `i` で Insert | T-7-05, T-7-07*, T-7-08 |
| AC-17 | Vim Insert `Esc` で Normal | T-7-05, T-7-09* |
| AC-18 | Vim Normal `Esc` でモード戻り | T-7-09* |
| AC-19 | IME変換中 `Esc` の優先順位 | T-4-06, T-7-09*, T-7-11 |
| AC-20 | Vim `h/j/k/l` 移動 | T-7-05, T-7-06* |
| AC-21 | 単一ユーザー・PostgreSQL保存 | T-0-04, T-0-05, T-1-04* |
| AC-22 | Post-MVPショートカットは不発 | T-7-10*, T-7-11 |

---

## ユーザーストーリー → タスク対応表

| US | Epic | 対応タスク |
|----|------|------------|
| US-MVP-001 | 今日のDayNoteを開く | T-1-08, T-1-12, T-1-13 |
| US-MVP-002 | 前日・翌日・今日移動 | T-1-09, T-1-14, T-7-04 |
| US-MVP-003 | 今日のテーマ入力 | T-1-13, T-2-09 |
| US-MVP-004 | TODO管理 | T-3-04, T-3-10, T-7-03 |
| US-MVP-005 | 障害・詰まり管理 | T-3-06, T-3-12 |
| US-MVP-006 | 振り返り | T-3-07, T-3-13 |
| US-MVP-007 | ノート本文 | T-4-01, T-4-03, T-4-04 |
| US-MVP-008 | モード切替 | T-4-05, T-4-07 |
| US-MVP-009 | ノート行TODO化 | T-5-06, T-5-09, T-5-10, T-5-11 |
| US-MVP-010 | ノート行障害化 | T-5-07, T-5-09 |
| US-MVP-011 | 自動保存 | T-2-01〜T-2-15 |
| US-MVP-012 | 未完了TODO持ち越し | T-6-01〜T-6-06 |
| US-MVP-013 | 標準キーバインド | T-7-03, T-7-04 |
| US-MVP-014 | キーバインド設定 | T-7-01, T-7-02 |
| US-MVP-015 | Vimキーバインド | T-7-05〜T-7-09 |

---

## 進捗サマリー（自動集計用）

各フェーズの完了タスク数。更新時に手動で反映、またはスクリプトで集計。

| フェーズ | タスク総数 | 完了 | 状態 |
|----------|------------|------|------|
| Phase 0 | 12 | 0 | 未着手 |
| Phase 1 | 14 | 0 | 未着手 |
| Phase 2 | 15 | 0 | 未着手 |
| Phase 3 | 14 | 0 | 未着手 |
| Phase 4 | 10 | 0 | 未着手 |
| Phase 5 | 14 | 0 | 未着手 |
| Phase 6 | 6 | 0 | 未着手 |
| Phase 7 | 11 | 0 | 未着手 |
| Phase 8 | 7 | 0 | 未着手 |
| **合計** | **103** | **0** | — |

---

## リスク・軽減策（[implementation_plan.md](implementation_plan.md) から引用・更新）

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| PostgreSQL同梱のバイナリ肥大化・起動複雑化 | T-0-05, T-8-05 | リポジトリIFで抽象化（[architecture.md §2.2](architecture.md)）、最悪SQLite差し替え可能 |
| CodeMirror Vim拡張とIMEの干渉 | T-7-05, T-7-09 | Phase 4（T-4-03）で早めに `@codemirror/vim` の挙動を検証。AC-19 を重点E2Eに |
| 自動保存のPOST二重作成 | T-2-07, T-3-10 | T-2-14 のリクエストID重複排除（推奨）、または冪等設計 |
| 変換時の `lineHash` 衝突 | T-5-03 | SHA-256先頭16文字で実用上衝突無視、異常時はDB一意制約で検出 |
| Electron `before-quit` で保存待ちきれない | T-2-13 | localStorageフォールバック（[autosave_spec.md §6.2/§10](autosave_spec.md)）を真の保険に |
| 巨大ノートでマーク追従が重い | T-5-10 | 編集行と前後のみ再計算、またはデバウンス（[edge_cases.md §6.2](edge_cases.md)） |

---

## スコープ外の再確認（[要件 5.2](dayborad_requirements.md)）

本ロードマップは MVP 範囲のみ。以下は含めない。要望が出た場合は別フェーズとして扱う。

- 長期目標管理 / プロジェクト管理 / ガントチャート
- チーム共有 / 権限管理
- AI要約 / AI整形 / 自動分類
- カレンダー連携 / 外部チャット連携 / 外部同期
- モバイル・タブレット最適化（React Native は Post-MVP）
- 通知機能 / コマンドパレット
- ノート行→振り返り直接送信 / 時刻見出しショートカット
- Vim高度操作（`gg`/`G`/`A`/`o`/`O`/`dd`/`u`/`Ctrl+r`/`/`/`n`/`N`）
- ユーザーによる個別キーマップ編集

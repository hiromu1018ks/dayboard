# dayborad MVP 実装計画

本書は、dayborad MVPを [要件定義書](dayborad_requirements.md) のスコープどおりに実装するためのフェーズ分割と実装順を定める。各フェーズは依存関係に基づき、**DayNote CRUD → 自動保存 → 仕事整理モード → ノートモード → 変換 → 持ち越し → キーバインド** の順で進める（ユーザー指定の自然な順序）。

- 関連ドキュメント: [architecture.md](architecture.md) / [database_schema.md](database_schema.md) / [api_contract.md](api_contract.md) / [ui_interaction_spec.md](ui_interaction_spec.md) / [autosave_spec.md](autosave_spec.md) / [note_conversion_spec.md](note_conversion_spec.md) / [dev_setup.md](dev_setup.md) / [test_strategy.md](test_strategy.md) / [edge_cases.md](edge_cases.md)
- 各フェーズの完了定義: 列挙した機能が動作し、[test_strategy.md](test_strategy.md) に基づく該当テストが通ること

---

## 0. 実装順の全体像

```text
Phase 0: プロジェクト基盤
    │
    ▼
Phase 1: DayNote CRUD（日付単位のノート最低線）
    │
    ▼
Phase 2: 自動保存（入力が失われない保証）
    │
    ▼
Phase 3: 仕事整理モード（TODO / 障害 / 振り返り）
    │
    ▼
Phase 4: ノートモード（会議メモ本文）
    │
    ▼
Phase 5: ノート変換（TODO化 / 障害化）
    │
    ▼
Phase 6: 未完了TODOの翌日持ち越し
    │
    ▼
Phase 7: キーバインド（標準 / Vim）
    │
    ▼
Phase 8: 統合・E2E・リリース確認
```

各フェーズは前のフェーズの成果物に依存する。フェーズ内の作業は並列化可能なものもあるが、依存方向は守る。

---

## Phase 0: プロジェクト基盤

**目標:** [dev_setup.md](dev_setup.md) の環境が整い、空のElectronアプリが起動してHono+PostgreSQLへ接続できる状態を作る。

### 作業

1. **モノレポ初期化**
   - `package.json`（ルート）、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.nvmrc`、`.gitignore`
   - [architecture.md §5](architecture.md) のディレクトリ構成を生成
2. **パッケージスケルトン**
   - `packages/domain`, `packages/shared-types`, `packages/repository`
   - `apps/api`（Hono）、`apps/desktop/main`、`apps/desktop/renderer`（React + Vite）
3. **PostgreSQL ローカル準備**
   - 開発用DB `dayborad_dev` 作成、`.env`/`.env.example` 設定（[dev_setup.md §3.2](dev_setup.md)）
4. **マイグレーション初期ファイル `0001_init.sql`**
   - [database_schema.md §3](database_schema.md) の全テーブル CREATE 文（循環FKは [§7.3](database_schema.md) の手順で）
   - `user_settings` のデフォルト行をシード
5. **起動フロー実装**
   - Electron main: PostgreSQL接続 → マイグレーション → Hono起動（動的ポート）→ BrowserWindow（[architecture.md §6.1](architecture.md)）
   - Renderer: `window.__API_BASE_URL__` 受け取り
6. **`package.json` scripts**
   - [dev_setup.md §4](dev_setup.md) のコマンド群（`dev`/`dev:api`/`dev:renderer`/`db:migrate`/`db:seed`/`db:reset`/`lint`/`typecheck`/`test` 等）

### 完了定義

- `pnpm dev` で Electronアプリが起動し、空画面でもエラーが出ない
- `pnpm dev:api` で Hono が立ち上がり、`GET /api/health` 等の最小エンドポイントが応答する
- `pnpm db:migrate` でスキーマが適用され、`user_settings` にデフォルト行がある

### 対象AC

- （間接）AC-21: PostgreSQLに接続できる基盤

---

## Phase 1: DayNote CRUD

**目標:** 日付単位のノート最低線を作る。AC-01, AC-10（一部）、US-MVP-001, US-MVP-002。

### バックエンド（apps/api, packages/repository）

1. **リポジトリ実装**
   - `DayNoteRepository`（[database_schema.md §11](database_schema.md)）: `findByDate`, `findById`, `create`, `update`
   - 日付計算ユーティリティ（`addDays`, ローカル日付文字列取得）を `packages/domain` に（[database_schema.md §8](database_schema.md)）
2. **エンドポイント**
   - `GET /api/day-notes/:date/full`（[api_contract.md §3](api_contract.md)）: 存在しない日付は DayNote + Reflection + NoteEntry を自動生成
   - `GET /api/day-notes/today/full`（ローカル日付計算）
   - `PATCH /api/day-notes/:date`（`theme`, `lastOpenedMode`）
3. **Reflection / NoteEntry リポジトリ**
   - DayNote生成時に空行を作成するため、最小限の `create` を実装
4. **エラーハンドラ**
   - [api_contract.md §1.4/§8](api_contract.md) の統一エラー形式ミドルウェア

### フロントエンド（renderer）

1. **DayNote取得フック**
   - `useDayNote(date)` で `GET /full` を呼び、UI状態へ反映
2. **ヘッダー**
   - 日付・曜日表示、テーマ入力欄、日付移動ボタン（`‹` / `›` / 「今日」）
3. **日付移動**
   - [ui_interaction_spec.md §7](ui_interaction_spec.md): 前日/翌日/今日で `currentDate` 更新
4. **テーマ入力**
   - `PATCH` 自動保存は Phase 2 で仕込むが、入力欄自体を配置

### テスト（[test_strategy.md](test_strategy.md)）

- Unit: 日付計算、DayNoteユースケース（[§3.1](test_strategy.md), [§3.2](test_strategy.md)）
- Integration: `GET /full` の自動生成、一意制約違反（[§4.2](test_strategy.md)）

### 完了定義

- アプリ起動で当日 DayNote が表示される（AC-01）
- 前日/翌日/今日移動が動く（AC-10 自動生成含む）
- テーマ入力欄がある（永続化は Phase 2）

### 対象AC

- AC-01, AC-10

---

## Phase 2: 自動保存

**目標:** 「入力内容を失わない」保証を確立する。AC-13, AC-14, US-MVP-011。**MVP成功指標「自動保存失敗による入力喪失 0件」の基盤** をここで作る。

### フロントエンド（renderer）

1. **自動保存ステートマシン**
   - [autosave_spec.md §5](autosave_spec.md) の FSM（`idle`/`saving`/`saved`/`error`）
   - 編集対象ごとのデバウンス（800ms、[§3](autosave_spec.md)）
2. **保存状態表示**
   - [ui_interaction_spec.md §10](ui_interaction_spec.md): 右上に「保存中...」/「保存済み」/「保存できませんでした」
3. **即時保存とflush**
   - [autosave_spec.md §2.2/§4](autosave_spec.md): 追加/削除/完了/並替/変換/持ち越しは即時保存
   - flush トリガ: モード切替・日付移動・アプリ終了（[§4](autosave_spec.md)）。遷移の完了条件はlocalStorageへの対象別スナップショット同期であり、サーバーリトライ完了ではない
4. **リトライ**
   - 指数バックオフ 1s/2s/4s、最大3回（[§7](autosave_spec.md)）
   - 上限到達で「再試行」ボタン
5. **localStorage フォールバック**
   - [autosave_spec.md §6.2](autosave_spec.md): `dayborad:pending:${date}` への対象別dirty書込・部分成功時の対象単位削除・起動時リカバリ

### バックエンド

1. **`PATCH` エンドポイントの検証強化**
   - テーマ空文字→`null` 正規化（[api_contract.md §4](api_contract.md)）
   - 部分更新の確実な処理
2. **（推奨）POST重複排除**
   - リクエストIDベースの60秒重複排除（[autosave_spec.md §8.2](autosave_spec.md)）

### テスト

- Unit: 自動保存FSM、デバウンス、リトライ、localStorage（[§3.7](test_strategy.md)）
- Integration: 部分保存の確実性
- E2E（段階導入）: アプリ再起動で入力保持（[§5.2 4.1](test_strategy.md)）

### 完了定義

- テーマ編集が800ms後に保存され、状態表示が `saving → saved` に遷移（AC-13）
- 保存失敗で `error` 表示、リトライされる（AC-14）
- アプリ強制終了後、再起動で未保存分が復元される（localStorageリカバリ）

### 対象AC

- AC-13, AC-14（+ 入力喪失0件の基盤）

---

## Phase 3: 仕事整理モード（TODO / 障害 / 振り返り）

**目標:** 3カラムの仕事整理モードを完成させる。AC-02, AC-09, US-MVP-003, US-MVP-004, US-MVP-005, US-MVP-006。

### バックエンド

1. **リポジトリ実装**
   - `TodoRepository`（`listByDayNote`, `create`, `update`, `reorder`, `findByCarriedFrom`）
   - `BlockerRepository`、`ReflectionRepository`
2. **エンドポイント**（[api_contract.md §5-7](api_contract.md)）
   - TODO: `POST`, `PATCH`（title/status）, `POST /reorder`, `DELETE`
   - Blocker: `POST`, `PATCH`（text/resolved/linkedTodoId）, `POST /reorder`, `DELETE`
   - Reflection: `PATCH /api/day-notes/:date/reflection`
3. **TODO状態遷移バリデーション**
   - [database_schema.md §3.3](database_schema.md): `INVALID_TRANSITION` を返す
4. **並替ロジック**
   - `orderedIds` 過不足チェック、`order` 再採番

### フロントエンド

1. **3カラムレイアウト**（要件 6.2）
   - TODO / 障害 / 振り返り。Tailwindでノート風UI（要件 14）
2. **TODO リスト**
   - 追加・完了切替・本文編集・削除（[ui_interaction_spec.md §5](ui_interaction_spec.md)）
   - 並替（ドラッグ or キーボード）
3. **障害リスト**
   - 追加・編集・解消切替・TODO紐付け（任意）
4. **振り返り**
   - 3セクション（できたこと/止まったこと/明日の一手）
5. **自動保存接続**
   - Phase 2 のFSMへ各編集を接続

### テスト

- Unit: TODO状態遷移（[§3.4](test_strategy.md)）
- Integration: CRUD, reorder, `INVALID_TRANSITION`（[§4.2](test_strategy.md)）

### 完了定義

- テーマ・TODO・障害・振り返りの入力が日付に紐づいて保存され、再起動後も同じ内容（AC-02）
- TODO完了切替が動作（AC-09）
- 並替が動作

### 対象AC

- AC-02, AC-09

---

## Phase 4: ノートモード

**目標:** ノートモードで会議メモ本文を書けるようにする。AC-03, AC-04, US-MVP-007, US-MVP-008。

### バックエンド

1. **`NoteEntryRepository`**
   - `findByDayNote`, `updateBody`
2. **`PATCH /api/day-notes/:date/note-entry`**（[api_contract.md §7](api_contract.md)）
   - 本文全文一括更新

### フロントエンド

1. **CodeMirror統合**（[architecture.md](architecture.md) 技術スタック）
   - `apps/desktop/renderer` に CodeMirror、Tailwind で広いテキストエリア（要件 6.3）
2. **モード切り替え**（[ui_interaction_spec.md §4](ui_interaction_spec.md)）
   - `viewMode` state、`⌘/Ctrl+J`、`Esc` の基本ハンドリング（Vimは Phase 7）
3. **IME保護**（[ui_interaction_spec.md §9](ui_interaction_spec.md)）
   - `isComposing` チェック、`Esc` 優先順位（[§9.2](ui_interaction_spec.md)）
4. **flush on モード切替**
   - [autosave_spec.md §9.1](autosave_spec.md): 切替前に保留内容を対象別localStorageスナップショットへflushし、サーバー同期はバックグラウンド継続
5. **自動保存接続**
   - CodeMirror入力 → デバウンス → `PATCH /note-entry`

### テスト

- Integration: `PATCH /note-entry`（[§4.2](test_strategy.md)）
- E2E: モード切替（[§5.2 4.2](test_strategy.md)）

### 完了定義

- `⌘/Ctrl+J` でノートモードに切替（AC-03）
- `Esc`/`⌘J` で戻り、入力途中の本文が失われない（AC-04）

### 対象AC

- AC-03, AC-04

---

## Phase 5: ノート変換（TODO化 / 障害化）

**目標:** dayborad のコア体験「④ → ①/②」を実装する。AC-05〜AC-08, US-MVP-009, US-MVP-010。**最もドメインロジックが集中するフェーズ**。

### バックエンド（packages/domain + apps/api）

1. **変換ドメイン関数**（[note_conversion_spec.md §12](note_conversion_spec.md)）
   - `normalizeLineText`, `extractTitle`, `computeLineHash`
2. **`NoteLineMetaRepository`**
   - `findByNoteEntryAndLineHash`, `create`
3. **変換エンドポイント**（[api_contract.md §9](api_contract.md)）
   - `POST /api/day-notes/:date/convert/todo`
   - `POST /api/day-notes/:date/convert/blocker`
   - `?force=1` で重複バイパス
   - 1トランザクションで `TodoItem`/`BlockerItem` + `NoteLineMeta` 作成
   - 重複時 409 `DUPLICATE_CONVERSION`
4. **AC-08 スナップショット保証**
   - `NoteLineMeta.lineText`（原文）を保持（要件 7.8）

### フロントエンド

1. **行選択・変換UI**（[ui_interaction_spec.md §6.2](ui_interaction_spec.md)）
   - カーソル行取得、`⌘/Ctrl+Enter` でTODO化、`⌘/Ctrl+Shift+B` で障害化
   - 空行時は通知「空行は変換できません」
2. **変換済みマーク**（[note_conversion_spec.md §8](note_conversion_spec.md)）
   - CodeMirrorガターに `✓T` / `✓B` 表示
   - 行編集後の `lineHash` 追従
3. **重複確認ダイアログ**（[note_conversion_spec.md §7](note_conversion_spec.md)）
   - 409受頍時に表示、キャンセル/別TODO作成
4. **通知・ハイライト**
   - 変換成功時のトースト（2s）、仕事整理モード復帰時の1.2sハイライト（[ui_interaction_spec.md §4.3/§6.2](ui_interaction_spec.md)）
5. **発生元表示**（[note_conversion_spec.md §9](note_conversion_spec.md)）
   - TODO/障害ホバーで `NoteLineMeta.lineText` ポップアップ

### テスト

- Unit: `extractTitle`/`normalizeLineText`/`computeLineHash` の境界値（[§3.5](test_strategy.md)）+ [edge_cases.md](edge_cases.md) 変換系
- Integration: 変換トランザクション、重複409、force、`ON DELETE SET NULL`（[§4.2](test_strategy.md)）
- E2E: 変換シナリオ（[§5.2 4.3](test_strategy.md)）

### 完了定義

- 選択行TODO化・障害化が動作、ノートモードに留まる（AC-05, AC-07）
- 重複確認が表示され、キャンセルで作成しない（AC-06）
- 元行編集後もTODO本文は変わらず、発生元スナップショットを確認可能（AC-08）

### 対象AC

- AC-05, AC-06, AC-07, AC-08

---

## Phase 6: 未完了TODOの翌日持ち越し

**目標:** 夕方の利用フローを完成させる。AC-11, AC-12, US-MVP-012。

### バックエンド

1. **持ち越しユースケース**（`packages/domain`）
   - [test_strategy.md §3.3](test_strategy.md): 未完了のみ、翌日DayNote自動生成、重複スキップ
2. **`POST /api/day-notes/:date/carry-over`**（[api_contract.md §10](api_contract.md)）
   - 1トランザクションで: 翌日DayNote確保 → 重複チェック → 新TODO作成（`carriedFromTodoId` / `carriedFromDate` 付き）→ 元TODO `carried` 化
   - 部分成功応答（`carried` / `skipped`）

### フロントエンド

1. **持ち越しUI**
   - TODO単位、または未完了一括のトグル（US-MVP-012 Open Questions → 実装時に最終決定、本計画では両方の導線を用意し、まず一括を主軸に）
   - 実行後、当日側は「→ 翌日へ持ち越し済み」、翌日側は `carriedFromDate` を使って「7/8から持ち越し」表示（要件 7.10 表示例）
2. **`carried` 表示**
   - ステータス `carried` のTODOの見せ方（要件 7.10 表示例）

### テスト

- Unit: 持ち越しユースケース（[§3.3](test_strategy.md)）
- Integration: `POST /carry-over` のトランザクション・重複スキップ・翌日自動生成（[§4.2](test_strategy.md)）

### 完了定義

- 未完了TODOが翌日に持ち越され、元は `carried`、翌日に `carriedFromTodoId` / `carriedFromDate` 付き（AC-11）
- 重複持ち越しはスキップされる（AC-12）

### 対象AC

- AC-11, AC-12

---

## Phase 7: キーバインド（標準 / Vim）

**目標:** 要件 8 の全ショートカットを完成させる。AC-15〜AC-20, AC-22, US-MVP-013, US-MVP-014, US-MVP-015。

### バックエンド

1. **`UserSettings` エンドポイント**（[api_contract.md §11](api_contract.md)）
   - `GET /api/settings`, `PATCH /api/settings`
   - `keybindingMode`, `vimDefaultState`

### フロントエンド

1. **設定モーダル**（[ui_interaction_spec.md §8](ui_interaction_spec.md)）
   - ヘッダー右の歯車アイコンから開く
   - ラジオで `standard`/`vim`、Vim時に `vimDefaultState`
2. **標準キーバインド完成**
   - [ui_interaction_spec.md §11.1-11.3](ui_interaction_spec.md) の全ショートカット
   - `⌘/Ctrl+1/2/3`（列フォーカス）、`⌘/Ctrl+Enter`（TODO追加）、`Alt/Option+←/→`（日付移動）、`⌘/Ctrl+T`（今日）
3. **Vimキーバインド**（[ui_interaction_spec.md §3.4/§3.5/§11.4](ui_interaction_spec.md)）
   - CodeMirror `@codemirror/vim` 拡張の有効化
   - `h/j/k/l`: Normal=列/項目移動、Insert=テキストカーソル移動（[§3.4](ui_interaction_spec.md)）
   - `i`/`Esc`/`x`/`Space n/1/2/3/t/b`
   - Vim状態表示（`VIM NORMAL`/`VIM INSERT`、右下、[要件 9.4](dayborad_requirements.md)）
4. **IME保護の最終調整**（[ui_interaction_spec.md §9](ui_interaction_spec.md)）
   - Vim Insert中のIME、`Esc` の4段優先順位
5. **Post-MVPショートカットの無効化**（AC-22）
   - `⌘/Ctrl+K` 等は発火せず、入力破壊しない

### テスト

- E2E: Vim系（[§5.2 4.4](test_strategy.md)）、IME（[§5.2 4.5](test_strategy.md)）、Post-MVP不発（[§5.2 4.6](test_strategy.md)）

### 完了定義

- 設定で `standard`/`vim` 切替、再起動後も維持（AC-15）
- Vim `i`/`Esc`/`h/j/k/l`/`x`/`Space系` 動作（AC-16〜AC-20）
- IME変換中の `Esc` が仕様どおり優先順位で処理（AC-19）
- Post-MVPショートカットが不発で入力破壊しない（AC-22）

### 対象AC

- AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-22

---

## Phase 8: 統合・E2E・リリース確認

**目標:** AC-01〜AC-22 をすべて満たし、[要件 4.3 成功指標](dayborad_requirements.md) を確認可能な状態にする。

### 作業

1. **E2Eシナリオの完全網羅**
   - [test_strategy.md §5.2](test_strategy.md) の全シナリオ
   - 特に [§6 重点領域](test_strategy.md)（自動保存・IME・ショートカット・CodeMirror）
2. **[edge_cases.md](edge_cases.md) の検証**
   - TODO削除、TODO本文編集、持ち越し後再編集、同名TODO、空行変換、巨大ノート、保存失敗復旧
3. **「自動保存失敗による入力喪失 0件」の検証**
   - [autosave_spec.md §6](autosave_spec.md) のフェイルセーフ経路のE2E
   - クラッシュ → 再起動で未保存分復元
4. **パフォーマンス確認**（要件 12.1）
   - 起動後すぐに今日のノート表示
   - モード切替が体感即時
   - 入力中の保存で引っかからない
5. **パッケージング**（[dev_setup.md §4.2](dev_setup.md)）
   - `pnpm package` で配布用バイナリ作成
   - PostgreSQL同梱戦略の最終確認（[architecture.md §2.2 注記](architecture.md)）

### 完了定義

- AC-01〜AC-22 全合格
- [要件 4.3](dayborad_requirements.md) 成功指標の測定準備完了（限定配布できる状態）
- [test_strategy.md §8](test_strategy.md) の品質ゲート全通過

---

## フェーズ別AC達成マッピング

| フェーズ | 達成AC |
|----------|--------|
| Phase 1 | AC-01, AC-10 |
| Phase 2 | AC-13, AC-14 |
| Phase 3 | AC-02, AC-09 |
| Phase 4 | AC-03, AC-04 |
| Phase 5 | AC-05, AC-06, AC-07, AC-08 |
| Phase 6 | AC-11, AC-12 |
| Phase 7 | AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-22 |
| Phase 8 | （全AC統合確認） |

AC-21（PostgreSQL保存・認証なし）は Phase 0/1 で基盤として達成済み。

---

## リスクと軽減策

| リスク | 影響フェーズ | 軽減策 |
|--------|--------------|--------|
| PostgreSQL同梱のバイナリ肥大化・起動処理複雑化 | Phase 0, 8 | [architecture.md §2.2 注記](architecture.md) どおりリポジトリIFで抽象化し、最悪SQLite差し替え可能にしておく |
| CodeMirrorのVim拡張とIMEの干渉 | Phase 7 | `@codemirror/vim` の既存挙動を早めに検証（Phase 4で試す）。AC-19 を重点E2Eに |
| 自動保存のPOST二重作成 | Phase 2, 3 | [autosave_spec.md §8.2](autosave_spec.md) のリクエストID重複排除、または冪等設計 |
| 変換時の `lineHash` 衝突 | Phase 5 | SHA-256先頭16文字で実用上衝突無視できるが、異常時はDBの一意制約（[database_schema.md §3.7](database_schema.md)）で検出 |
| Electronの `before-quit` で保存待ちきれない | Phase 2, 8 | localStorageフォールバック（[autosave_spec.md §6.2/§10](autosave_spec.md)）を真の保険に |

---

## スコープ外の再確認（要件 5.2）

本計画は [要件定義書 5.2](dayborad_requirements.md) の初期スコープ外（長期目標管理、チーム共有、AI要約、外部連携、モバイル最適化、通知、コマンドパレット、ノート行→振り返り直接送信、時刻見出しショートカット、Vim高度操作、個別キーマップ編集）を含まない。これらの機能要望が出た場合は本計画外の別フェーズとして扱う。

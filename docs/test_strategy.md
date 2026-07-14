# dayborad テスト戦略

本書は、dayborad MVPの受け入れ条件（[要件定義書 15. MVP受け入れ条件](dayborad_requirements.md) AC-01〜AC-22、および [ユーザーストーリー](dayborad_user_stories.md) の各AC）を、unit / integration / E2E の3層に対応付け、実装者が何をどうテストすべきかを明確にする設計契約である。

- 特に重点項目: **自動保存・IME・ショートカット・CodeMirror周り**（要件 12.1, 9.3, 8.6 注意点、AC-19）
- 関連: [architecture.md](architecture.md) / [autosave_spec.md §11](autosave_spec.md) / [ui_interaction_spec.md](ui_interaction_spec.md) / [dev_setup.md §4.4](dev_setup.md)

---

## 1. テストピラミッドと方針

```text
           ┌───────────┐
           │    E2E    │  Electronアプリ全体。主要AC・クリティカルパス
           └───────────┘
         ┌───────────────┐
         │ Integration   │  Hono + PostgreSQL、複数レイヤー
         └───────────────┘
       ┌───────────────────┐
       │     Unit          │  ピュアTS（domain/shared-types）。厚く
       └───────────────────┘
```

### 1.1 基本方針

| 層 | 対象 | 割合の目安 | ツール（指針） |
|----|------|------------|----------------|
| **Unit** | `packages/domain`（正規化、状態遷移、lineHash、タイトル生成）、`packages/shared-types` の検証、自動保存ステートマシン（モック） | 多い | Vitest |
| **Integration** | Honoエンドポイント + リポジトリ + PostgreSQL（テスト用DB）、変換トランザクション、持ち越し生成 | 中程度 | Vitest + テスト用PostgreSQL |
| **E2E** | Electronアプリ全体。AC-01〜AC-22のユーザー視点シナリオ、ショートカット、IME、CodeMirror操作 | 少ない（クリティカルのみ） | Playwright（Electron対応） |

### 1.2 テストツール指針

- **Unit/Integration:** [Vitest](https://vitest.dev/)（Viteエコシステム、TypeScript親和性）
- **E2E:** [Playwright](https://playwright.dev/) の Electronサポート（`_electron`）
- **DBテスト:** テスト専用のPostgreSQLデータベース（例: `dayborad_test`）。各テストでトランザクションロールバックまたはTRUNCATEで隔離
- **モック:** HonoのリポジトリはIFベースで差し替え可能（[database_schema.md §11](database_schema.md)）。結合テストでは実PostgreSQL、Unitではインメモリモックを使う

---

## 2. 受け入れ条件 → テスト層の対応表

[要件定義書 15. MVP受け入れ条件](dayborad_requirements.md) AC-01〜AC-22 を3層に振り分ける。1つのACが複数層にまたがる場合は、その旨を記載する。

### 2.1 対応表

| AC | 内容 | 主テスト層 | 補助層 | テスト観点 |
|----|------|------------|--------|------------|
| AC-01 | 当日DayNote自動生成 | Integration | Unit | 存在しない日付で `GET /full` → DayNote生成（[§3.1](#31-ac-01-当日daynote自動生成)） |
| AC-02 | 入力内容の永続化 | E2E | Integration | 入力 → 再起動 → 同じ内容（[§4.1](#41-ac-02-入力内容の永続化)） |
| AC-03 | `⌘/Ctrl+J` でノートモード切替 | E2E | — | ショートカット検出・切替（[§4.2](#42-ac-03-モード切替)） |
| AC-04 | `Esc`/`⌘J` で戻る、入力保持 | E2E | — | 切替前のflush（[autosave_spec.md §9.1](autosave_spec.md)） |
| AC-05 | 選択行TODO化、ノートモード留まる | E2E | Integration, Unit | 正規化・NoteLineMeta生成・マーク（[§3.5](#35-ac-05ac-07-変換)） |
| AC-06 | 重複TODO化で確認 | E2E | Integration | 409応答・ダイアログ（[§3.5](#35-ac-05ac-07-変換)） |
| AC-07 | 選択行障害化 | E2E | Integration, Unit | AC-05と同構造 |
| AC-08 | 発生元スナップショット保持 | Integration | Unit | NoteLineMeta.lineText 保持（[§3.5](#35-ac-05ac-07-変換)） |
| AC-09 | TODO完了切替 | Unit + E2E | Integration | 状態遷移 `todo↔done`（[database_schema.md §3.3](database_schema.md)） |
| AC-10 | 前日/翌日/今日移動、自動生成 | Integration + E2E | — | 日付計算・`GET /full`（[§3.2](#32-ac-10-日付移動)） |
| AC-11 | 未完了TODO持ち越し | Integration | Unit | トランザクション・`carried`遷移・持ち越し元日付保持（[§3.3](#33-ac-11ac-12-持ち越し)） |
| AC-12 | 重複持ち越し防止 | Integration | Unit | 同`carriedFromTodoId`でスキップ |
| AC-13 | 保存状態 `saving → saved` | Unit | E2E | 自動保存FSM（[autosave_spec.md §5](autosave_spec.md)） |
| AC-14 | 保存失敗で `error` 表示 | Unit + Integration | E2E | リトライ・状態遷移 |
| AC-15 | キーバインド設定の永続化 | Integration | E2E | `PATCH /api/settings` |
| AC-16 | Vim `i` で Insert | E2E | — | CodeMirror Vim拡張 |
| AC-17 | Vim Insert `Esc` で Normal（ノート離脱しない） | E2E | — | [ui_interaction_spec.md §9.2](ui_interaction_spec.md) |
| AC-18 | Vim Normal `Esc` でモード戻り | E2E | — | 同上 |
| AC-19 | IME変換中 `Esc` の優先順位 | E2E | Unit | `isComposing` チェック（[§4.5](#45-ac-19-ime扱い最重要)） |
| AC-20 | Vim `h/j/k/l` 移動 | E2E | Unit | Normal=列/項目移動（[§4.4](#44-ac-20-vim-hjkl-移動)） |
| AC-21 | 単一ユーザー・PostgreSQL保存 | Integration | — | 認証なしでCRUD（[§3.6](#36-ac-21-単一ユーザーローカル保存)） |
| AC-22 | Post-MVPショートカットは不発、入力破壊しない | E2E | — | `⌘K`等の無効化（[§4.6](#46-ac-22-post-mvpショートカットの不発)） |

---

## 3. Unit テスト詳細

`packages/domain` を中心に、ピュア関数とステートマシンを厚くテストする。実行環境にPostgreSQL不要で高速。

### 3.1 AC-01 当日DayNote自動生成

- 対象: `DayNoteRepository.findByDate` のモック + ユースケース
- 観点: 存在しない日付 → `create()` が呼ばれる、存在する日付 → 既存を返す

### 3.2 AC-10 日付移動

- 対象: 日付計算ユーティリティ（`addDays(date, +1)` 等）
- 観点:
  - 月境界（1/31 → 2/1）、うるう年（2/28 → 2/29）、年末（12/31 → 1/1）
  - ローカル日付文字列の計算（[database_schema.md §8](database_schema.md）、`new Date()` 依存を避けるため時刻注入）

### 3.3 AC-11/AC-12 持ち越し

- 対象: 持ち越しユースケース（`carryOver(todoIds)`）をモックリポジトリで
- 観点:
  - 未完了TODOのみ対象。`done` はエラー。`carried` は翌日側に `carriedFromTodoId` の重複が存在すれば `skipped`、重複先が存在しない不整合時のみエラー
  - 翌日DayNote自動生成
  - 重複スキップ（`carriedFromTodoId` 既存なら `skipped` 行追加）
  - 元TODOが `carried` に遷移、新TODOの `carriedFromTodoId` / `carriedFromDate` 設定

### 3.4 TODO状態遷移

- 対象: `TodoItem.status` 遷移関数（[database_schema.md §3.3](database_schema.md)）
- 観点:
  - `todo → done` OK、`completedAt` セット
  - `done → todo` OK、`completedAt` NULL
  - `todo → carried` OK（持ち越し経路のみ）
  - `done → carried` / `carried → *` は `INVALID_TRANSITION` 例外

### 3.5 AC-05/AC-07 変換

[note_conversion_spec.md](note_conversion_spec.md) のピュア関数を網羅する。**最も重点的なUnitテスト対象**。

- `normalizeLineText`: [§3](note_conversion_spec.md) の正規化例をすべてケース化
  - 前後空白trim、連続空白圧縮、全角スペース→半角変換
- `extractTitle`: [§4](note_conversion_spec.md) のラベル/記号除去ルール
  - 行頭 `-`/`•`/`・`/`*` 除去（記号直後の空白は0文字以上）
  - 番号リスト `1.`/`2)` 除去（番号直後の空白は0文字以上）
  - ラベル `TODO`/`TODO化`/`やること`/`障害`/`障害化`/`詰まり`/`Blocker`/`メモ` 除去（コロン直後の空白は0文字以上）
  - 空になった場合（`TODO：`のみ、`-`のみ）のエラー判定
  - 200文字超過の切り詰め
- `computeLineHash`: 同一入力で同じハッシュ、異なる `noteEntryId` で別ハッシュ
- 重複判定ロジック: 同 `(noteEntryId, lineHash)` の判定

> **境界値ケースの充実:** [edge_cases.md](edge_cases.md) の変換系エッジケース（空行、同名TODO、行頭記号バリエーション）は、すべてUnitテストとして表現する。

### 3.6 AC-21 単一ユーザー・ローカル保存

- 対象: リポジトリのIF準拠（[database_schema.md §11](database_schema.md)）。Unitではモック実装で検証
- 観点: IFに沿ったCRUDが呼べる（実PostgreSQLとの結合はIntegration層）

### 3.7 自動保存ステートマシン（AC-13/AC-14）

[autosave_spec.md §5](autosave_spec.md) のFSMをモックfetchで検証。

- デバウンス800msのタイマー（疑似タイマー `vi.useFakeTimers()` 使用）
- 入力 → `idle`、タイマー発火 → `saving`、2xx → `saved`
- 失敗 → `error` → リトライ（指数バックオフ 1s/2s/4s）
- リトライ上限到達で最終 `error`
- flush（モード切替/日付移動）で対象別localStorage書込を即時実行
- サーバー保存失敗中でも、localStorage書込成功後はモード切替/日付移動を長時間ブロックしない
- localStorage バッファの対象別書込・部分成功時の対象単位削除・復元（[autosave_spec.md §6](autosave_spec.md)）

---

## 4. Integration テスト詳細

Honoエンドポイント + リポジトリ + テスト用PostgreSQLを実環境で繋ぐ。各テストはトランザクション内で実行し、終了時にロールバック（またはTRUNCATE）で隔離する。

### 4.1 共通セットアップ

- テスト用DB: `dayborad_test`（`.env.test` 等で指定）
- 各テストスイート実行前にマイグレーション適用（`pnpm db:migrate` 相当）
- テストごとに `TRUNCATE day_notes, todo_items, ...` で初期化（またはトランザクションロールバック方式）

### 4.2 代表的なIntegrationテスト

| テスト | API | 観点 |
|--------|-----|------|
| DayNote自動生成 | `GET /api/day-notes/:date/full` | 存在しない日付でDayNote+Reflection+NoteEntryが作られる（[§3.1](#31-ac-01-当日daynote自動生成) と同じだが実DBで検証） |
| TODO CRUD | `POST`/`PATCH`/`DELETE` | 追加の `order` 採番、並替の再採番、削除のcascade |
| TODO状態遷移 | `PATCH /api/todos/:id` | `INVALID_TRANSITION` の400応答 |
| 変換（新規） | `POST /api/day-notes/:date/convert/todo` | NoteLineMeta + TodoItem が1トランザクションで作られる |
| 変換（重複） | 同上 | 409 `DUPLICATE_CONVERSION` と `details.existing` |
| 変換（force） | `?force=1` | 2つ目のTodoItem作成、別id |
| 持ち越し | `POST /api/day-notes/:date/carry-over` | 翌日DayNote自動生成、`carried`遷移、重複スキップ |
| 一意制約 | （DB直接） | `day_notes.date` UNIQUE違反のテスト、`note_entries.day_note_id` UNIQUE違反 |
| 外部キーON DELETE | （DB直接） | DayNote削除 → todo/blocker/reflection/note_entry cascade、Todo削除 → note_line_metas.converted_to_todo_id が SET NULL |

### 4.3 エラー形式の検証

[api_contract.md §1.4](api_contract.md) のエラー形式が全エンドポイントで統一されていることを検証。

- `VALIDATION_ERROR` に `details.fields` 配列が含まれる
- `NOT_FOUND` / `DUPLICATE_CONVERSION` / `INVALID_TRANSITION` / `INTERNAL_ERROR` の各コードとHTTPステータスの組み合わせ
- `DUPLICATE_CARRYOVER` はエラー形式ではなく、持ち越しAPIのHTTP 200レスポンス内 `skipped.reason` として検証する

---

## 5. E2E テスト詳細

Electronアプリ全体をヘッドレスで動かし、ユーザー視点のシナリオを検証する。**ショートカット・IME・CodeMirror** を含むACが主役。

### 5.1 ツール: Playwright (_electron)

```ts
import { _electron as electron } from 'playwright'

const app = await electron.launch({ args: ['.'] })
const window = await app.firstWindow()
```

- 実際のElectronアプリを起動
- Renderer内のDOM操作・キーボードイベント・CodeMirrorの操作が可能

### 5.2 主要E2Eシナリオ

#### 4.1 AC-02 入力内容の永続化

```text
1. アプリ起動
2. 今日のテーマ・TODO・振り返り・ノート本文を入力
3. 自動保存完了を待つ（saveStatus=saved）
4. アプリ再起動
5. 同じ内容が表示されることを検証
```

#### 4.2 AC-03 モード切替

```text
1. 仕事整理モード表示
2. ⌘/Ctrl+J を送信
3. ノートモードに切替わったことを検証（CodeMirrorが見える）
4. ⌘/Ctrl+J または Esc で戻る
```

#### 4.3 AC-05/AC-07 変換

```text
1. ノートモードで本文入力（"10:00 会議\n- TODO化：見積作成\n"）
2. 2行目にカーソル移動
3. ⌘/Ctrl+Enter を送信
4. 変換済みマーク（✓T）が表示されることを検証
5. 仕事整理モードへ戻る
6. TODO列に「見積作成」が追加され、ハイライトされることを検証
```

#### 4.4 AC-20 Vim h/j/k/l 移動

```text
1. UserSettings.keybindingMode = 'vim' に設定
2. 仕事整理モードでTODO複数件
3. ノーマル状態で j → 次のTODO選択
4. k → 前のTODO選択
5. l → 障害列へフォーカス移動
6. h → TODO列へ戻る
```

#### 4.5 AC-19 IME扱い（最重要）

```text
1. テーマ入力欄フォーカス
2. IME変換イベント（compositionstart → compositionupdate → compositionend）を合成
3. 変換中に ⌘/Ctrl+J を送信
4. モード切替が発火しないことを検証
5. 変換確定（compositionend）後の ⌘/Ctrl+J は機能することを検証
```

> **実装ノート:** Playwrightの `page.keyboard` はネイティブIMEを完全には再現しない。`isComposing` 判定のUnitテスト（キーハンドラ先頭の分岐）と併用する。`window.dispatchEvent(new CompositionEvent(...))` で合成イベントを注入する方法で擬似的に検証する。

#### 4.6 AC-22 Post-MVPショートカットの不発

```text
1. 仕事整理モードで ⌘/Ctrl+K を送信
2. コマンドパレットが開かないことを検証
3. 入力内容が破壊されていないことを検証
```

### 5.3 E2Eの実行頻度・CI

- E2Eは実行コストが高いため、**PRごとの必須実行は必須とせず**、mainブランチへのマージ前やリリース前に実行
- ローカルでは `pnpm test:e2e` で実行可能（[dev_setup.md §4.4](dev_setup.md)）
- CIでのElectronヘッドレス実行は追加設定が必要（`xvfb-run` 等、[dev_setup.md §8](dev_setup.md)）

---

## 6. 重点テスト領域（要件が強調する箇所）

### 6.1 自動保存

[autosave_spec.md §11](autosave_spec.md) に列挙した観点を網羅。特に:

- **「自動保存失敗による入力喪失 0件」**（要件 4.3 成功指標）:
  - サーバー同期失敗時の localStorage リカバリ（Unit + Integration）
  - 同一日付内でテーマ保存だけ成功しても、未同期のノート本文/TODOスナップショットが削除されないこと（Unit）
  - アプリクラッシュ → 再起動で未保存分復元（E2E）
  - localStorage書き込み失敗時の「移動する/キャンセル」ダイアログ（[autosave_spec.md §9.3](autosave_spec.md)）（E2E）

### 6.2 IME・日本語入力

- [ui_interaction_spec.md §9](ui_interaction_spec.md) の `isComposing` チェック
- `Esc` の優先順位（[§9.2](ui_interaction_spec.md)）: IME→Vim Insert→モーダル→モード戻り の順が守られること
- Vimキーバインド時、Normal状態でIMEが起動しない（`@codemirror/vim` 拡張の挙動）

### 6.3 ショートカット

- [ui_interaction_spec.md §11](ui_interaction_spec.md) の早見表をE2Eシナリオにマッピング
- Mac/Win差分: `⌘` vs `Ctrl`、`Option` vs `Alt`。テスト実行環境のプラットフォームに応じてキーを切替
- Vim `Space` 系（`Space n` 等）のリーダーキー待ち・200msタイムアウト

### 6.4 CodeMirror周り

- ノート本文の入力 → 自動保存（[§7 api_contract.md](api_contract.md)、全文送信）
- 変換済みマークのガター表示と、行編集後の `lineHash` 追従（[note_conversion_spec.md §8](note_conversion_spec.md)）
- Vim拡張の Normal/Insert 切替（AC-16/17/18）
- 行選択（カーソル行）の取得

---

## 7. テストデータ・フィクスチャ指針

- **フィクスチャは `packages/*/test/fixtures/` に集約**。ドメイン型（[api_contract.md §2](api_contract.md)）に沿ったJSON
- 日付は **固定値（例: `2026-07-08`）** を使い、`new Date()` 依存を避ける。現在日時に依存するテストは時刻注入で制御
- ランダムIDは生成関数をモック可能にし、テストでは固定値で assert できるようにする

---

## 8. カバレッジと品質ゲート

### 8.1 カバレッジ目安

- `packages/domain`: **90% 以上**（ピュア関数中心、高カバレッジが現実的）
- `apps/api`: 80% 以上（Integrationで主要パス網羅）
- `apps/desktop/renderer`: 60% 以上（UIはE2E中心、Unitはロジック抽出部分）。対象は `keybindings/**/*.ts`（selection.ts / vim.ts / focus.ts / standard.ts / escPriority.ts を含む）。selection model と Vim コマンド解析はピュアTSのため高カバレッジを維持。
- `packages/repository`: 70% 以上（IF実装、Integrationで補完）

### 8.2 品質ゲート（CI）

PRのマージ前に以下を必須とする（[dev_setup.md §8](dev_setup.md)）。

| ゲート | 内容 |
|--------|------|
| `pnpm lint` | エラー0 |
| `pnpm typecheck` | エラー0 |
| `pnpm test` | 全pass、domainカバレッジ90%以上 |
| `pnpm test:integration` | 全pass |

E2E（`pnpm test:e2e`）は推奨だが必須にはしない（CI環境の制約による）。

---

## 9. テスト戦略と他ドキュメントの対応

| 本書の節 | 対応ドキュメント |
|----------|------------------|
| §2 AC対応表 | [要件定義書 15](dayborad_requirements.md) / [dayborad_user_stories.md](dayborad_user_stories.md) |
| §3.3 持ち越し | [database_schema.md §3.3](database_schema.md) / [api_contract.md §10](api_contract.md) |
| §3.5 変換 | [note_conversion_spec.md](note_conversion_spec.md) |
| §3.7 自動保存FSM | [autosave_spec.md](autosave_spec.md) |
| §4.2 Integration | [api_contract.md](api_contract.md) / [database_schema.md](database_schema.md) |
| §5.2 E2E | [ui_interaction_spec.md](ui_interaction_spec.md) |
| §6 重点領域 | [autosave_spec.md §11](autosave_spec.md) / [ui_interaction_spec.md §9](ui_interaction_spec.md) |
| §8 CI | [dev_setup.md §8](dev_setup.md) / [implementation_plan.md](implementation_plan.md) |

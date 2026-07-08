# dayborad API契約

本書は、[architecture.md](architecture.md) で決定したHono API層のエンドポイント・リクエスト/レスポンス形式・バリデーション・エラー形式・自動保存の保存単位を固定する設計契約である。UIとAPIを並行実装するための単一の真実源とする。

- 参照: [要件定義書 7. 機能要件](dayborad_requirements.md) / [architecture.md §7 通信とアドレス構成](architecture.md)
- 関連: [database_schema.md](database_schema.md) / [autosave_spec.md](autosave_spec.md) / [note_conversion_spec.md](note_conversion_spec.md)

---

## 1. 共通仕様

### 1.1 ベースURL・プロトコル

- ベース: `http://127.0.0.1:{port}/api`
- ポートは起動時にElectron mainが決定し、Rendererへ注入する（[architecture.md §7](architecture.md)）
- プロトコル: HTTP（localhostのみ、C7 認証不要）
- Content-Type: `application/json; charset=utf-8`

### 1.2 日付フォーマット

- 日付パスパラメータ・リクエストボード内の日付: **`YYYY-MM-DD`**（ローカル日付文字列）
- タイムスタンプ（`createdAt` 等）: ISO 8601 UTC（`2026-07-08T01:23:45.000Z`）
- 詳細は [database_schema.md §8](database_schema.md)

### 1.3 共通レスポンス原則

- 成功時: リソースJSONそのもの、または空の `200 OK` / `204 No Content`
- 配列は裸で返さず、後述の **リソースオブジェクト群** をまとめたレスポンスにする
- 単一リソースは `data` に包まず、プロパティをトップレベルに並べる（Honoで素直に扱うため）

### 1.4 エラー形式（統一）

エラーは以下の形式で返す（[§8 エラー一覧](#8-エラー一覧) も参照）。

```json
{
  "error": {
    "code": "DUPLICATE_CONVERSION",
    "message": "この行はすでにTODO化されています。",
    "details": {
      "existing": { "id": "todo_abc", "title": "見積作成" }
    }
  }
}
```

| フィールド | 型 | 内容 |
|-----------|----|------|
| `error.code` | string | マシン可読エラーコード（SCREAMING_SNAKE_CASE） |
| `error.message` | string | ユーザー表示可能な日本語メッセージ |
| `error.details` | object? | コードごとの追加情報。省略可 |

バリデーションエラーは `details` に `fields` 配列を置く。

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容に誤りがあります。",
    "details": {
      "fields": [
        { "field": "title", "message": "タイトルは必須です。" }
      ]
    }
  }
}
```

### 1.5 HTTPステータスコード運用

| コード | 用途 |
|--------|------|
| 200 | 取得成功、更新成功、部分成功（例: 持ち越しAPIの `skipped`） |
| 201 | 作成成功 |
| 204 | 削除成功（ボディなし） |
| 400 | バリデーションエラー (`VALIDATION_ERROR`) |
| 404 | リソース不在 (`NOT_FOUND`) |
| 409 | 競合（重複変換 `DUPLICATE_CONVERSION`） |
| 500 | サーバーエラー (`INTERNAL_ERROR`) |

---

## 2. リソース形状（shared-types）

[要件定義書 10. データ設計案](dayborad_requirements.md) のTS型をAPI表現に合わせる。フィールド名は camelCase。

```ts
type DayNote = {
  id: string
  date: string                 // YYYY-MM-DD
  theme: string | null
  lastOpenedMode: 'work' | 'note'
  createdAt: string            // ISO 8601
  updatedAt: string
}

type TodoItem = {
  id: string
  dayNoteId: string
  title: string
  status: 'todo' | 'done' | 'carried'
  order: number
  sourceNoteLineMetaId: string | null
  carriedFromTodoId: string | null
  carriedFromDate: string | null     // YYYY-MM-DD
  createdAt: string
  completedAt: string | null
  updatedAt: string
}

type BlockerItem = {
  id: string
  dayNoteId: string
  text: string
  linkedTodoId: string | null
  sourceNoteLineMetaId: string | null
  resolved: boolean
  order: number
  createdAt: string
  resolvedAt: string | null
  updatedAt: string
}

type Reflection = {
  id: string
  dayNoteId: string
  doneText: string
  stuckText: string
  tomorrowActionText: string
  updatedAt: string
}

type NoteEntry = {
  id: string
  dayNoteId: string
  body: string
  createdAt: string
  updatedAt: string
}

type NoteLineMeta = {
  id: string
  noteEntryId: string
  lineNumberAtConversion: number
  normalizedLineText: string
  lineHash: string
  lineText: string
  convertedToTodoId: string | null
  convertedToBlockerId: string | null
  convertedToReflection: boolean
  convertedAt: string
  createdAt: string
  updatedAt: string
}

type UserSettings = {
  id: string
  keybindingMode: 'standard' | 'vim'
  vimDefaultState: 'normal' | 'insert'
  createdAt: string
  updatedAt: string
}
```

> **NULL運用:** 型案では `theme?` のように optional だが、API表現では明示的に `string | null` とし、未入力を `null` で表す（[database_schema.md §3.1](database_schema.md)）。
> **持ち越し元日付:** `carriedFromDate` は持ち越し先TODOに保存する元DayNoteの日付スナップショット。`GET /full` だけで「2026-07-08から持ち越し」を描画できるよう、`carriedFromTodoId` とあわせて返す。通常TODO・持ち越し元TODOでは `null`。

---

## 3. 「1日のノート全体」取得（画面描画の主役）

仕事整理モード・ノートモードの描画に必要な全データを1リクエストで取る。起動時と日付移動時に呼ぶ。

### `GET /api/day-notes/:date/full`

- パスパラメータ `date`: `YYYY-MM-DD`
- 当日ノートが存在しない場合は**自動生成してから返す**（AC-01）

**200レスポンス:**

```json
{
  "dayNote": { "id": "dn_001", "date": "2026-07-08", "theme": null, "lastOpenedMode": "work", "createdAt": "...", "updatedAt": "..." },
  "todos": [ { "id": "todo_1", "dayNoteId": "dn_001", "title": "見積作成", "status": "todo", "order": 0, "sourceNoteLineMetaId": null, "carriedFromTodoId": null, "carriedFromDate": null, "createdAt": "...", "completedAt": null, "updatedAt": "..." } ],
  "blockers": [],
  "reflection": { "id": "rf_001", "dayNoteId": "dn_001", "doneText": "", "stuckText": "", "tomorrowActionText": "", "updatedAt": "..." },
  "noteEntry": { "id": "ne_001", "dayNoteId": "dn_001", "body": "", "createdAt": "...", "updatedAt": "..." },
  "noteLineMetas": []
}
```

- `todos` / `blockers` は `order` 昇順。
- `noteLineMetas` は当該ノートエントリの全メタ（変換済みマーク表示用）。

### `GET /api/day-notes/today/full`

- 「今日」のローカル日付（[database_schema.md §8](database_schema.md)）で `GET /api/day-notes/:date/full` と等価。
- ショートカット `Cmd/Ctrl+T`（要件 8.1）から呼ぶ。
- 実装はサーバー側でローカル日付を計算し、リダイレクト（307）または直接レスポンス。

---

## 4. DayNote エンドポイント

### `PATCH /api/day-notes/:date`

テーマと最終表示モードの自動保存（[autosave_spec.md](autosave_spec.md)）。本文体は持たない。

**リクエストボディ（部分更新、両方任意）:**

```json
{ "theme": "A社提案を前に進める", "lastOpenedMode": "note" }
```

- `theme`: 空文字列は `null` に正規化して保存（未入力扱い）
- `lastOpenedMode`: `'work'` or `'note'` のみ許可
- 存在しない `date` の場合は 404

**200レスポンス:** 更新後の `DayNote`

---

## 5. TodoItem エンドポイント

### `POST /api/day-notes/:date/todos`

TODO手動追加（要件 7.3、US-MVP-004）。`order` はサーバーが末尾に割り当てる。

**リクエストボディ:**

```json
{ "title": "見積作成" }
```

- `title`: 必須、1文字以上、前後空白は trim、trim後空は `VALIDATION_ERROR`
- 最大長: 200文字（超過は `VALIDATION_ERROR`、実用上の上限）

**201レスポンス:** 作成された `TodoItem`

### `PATCH /api/todos/:id`

TODO個別更新。status切替・タイトル編集・完了日時管理を1エンドポイントに集約（保存単位を細かくするため、[autosave_spec.md](autosave_spec.md)）。

**リクエストボディ（部分更新、いずれか任意）:**

```json
{ "title": "見積作成（修正）", "status": "done" }
```

- `status`:
  - `todo → done`: `completedAt` を `now()` に設定
  - `done → todo`: `completedAt` を `null` に
  - `todo → carried`: 直接のAPI指定は禁止（持ち越しは [§10](#10-持ち越しエンドポイント) 経由）。`carried → *` は `400 INVALID_TRANSITION`
  - `done → carried` / `carried → *`: `400 INVALID_TRANSITION`
- `title`: `POST` と同様の検証

**200レスポンス:** 更新後の `TodoItem`

### `POST /api/day-notes/:date/todos/reorder`

表示順変更（要件 7.3 AC-4）。

**リクエストボディ:**

```json
{ "orderedIds": ["todo_3", "todo_1", "todo_2"] }
```

- 全TODOのidを過不足なく含む必要がある。過不足がある場合は `400 VALIDATION_ERROR`（`fields: [{ field: "orderedIds", message: "TODOの過不足があります。" }]`）
- サーバーは `order` を 0,1,2,... に再採番

**200レスポンス:** 更新後の全 `TodoItem[]`（`order` 昇順）

### `DELETE /api/todos/:id`

TODO削除（[edge_cases.md](edge_cases.md) で扱う編集UXに付随）。

- 持ち越し元TODO（`status = 'carried'`）を削除した場合、翌日側の `carriedFromTodoId` と `carriedFromDate` は `null` にせずそのまま残し、「2026-07-08から持ち越し（元TODO削除済み）」として表示できるようにする（[database_schema.md §3.3](database_schema.md) の自己参照運用）
- `sourceNoteLineMetaId` 経由で参照している `note_line_metas.converted_to_todo_id` は `ON DELETE SET NULL` で `null` 化される（変換済みマークが消える）

**204レスポンス:** ボディなし

---

## 6. BlockerItem エンドポイント

### `POST /api/day-notes/:date/blockers`

障害手動追加（要件 7.4、US-MVP-005）。`order` はサーバーが末尾に割り当て。

**リクエストボディ:**

```json
{ "text": "A社回答待ち", "linkedTodoId": "todo_1" }
```

- `text`: 必須、trim、1文字以上200文字以内
- `linkedTodoId`: 任意。指定時は当該日付のTODOであることを検証（違う場合は `400 VALIDATION_ERROR`）

**201レスポンス:** 作成された `BlockerItem`

### `PATCH /api/blockers/:id`

```json
{ "text": "A社回答待ち（再）", "resolved": true, "linkedTodoId": null }
```

- `resolved`: `false → true` で `resolvedAt` を `now()`、`true → false` で `null`
- `text`: 追加と同様の検証

**200レスポンス:** 更新後の `BlockerItem`

### `POST /api/day-notes/:date/blockers/reorder`

TODOの reorder と同様。

### `DELETE /api/blockers/:id`

TODO削除と同様、204。

---

## 7. Reflection・NoteEntry エンドポイント（自動保存中心）

Reflection・NoteEntry は UPSERT 性質（DayNote生成時に空行作成済み、[database_schema.md §3.5/§3.6](database_schema.md)）。よって PATCH のみ。

### `PATCH /api/day-notes/:date/reflection`

```json
{ "doneText": "・見積は完了\n", "stuckText": "", "tomorrowActionText": "・明日は朝に確認" }
```

- 3フィールドとも任意（部分更新可）
- 改行を含む自由テキスト。最大長は実用上の上限（例: 各 4000文字）を設ける

**200レスポンス:** 更新後の `Reflection`

### `PATCH /api/day-notes/:date/note-entry`

ノート本文（要件 7.6、US-MVP-007）。CodeMirror全文をそのまま送る。

```json
{ "body": "10:00 A社定例\n- 宿題：単価表を確認\n" }
```

- `body`: 任意（空文字可）。最大長は実用上の上限（例: 50000文字）。
- 自動保存の保存単位は **NoteEntry全文一括** とする（CodeMirrorの部分的diff送信はMVPでは複雑すぎる）。差分は都度全体送信で許容する。

**200レスポンス:** 更新後の `NoteEntry`

---

## 8. エラー一覧

| code | HTTP/扱い | 発生箇所 | ユーザー表示メッセージ（例） |
|------|------|----------|------------------------------|
| `VALIDATION_ERROR` | 400 | 全エンドポイント共通 | 入力内容に誤りがあります。 |
| `NOT_FOUND` | 404 | 存在しない `:date` / `:id` | 指定されたノートが見つかりません。 |
| `INVALID_TRANSITION` | 400 | TodoItem.status 遷移違反 | この操作は現在の状態では実行できません。 |
| `DUPLICATE_CONVERSION` | 409 | ノート行の重複TODO化/障害化 | この行はすでにTODO化されています。 |
| `DUPLICATE_CARRYOVER` | 200レスポンス内の `skipped.reason` | 同じTODOの重複持ち越し | このTODOはすでに翌日に持ち越し済みです。 |
| `INTERNAL_ERROR` | 500 | 想定外エラー | 保存できませんでした。しばらくしてからお試しください。 |

`INTERNAL_ERROR` はクライアントの自動保存リトライ（[autosave_spec.md](autosave_spec.md)）をトリガする。

---

## 9. ノート行変換エンドポイント（要件 7.8 / 7.9）

変換の正規化・重複判定ルールの詳細は [note_conversion_spec.md](note_conversion_spec.md) に委ねる。ここではHTTP契約のみ。

### `POST /api/day-notes/:date/convert/todo`

ノート選択行をTODO化（要件 7.8、US-MVP-009）。

**リクエストボディ:**

```json
{
  "noteEntryId": "ne_001",
  "lineNumber": 4,
  "lineText": "- TODO化：見積作成"
}
```

- `noteEntryId`: 必須、当該日付のnoteEntryであることを検証
- `lineNumber`: 必須、0始まりまたは1始まりは [note_conversion_spec.md](note_conversion_spec.md) で固定
- `lineText`: 必須、trim後空は `VALIDATION_ERROR`

**成功 201レスポンス:**

```json
{
  "todo": { "id": "todo_new", "...": "..." },
  "noteLineMeta": { "id": "nlm_new", "convertedToTodoId": "todo_new", "...": "..." }
}
```

サーバー側で行うこと:
1. `lineText` を `note_conversion_spec.md` のルールで正規化 → `normalizedLineText`
2. `lineHash` を `noteEntryId + normalizedLineText` から生成
3. 同 `(noteEntryId, lineHash)` で `converted_to_todo_id IS NOT NULL` の NoteLineMeta があれば **409 DUPLICATE_CONVERSION**（`details.existing` に既存TODO候補を添える）
4. 新規 `TodoItem`（`sourceNoteLineMetaId` 付き）と `NoteLineMeta` を1トランザクションで作成

**409レスポンス（重複時）:**

```json
{
  "error": {
    "code": "DUPLICATE_CONVERSION",
    "message": "この行はすでにTODO化されています。",
    "details": {
      "existing": { "id": "todo_abc", "title": "見積作成", "sourceNoteLineMetaId": "nlm_prev" }
    }
  }
}
```

クライアントはこれを受け取り、確認ダイアログを表示。「キャンセル」なら新規作成しない。「別TODO作成」を選んだ場合は後述エンドポイントを呼ぶ。

### `POST /api/day-notes/:date/convert/todo?force=1`

重複確認で「別TODO作成」を選んだ場合（要件 7.8「重複確認で作成を選んだ場合、別TODOとして作成」）。

- `force=1` クエリパラメータで重複チェックをバイパスし、強制的に2つめのTODO + NoteLineMetaを作成する
- レスポンス形状は通常の変換と同じ

### `POST /api/day-notes/:date/convert/blocker`

ノート選択行を障害化（要件 7.9、US-MVP-010）。TODO化と同じ構造。

```json
{ "noteEntryId": "ne_001", "lineNumber": 6, "lineText": "- 部長承認待ち" }
```

**201レスポンス:**

```json
{ "blocker": { "id": "blk_new", "...": "..." }, "noteLineMeta": { "...": "..." } }
```

`?force=1` の重複バイパスも TODO化と同様。

---

## 10. 持ち越しエンドポイント

### `POST /api/day-notes/:date/carry-over`

未完了TODOを翌日に持ち越す（要件 7.10、US-MVP-012）。

**リクエストボディ:**

```json
{ "todoIds": ["todo_1", "todo_3"] }
```

- `todoIds`: 必須。各IDが当該日付のTODOであることを検証する。`status` は下記トランザクション内で、重複持ち越し確認後に判定する。
- サーバーは1トランザクションで以下を行う:
  1. 翌日（`date + 1 day`）の DayNote が無ければ作成
  2. 各 `todoId` について、すでに `carriedFromTodoId = todoId` となる翌日TODOが存在しないか確認（要件 7.10「同じTODOを重複して持ち越さない」）。存在すれば、元TODOの現在ステータスが `carried` でも **そのTODOはスキップ**（全体を409にせず、部分成功）
  3. 重複が存在しないTODOについて、`status = 'todo'` であることを検証する。`done`、または重複先が見つからない `carried` は `400 VALIDATION_ERROR`
  4. 翌日に新規TodoItem作成（`status: 'todo'`, `carriedFromTodoId: <元>`, `carriedFromDate: <date>`, `title` は元TODOをコピー）
  5. 元TODOを `status: 'carried'` に更新（[database_schema.md §3.3](database_schema.md) の遷移）

**200レスポンス:**

```json
{
  "carried": [
    { "sourceTodoId": "todo_1", "newTodoId": "todo_new1", "nextDayDate": "2026-07-09" }
  ],
  "skipped": [
    { "sourceTodoId": "todo_3", "reason": "DUPLICATE_CARRYOVER", "message": "すでに翌日に持ち越し済みです。" }
  ]
}
```

- 部分成功を許すため、重複があっても HTTP 200。クライアントは `skipped` を通知表示に使う。
- 翌日ノートの自動生成が必要な場合もこのエンドポイント内で行う（要件 7.10 AC-2）。

---

## 11. UserSettings エンドポイント

### `GET /api/settings`

```json
{
  "id": "default",
  "keybindingMode": "standard",
  "vimDefaultState": "normal",
  "createdAt": "...",
  "updatedAt": "..."
}
```

常に1行返る（[database_schema.md §3.2](database_schema.md)）。未作成の場合は初期値で作成して返す。

### `PATCH /api/settings`

```json
{ "keybindingMode": "vim" }
```

- `keybindingMode`: `'standard'` or `'vim'`
- `vimDefaultState`: `'normal'` or `'insert'`
- どちらも部分更新可（要件 8.5、US-MVP-014）

**200レスポンス:** 更新後の `UserSettings`

---

## 12. 自動保存の保存単位まとめ

[autosave_spec.md](autosave_spec.md) から参照される、編集対象ごとの保存単位をここに集約する。

| 編集対象 | 保存API | 保存単位 |
|----------|---------|----------|
| 今日のテーマ | `PATCH /api/day-notes/:date` | `theme` フィールドのみ |
| 最終表示モード | `PATCH /api/day-notes/:date` | `lastOpenedMode` フィールドのみ |
| TODO本文編集 | `PATCH /api/todos/:id` | `title` のみ |
| TODO完了切替 | `PATCH /api/todos/:id` | `status` のみ |
| TODO並べ替え | `POST /api/day-notes/:date/todos/reorder` | 全 `orderedIds` |
| TODO追加・削除 | `POST` / `DELETE` | 1項目単位 |
| 障害（追加/編集/解消/並替/削除） | blockers系 | TODOと同様 |
| 振り返り3セクション | `PATCH /api/day-notes/:date/reflection` | 変更のあったセクションのみ、または3つまとめて |
| ノート本文 | `PATCH /api/day-notes/:date/note-entry` | **本文全文一括** |
| 変換（TODO化/障害化） | `POST /api/day-notes/:date/convert/*` | 1行単位 |
| 持ち越し | `POST /api/day-notes/:date/carry-over` | `todoIds` 配列一括 |
| キーバインド設定 | `PATCH /api/settings` | 変更フィールドのみ |

---

## 13. エンドポイント早見表

| メソッド | パス | 用途 | 要件出典 |
|----------|------|------|----------|
| GET | `/api/day-notes/:date/full` | 1日の全データ取得（自動生成付き） | 7.1, AC-01 |
| GET | `/api/day-notes/today/full` | 今日の全データ取得 | 8.1 |
| PATCH | `/api/day-notes/:date` | テーマ・表示モード更新 | 7.2, 7.7 |
| POST | `/api/day-notes/:date/todos` | TODO追加 | 7.3 |
| PATCH | `/api/todos/:id` | TODO更新（title/status） | 7.3 |
| POST | `/api/day-notes/:date/todos/reorder` | TODO並替 | 7.3 |
| DELETE | `/api/todos/:id` | TODO削除 | edge_cases |
| POST | `/api/day-notes/:date/blockers` | 障害追加 | 7.4 |
| PATCH | `/api/blockers/:id` | 障害更新（text/resolved） | 7.4 |
| POST | `/api/day-notes/:date/blockers/reorder` | 障害並替 | 7.4 |
| DELETE | `/api/blockers/:id` | 障害削除 | edge_cases |
| PATCH | `/api/day-notes/:date/reflection` | 振り返り更新 | 7.5 |
| PATCH | `/api/day-notes/:date/note-entry` | ノート本文更新 | 7.6 |
| POST | `/api/day-notes/:date/convert/todo` | ノート行→TODO | 7.8 |
| POST | `/api/day-notes/:date/convert/blocker` | ノート行→障害 | 7.9 |
| POST | `/api/day-notes/:date/carry-over` | 未完了TODO翌日持ち越し | 7.10 |
| GET | `/api/settings` | 設定取得 | 8.5 |
| PATCH | `/api/settings` | 設定更新 | 8.5 |

---

## 14. 今後の拡張（Post-MVP、本契約の対象外）

- コマンドパレット（要件 8.1）: UI層のみ、API不要
- ノート行→振り返り送信（要件 16）: `POST /api/day-notes/:date/convert/reflection` を追加予定。現状 `NoteLineMeta.convertedToReflection` は予約フィールド（[database_schema.md §3.7](database_schema.md)）
- 検索（要件 16）: `GET /api/search?q=...` を別途設計
- 認証（将来Web版）: 全エンドポイント前に認証ミドルウェアを挿入する設計余地を残す

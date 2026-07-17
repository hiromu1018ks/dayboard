# dayborad データベーススキーマ設計

本書は、[要件定義書 10. データ設計案](dayborad_requirements.md) のTypeScript型案を、SQLite（libSQL）の物理スキーマ（テーブル・制約・インデックス・マイグレーション方針）に落とし込んだ設計契約である。実装者がDDLを書く際の単一の真実源とする。

- 参照元: [要件定義書 10. データ設計案](dayborad_requirements.md)
- 関連: [architecture.md](architecture.md) / [api_contract.md](api_contract.md) / [note_conversion_spec.md](note_conversion_spec.md)
- データストア決定の根拠: [architecture.md §2](architecture.md)

---

## 1. 設計原則

1. **1日1ノートの不変条件をDB制約で担保する。** `DayNote.date` に一意制約を課し、アプリ層のバグで同日ノートが複数できることを防ぐ。
2. **型案の OPTIONAL は NULL 許可カラムに、必須は NOT NULL に正確に対応させる。**
3. **リレーションは外部キーで表現し、親削除時の挙動を明示する。** DayNote削除で配下データは cascade する（1日のノートを消したらその日のTODO等も消える）。
4. **順序カラムを持つ一覧は、(`day_note_id`, `order`) の複合インデックスで取得を速くする。**
5. **タイムスタンプは `timestamptz`（UTC保存）で統一し、アプリ層でローカル表示する。**
6. **IDは `text`（UUID v4 または ULID）とする。** ポータビリティと将来の同期を考慮し、連番 `serial` は使わない。

---

## 2. 命名規則

| 項目 | 規則 | 例 |
|------|------|-----|
| テーブル名 | `PascalCase` の型名を `snake_case` 複数形へ | `TodoItem` → `todo_items` |
| カラム名 | `camelCase` を `snake_case` へ | `dayNoteId` → `day_note_id` |
| 外部キー | `<参照先単数>_id` | `day_note_id` |
| インデックス | `idx_<table>_<cols>` | `idx_todo_items_day_note_id_order` |
| 一意制約 | `uq_<table>_<cols>` | `uq_day_notes_date` |

TypeScript型（`TodoItem.dayNoteId`）↔ SQLite カラム（`todo_items.day_note_id`）の変換は、リポジトリ層で一括して行う（[architecture.md §4](architecture.md)）。

---

## 3. テーブル定義

### 3.1 `day_notes` — DayNote

```sql
CREATE TABLE day_notes (
  id               text PRIMARY KEY,
  date             date NOT NULL,
  theme            text,
  last_opened_mode text NOT NULL DEFAULT 'work'
                   CHECK (last_opened_mode IN ('work', 'note')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_day_notes_date ON day_notes (date);
```

**設計メモ:**
- `date` は `date` 型（時刻なし）。タイムゾーンによる日付ズレを防ぐため、API層では「ユーザーのローカル日付（YYYY-MM-DD）」をそのまま格納する（[§8 日付の扱い](#8-日付の扱い) 参照）。
- `theme` は要件 7.2 で未入力を許すため NULL 許可。空文字列ではなく NULL で「未入力」を表す。
- `last_opened_mode` は `work` / `note` のみ（要件 6.1）。デフォルト `work`（要件 7.7「初期表示は仕事整理モード」）。
- `(date)` の一意制約が **1日1ノート** の不変条件を担保する（AC-01 重複生成の防止）。

### 3.2 `user_settings` — UserSettings

```sql
CREATE TABLE user_settings (
  id                  text PRIMARY KEY,
  keybinding_mode     text NOT NULL DEFAULT 'standard'
                      CHECK (keybinding_mode IN ('standard', 'vim')),
  vim_default_state   text NOT NULL DEFAULT 'normal'
                      CHECK (vim_default_state IN ('normal', 'insert')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

**設計メモ:**
- MVPは単一ユーザー（[architecture.md C7](architecture.md)）のため、実運用では **常に1行** になる。最初の起動でシード行（id 固定値 `default` など）をマイグレーションまたはアプリ初回起動で作成する。
- `keybinding_mode` のデフォルトは `standard`（要件 8.5）。`vim_default_state` のデフォルトは `normal`（要件 10.2 補足）。

### 3.3 `todo_items` — TodoItem

```sql
CREATE TABLE todo_items (
  id                       text PRIMARY KEY,
  day_note_id              text NOT NULL
                           REFERENCES day_notes(id) ON DELETE CASCADE,
  title                    text NOT NULL,
  status                   text NOT NULL DEFAULT 'todo'
                           CHECK (status IN ('todo', 'done', 'carried')),
  "order"                  integer NOT NULL,
  source_note_line_meta_id text
                           REFERENCES note_line_metas(id) ON DELETE SET NULL,
  carried_from_todo_id     text,  -- 自己参照。別テーブル参照なし
  carried_from_date        date,  -- 持ち越し元DayNote.dateのスナップショット
  created_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (carried_from_todo_id IS NULL AND carried_from_date IS NULL)
    OR
    (carried_from_todo_id IS NOT NULL AND carried_from_date IS NOT NULL)
  )
);

CREATE INDEX idx_todo_items_day_note_id_order
  ON todo_items (day_note_id, "order");
CREATE INDEX idx_todo_items_carried_from_todo_id
  ON todo_items (carried_from_todo_id)
  WHERE carried_from_todo_id IS NOT NULL;
```

**設計メモ:**
- `title` は NOT NULL（空のTODOは作らない）。タイトル生成ルールは [note_conversion_spec.md](note_conversion_spec.md) で固定する。
- `status` の状態遷移は [§4 状態遷移](#4-todoitemstatus-の状態遷移) に示す。`carried` は「翌日に持ち越し済み」で、元TODOのみが取り得る終端状態。
- `order` は要件 7.3「表示順を変更できる」のため。同 `day_note_id` 内での並び替えに使う。ギャップ（10, 20, 30...）持ちはせず、挿入時に都度再採番で対応（順序の衝突を防ぐため、シンプルさを優先）。
- `source_note_line_meta_id` は ノート→TODO変換時のみ設定。`ON DELETE SET NULL` とし、NoteLineMetaが何らかの理由で削除されてもTODOは残す（要件 7.8「ノート本文編集により元行を特定できなくなった場合でもTODO側には変換時点の行本文を表示」を、NoteLineMetaの lineText 経由で担保）。
- `carried_from_todo_id` は自己参照だが外部キー制約を付けない。理由: 持ち越し元TODOが先に削除されるケースがありうるため（参照整合性より履歴保持を優先）。値が存在しても参照先がない場合は「元TODO削除済み」として扱う。
- `carried_from_date` は持ち越し先TODOにだけ設定する元DayNoteの日付スナップショット。`GET /full` で当日分TODOだけを取得しても「7/8から持ち越し」を表示でき、元TODO削除後も日付表示を失わない。
- `completed_at` は `status = 'done'` のときのみ非NULL。

#### TodoItem.status の状態遷移

```text
            完了操作              完了解除
   todo ──────────────► done ──────────► todo
     │                                    ▲
     │ 持ち越し操作（不可逆）              │
     ▼                                    │
   carried  ──── (完了/未完了へは戻さない) ─┘
```

| 遷移 | トリガー | 備考 |
|------|----------|------|
| `todo → done` | 完了操作（要件 7.3） | `completed_at` をセット |
| `done → todo` | 完了解除（要件 7.3） | `completed_at` を NULL に |
| `todo → carried` | 翌日持ち越し（要件 7.10） | **不可逆**。持ち越し元TODOはこれで確定。`done`/`carried` からの `carried` 遷移は禁止 |

`carried` は「翌日へ移った」ことを示す表示用終端状態。翌日側には**別の新しいTodoItem**（`carried_from_todo_id` / `carried_from_date` 付き）を作るため、元TODOのステータスを戻す必要はない。

### 3.4 `blocker_items` — BlockerItem

```sql
CREATE TABLE blocker_items (
  id                       text PRIMARY KEY,
  day_note_id              text NOT NULL
                           REFERENCES day_notes(id) ON DELETE CASCADE,
  text                     text NOT NULL,
  linked_todo_id           text
                           REFERENCES todo_items(id) ON DELETE SET NULL,
  source_note_line_meta_id text
                           REFERENCES note_line_metas(id) ON DELETE SET NULL,
  resolved                 boolean NOT NULL DEFAULT false,
  "order"                  integer NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  resolved_at              timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blocker_items_day_note_id_order
  ON blocker_items (day_note_id, "order");
```

**設計メモ:**
- `linked_todo_id` は任意（要件 7.4「TODOに紐づかない障害も登録できる」）。`ON DELETE SET NULL` で、紐づいたTODOが削除されても障害は残る。
- `resolved` は boolean（要件 7.4）。`resolved = true` のとき `resolved_at` をセット。
- 初期実装ではカテゴリ列は持たない（要件 7.4「初期実装では任意入力でよい」→カテゴリ自体がスコープ外、要件 5.2）。

### 3.5 `reflections` — Reflection

```sql
CREATE TABLE reflections (
  id                   text PRIMARY KEY,
  day_note_id          text NOT NULL UNIQUE
                       REFERENCES day_notes(id) ON DELETE CASCADE,
  done_text            text NOT NULL DEFAULT '',
  stuck_text           text NOT NULL DEFAULT '',
  tomorrow_action_text text NOT NULL DEFAULT '',
  updated_at           timestamptz NOT NULL DEFAULT now()
);
```

**設計メモ:**
- DayNoteと1:1。`day_note_id` に **UNIQUE制約** を付け、1日1振り返りを強制する。
- 各セクションは空文字列 DEFAULT（要件 7.5「未入力でも利用可能」）。NULL は「行未作成」、空文字は「作成済み・未入力」を意味する。DayNote生成時に空行を同時作成し、以降は UPDATE のみとする（UPSERTで扱う）。
- 3セクションは別カラム（要件 10.5）。1つのテキストに結合しない。

### 3.6 `note_entries` — NoteEntry

```sql
CREATE TABLE note_entries (
  id          text PRIMARY KEY,
  day_note_id text NOT NULL
              REFERENCES day_notes(id) ON DELETE CASCADE,
  body        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_note_entries_day_note_id
  ON note_entries (day_note_id);
```

**設計メモ:**
- 要件 10.6「MVPではノートモードの本文を1つの大きなテキストとして保持する」に従い、DayNoteと1:1。`day_note_id` に UNIQUE制約でこれを強制する。
- DayNote生成時に空行を同時作成し、以降は `body` の UPDATE のみ。

### 3.7 `note_line_metas` — NoteLineMeta

```sql
CREATE TABLE note_line_metas (
  id                          text PRIMARY KEY,
  note_entry_id               text NOT NULL
                              REFERENCES note_entries(id) ON DELETE CASCADE,
  line_number_at_conversion   integer NOT NULL,
  normalized_line_text        text NOT NULL,
  line_hash                   text NOT NULL,
  line_text                   text NOT NULL,
  converted_to_todo_id        text
                              REFERENCES todo_items(id) ON DELETE SET NULL,
  converted_to_blocker_id     text
                              REFERENCES blocker_items(id) ON DELETE SET NULL,
  converted_to_reflection     boolean NOT NULL DEFAULT false,
  converted_at                timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_line_metas_note_entry_id
  ON note_line_metas (note_entry_id);
CREATE INDEX idx_note_line_metas_todo_duplicate_lookup
  ON note_line_metas (note_entry_id, line_hash)
  WHERE converted_to_todo_id IS NOT NULL;
CREATE INDEX idx_note_line_metas_blocker_duplicate_lookup
  ON note_line_metas (note_entry_id, line_hash)
  WHERE converted_to_blocker_id IS NOT NULL;
CREATE UNIQUE INDEX uq_note_line_metas_converted_to_todo_id
  ON note_line_metas (converted_to_todo_id)
  WHERE converted_to_todo_id IS NOT NULL;
CREATE UNIQUE INDEX uq_note_line_metas_converted_to_blocker_id
  ON note_line_metas (converted_to_blocker_id)
  WHERE converted_to_blocker_id IS NOT NULL;
```

**設計メモ:**
- `lineText`（原文スナップショット）、`normalizedLineText`、`lineHash` の生成規則は [note_conversion_spec.md](note_conversion_spec.md) に固定する。ここでは格納方法のみ定義する。
- `line_hash` は「同じ `noteEntryId` 内で同じ正規化行」を識別するためのハッシュ（要件 10.7）。重複判定のキーになる。
- `converted_to_todo_id` / `converted_to_blocker_id` / `converted_to_reflection` は、それぞれ変換先。要件 10.7 により `converted_to_reflection` は **Post-MVP用予約**。MVPでは常に `false` だが、スキーマには含めておき、後日マイグレーション不要にする。
- `line_number_at_conversion` は要件 10.7「変換時点の行番号であり、ノート本文編集後に正確な位置を保証しない」のとおり、**参考値**。検索や位置特定の保証はしない。
- `ON DELETE SET NULL`（todo/blocker側）: 変換先が削除されてもメタ情報は残し、行の変換履歴を保持する。

#### §3.7 補足: 重複判定と `force=1`

同一 `noteEntryId` + 同一 `lineHash` + 同一変換対象の重複は、DBの一意制約ではなく **アプリ層の重複確認フロー**（[note_conversion_spec.md §5](note_conversion_spec.md)）で制御する。

- TODO化: `(note_entry_id, line_hash)` に対し、すでに `converted_to_todo_id IS NOT NULL` の行があれば重複候補を返す。ユーザーが「別TODO作成」を選んだ場合は `?force=1` で2行目以降の `NoteLineMeta` 挿入を許可する。
- 障害化: `(note_entry_id, line_hash)` に対し、すでに `converted_to_blocker_id IS NOT NULL` の行があればTODO化と同じ重複確認フローを使う。`?force=1` の場合は別障害として追加できる。
- `idx_note_line_metas_*_duplicate_lookup` は重複候補検索用の **非一意インデックス**。`?force=1` による複数変換を妨げない。
- `uq_note_line_metas_converted_to_todo_id` / `uq_note_line_metas_converted_to_blocker_id` は、1つの変換先TODO/障害に複数のメタ行が紐づく事故だけを防ぐ。
- `conversion_target` のような生成列は初期スキーマには持たない。必要になった場合も、`?force=1` の複数作成を拒否する一意制約にはしない。

---

## 4. (前述) TodoItem.status の状態遷移

[§3.3 の状態遷移節](#todoitemstatus-の状態遷移) を参照。

---

## 5. ER図（テキスト）

```text
day_notes (1) ──────< (N) todo_items
          │                  ▲
          │                  │ source_note_line_meta_id (SET NULL)
          │                  │
          │            ┌─────┴──────┐
          │            │            │
          │      note_line_metas    │
          │            ▲            │
          │            │            │
          ├─────< (1) note_entries (1)──< (N) note_line_metas
          │
          ├─────< (1) reflections (1)
          │
          └─────< (N) blocker_items ──linked_todo_id──> todo_items (SET NULL)

user_settings  (単独行、他テーブルへのFKなし)
```

---

## 6. 初期データ（シード）

初回マイグレーション後、以下をシードする。

| テーブル | 内容 |
|----------|------|
| `user_settings` | 1行。`id='default'`, `keybinding_mode='standard'`, `vim_default_state='normal'` |

`day_notes` はシードしない。初回起動時にAPIが当日ノートを自動生成する（要件 7.1、AC-01）。

---

## 7. マイグレーション方針

### 7.1 ツール

- [drizzle-kit](https://orm.drizzle.team/drizzle-kit/overview) または [node-pg-migrate](https://github.com/salsita/node-pg-migrate) を採用（いずれもNode/TS製で [architecture.md](architecture.md) のスタックに合致）。決定時期は [implementation_plan.md](implementation_plan.md) の最初のフェーズ。
- SQLベースのマイグレーションファイルをバージョン管理し、アプリ起動時に自動適用する（[architecture.md §6.1 起動フロー](architecture.md)）。

### 7.2 運用ルール

1. **前方向き:** マイグレーションは追加のみ。一度コミットしたマイグレーションは変更しない（変更が必要なら新規マイグレーションで打ち消す）。
2. **起動時自動適用:** Electron mainプロセス起動時に `migrate up` を実行し、最新まで適用してからHonoを起動する。
3. **破壊的変更の原則禁止:** MVP期間中はスキーマ変更してもデータ保全を優先。カラム追加は `ADD COLUMN ... DEFAULT`、カラム削除は「非表示にしてデータ保持」を基本とする。
4. **ローカルDBリセット:** 開発中は `pnpm db:reset`（DROP & recreate & seed）を提供する。本番データはMVPでは端末ローカルのみ。

### 7.3 初回マイグレーション `0001_init.sql`

上記 §3 の全テーブル CREATE 文を1つの初期マイグレーションにまとめる。作成順序は依存関係に従い、`day_notes` → `user_settings` → `todo_items` → `blocker_items` → `reflections` → `note_entries` → `note_line_metas` とする（`todo_items.source_note_line_meta_id` は `note_line_metas` へのFKだが、循環参照のため `note_line_metas` 作成後に `ALTER TABLE ... ADD CONSTRAINT` で追加する、あるいは最初はFKなしで作って後続マイグレーションで追加する）。

> **循環FKメモ:** `todo_items.source_note_line_meta_id → note_line_metas.id` と `note_line_metas.converted_to_todo_id → todo_items.id` は循環する。作法としては、`todo_items` を `source_note_line_meta_id` なしで作成 → `note_line_metas` 作成 → `ALTER TABLE todo_items ADD CONSTRAINT fk_... FOREIGN KEY (source_note_line_meta_id) ...` で後から付ける。

---

## 8. 日付の扱い

**重要:** 日付ズレを防ぐため、以下の規則を厳守する。

- `day_notes.date` は `date` 型（タイムゾーンなし）。
- API層では**ユーザーのローカル日付を YYYY-MM-DD 文字列として**扱い、そのまま `date` 型カラムへ格納する。
- サーバー（Electron main）とクライアント（Renderer）は同一端末・同一タイムゾーンのため、`new Date()` からローカル日付を計算して使う。**サーバーの `now()` に頼って日付を決定しない**（`now()` は `timestamptz` 用であり、`date` の値の計算には使わない）。
- 「今日」の判定は Renderer と API の両方でローカル日付で行い、一貫させる。

---

## 9. インデックス運用方針

| アクセスパターン | インデックス | 根拠 |
|------------------|--------------|------|
| 当日ノート取得 | `uq_day_notes_date` | 起動ごとに1回。一意制約で兼用 |
| 1日のTODO一覧取得（順序付き） | `idx_todo_items_day_note_id_order` | 仕事整理モード描画の都度 |
| 1日のblocker一覧取得（順序付き） | `idx_blocker_items_day_note_id_order` | 同上 |
| 1日のreflection取得 | `reflections.day_note_id` UNIQUE | 1:1。一意制約で兼用 |
| 1日のnote_entry取得 | `uq_note_entries_day_note_id` | 1:1。一意制約で兼用 |
| 変換時の重複チェック | `idx_note_line_metas_note_entry_id` + `line_hash` | ノート行TODO化/障害化の都度 |
| 持ち越しTODOの逆引き | `idx_todo_items_carried_from_todo_id` | 持ち越し重複判定（要件 7.10） |

MVPのデータ量（単一ユーザー・日次）ではこれらで十分。将来の検索拡張（要件 16）では全文検索インデックス等を別途検討する。

---

## 10. SQLite (libSQL) 設定ノート（MVPローカル運用）

- エンコーディング: SQLite は UTF-8 を既定で使用する。
- 接続: [architecture.md](architecture.md) のリポジトリ層で `@libsql/client` の単一クライアントを使用。SQLite は単一ユーザー・単一プロセス（[architecture.md C7](architecture.md)）のため、接続プールは持たない。
- 外部キー制約: 接続直後に `PRAGMA foreign_keys = ON` を有効化する（SQLite はデフォルトで FK 強制が OFF のため）。
- タイムゾーン: タイムスタンプは `integer(unixepoch)` でUTCの秒数を保持し、アプリ層でローカル変換（[§8](#8-日付の扱い)）。
- データ型マッピング: PostgreSQL 版の `timestamptz` → `integer(unixepoch)`、`boolean` → `integer(0/1)`、`date` → `text('YYYY-MM-DD')`。CHECK 制約・部分インデックス（`WHERE col IS NOT NULL`）・循環FKの `ON DELETE SET NULL` は SQLite でも同等の構文で表現する。

---

## 11. リポジトリインターフェースの指釙

[architecture.md §4](architecture.md) のリポジトリ層に対応する、TypeScript側のインターフェース指針を示す。実装詳細は実装フェーズで詰めるが、以下の単位でメソッドを用意する。

```ts
interface DayNoteRepository {
  findByDate(date: string): Promise<DayNote | null>     // YYYY-MM-DD
  findById(id: string): Promise<DayNote | null>
  create(date: string): Promise<DayNote>                 // 当日自動生成用
  update(id: string, patch: Partial<DayNote>): Promise<DayNote>
}

interface TodoRepository {
  listByDayNote(dayNoteId: string): Promise<TodoItem[]>  // order順
  create(input): Promise<TodoItem>
  update(id: string, patch: Partial<TodoItem>): Promise<TodoItem>
  reorder(dayNoteId: string, orderedIds: string[]): Promise<void>
  findByCarriedFrom(todoId: string): Promise<TodoItem[]> // 持ち越し重複判定
}

interface BlockerRepository { /* 同系 */ }
interface ReflectionRepository { findByDayNote(id): Promise<Reflection>; upsert(...): Promise<Reflection> }
interface NoteEntryRepository { findByDayNote(id): Promise<NoteEntry>; updateBody(...): Promise<NoteEntry> }
interface NoteLineMetaRepository {
  findByNoteEntryAndLineHash(noteEntryId, lineHash): Promise<NoteLineMeta[]>  // 重複判定
  create(input): Promise<NoteLineMeta>
}
interface UserSettingsRepository {
  get(): Promise<UserSettings>   // 常に1行
  update(patch): Promise<UserSettings>
}
```

各メソッドはドメイン型（要件 10 のTS型）を返し、SQLite の `snake_case` 表現との変換を内部で吸収する。

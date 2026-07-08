---
artifact: user-stories
version: "1.0"
created: 2026-07-08
status: complete
source: docs/dayborad_requirements.md
---

# User Stories: dayborad MVP

本書は、レビュー済みPRDである [dayborad 要件定義書](dayborad_requirements.md) を、実装チケットに近い粒度のユーザーストーリーへ分解したものである。対象はPRDのMVP範囲に限定し、長期目標管理、チーム共有、AI要約、外部連携、モバイル最適化などの初期スコープ外機能は含めない。

## Personas

- 日次業務を整理するビジネスパーソン
- 会議・会話メモを取るビジネスパーソン
- キーボード中心で操作するビジネスパーソン
- Vim操作に慣れたビジネスパーソン

---

## Story 1: 今日のDayNoteを開く

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-001 |
| Title | 今日のDayNoteを開く |
| Persona | 日次業務を整理するビジネスパーソン |
| Priority | P0 |
| Epic/Feature | 日付ごとの仕事ノート |
| Estimate | M |

### User Story Statement

**As a** 日次業務を整理するビジネスパーソン,

**I want** アプリ起動時に今日の仕事ノートをすぐ開ける,

**so that** 朝からその日のTODO、障害、振り返り、メモを1枚のノートとして使い始められる.

### Context & Background

dayboradは1つの日付に対して1つの`DayNote`を持つ。ユーザーは起動直後に今日の仕事整理モードを見られる必要がある。

### Acceptance Criteria

#### AC-1: 当日のノートが存在する場合

**Given** 当日の日付に対応する`DayNote`が存在する

**When** ユーザーがアプリを起動する

**Then** 当日の`DayNote`が仕事整理モードで表示される

#### AC-2: 当日のノートが存在しない場合

**Given** 当日の日付に対応する`DayNote`が存在しない

**When** ユーザーがアプリを起動する

**Then** 当日の`DayNote`が自動生成され、空のTODO、障害・詰まり、振り返り、ノート本文を入力できる

#### AC-3: ヘッダーの日付表示

**Given** `DayNote`が表示されている

**When** ユーザーがヘッダーを見る

**Then** 対象日の日付と曜日が表示される

### Design Notes

- 初期表示は仕事整理モードとする。
- 仕事整理モードでは、TODO、障害・詰まり、振り返りの3領域を画面いっぱいに表示する。

### Technical Notes

- PRDの`DayNote`、`TodoItem`、`BlockerItem`、`Reflection`、`NoteEntry`を日付単位で扱う。
- MVPではローカル保存を前提とする。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| None | - | Ready |

### Out of Scope

- プロジェクト単位、長期目標単位のノート作成。
- チーム共有や認証。

### Open Questions

- なし。

---

## Story 2: 前日・翌日・今日のノートへ移動する

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-002 |
| Title | 前日・翌日・今日のノートへ移動する |
| Persona | 日次業務を整理するビジネスパーソン |
| Priority | P0 |
| Epic/Feature | 日付ごとの仕事ノート |
| Estimate | S |

### User Story Statement

**As a** 日次業務を整理するビジネスパーソン,

**I want** 前日、翌日、今日の仕事ノートへ移動できる,

**so that** 過去の作業ログを確認しながら、今日や明日の作業を整理できる.

### Context & Background

dayboradは日付単位で仕事のログを残す。ユーザーは過去の日付を閲覧・編集し、翌日のノートにも移動できる必要がある。

### Acceptance Criteria

#### AC-1: 前日のノートへ移動

**Given** 任意の日付の`DayNote`を表示している

**When** ユーザーが前日へ移動する

**Then** 1日前の日付に対応する`DayNote`が表示される

#### AC-2: 翌日のノートへ移動

**Given** 任意の日付の`DayNote`を表示している

**When** ユーザーが翌日へ移動する

**Then** 1日後の日付に対応する`DayNote`が表示される

#### AC-3: 未作成日付の自動生成

**Given** 移動先の日付に`DayNote`が存在しない

**When** ユーザーがその日付へ移動する

**Then** 移動先の日付の`DayNote`が自動生成される

#### AC-4: 今日へ戻る

**Given** 今日以外の`DayNote`を表示している

**When** ユーザーが今日へ戻る操作を行う

**Then** 今日の日付に対応する`DayNote`が表示される

### Design Notes

- ヘッダー内で現在表示中の日付が明確に分かるようにする。
- 長期タスクやプロジェクト情報は表示しない。

### Technical Notes

- 日付ごとにTODO、障害、振り返り、ノート本文を分離して保持する。
- 日付移動時に未保存入力が失われないことはUS-MVP-011で扱う。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-001 | Story | Ready |

### Out of Scope

- カレンダー連携。
- 日付範囲検索。

### Open Questions

- なし。

---

## Story 3: 今日のテーマを入力する

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-003 |
| Title | 今日のテーマを入力する |
| Persona | 日次業務を整理するビジネスパーソン |
| Priority | P0 |
| Epic/Feature | 今日のテーマ |
| Estimate | S |

### User Story Statement

**As a** 日次業務を整理するビジネスパーソン,

**I want** その日の仕事の主目的を短く入力できる,

**so that** 1日の作業の軸を見失わずに仕事を進められる.

### Context & Background

今日のテーマは各`DayNote`に1つだけ設定される短いテキストであり、仕事整理モードとノートモードの両方で参照される。

### Acceptance Criteria

#### AC-1: テーマを入力できる

**Given** `DayNote`を表示している

**When** ユーザーが今日のテーマを入力する

**Then** 入力したテーマが対象日の`DayNote`に表示される

#### AC-2: テーマ未入力でも使える

**Given** 今日のテーマが未入力である

**When** ユーザーがTODO、障害、振り返り、ノート本文を編集する

**Then** テーマ入力を必須にされずに利用できる

#### AC-3: 両方の表示モードに表示される

**Given** 今日のテーマが入力されている

**When** ユーザーが仕事整理モードとノートモードを切り替える

**Then** どちらのモードでも同じテーマがヘッダーに表示される

### Design Notes

- ヘッダー内に表示し、ノート1枚感を損なわない控えめな入力にする。

### Technical Notes

- `DayNote.theme`として保持する。
- 自動保存の挙動はUS-MVP-011で扱う。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-001 | Story | Ready |

### Out of Scope

- 複数テーマの管理。
- テーマのテンプレート化。

### Open Questions

- なし。

---

## Story 4: 今日のTODOを管理する

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-004 |
| Title | 今日のTODOを管理する |
| Persona | 日次業務を整理するビジネスパーソン |
| Priority | P0 |
| Epic/Feature | TODO |
| Estimate | M |

### User Story Statement

**As a** 日次業務を整理するビジネスパーソン,

**I want** 今日やることを追加、完了、並べ替えできる,

**so that** その日に必要な作業だけを1画面で把握できる.

### Context & Background

TODOは今日やることを管理する領域である。日付に紐づき、完了状態と表示順を持つ。

### Acceptance Criteria

#### AC-1: TODOを追加できる

**Given** 仕事整理モードでTODO領域を表示している

**When** ユーザーがTODOを追加する

**Then** 入力したTODOが対象日のTODO一覧に追加される

#### AC-2: TODOを完了できる

**Given** 未完了のTODOが存在する

**When** ユーザーがそのTODOを完了にする

**Then** TODOの状態が`done`になり、完了済みとして表示される

#### AC-3: TODOを未完了に戻せる

**Given** 完了済みのTODOが存在する

**When** ユーザーがそのTODOを未完了に戻す

**Then** TODOの状態が`todo`になり、未完了として表示される

#### AC-4: TODOの表示順を変更できる

**Given** 対象日に複数のTODOが存在する

**When** ユーザーがTODOの順序を変更する

**Then** 変更後の順序でTODO一覧が表示される

### Design Notes

- 仕事整理モードの左列に表示する。
- 完了状態は視覚的に区別できるようにする。

### Technical Notes

- `TodoItem.status`は`todo`、`done`、`carried`を扱う。
- ノートからTODO化された項目の追加はUS-MVP-009で扱う。
- 未完了TODOの翌日持ち越しはUS-MVP-012で扱う。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-001 | Story | Ready |

### Out of Scope

- 長期タスク管理。
- 複雑なタグ管理。
- プロジェクト別分類。

### Open Questions

- TODO本文の編集をMVP内で明示的に提供するかは、PRD上では追加・完了・順序変更が中心であるため、必要なら別チケットで扱う。

---

## Story 5: 障害・詰まりを管理する

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-005 |
| Title | 障害・詰まりを管理する |
| Persona | 日次業務を整理するビジネスパーソン |
| Priority | P0 |
| Epic/Feature | 障害・詰まり |
| Estimate | M |

### User Story Statement

**As a** 日次業務を整理するビジネスパーソン,

**I want** 仕事が止まっている理由を追加、編集、解消済みにできる,

**so that** TODOが進まない原因を日中と振り返り時に把握できる.

### Context & Background

障害・詰まりは、TODOや仕事を止めている要因を記録する領域である。TODOに紐づく障害と、TODOに紐づかない障害の両方を扱う。

### Acceptance Criteria

#### AC-1: 障害・詰まりを追加できる

**Given** 仕事整理モードで障害・詰まり領域を表示している

**When** ユーザーが障害・詰まりを追加する

**Then** 入力した内容が対象日の障害・詰まり一覧に追加される

#### AC-2: 障害・詰まりを編集できる

**Given** 対象日に障害・詰まりが存在する

**When** ユーザーがその内容を編集する

**Then** 編集後の内容が障害・詰まり一覧に表示される

#### AC-3: 障害・詰まりを解消済みにできる

**Given** 未解消の障害・詰まりが存在する

**When** ユーザーが解消済みにする

**Then** その障害・詰まりが解消済みとして表示される

#### AC-4: TODOへの紐づけは任意である

**Given** ユーザーが障害・詰まりを登録する

**When** TODOに紐づけずに保存する

**Then** TODOに紐づかない障害・詰まりとして登録できる

### Design Notes

- 仕事整理モードの中央列に表示する。
- 初期実装ではカテゴリ入力を必須にしない。

### Technical Notes

- `BlockerItem.linkedTodoId`は任意とする。
- ノートから障害化された項目の追加はUS-MVP-010で扱う。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-001 | Story | Ready |
| US-MVP-004 | Story | Ready |

### Out of Scope

- 障害カテゴリの本実装。
- 自動分類。

### Open Questions

- なし。

---

## Story 6: 1日の振り返りを書く

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-006 |
| Title | 1日の振り返りを書く |
| Persona | 日次業務を整理するビジネスパーソン |
| Priority | P0 |
| Epic/Feature | 振り返り |
| Estimate | S |

### User Story Statement

**As a** 日次業務を整理するビジネスパーソン,

**I want** できたこと、止まったこと、明日の一手を書ける,

**so that** 1日の終わりに作業結果と次の行動を整理できる.

### Context & Background

振り返りは1日の終わりに成果、詰まり、明日の一手を記録する領域である。未入力でも利用可能である。

### Acceptance Criteria

#### AC-1: 3つの振り返りセクションが表示される

**Given** 仕事整理モードを表示している

**When** ユーザーが振り返り領域を見る

**Then** 「できたこと」「止まったこと」「明日の一手」の3セクションが表示される

#### AC-2: 各セクションへ自由入力できる

**Given** 振り返り領域を表示している

**When** ユーザーが任意のセクションに文章を入力する

**Then** 入力した文章がそのセクションに表示される

#### AC-3: 未入力でも利用できる

**Given** 振り返りが未入力である

**When** ユーザーが他の領域を編集する

**Then** 振り返り入力を必須にされずに利用できる

### Design Notes

- 仕事整理モードの右列に表示する。
- 夕方以降の軽い強調はPRD上「してもよい」のため、必須受入条件にはしない。

### Technical Notes

- `Reflection.doneText`、`stuckText`、`tomorrowActionText`として保持する。
- ノート行の振り返りへの直接送信はMVP対象外。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-001 | Story | Ready |

### Out of Scope

- ノート行の振り返りへの直接送信。
- AI要約。

### Open Questions

- なし。

---

## Story 7: ノートモードで会議・会話メモを書く

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-007 |
| Title | ノートモードで会議・会話メモを書く |
| Persona | 会議・会話メモを取るビジネスパーソン |
| Priority | P0 |
| Epic/Feature | 会議・打ち合わせ・会話メモ |
| Estimate | M |

### User Story Statement

**As a** 会議・会話メモを取るビジネスパーソン,

**I want** 会議、打ち合わせ、会話、自分用メモを自由に書ける,

**so that** 口頭やチャットで発生した情報を流さずにその日のノートへ残せる.

### Context & Background

ノートモードでは、会議・打ち合わせ・会話メモを画面いっぱいに表示し、自由入力する。時刻つき見出しはMVPでは手入力する。

### Acceptance Criteria

#### AC-1: ノート本文を自由入力できる

**Given** ノートモードを表示している

**When** ユーザーが本文エリアに文章を入力する

**Then** 入力した内容がノート本文として表示される

#### AC-2: 本文エリアを画面いっぱいに使える

**Given** ノートモードを表示している

**When** ユーザーが画面を見る

**Then** 会議・打ち合わせ・会話メモの本文エリアが主表示領域として表示される

#### AC-3: 時刻つき見出しを手入力できる

**Given** ノートモードの本文エリアにフォーカスしている

**When** ユーザーが時刻つき見出しを入力する

**Then** 入力した文字列が通常のノート本文として保持される

#### AC-4: ノート本文は日付に紐づく

**Given** 複数日付の`DayNote`が存在する

**When** ユーザーが日付を切り替える

**Then** 各日付に紐づくノート本文だけが表示される

### Design Notes

- ノートモードではTODO、障害、振り返りを常時同時表示しない。
- ヘッダーには日付、曜日、モード名、戻る操作の案内を表示する。

### Technical Notes

- MVPでは`NoteEntry.body`に1つの大きなテキストとして保持する。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-001 | Story | Ready |
| US-MVP-008 | Story | Ready |

### Out of Scope

- 時刻つきメモ見出しのショートカット挿入。
- メモの自動構造化。

### Open Questions

- なし。

---

## Story 8: 仕事整理モードとノートモードを切り替える

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-008 |
| Title | 仕事整理モードとノートモードを切り替える |
| Persona | キーボード中心で操作するビジネスパーソン |
| Priority | P0 |
| Epic/Feature | モード切り替え |
| Estimate | S |

### User Story Statement

**As a** キーボード中心で操作するビジネスパーソン,

**I want** ショートカットで仕事整理モードとノートモードを切り替えられる,

**so that** 会議メモと日次整理を作業の流れを止めずに行き来できる.

### Context & Background

dayboradは仕事整理モードをノートの表面、ノートモードを裏面として扱う。切り替えは軽快で、入力内容を失わない必要がある。

### Acceptance Criteria

#### AC-1: 初期表示は仕事整理モードである

**Given** ユーザーがアプリを起動する

**When** 当日の`DayNote`が表示される

**Then** 表示モードは`work`である

#### AC-2: CtrlまたはCmd + Jでノートモードへ切り替わる

**Given** 仕事整理モードを表示している

**When** ユーザーが`Ctrl / Cmd + J`を押す

**Then** ノートモードへ切り替わる

#### AC-3: CtrlまたはCmd + Jで仕事整理モードへ戻る

**Given** ノートモードを表示している

**When** ユーザーが`Ctrl / Cmd + J`を押す

**Then** 仕事整理モードへ切り替わる

#### AC-4: Escで仕事整理モードへ戻る

**Given** ノートモードを表示している

**When** ユーザーが`Esc`を押す

**Then** 仕事整理モードへ切り替わる

#### AC-5: 変換後の項目が短時間ハイライトされる

**Given** ノートモードでTODO化または障害化した項目がある

**When** ユーザーが仕事整理モードへ戻る

**Then** 追加されたTODOまたは障害・詰まりが短時間ハイライトされる

### Design Notes

- 切り替えは体感で即時に行われること。
- 演出を入れる場合は軽くし、過剰なアニメーションは避ける。

### Technical Notes

- 表示状態は`ViewMode = 'work' | 'note'`として扱う。
- モード切り替え時の保存保証はUS-MVP-011で扱う。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-001 | Story | Ready |

### Out of Scope

- 仕事整理モードとノートモードの常時同時表示。
- コマンドパレットによる切り替え。

### Open Questions

- なし。

---

## Story 9: ノート行をTODO化する

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-009 |
| Title | ノート行をTODO化する |
| Persona | 会議・会話メモを取るビジネスパーソン |
| Priority | P0 |
| Epic/Feature | ノートからTODO化 |
| Estimate | L |

### User Story Statement

**As a** 会議・会話メモを取るビジネスパーソン,

**I want** ノートモードで選択した行をTODOに変換できる,

**so that** 会議や会話で発生した宿題を忘れずに今日のTODOへ移せる.

### Context & Background

ユーザーはノートを書きながら、必要な行だけをTODOに変換する。変換してもノートモードから勝手に離脱しない。

### Acceptance Criteria

#### AC-1: 選択行をTODOに追加できる

**Given** ノートモードでノート本文内の行を選択している

**When** ユーザーが`Ctrl / Cmd + Enter`を押す

**Then** 選択行の内容を元にしたTODOが同じ日付のTODO一覧に追加される

#### AC-2: ノートモードに留まる

**Given** ノートモードで行をTODO化する

**When** TODO作成が完了する

**Then** 表示モードはノートモードのままで、小さな通知が表示される

#### AC-3: 発生元のスナップショットを保持する

**Given** ノート行をTODO化する

**When** TODOが作成される

**Then** TODOは変換時点の行本文を発生元として参照できる

#### AC-4: TODO化済みの行にマークを表示する

**Given** TODO化済みのノート行がある

**When** ユーザーがノート本文を見る

**Then** その行がTODO化済みであることが分かるマークが表示される

#### AC-5: 同一行の重複TODO化を確認する

**Given** 同じ`noteEntryId`内で同一内容の行がすでにTODO化されている

**When** ユーザーがその行を再度TODO化しようとする

**Then** 既存TODO候補を表示し、キャンセルまたは別TODOとして作成を選べる

#### AC-6: ノート編集後もTODO本文は変わらない

**Given** ノート行から作成済みのTODOがある

**When** ユーザーが元のノート本文を編集する

**Then** 作成済みTODOの本文は自動変更されない

### Design Notes

- TODO化後は入力の流れを止めない控えめな通知にする。
- 仕事整理モードへ戻った際、追加されたTODOを短時間ハイライトする。

### Technical Notes

- `NoteLineMeta`に変換時点の`lineNumberAtConversion`、`normalizedLineText`、`lineHash`、`lineText`、`convertedToTodoId`を保持する。
- `lineHash`は`noteEntryId + normalizedLineText`をもとに生成する。
- 元行を特定できなくなった場合でも、TODO側は`NoteLineMeta.lineText`を発生元として表示できるようにする。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-004 | Story | Ready |
| US-MVP-007 | Story | Ready |
| US-MVP-008 | Story | Ready |

### Out of Scope

- ノート行の振り返りへの直接送信。
- AIによるTODO抽出。

### Open Questions

- TODOタイトル生成時に、行頭記号や「TODO化:」などのラベルをどこまで除去するかは実装前に最小ルールを決める必要がある。

---

## Story 10: ノート行を障害化する

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-010 |
| Title | ノート行を障害化する |
| Persona | 会議・会話メモを取るビジネスパーソン |
| Priority | P0 |
| Epic/Feature | ノートから障害化 |
| Estimate | M |

### User Story Statement

**As a** 会議・会話メモを取るビジネスパーソン,

**I want** ノートモードで選択した行を障害・詰まりに変換できる,

**so that** 会議や会話で見つかった仕事の詰まりをその日の整理画面へ移せる.

### Context & Background

障害化はTODO化と同じ行変換ルールを適用する。ユーザーはメモ中に詰まりを登録してもノートモードから離脱しない。

### Acceptance Criteria

#### AC-1: 選択行を障害・詰まりに追加できる

**Given** ノートモードでノート本文内の行を選択している

**When** ユーザーが`Ctrl / Cmd + Shift + B`を押す

**Then** 選択行の内容を元にした障害・詰まりが同じ日付の障害・詰まり一覧に追加される

#### AC-2: ノートモードに留まる

**Given** ノートモードで行を障害化する

**When** 障害・詰まりの作成が完了する

**Then** 表示モードはノートモードのままで、小さな通知が表示される

#### AC-3: 発生元のスナップショットを保持する

**Given** ノート行を障害化する

**When** 障害・詰まりが作成される

**Then** 障害・詰まりは変換時点の行本文を発生元として参照できる

#### AC-4: 障害化済みの行にマークを表示する

**Given** 障害化済みのノート行がある

**When** ユーザーがノート本文を見る

**Then** その行が障害化済みであることが分かるマークが表示される

#### AC-5: 同一行の重複障害化を確認する

**Given** 同じ`noteEntryId`内で同一内容の行がすでに障害化されている

**When** ユーザーがその行を再度障害化しようとする

**Then** 既存の障害・詰まり候補を表示し、キャンセルまたは別の障害・詰まりとして作成を選べる

### Design Notes

- 障害化後は入力の流れを止めない控えめな通知にする。
- 仕事整理モードへ戻った際、追加された障害・詰まりを短時間ハイライトする。

### Technical Notes

- TODO化と同じ`NoteLineMeta`の変換ルールを適用する。
- `convertedToBlockerId`を保持する。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-005 | Story | Ready |
| US-MVP-007 | Story | Ready |
| US-MVP-008 | Story | Ready |
| US-MVP-009 | Story | Ready |

### Out of Scope

- 障害カテゴリの自動付与。
- 外部チャットからの自動取り込み。

### Open Questions

- 障害テキスト生成時に、行頭記号や「障害化:」などのラベルをどこまで除去するかは実装前に最小ルールを決める必要がある。

---

## Story 11: 入力内容を自動保存する

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-011 |
| Title | 入力内容を自動保存する |
| Persona | 日次業務を整理するビジネスパーソン |
| Priority | P0 |
| Epic/Feature | 自動保存 |
| Estimate | L |

### User Story Statement

**As a** 日次業務を整理するビジネスパーソン,

**I want** 保存操作を意識しなくても入力内容が保存される,

**so that** 仕事中にアプリを使っていても入力内容を失う不安を持たずに済む.

### Context & Background

MVPの重要目標は、TODO、障害、振り返り、ノート本文、今日のテーマの入力内容が失われないことである。保存状態は小さく表示する。

### Acceptance Criteria

#### AC-1: 編集内容が短い遅延後に保存される

**Given** ユーザーがTODO、障害、振り返り、ノート本文、今日のテーマのいずれかを編集している

**When** 入力後に短い遅延が経過する

**Then** 編集内容が対象日のデータとして保存される

#### AC-2: 保存中状態を表示する

**Given** 自動保存処理が実行中である

**When** ユーザーが画面右上などの保存状態を見る

**Then** 「保存中...」に相当する状態が表示される

#### AC-3: 保存済み状態を表示する

**Given** 自動保存が成功している

**When** ユーザーが保存状態を見る

**Then** 「保存済み」に相当する状態が表示される

#### AC-4: 保存失敗を表示する

**Given** 自動保存に失敗する

**When** 保存処理が失敗として完了する

**Then** 「保存できませんでした」に相当するエラー状態が表示される

#### AC-5: モード切り替えや日付移動で入力内容を失わない

**Given** ユーザーが入力内容を編集している

**When** モード切り替えまたは日付移動を行う

**Then** 入力内容が失われず、保存処理が継続または完了する

### Design Notes

- 保存状態表示は控えめにし、入力の邪魔にならない位置に置く。
- エラー表示は明確にする。

### Technical Notes

- MVPではローカル保存を前提とする。
- 入力中に保存処理で引っかからないことを優先する。
- 自動保存失敗による入力喪失報告0件がMVP成功指標に含まれる。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-001 | Story | Ready |

### Out of Scope

- 外部同期。
- 認証。
- クラウドバックアップ。

### Open Questions

- 自動保存の具体的な遅延時間は実装時にUXとパフォーマンスを見て決定する。

---

## Story 12: 未完了TODOを翌日に持ち越す

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-012 |
| Title | 未完了TODOを翌日に持ち越す |
| Persona | 日次業務を整理するビジネスパーソン |
| Priority | P0 |
| Epic/Feature | 未完了TODOの翌日持ち越し |
| Estimate | M |

### User Story Statement

**As a** 日次業務を整理するビジネスパーソン,

**I want** 完了しなかったTODOを翌日のノートへ持ち越せる,

**so that** 今日終わらなかった作業を明日の一手として忘れずに扱える.

### Context & Background

夕方の利用ではTODOと障害を確認し、未完了TODOを翌日に引き継ぐ。持ち越し元の日付を保持し、同じTODOを重複して持ち越さない。

### Acceptance Criteria

#### AC-1: 未完了TODOを翌日に持ち越せる

**Given** 対象日に未完了TODOが存在する

**When** ユーザーがTODOを翌日に持ち越す

**Then** 翌日の`DayNote`に同じ内容の未完了TODOが追加される

#### AC-2: 翌日のノートが未作成なら自動生成される

**Given** 翌日の`DayNote`が存在しない

**When** ユーザーが未完了TODOを翌日に持ち越す

**Then** 翌日の`DayNote`が自動生成され、持ち越しTODOが追加される

#### AC-3: 持ち越し元にマークが付く

**Given** TODOを翌日に持ち越した

**When** ユーザーが持ち越し元の日付のTODOを見る

**Then** 元TODOは`carried`状態として、翌日に持ち越し済みであることが分かる

#### AC-4: 持ち越し元の日付を保持する

**Given** 翌日に持ち越されたTODOが存在する

**When** ユーザーが翌日のTODOを見る

**Then** そのTODOがどの日付から持ち越されたか分かる

#### AC-5: 同じTODOを重複して持ち越さない

**Given** すでに翌日に持ち越し済みのTODOが存在する

**When** ユーザーが同じTODOを再度持ち越そうとする

**Then** 重複する持ち越しTODOは作成されない

### Design Notes

- 当日側では「翌日へ持ち越し済み」、翌日側では「前日から持ち越し」が分かる表示にする。

### Technical Notes

- 持ち越し先TODOは`carriedFromTodoId`で元TODOを参照する。
- 元TODOは`status: 'carried'`にする。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-002 | Story | Ready |
| US-MVP-004 | Story | Ready |

### Out of Scope

- 複数日先への持ち越し。
- 繰り返しタスク。

### Open Questions

- 持ち越し操作をTODO単位にするか、未完了一括にするかはUI設計時に決める必要がある。

---

## Story 13: 標準キーバインドで主要操作を行う

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-013 |
| Title | 標準キーバインドで主要操作を行う |
| Persona | キーボード中心で操作するビジネスパーソン |
| Priority | P0 |
| Epic/Feature | ショートカットキー |
| Estimate | M |

### User Story Statement

**As a** キーボード中心で操作するビジネスパーソン,

**I want** 標準キーバインドで主要な移動と追加操作を行える,

**so that** クリックに頼らず日次ノートを素早く操作できる.

### Context & Background

MVPでは標準キーバインドを初期設定とし、仕事整理モード内のフォーカス移動、TODO追加、日付移動をショートカットで行えるようにする。

### Acceptance Criteria

#### AC-1: 仕事整理モード内の領域へ移動できる

**Given** 標準キーバインドで仕事整理モードを表示している

**When** ユーザーが`Ctrl / Cmd + 1`、`Ctrl / Cmd + 2`、`Ctrl / Cmd + 3`を押す

**Then** TODO、障害・詰まり、振り返りの対応する領域へフォーカスが移動する

#### AC-2: TODOをショートカットで追加できる

**Given** 標準キーバインドで仕事整理モードを表示している

**When** ユーザーがTODO追加操作として`Ctrl / Cmd + Enter`を押す

**Then** TODOを追加できる状態になる、または入力中のTODOが追加される

#### AC-3: 日付移動をショートカットで行える

**Given** 標準キーバインドで任意の日付の`DayNote`を表示している

**When** ユーザーが`Alt / Option + ←`、`Alt / Option + →`、`Ctrl / Cmd + T`を押す

**Then** 前日、翌日、今日の対応する`DayNote`へ移動する

#### AC-4: MVP外ショートカットは動作対象にしない

**Given** ユーザーがMVP外ショートカットを押す

**When** `Ctrl / Cmd + K`などPost-MVP操作を実行しようとする

**Then** コマンドパレットなどMVP外機能は起動しない

### Design Notes

- ショートカットの案内は必要最小限にし、ノート1枚感を損なわないようにする。

### Technical Notes

- OS差分としてWindowsは`Ctrl`、Macは`Cmd`を主に扱う。
- ノートモード内のTODO化と障害化ショートカットはUS-MVP-009、US-MVP-010で扱う。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-002 | Story | Ready |
| US-MVP-004 | Story | Ready |
| US-MVP-006 | Story | Ready |

### Out of Scope

- コマンドパレット。
- ユーザーによる個別キーマップ編集。

### Open Questions

- TODO追加時のフォーカス位置と入力確定ルールはUI実装時に最小挙動を決める必要がある。

---

## Story 14: キーバインドモードを設定する

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-014 |
| Title | キーバインドモードを設定する |
| Persona | キーボード中心で操作するビジネスパーソン |
| Priority | P1 |
| Epic/Feature | キーバインド設定 |
| Estimate | M |

### User Story Statement

**As a** キーボード中心で操作するビジネスパーソン,

**I want** 標準キーバインドとVimキーバインドを選択できる,

**so that** 自分の操作習慣に合った方法でdayboradを使える.

### Context & Background

dayboradはキーボード操作を重視する。初期設定は標準キーバインドであり、設定画面からVimキーバインドに切り替えられる。

### Acceptance Criteria

#### AC-1: 初期設定は標準キーバインドである

**Given** ユーザー設定が未作成である

**When** ユーザーがアプリを初回起動する

**Then** キーバインドモードは`standard`である

#### AC-2: 設定画面で現在のキーバインドを確認できる

**Given** ユーザーが設定画面を開いている

**When** キーバインド設定を見る

**Then** 標準またはVimの現在選択中の状態が明確に表示される

#### AC-3: Vimキーバインドへ切り替えられる

**Given** 標準キーバインドが選択されている

**When** ユーザーが設定画面でVimを選択する

**Then** キーバインドモードが`vim`へ切り替わる

#### AC-4: 標準キーバインドへ戻せる

**Given** Vimキーバインドが選択されている

**When** ユーザーが設定画面で標準を選択する

**Then** キーバインドモードが`standard`へ切り替わる

#### AC-5: 設定は再起動後も維持される

**Given** ユーザーがキーバインドモードを変更済みである

**When** アプリを再起動する

**Then** 変更後のキーバインドモードが維持される

### Design Notes

- 設定画面では標準とVimをラジオボタンなどで明確に選べるようにする。
- Vimを知らないユーザーが誤って切り替えても標準に戻せる導線を保つ。

### Technical Notes

- `UserSettings.keybindingMode`として`standard`または`vim`を永続化する。
- キーバインド切り替えで入力データに影響を与えない。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-013 | Story | Ready |

### Out of Scope

- ユーザーによる個別キーマップ編集。
- 複数プロファイル。

### Open Questions

- 設定画面の開き方はPRDで明示されていないため、MVP実装時に最小導線を決める必要がある。

---

## Story 15: VimキーバインドでMVP操作を行う

### Story Header

| Field | Value |
|-------|-------|
| ID | US-MVP-015 |
| Title | VimキーバインドでMVP操作を行う |
| Persona | Vim操作に慣れたビジネスパーソン |
| Priority | P1 |
| Epic/Feature | Vimキーバインド |
| Estimate | L |

### User Story Statement

**As a** Vim操作に慣れたビジネスパーソン,

**I want** Vim風の最小操作で移動、入力状態切り替え、TODO化、障害化ができる,

**so that** キーボード中心の作業感を保ったままdayboradを使える.

### Context & Background

MVPのVimキーバインドは完全なVim互換を目指さない。移動、入力状態切り替え、TODO完了切替、モード切り替え、TODO化、障害化に必要な最小範囲に絞る。

### Acceptance Criteria

#### AC-1: テキスト領域フォーカス直後はNormal状態になる

**Given** キーバインドモードが`vim`である

**When** ユーザーがテキスト領域にフォーカスする

**Then** Vim操作状態は既定で`Normal`になる

#### AC-2: Insert状態へ入り、EscでNormal状態へ戻れる

**Given** Vim操作状態が`Normal`である

**When** ユーザーが`i`を押し、その後`Esc`を押す

**Then** `Insert`状態へ入った後、`Normal`状態へ戻る

#### AC-3: 現在のVim操作状態が分かる

**Given** キーバインドモードが`vim`である

**When** ユーザーが画面を見る

**Then** `VIM NORMAL`または`VIM INSERT`に相当する状態表示が控えめに表示される

#### AC-4: h/j/k/lで移動できる

**Given** Vim操作状態が`Normal`である

**When** ユーザーが`h`、`j`、`k`、`l`を押す

**Then** 左、下、上、右の列または項目へ移動できる

#### AC-5: xでTODO完了状態を切り替えられる

**Given** Vim操作状態が`Normal`で、TODOが選択されている

**When** ユーザーが`x`を押す

**Then** 選択中TODOの完了または未完了が切り替わる

#### AC-6: Space系ショートカットでMVP操作を行える

**Given** Vim操作状態が`Normal`である

**When** ユーザーが`Space n`、`Space 1`、`Space 2`、`Space 3`、`Space t`、`Space b`のいずれかを押す

**Then** モード切り替え、領域移動、選択行のTODO化、選択行の障害化の対応する操作が実行される

#### AC-7: Vimキーバインド中もCtrlまたはCmd + Jが有効である

**Given** キーバインドモードが`vim`である

**When** ユーザーが`Ctrl / Cmd + J`を押す

**Then** 仕事整理モードとノートモードが切り替わる

### Design Notes

- Vim操作状態表示は入力の邪魔にならない位置に置く。
- 日本語入力中のIME操作を妨げない。

### Technical Notes

- `UserSettings.vimDefaultState`の既定値は`normal`とする。
- `Esc`はIME確定、Insert解除、ノートモード復帰の順に扱う。
- Vimキーバインドは完全な編集エンジンとして作らない。

### Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| US-MVP-008 | Story | Ready |
| US-MVP-009 | Story | Ready |
| US-MVP-010 | Story | Ready |
| US-MVP-014 | Story | Ready |

### Out of Scope

- `gg` / `G`。
- `A` / `o` / `O`。
- `dd`。
- `u` / `Ctrl + r`。
- `/` / `n` / `N`。
- 複雑なマクロ、レジスタ、ビジュアルブロック、Exコマンド。

### Open Questions

- h/j/k/lがテキストカーソル移動と列・項目移動のどちらを優先するかは、フォーカス対象ごとの最小ルールを実装時に定義する必要がある。

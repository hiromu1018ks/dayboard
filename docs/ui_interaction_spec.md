# dayborad UI・インタラクション仕様

本書は、[要件定義書 6. 画面構成 / 8. ショートカットキー / 9. UX要件](dayborad_requirements.md) と [ユーザーストーリー](dayborad_user_stories.md) をもとに、画面遷移・フォーカス移動・入力確定・キーハンドリングの優先ルールを実装者が迷わない粒度に固定する設計契約である。

- 未確定だった論点: TODO追加時のフォーカス位置と入力確定（US-MVP-013 Open Questions）、設定画面の開き方（US-MVP-014 Open Questions）、Vimの `h/j/k/l` 優先ルール（US-MVP-015 Open Questions）
- 関連: [architecture.md §9](architecture.md) / [autosave_spec.md](autosave_spec.md) / [note_conversion_spec.md](note_conversion_spec.md)

---

## 1. 用語の確認（要件 8.4 準拠）

混同を防ぐため再掲する。

| 用語 | 値 | 内容 |
|------|-----|------|
| 表示モード (ViewMode) | `work` / `note` | 画面の表示状態。仕事整理モードとノートモード |
| キーバインドモード (KeybindingMode) | `standard` / `vim` | 操作体系。`UserSettings.keybindingMode` |
| Vim操作状態 (VimState) | `normal` / `insert` | Vimキーバインド時の編集状態。標準キーバインド時は無関係 |

---

## 2. 画面状態モデル

### 2.1 Rendererが保持するUI状態

```ts
type UIState = {
  // 表示
  viewMode: 'work' | 'note'
  currentDate: string                   // YYYY-MM-DD。表示中の日付

  // フォーカス（仕事整理モード用）
  workFocus: {
    section: 'todo' | 'blocker' | 'reflection' | 'theme'
    itemId: string | null               // 選択中のTODO/Blocker id。theme は null
  }

  // ノートモード用
  noteSelection: {
    lineNumber: number | null           // 選択中の行（1始まり）。null は未選択
  }

  // Vim
  vimState: 'normal' | 'insert'         // キーバインドモード=vim時のみ有意

  // 保存状態（autosave_spec.md 参照）
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'

  // 設定モーダル
  settingsOpen: boolean
}
```

### 2.2 起動直後の初期状態

| 状態 | 初期値 | 根拠 |
|------|--------|------|
| `viewMode` | `work` | 要件 7.7「初期表示は仕事整理モード」 |
| `currentDate` | 今日のローカル日付 | 要件 7.1 |
| `workFocus.section` | `theme` | テーマ入力から始めやすい（要件 11.1 朝の利用フロー） |
| `noteSelection.lineNumber` | `null` | ノートモードに入り直すごとにリセット |
| `vimState` | `UserSettings.vimDefaultState`（既定 `normal`） | 要件 8.6, 10.2 |
| `saveStatus` | `saved`（初回取得データは保存済み） | — |
| `settingsOpen` | `false` | — |

> **補足:** `lastOpenedMode` を DBに保持する（[database_schema.md §3.1](database_schema.md)）が、**起動直後は常に `work` で開く**（要件 7.7）。`lastOpenedMode` は「直前に見ていたモード」としての参考記録で、起動時の強制上書き対象とはしないが、MVPでは要件 7.7 を優先し毎回 `work` で開始する。

---

## 3. 仕事整理モードのフォーカス移動

### 3.1 フォーカス可能要素

仕事整理モードには以下のフォーカス領域（`section`）がある。

| section | 領域 | 中身 |
|---------|------|------|
| `theme` | ヘッダーの今日のテーマ入力 | 1つのテキスト入力 |
| `todo` | ① TODO列 | TODO項目のリスト + 追加入力欄 |
| `blocker` | ② 障害・詰まり列 | 障害項目のリスト + 追加入力欄 |
| `reflection` | ③ 振り返り列 | できたこと / 止まったこと / 明日の二手 の3テキストエリア |

### 3.2 標準キーバインドのフォーカス移動

| 操作 | キー（Mac / Win） | 動作 |
|------|-------------------|------|
| TODO列へ | `⌘1` / `Ctrl+1` | `workFocus.section = 'todo'`、先頭TODO（なければ追加入力欄）にフォーカス |
| 障害列へ | `⌘2` / `Ctrl+2` | 同上 `blocker` |
| 振り返り列へ | `⌘3` / `Ctrl+3` | 同上 `reflection` |
| TODO追加 | `⌘Enter` / `Ctrl+Enter` | [§5.1](#51-todo追加の入力確定ルール) 参照 |

`⌘1/2/3` は各列の**入力可能な最初の要素**にフォーカスする。すでにその列にフォーカスがある場合は、フォーカスを維持したまま最初の編集可能要素へ。

### 3.3 列内の項目間移動（標準キーバインド）

標準キーバインドでは列内の上下移動は **`Tab` / `Shift+Tab`** または矢印キーで行う（一般的なフォーム操作）。TODOの場合:

- `Tab`: 次のTODO（なければ追加入力欄 → 次の列へ）
- `↑` / `↓`: 同じ列内のTODO間移動
- `Enter`（TODO本文編集中）: 編集確定。空になったTODOは [edge_cases.md](edge_cases.md) の削除ルールへ

### 3.4 Vimキーバインドのフォーカス移動（h/j/k/l）

要件 8.6「左、下、上、右の基本移動」。**`h/j/k/l` の優先ルール**（US-MVP-015 Open Questions）を以下で固定する。

**基本原則:** `h/l` は列（section）間移動、`j/k` は列内項目移動。ただし **Insert状態では CodeMirror/入力欄のテキストカーソル移動** に取られる（入力を妨げない）。

| キー | Normal状態の動作 | Insert状態の動作 |
|------|------------------|------------------|
| `h` | 左の列（`todo←blocker←reflection`、左端なら `theme`） | CodeMirror/入力欄のカーソル左 |
| `l` | 右の列（`theme→todo→blocker→reflection`） | カーソル右 |
| `j` | 同列の次項目（下） | カーソル下 |
| `k` | 同列の前項目（上） | カーソル上 |

**列の順序（左右）:** `theme` ↔ `todo` ↔ `blocker` ↔ `reflection`

**列内の項目順（上下）:** 各列は上から追加入力欄→項目リスト（`order` 昇順）。`j/k` はこの順で移動。列の末尾で `j` を押すと止まる（循環しない）。先頭で `k` も止まる。

> **ノートモードでの h/j/k/l:** ノートモードは CodeMirror単体。Normal状態では CodeMirrorのVim拡張の `h/j/k/l`（テキスト内移動）をそのまま使う。列概念はない。Insert状態では通常のテキスト入力。

### 3.5 Vimキーバインドの Space 系コマンド

要件 8.6 の Space 系を実装する。**`Space` を押した時点でリーダーキー待ち状態**に入り、続く1キーでコマンド確定。200ms以内に次キーが来なければキャンセル。

| コマンド | 動作 |
|----------|------|
| `Space n` | `viewMode` を切替（要件 8.6） |
| `Space 1/2/3` | 対応列へフォーカス（[§3.2](#32-標準キーバインドのフォーカス移動) と同じ） |
| `Space t` | ノートモードで選択行をTODO化（[§6.2](#62-todo化障害化のui挙動)） |
| `Space b` | ノートモードで選択行を障害化 |

---

## 4. モード切り替え（要件 7.7、US-MVP-008）

### 4.1 切り替えキーと挙動

| トリガー | 動作 |
|----------|------|
| `⌘/Ctrl+J`（work時） | `viewMode = 'note'`、ノートモードのCodeMirrorにフォーカス |
| `⌘/Ctrl+J`（note時） | `viewMode = 'work'`、前回の `workFocus` を復元 |
| `Esc`（note時、標準キーバインド） | `viewMode = 'work'` |
| `Esc`（note時、Vim・Normal状態） | `viewMode = 'work'` |
| `Esc`（note時、Vim・Insert状態） | **Insert→Normal のみ**。モードは戻さない（要件 8.6、AC-17） |
| `Space n`（Vim・Normal状態） | `viewMode` 切替 |

### 4.2 モード切替時の保存保証

モード切替を実行する直前に、**保留中の自動保存デバウンスを即時フラッシュ**する（[autosave_spec.md §3](autosave_spec.md) の即時保存トリガ）。フラッシュ完了（または並行で切替）を待って切替。US-MVP-008 AC-5 のハイライトは切替完了後に行う。

### 4.3 ハイライト（US-MVP-008 AC-5）

`work` に戻った際、直近のノートモードセッションで新規作成された TODO/Blocker があれば **1.2秒間** 軽くハイライト（背景色を薄く）。その後ハイライト解除。複数項目あれば全てハイライト。

---

## 5. TODO追加・編集の入力確定ルール

US-MVP-013 Open Questions「TODO追加時のフォーカス位置と入力確定ルール」を固定する。

### 5.1 TODO追加の入力確定ルール

**標準キーバインド:**
1. `⌘/Ctrl+Enter` を押す、または列下部の追加入力欄にフォーカスして入力
2. 追加入力欄が開き、**キャレットを末尾に置いて入力開始**
3. `Enter` で確定 → `POST /api/day-notes/:date/todos`
4. 確定後: **追加入力欄をクリアしてフォーカス維持**（連続追加を可能にする、要件 9.3「入力のしやすさ」）
5. 追加入力欄が空の状態で `Enter`/`Esc` → フォーカスをTODOリスト先頭へ移す

**Vimキーバインド:**
1. Normal状態で `i`（または `Space t` のような直接作成コマンドはMVPでは未扱い）→ Insert状態で追加入力欄へ
2. 入力後 `Enter` で確定（Insert状態維持で連続追加可能）
3. `Esc` で Insert→Normal、追加入力欄からフォーカスを外しTODOリストへ

### 5.2 TODO本文編集の確定

- ダブルクリック、またはフォーカス中に `Enter`（標準）/ `i`（Vim Normal）で編集モードへ
- 編集確定は `Enter`（標準）または `Esc`（Vim Insert→Normal）
- 空にして確定した場合は **削除確認**（[edge_cases.md](edge_cases.md) 参照）

### 5.3 TODO完了切替

| 操作 | キー |
|------|------|
| 標準 | `Space` または `x`（任意採用。チェックボックスクリックも可） |
| Vim | Normal状態で `x`（要件 8.6、AC-09） |

`done` は取り消し線 + 薄色表示。`carried` は「→ 翌日へ持ち越し済み」ラベル（要件 7.10 表示例）。持ち越し先TODOは `carriedFromDate` を使い、「7/8から持ち越し」と表示する。

---

## 6. ノートモード（要件 7.6、US-MVP-007）

### 6.1 CodeMirrorの役割

- ノート本文は **CodeMirror** で編集（[architecture.md](architecture.md) 技術スタック）
- 自動保存は [autosave_spec.md](autosave_spec.md) に従い、`body` 全文をデバウンス送信（[api_contract.md §7](api_contract.md)）
- Vimキーバインド時は CodeMirrorの `@codemirror/vim` 拡張を有効化。Normal/Insert は CodeMirror側の状態をアプリの `vimState` と同期

### 6.2 TODO化・障害化のUI挙動

要件 7.8 / 7.9 を実装する。

**行選択:**
- ノートモードでは「現在カーソルがある行」を選択行とする（`noteSelection.lineNumber` = カーソル行）
- 複数行選択はMVPでは扱わない（要件 7.8「選択行」は単数行）

**TODO化（`⌘/Ctrl+Enter` または Vim `Space t`）:**
1. カーソル行の `lineText` を取得
2. 空行の場合は無反応（通知「空行はTODO化できません」）。API呼び出ししない
3. `POST /api/day-notes/:date/convert/todo`
4. **201成功:** 行左端に変換済みマーク `✓T`（仮）を付与。通知「TODOに追加しました」。**ノートモードに留まる**（要件 7.8 AC-2）
5. **409重複:** 確認ダイアログ「すでにTODO化されています。別TODOとして追加しますか？」→ キャンセル / 別TODO作成（`?force=1`）

**障害化（`⌘/Ctrl+Shift+B` または Vim `Space b`）:**
- 同上。マークは `✓B`（仮）。通知「障害・詰まりに追加しました」

**通知（要件 9.3）:**
- 画面右下に小さく、2秒で消えるトースト
- ノートモードから離脱しない（要件 9.3、US-MVP-009 AC-2）

### 6.3 変換済みマークの表示

- 各行の左端にガター領域を設け、変換済み状態を表示
- マークは `NoteLineMeta.convertedToTodoId` / `convertedToBlockerId` が非NULLの行に対して付与
- 行編集で元行がずれても、`lineHash` が一致する行にマークを追従させる（[note_conversion_spec.md §6](note_conversion_spec.md) で追従ルールを固定）

---

## 7. 日付移動（要件 8.1、US-MVP-002）

| 操作 | キー |
|------|------|
| 前日 | `Alt/Option+←` |
| 翌日 | `Alt/Option+→` |
| 今日 | `⌘/Ctrl+T` |

**挙動:**
1. 保留中の自動保存を即時フラッシュ（[autosave_spec.md](autosave_spec.md)）
2. `GET /api/day-notes/:targetDate/full` を呼ぶ
3. レスポンスで `currentDate` と全データを差し替え
4. `viewMode = 'work'`、`workFocus` を初期化（theme へ）
5. ヘッダーに日付・曜日を表示

ヘッダーには日付移動ボタン（`‹` / `›` / 「今日」）も併設する（マウス利用の余地、要件 9.3 でクリックも排除しない）。

---

## 8. 設定画面（要件 8.5、US-MVP-014）

US-MVP-014 Open Questions「設定画面の開き方」を固定する。

### 8.1 開き方

- **ヘッダー右端の設定アイコン（歯車）クリック** でモーダルを開く
- MVPではショートカットキーは割り当てない（コマンドパレットは Post-MVP）。キーボードユーザーには、アイコンが `Tab` で到達できることを保証する
- モーダル中は `Esc` で閉じる。背景クリックでも閉じる

### 8.2 内容

```text
┌───────────────────────────────┐
│ 設定                       ✕  │
├───────────────────────────────┤
│ キーバインド                  │
│                               │
│  ○ 標準                       │
│    一般的なショートカットで操作 │
│                               │
│  ○ Vim                        │
│    h/j/k/l、i、Esc などの      │
│    Vim風操作を使う             │
│                               │
│ Vim 初期状態（Vim選択時のみ）  │
│  ○ Normal   ○ Insert          │
│                               │
│              [ キャンセル ] [ 保存 ] │
└───────────────────────────────┘
```

- ラジオボタンで `keybindingMode` を選択
- `vim` 選択時のみ `vimDefaultState`（Normal/Insert）を表示（要件 10.2）
- 「保存」で `PATCH /api/settings`（[api_contract.md §11](api_contract.md)）。キャンセルは変更破棄
- 保存成功後、即座にキーバインドを切り替えて適用（要件 8.5 AC-5）

---

## 9. IME・日本語入力の扱い（要件 9.3 / 8.6 注意点、AC-19）

**最重要:** 日本語入力中のショートカット誤動作を防ぐ。すべてのキーハンドラの先頭で以下をチェックする。

### 9.1 IME変換中の判定

- `KeyboardEvent.isComposing === true` または `keyCode === 229` の場合、**ショートカット判定をスキップ** する
- 変換未確定の文字列はそのまま入力欄へ流す

### 9.2 Esc の優先順位（要件 8.6 注意点、AC-19）

`Esc` を押したときの優先順位を以下で固定する。

```text
1. IME変換中       → 変換キャンセル/確定のみ。アプリ操作はしない
2. Vim Insert状態   → Normal状態へ戻るのみ（ノートモードでも離脱しない）
3. 設定モーダル open → モーダルを閉じるのみ
4. ノートモード(Vim Normal / 標準) → 仕事整理モードへ戻る
```

上位ほど優先。これにより「日本語入力確定で意図せず画面遷移」を防ぐ（要件 AC-19）。

### 9.3 Vimキーバインド時の IME

- Insert状態でのみIME入力を許可。Normal状態での日本語入力はしない（Vim本来の挙動）
- `@codemirror/vim` 拡張の挙動に任せ、アプリ層ではIMEとVimの干渉を明示的に処理しない（要件 8.6 注意点「日本語入力中は、VimキーバインドがIME入力を妨げないようにする」）

---

## 10. 保存状態表示（要件 7.11、US-MVP-011）

保存状態は**平時は非表示**。自動保存を売りにする以上、何も起きていない時の
「保存済み」常時表示はノイズになる。保存が絡む動作中のみ右下に表示する
（[autosave_spec.md](autosave_spec.md) で状態遷移を固定）。

| saveStatus | 表示 | 色 |
|------------|------|----|
| `idle` | 「保存中...」（デバウンス待機中も保存中と同義） | 控め（グレー） |
| `saving` | 「保存中...」 | 控えめ（グレー） |
| `saved` | （非表示） | — | 表示が消える = 保存完了 |
| `error` | 「保存できませんでした」+ 再試行 | 赤 |

要件 9.3「入力の邪魔にならない位置」のため、表示時も右下端の小さなテキストのみ。
アニメーションは控えめに。

---

## 11. ショートカット早見表（実装チェックリスト）

実装者がキーバインドを網羅できるよう、要件 8 をマッピングする。

### 11.1 基本ショートカット（要件 8.1、画面スコープ）

| 操作 | Mac | Win | モード | 備考 |
|------|-----|-----|--------|------|
| ノートモード切替 | `⌘J` | `Ctrl+J` | 両モード | [§4.1](#41-切り替えキーと挙動) |
| 今日へ | `⌘T` | `Ctrl+T` | 両モード | [§7](#7-日付移動要件-81us-mvp-002) |
| 前日 | `Option+←` | `Alt+←` | 両モード | 同上 |
| 翌日 | `Option+→` | `Alt+→` | 両モード | 同上 |

### 11.2 仕事整理モード（要件 8.2）

| 操作 | Mac | Win | 備考 |
|------|-----|-----|------|
| TODOへ | `⌘1` | `Ctrl+1` | [§3.2](#32-標準キーバインドのフォーカス移動) |
| 障害へ | `⌘2` | `Ctrl+2` | 同上 |
| 振り返りへ | `⌘3` | `Ctrl+3` | 同上 |
| TODO追加 | `⌘Enter` | `Ctrl+Enter` | [§5.1](#51-todo追加の入力確定ルール) |

### 11.3 ノートモード（要件 8.3）

| 操作 | Mac | Win | 備考 |
|------|-----|-----|------|
| 選択行TODO化 | `⌘Enter` | `Ctrl+Enter` | [§6.2](#62-todo化障害化のui挙動) |
| 選択行障害化 | `⌘Shift+B` | `Ctrl+Shift+B` | 同上 |

### 11.4 Vim（要件 8.6、Normal状態）

| キー | 動作 | 備考 |
|------|------|------|
| `h/j/k/l` | 移動 | [§3.4](#34-vimキーバインドのフォーカス移動 hjkl) |
| `i` | Insertへ | AC-16 |
| `Esc` | Normalへ / モード戻り | [§9.2](#92-esc-の優先順位要件-86-注意点ac-19) |
| `x` | TODO完了切替 | AC-09 |
| `Space n` | モード切替 | [§3.5](#35-vimキーバインドの-space-系コマンド) |
| `Space 1/2/3` | 列フォーカス | 同上 |
| `Space t` | 選択行TODO化 | ノートモード |
| `Space b` | 選択行障害化 | ノートモード |

### 11.5 Post-MVP（実装しない、AC-22）

`⌘/Ctrl+K`（コマンドパレット）、`⌘/Ctrl+Shift+R`（振り返り送信）、`⌘/Ctrl+Shift+M`（時刻見出し）、Vim Normal の `gg`, `G`, `A`, `o`, `O`, `dd`, `u`, `Ctrl+r`, `/`, `n`, `N`, `Space r`, `Space k` は押しても何も起きない（ただし入力内容は破壊しない）。

---

## 12. アクセシビリティの最低ライン

要件 9 に直接の記載はないが、[dayborad_user_stories.md](dayborad_user_stories.md) の「キーボード中心」思想に合わせる。

- 全フォーカス可能要素は `Tab` で到達可能
- フォーカス表示は明確（Vim OFF時も含む）
- TODOのチェックボックスは `Space` で切替可能（標準キーバインド時）
- 色だけで状態（`done` / `carried` / 変換済み）を伝えない（アイコンやテキスト併用）

---

## 13. 未決定事項の解決まとめ

本書が新たに固定した、ユーザーストーリーの Open Questions への回答。

| Open Question | 出典 | 本書の回答 |
|---------------|------|-----------|
| TODO追加時のフォーカス位置と入力確定ルール | US-MVP-013 | [§5.1](#51-todo追加の入力確定ルール): 追加入力欄フォーカス、Enter確定、確定後もフォーカス維持で連続追加 |
| 設定画面の開き方 | US-MVP-014 | [§8.1](#81-開き方): ヘッダー右の歯車アイコンからモーダル |
| `h/j/k/l` の優先（テキストカーソル vs 列・項目移動） | US-MVP-015 | [§3.4](#34-vimキーバインドのフォーカス移動hjkl): Normal=列/項目移動、Insert=テキストカーソル移動 |

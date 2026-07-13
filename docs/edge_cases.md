# dayborad エッジケース仕様

本書は、[要件定義書](dayborad_requirements.md) と [ユーザーストーリー](dayborad_user_stories.md) の本体に明示されていないが、実装者が手を動かす際に必ず遭遇するエッジケースを網羅し、それぞれの「期待される挙動」を固定する設計契約である。本書は [test_strategy.md](test_strategy.md) のUnit/Integrationテストの入力ケースにもなる。

- 対象領域: TODO削除、TODO本文編集、持ち越し後の再編集、同名TODO、空行変換、巨大ノート、保存失敗復旧、その他
- 関連: [database_schema.md](database_schema.md) / [api_contract.md](api_contract.md) / [note_conversion_spec.md](note_conversion_spec.md) / [autosave_spec.md](autosave_spec.md) / [ui_interaction_spec.md](ui_interaction_spec.md)

---

## 0. 記述形式

各ケースは以下の形式で記述する。

> **ケース:** 状況の説明
> **期待される挙動:** 実装が取るべき動作
> **根拠:** 関連仕様節・要件

---

## 1. TODO削除系

### 1.1 TODOの手動削除

> **ケース:** ユーザーがTODOを削除する（要件 7.3 には明示ないが、編集UX上必要）
> **期待される挙動:**
> - `DELETE /api/todos/:id`（[api_contract.md §5](api_contract.md)）で削除
> - 削除前に確認（空にして確定時も [ui_interaction_spec.md §5.2](ui_interaction_spec.md) の削除確認）
> - リスト内の残りTODOの `order` を詰める（0,1,2... に再採番）
> - UIから即座に消す（楽観的更新）
> **根拠:** [api_contract.md §5](api_contract.md), [ui_interaction_spec.md §5.2](ui_interaction_spec.md)

### 1.2 変換元ノート行を持つTODOの削除

> **ケース:** ノートからTODO化して作ったTODO（`sourceNoteLineMetaId` あり）を削除する
> **期待される挙動:**
> - TODOは削除される
> - `note_line_metas.converted_to_todo_id` が `ON DELETE SET NULL` でNULL化（[database_schema.md §3.3](database_schema.md)）
> - 結果、元ノート行の変換済みマーク `✓T` が消える（`convertedToTodoId IS NULL` になるため、[note_conversion_spec.md §8.4](note_conversion_spec.md)）
> - NoteLineMetaレコード自体は残る
> **根拠:** [database_schema.md §3.3](database_schema.md), [note_conversion_spec.md §8.4](note_conversion_spec.md)

### 1.3 持ち越し元TODO（`carried`）の削除

> **ケース:** 翌日に持ち越した元TODO（`status='carried'`）を削除する
> **期待される挙動:**
> - 元TODOは削除される
> - 翌日側の `carriedFromTodoId` は **null化せずそのまま残す**（[database_schema.md §3.3](database_schema.md) の自己参照運用: 外部キー制約なし）
> - 翌日側の `carriedFromDate` も保持し、「7/8から持ち越し（元TODO削除済み）」のように日付表示は継続する
> - 翌日側TODO自体の`status`は`todo`のままで変更しない
> **根拠:** [database_schema.md §3.3](database_schema.md)

### 1.4 持ち越し先TODO（翌日側）の削除

> **ケース:** 翌日に持ち越された側のTODO（`carriedFromTodoId` あり）を削除する
> **期待される挙動:**
> - 翌日側TODOは削除される
> - 元TODO（前日側）の `status='carried'` は **変更しない**（持ち越しは履歴事実であり、取り消し可能とはしない）
> - ユーザーが「やっぱり翌日で扱わない」と削除しただけなら、前日側は `carried` のままでよい
> - 同じTODOを再度持ち越ししたい場合は、重複判定（[§4.3](#43-同じtodoの重複持ち越し)）に引っかかりスキップされる。新たに持ち越すには、別の「やり直し」導線が必要だがMVPでは提供しない（持ち越しは不可逆、[database_schema.md §3.3](database_schema.md)）
> **根拠:** [database_schema.md §3.3](database_schema.md), [api_contract.md §10](api_contract.md)

---

## 2. TODO本文編集系

### 2.1 TODO本文を空にして確定

> **ケース:** TODOの `title` を編集で空にして確定する
> **期待される挙動:**
> - [ui_interaction_spec.md §5.2](ui_interaction_spec.md) の削除確認ダイアログを表示
> - 「削除」を選んだら [§1.1](#11-todoの手動削除) と同じ削除フロー
> - 「キャンセル」を選んだら元のtitleに戻す（編集破棄）
> **根拠:** [ui_interaction_spec.md §5.2](ui_interaction_spec.md)

### 2.2 TODO本文に前後空白だけ入力

> **ケース:** TODO追加時に `"   "`（空白のみ）を入力して確定
> **期待される挙動:**
> - API側で trim 後空となるため `VALIDATION_ERROR`（[api_contract.md §5](api_contract.md)）
> - UI通知「タイトルは必須です」
> - 追加は行われない（TODOは作られない）
> **根拠:** [api_contract.md §5](api_contract.md)

### 2.3 TODO本文が200文字超過

> **ケース:** TODO本文に201文字以上入力して確定
> **期待される挙動:**
> - `VALIDATION_ERROR`（最大長200、[api_contract.md §5](api_contract.md)）
> - UI通知「200文字以内で入力してください」
> - ※ ノートからの変換時は200文字で切り詰め（[note_conversion_spec.md §4.5](note_conversion_spec.md)）だが、手動追加ではエラー
> **根拠:** [api_contract.md §5](api_contract.md), [note_conversion_spec.md §4.5](note_conversion_spec.md)

---

## 3. 持ち越し後の再編集系

### 3.1 持ち越し元（`carried`）のTODOを編集・完了しようとする

> **ケース:** `status='carried'` の元TODOの本文を編集、または完了操作をする
> **期待される挙動:**
> - 編集（`PATCH title`）: 許可する（`carried` でも表示上の修正は可能）。ただし翌日側TODOには伝播しない（持ち越しはスナップショットコピー）
> - 完了操作（`PATCH status='done'`）: `INVALID_TRANSITION`（[database_schema.md §3.3](database_schema.md)）。`carried → *` は禁止
> - UI通知「このTODOはすでに持ち越し済みです」
> **根拠:** [database_schema.md §3.3](database_schema.md)

### 3.2 持ち越し先（翌日側）のTODOを編集・完了する

> **ケース:** 翌日に持ち越されたTODO（`status='todo'`, `carriedFromTodoId` あり）を編集・完了する
> **期待される挙動:**
> - 通常のTODOと同様に編集・完了可能（`todo ↔ done`）
> - `carriedFromTodoId` と `carriedFromDate` は維持（「7/8から持ち越し」表示を保つ）
> - 完了時は通常どおり `completedAt` セット
> **根拠:** [database_schema.md §3.3](database_schema.md), [api_contract.md §10](api_contract.md)

### 3.3 持ち越し先を編集後に前日を見ると、元TODOは古い内容のまま

> **ケース:** 翌日側で持ち越しTODOのtitleを修正後、前日に戻る
> **期待される挙動:**
> - 前日側の元TODOは「持ち越し時点のコピー」のため、修正は反映されない
> - 元TODOは `carried` のまま、持ち越し時のtitleを保持
> - これは仕様（持ち越しはスナップショット、[api_contract.md §10](api_contract.md)）
> **根拠:** [api_contract.md §10](api_contract.md)

---

## 4. 同名TODO・重複系

### 4.1 同一日に同名のTODOを手動で2つ作成

> **ケース:** 同じ日付に「見積作成」を2つ手動追加
> **期待される挙動:**
> - 許可する（手動追加に重複チェックはない、[api_contract.md §5](api_contract.md)）
> - 2つの別 `id` のTODOとして存在
> - UI上は同じタイトルで2行表示
> **根拠:** [api_contract.md §5](api_contract.md)（重複チェックは変換時のみ）

### 4.2 同一ノート行の重複TODO化（基本）

> **ケース:** 同じ `(noteEntryId, lineHash)` の行を2回TODO化する
> **期待される挙動:**
> - 2回目は `409 DUPLICATE_CONVERSION`（[api_contract.md §9](api_contract.md), [note_conversion_spec.md §6](note_conversion_spec.md)）
> - 確認ダイアログ表示（[note_conversion_spec.md §7](note_conversion_spec.md)）
> - キャンセル → TODO作成しない
> - 別TODO作成（`?force=1`）→ 2つ目のTodoItem + NoteLineMeta作成
> **根拠:** [note_conversion_spec.md §6/§7](note_conversion_spec.md)

### 4.3 同じTODOの重複持ち越し

> **ケース:** すでに翌日に持ち越済みのTODOを、再度持ち越し操作する
> **期待される挙動:**
> - `POST /carry-over` で `skipped` 行として返却（[api_contract.md §10](api_contract.md)）
> - HTTP 200（部分成功）、翌日に重複TODOは作られない
> - UI通知「このTODOはすでに翌日に持ち越し済みです」
> **根拠:** [api_contract.md §10](api_contract.md), AC-12

### 4.4 持ち越し済みTODO（`carried`）を持ち越し操作に含める

> **ケース:** `status='carried'` のTODOを `todoIds` に含めて `POST /carry-over` する
> **期待される挙動:**
> - 翌日に `carriedFromTodoId = <元TODO>` のTODOが存在する場合は、HTTP 200の `skipped` 行として返す
> - 翌日に重複先が存在しない `carried` はデータ不整合として `VALIDATION_ERROR` を返す
> - クライアントは原則として事前に `carried` を除外して送る。ただし、再送や二重クリックで送られた通常ケースは `skipped` で安全に処理する
> **根拠:** [api_contract.md §10](api_contract.md)

---

## 5. 空行変換系

### 5.1 空行をTODO化しようとする

> **ケース:** ノート本文の空行（改行のみ、または空白のみ）にカーソルを置いてTODO化
> **期待される挙動:**
> - クライアント側で空行検出 → API呼び出しせず通知「空行はTODO化できません」（[ui_interaction_spec.md §6.2](ui_interaction_spec.md)）
> - NoteLineMeta/TodoItem 作成なし
> **根拠:** [ui_interaction_spec.md §6.2](ui_interaction_spec.md)

### 5.2 ラベル/記号のみの行（変換後に空になる）

> **ケース:** `"TODO化："` や `"-"` 単独の行をTODO化
> **期待される挙動:**
> - 記号・ラベル直後の空白有無に関係なく `extractTitle` 後に空になる → `VALIDATION_ERROR`（[note_conversion_spec.md §4.4](note_conversion_spec.md)）
> - UI通知「この行はTODO化できません（本文が空になります）」
> - NoteLineMeta/TodoItem 作成なし
> **根拠:** [note_conversion_spec.md §4.4](note_conversion_spec.md)

### 5.3 行頭記号のバリエーション

> **ケース:** `"-"`/`"•"`/`"・"`/`"*"`/`"1."`/`"2)"` 等の行頭記号付き行
> **期待される挙動:**
> - [note_conversion_spec.md §4.1](note_conversion_spec.md) のルールで記号除去 → title生成
> - 記号直後の空白がなくても、いずれの記号も除去される（例: `・部長承認待ち` → `部長承認待ち`）
> - これらはUnitテストで全パターン検証（[test_strategy.md §3.5](test_strategy.md)）
> **根拠:** [note_conversion_spec.md §4](note_conversion_spec.md)

### 5.4 変換後に200文字を超える行

> **ケース:** 200文字超の長い行をTODO化
> **期待される挙動:**
> - titleを200文字で切り詰め、「…」付加（[note_conversion_spec.md §4.5](note_conversion_spec.md)）
> - 通知「長いため200文字に切り詰めました」
> - TODOは作成される
> **根拠:** [note_conversion_spec.md §4.5](note_conversion_spec.md)

---

## 6. 巨大ノート系

### 6.1 ノート本文が巨大（数万文字）

> **ケース:** ノート本文に数万文字入力し続ける
> **期待される挙動:**
> - CodeMirrorは数万文字でも実用上軽快に動作（要件 12.1）
> - 自動保存は `PATCH /note-entry` で全文送信（[api_contract.md §7](api_contract.md)）。800msデバウンスで入力中のAPI連発を防ぐ
> - API側の最大長（例: 50000文字、[api_contract.md §7](api_contract.md)）を超えたら `VALIDATION_ERROR`
> **根拠:** [autosave_spec.md §3.4](autosave_spec.md), [api_contract.md §7](api_contract.md)

### 6.2 巨大ノートで変換済みマーク追従が重い

> **ケース:** 数千行のノートで、行編集ごとに `lineHash` 再計算を行う
> **期待される挙動:**
> - 行編集イベントで全行の `lineHash` を再計算するとO(N)で重くなる
> - **軽減策:** 編集された行とその前後のみ再計算、またはデバウンスしてガター更新（実装時の最適化余地）
> - MVPでは実用範囲（数万文字程度）で性能要件を満たすこと（要件 12.1）
> **根拠:** 要件 12.1, [note_conversion_spec.md §8.2](note_conversion_spec.md)

### 6.3 localStorage 容量超過

> **ケース:** 自動保存のフォールバックで `localStorage` の容量（数MB）を超える
> **期待される挙動:**
> - `dayborad:pending:${date}` は日付単位で分割済み（[autosave_spec.md §6.2](autosave_spec.md)）
> - それでも超過した場合、`QuotaExceededError` をキャッチし、**サーバー保存成功を最優先** する
> - フォールバックが書けなくても、メモリ上のローカルバッファ（[autosave_spec.md §6.1](autosave_spec.md)）には入力が残るため、セッション中は保護される
> - 入力中は `saveStatus=error` として扱い、ユーザー責任を示す文言にはしない
> - モード切替・日付移動前のlocalStorage書き込みで失敗した場合は、[autosave_spec.md §9.3](autosave_spec.md) の確認を出して遷移を止める
> **根拠:** [autosave_spec.md §6](autosave_spec.md)

---

## 7. 保存失敗・復旧系

### 7.1 保存APIが一時的に失敗（500/503/ネットワークエラー）

> **ケース:** Honoサーバーが一時的に応答不能、またはDB接続が瞬断
> **期待される挙動:**
> - 指数バックオフで3回リトライ（1s/2s/4s、[autosave_spec.md §7.1](autosave_spec.md)）
> - 復旧すれば `saved` へ戻る
> - ユーザー入力は継続可能（ローカルバッファに保持）
> **根拠:** [autosave_spec.md §7](autosave_spec.md)

### 7.2 保存APIが4xx（バリデーション等）

> **ケース:** バリデーションエラー（空title、長すぎ、等）でAPIが400
> **期待される挙動:**
> - リトライしない（[autosave_spec.md §7.1](autosave_spec.md): 4xxは冪等でないため）
> - `saveStatus=error`、UI通知で原因表示（例: 「タイトルは必須です」）
> - ユーザーが入力を修正すれば再び通常パスへ
> **根拠:** [autosave_spec.md §7](autosave_spec.md)

### 7.3 リトライ上限到達

> **ケース:** 3回リトライすべて失敗
> **期待される挙動:**
> - `saveStatus=error`（最終）、画面右下に「保存できませんでした」+「再試行」ボタン（[autosave_spec.md §7.2](autosave_spec.md)）
> - トースト「保存に失敗しました。入力内容は保持されています。再試行してください。」
> - ローカルバッファにはデータが残る
> **根拠:** [autosave_spec.md §7.2](autosave_spec.md)

### 7.4 サーバー保存失敗中に日付移動・モード切替を試みる

> **ケース:** 保留保存のサーバー同期が失敗状態で、ユーザーが日付移動やモード切替を試みる
> **期待される挙動:**
> - 遷移前に対象別localStorageスナップショットへ最新状態を書き込む
> - localStorage書き込みに成功した場合、サーバーリトライ完了を待たずに日付移動・モード切替を続行する
> - 移動元の未同期データは `dayborad:pending:${date}` に残り、バックグラウンドリトライまたは次回起動時に復旧する
> - localStorage書き込み自体が失敗した場合のみ、[autosave_spec.md §9.3](autosave_spec.md) の確認ダイアログを出す
> **根拠:** [autosave_spec.md §4.2](autosave_spec.md), [autosave_spec.md §9.3](autosave_spec.md)

### 7.5 アプリクラッシュ後の再起動で未保存分を復元

> **ケース:** 異常終了後、再起動する
> **期待される挙動:**
> - 起動時に `localStorage` の `dayborad:pending:*` を走査（[autosave_spec.md §6.2](autosave_spec.md)）
> - 未同期データがあれば、対応する日付のAPIへ再送（リカバリ）
> - 成功した対象だけ `targets` から削除し、全対象が空になった日付キーだけ削除
> - 失敗時は [§7.3](#73-リトライ上限到達) のerror状態へ
> **根拠:** [autosave_spec.md §6.2](autosave_spec.md)

### 7.6 POST（TODO追加等）のリトライで二重作成

> **ケース:** TODO追加のPOSTがタイムアウトし、リトライで2回POSTが届く
> **期待される挙動:**
> - [autosave_spec.md §8.2](autosave_spec.md) のリクエストID重複排除（推奨）で、同じリクエストIDを60秒以内に受信した場合は2回目を無視
> - MVPで重複排除未実装の場合、結果として2つのTODOが作られることがある → ユーザーが手動で片方を削除（[§1.1](#11-todoの手動削除)）
> - ※ いずれにせよ **入力内容は失われない**（要件 4.3「入力喪失0件」は遵守）
> **根拠:** [autosave_spec.md §8.2](autosave_spec.md)

---

## 8. 日付・タイムゾーン系

### 8.1 月境界・年末・うるう年の日付移動

> **ケース:** 1/31 → 翌日、12/31 → 翌日、2/28 → 翌日（うるう年/平年）
> **期待される挙動:**
> - `addDays` ユーティリティが正しく計算（2/29はうるう年のみ）
> - Unitテストで全パターン検証（[test_strategy.md §3.2](test_strategy.md)）
> **根拠:** [database_schema.md §8](database_schema.md)

### 8.2 深夜0時をまたいでの「今日」

> **ケース:** 23:59にアプリ起動、00:01に「今日」へ移動
> **期待される挙動:**
> - ローカル日付で計算（[database_schema.md §8](database_schema.md)）
> - 00:01の「今日」は前日と異なる日付になる
> - `GET /api/day-notes/today/full` で改めて当日を取得
> **根拠:** [database_schema.md §8](database_schema.md)

### 8.3 過去日付のノート編集

> **ケース:** 過去の日付のノートを開いて編集する
> **期待される挙動:**
> - 編集可能（要件 7.1「過去の日付のノートも閲覧・編集できる」）
> - 自動保存も通常どおり動作
> - 持ち越し操作は「翌日」が未来または当日になるため、通常どおり機能（例: 7/8のノートから7/9へ持ち越し）
> **根拠:** 要件 7.1

---

## 9. モード切替・入力系

### 9.1 モード切替直後のフォーカス

> **ケース:** work → note 切替直後、CodeMirrorのフォーカス状態
> **期待される挙動:**
> - ノートモードのCodeMirrorにフォーカス（[ui_interaction_spec.md §4.1](ui_interaction_spec.md)）
> - Vim時は `vimState=UserSettings.vimDefaultState`（既定`normal`、[要件 8.6](dayborad_requirements.md)）
> - note → work の戻りでは前回の `workFocus` を復元（[ui_interaction_spec.md §4.1](ui_interaction_spec.md)）
> **根拠:** [ui_interaction_spec.md §4.1](ui_interaction_spec.md)

### 9.2 変換ハイライト中に別の操作

> **ケース:** ノートモードから戻り、TODOが1.2sハイライト中に完了操作をする
> **期待される挙動:**
> - ハイライトは完了操作を妨げない
> - 完了操作は通常どおり即時保存（[autosave_spec.md §2.2](autosave_spec.md)）
> - ハイライトは1.2sで自然に消失（または完了して `done` 表示に切り替わる）
> **根拠:** [ui_interaction_spec.md §4.3](ui_interaction_spec.md)

### 9.3 Vim Insert中にモード切替ショートカット（`⌘/Ctrl+J`）

> **ケース:** Vimキーバインド・Insert状態で `⌘/Ctrl+J`
> **期待される挙動:**
> - `⌘/Ctrl+J` はVim状態によらず有効（要件 8.6「Vimキーバインドでも有効」、AC-15 AC-7）
> - モード切替実行（[ui_interaction_spec.md §4.1](ui_interaction_spec.md)）
> - ただし `Esc` は異なる: Insert状態なら Normal状態へ戻るのみ（モード戻りしない、AC-17）
> **根拠:** 要件 8.6, AC-17

### 9.4 Vimの `Space` リーダーキー後、200ms経過

> **ケース:** Vim Normal状態で `Space` を押した後、200ms以内に次キーを押さない
> **期待される挙動:**
> - リーダー待ち状態をキャンセル（[ui_interaction_spec.md §3.5](ui_interaction_spec.md)）
> - 何も実行しない（`Space` 単独はMVPではコマンド割り当てなし）
> **根拠:** [ui_interaction_spec.md §3.5](ui_interaction_spec.md)

### 9.5 設定モーダル表示中のショートカット

> **ケース:** 設定モーダルが開いている状態で `⌘/Ctrl+J` 等を押す
> **期待される挙動:**
> - モーダル表示中は背後のショートカットを無効化（モーダルがイベントを食う）
> - `Esc` のみ有効: モーダルを閉じる（[ui_interaction_spec.md §9.2](ui_interaction_spec.md) 優先順位3）
> **根拠:** [ui_interaction_spec.md §8/§9.2](ui_interaction_spec.md)

---

## 10. データ整合性系

### 10.1 DayNote削除時のcascade

> **ケース:** 何らかの理由で DayNote を削除する（MVPではUI未提供だが、管理操作やDB直接操作で起こりうる）
> **期待される挙動:**
> - `ON DELETE CASCADE` で todo_items, blocker_items, reflections, note_entries が連鎖削除（[database_schema.md §3](database_schema.md)）
> - note_entries 削除 → note_line_metas もcascade
> - ※ MVP UIではDayNote削除導線を提供しない（1日1ノート不可逆は危険）。これは異常時のDB振る舞いの定義
> **根拠:** [database_schema.md §3](database_schema.md)

### 10.2 linkedTodoId の参照先TODOが別日付

> **ケース:** Blockerの `linkedTodoId` に別日付のTODOを指定して `POST /blockers`
> **期待される挙動:**
> - `VALIDATION_ERROR`（[api_contract.md §6](api_contract.md): 当該日付のTODOであることを検証）
> - Blocker作成されない
> **根拠:** [api_contract.md §6](api_contract.md)

### 10.3 変換時のトランザクション失敗

> **ケース:** 変換エンドポイントで TodoItem 作成後に NoteLineMeta 作成が失敗
> **期待される挙動:**
> - 1トランザクションで両者を作成（[api_contract.md §9](api_contract.md)）するため、ロールバック
> - 片方だけ残る状態にはならない
> - クライアントには 500 `INTERNAL_ERROR`
> - リトライで再実行可能（[autosave_spec.md §7](autosave_spec.md)）
> **根拠:** [api_contract.md §9](api_contract.md)

### 10.4 並替リクエストの過不足

> **ケース:** `POST /todos/reorder` の `orderedIds` が当日の全TODOでない（一部欠損・余剰）
> **期待される挙動:**
> - `VALIDATION_ERROR`（[api_contract.md §5](api_contract.md)）
> - `details.fields` に「TODOの過不足があります。」
> - 並替実行されない（`order` 変更なし）
> **根拠:** [api_contract.md §5](api_contract.md)

### 10.5 存在しない日付・IDへのアクセス

> **ケース:** 存在しない `:date` や `:id` へ PATCH/DELETE
> **期待される挙動:**
> - 404 `NOT_FOUND`（[api_contract.md §8](api_contract.md)）
> - ただし `GET /api/day-notes/:date/full` は例外: 存在しない日付を自動生成（AC-01）
> **根拠:** [api_contract.md §3/§8](api_contract.md)

---

## 11. エッジケースとテストの対応

[test_strategy.md](test_strategy.md) のテストケースへの対応をまとめる。

| エッジケース節 | テスト層 | 該当テスト節 |
|----------------|----------|--------------|
| §1 削除系 | Integration | [test_strategy.md §4.2](test_strategy.md) ON DELETE SET NULL / cascade |
| §2 編集系 | Unit + Integration | [§3.4](test_strategy.md) 状態遷移、[§4.2](test_strategy.md) VALIDATION_ERROR |
| §3 持ち越し後再編集 | Unit + Integration | [§3.3/§3.4](test_strategy.md) |
| §4 同名・重複 | Unit + Integration | [§3.3/§3.5/§4.2](test_strategy.md) |
| §5 空行変換 | Unit | [§3.5](test_strategy.md) `extractTitle` 境界値（重点） |
| §6 巨大ノート | Integration + E2E | [§4.2](test_strategy.md) 本文上限、[§6.4](test_strategy.md) CodeMirror |
| §7 保存失敗復旧 | Unit + E2E | [§3.7](test_strategy.md) 自動保存FSM、[§5.2 4.1](test_strategy.md) リカバリ |
| §8 日付系 | Unit | [§3.2](test_strategy.md) 日付計算 |
| §9 モード切替 | E2E | [§5.2 4.2/4.4](test_strategy.md) |
| §10 データ整合性 | Integration | [§4.2](test_strategy.md) |

---

## 12. スコープ外の明示（要件 5.2 準拠）

本書が扱うのはMVP範囲内のエッジケースのみ。以下は対象外とする。

- 複数端末・複数ユーザー間の競合（[architecture.md C7](architecture.md) 単一ユーザー前提）
- 認証・権限（要件 5.2 スコープ外）
- 検索時のインデックス振る舞い（要件 16 Post-MVP）
- AI要約・自動分類（要件 5.2 スコープ外）
- カレンダー連携・外部同期（要件 5.2 スコープ外）
- モバイル・タブレット固有の挙動（要件 5.2 スコープ外）

これらが将来追加される場合は、本書とは別のエッジケース定義を設ける。

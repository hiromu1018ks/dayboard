# dayborad リリースチェックリスト

本書は MVP の限定配布に向けた準備手順と、受け入れ条件（AC-01〜AC-22）の最終確認手順をまとめる。Phase 8（[roadmap.md T-8-04 / T-8-07]）の成果物であり、[要件定義書 4.3 成功指標](dayborad_requirements.md) の測定準備を含む。

- 関連: [要件定義書 4.3](dayborad_requirements.md) / [test_strategy.md §8](test_strategy.md) / [dev_setup.md §4.2](dev_setup.md) / [architecture.md §2.2](architecture.md)

---

## 1. 配布用バイナリのビルド

### 1.1 前提

- Node.js 20 以上、pnpm 9 以上（[dev_setup.md §1](dev_setup.md)）
- リポジトリが `pnpm install` 済み
- 配布対象プラットフォームでのビルドを推奨（クロスコンパイルは electron-builder の制約による）

### 1.2 ビルド手順

```bash
# リポジトリルートで
pnpm install --frozen-lockfile

# 配布用バイナリを生成（apps/desktop/dist-electron/ へ出力）
pnpm package
```

`pnpm package` は `electron-vite build && electron-builder` を実行し、以下を生成する:

- macOS: `apps/desktop/dist-electron/dayborad-<version>-arm64.dmg`, `dayborad-<version>.dmg` (x64)
- Windows: `apps/desktop/dist-electron/dayborad-setup-<version>.exe` (NSIS)
- Linux: `apps/desktop/dist-electron/dayborad-<version>.AppImage`

### 1.3 パッケージ内容

- Electron 本体 + Renderer（React + CodeMirror）のプロダクションビルド
- `packages/repository/migrations`（`Resources/migrations` へ同梱、初回起動時に自動適用）
- `pg`（pure-JS PostgreSQL クライアント。ネイティブバインディングなし）

### 1.4 PostgreSQL 同梱の方針（[architecture.md §2.2](architecture.md)）

**PostgreSQL サーバープロセスはバイナリに同梱しない。** バイナリサイズと起動処理の複雑さを避けるため、ユーザー環境の PostgreSQL への接続を前提とする。リポジトリIFで抽象化しているため、将来 SQLite 差し替えも可能な構造。

---

## 2. ユーザー環境のセットアップ手順

限定配布先のユーザーが行う手順。

### 2.1 PostgreSQL の準備

1. PostgreSQL 15 以上をインストール（[dev_setup.md §1](dev_setup.md)）
   - macOS: `brew install postgresql@15 && brew services start postgresql@15`
   - Windows: [PostgreSQL公式](https://www.postgresql.org/download/) からインストール
2. dayborad 用データベースを作成
   ```bash
   createdb dayborad
   ```
3. `DATABASE_URL` 環境変数を設定
   - 例: `postgres://localhost:5432/dayborad`
   - macOS/Linux: `export DATABASE_URL="postgres://localhost:5432/dayborad"`
   - Windows: システム環境変数、または起動時に設定

> **マイグレーションは初回起動時に自動適用される。** ユーザーが手動で `db:migrate` を行う必要はない（main プロセスが `app.isPackaged` 時に `Resources/migrations` から実行）。

### 2.2 アプリの起動

1. 配布されたバイナリ（dmg/exe/AppImage）をインストール・起動
2. `DATABASE_URL` が正しく設定されていれば、初回起動でスキーマが作成され、当日の DayNote が表示される
3. `DATABASE_URL` 未設定・PostgreSQL 未起動の場合は「起動エラー」ダイアログで `DATABASE_URL` の設定を促す

### 2.3 トラブルシューティング

- **「起動エラー」ダイアログが出る**: PostgreSQL が起動しているか、`DATABASE_URL` が正しいか確認
- **macOS で「開発元を確認できない」警告**: コード署名なしのバイナリのため。右クリック→「開く」で許可、または `xattr -d com.apple.quarantine /Applications/dayborad.app`
- **ポートが占有されている**: main プロセスは動的ポートで Hono を起動するため、ポート衝突は通常発生しない

---

## 3. AC-01〜AC-22 最終チェックリスト

限定配布前に各受け入れ条件（[要件 15](dayborad_requirements.md)）を確認する手順。自動テスト（Unit/Integration/E2E）で担保されているものは◎、手動確認が必要なものは〇で示す。

| AC | 内容 | 確認方法 | 確認状態 |
|----|------|----------|----------|
| AC-01 | 当日DayNote自動生成 | Integration テスト（dayNotes.integration.test.ts）+ 起動して当日表示 | ◎ |
| AC-02 | 入力内容の永続化 | E2E（autosave.spec.ts）+ 起動→入力→再起動→同一内容 | ◎ |
| AC-03 | `⌘/Ctrl+J` でノートモード | E2E（modeSwitch.spec.ts） | ◎ |
| AC-04 | `Esc`/`⌘J` で戻る・入力保持 | E2E（modeSwitch.spec.ts） | ◎ |
| AC-05 | 選択行TODO化・ノート留まる | Integration（convert.integration.test.ts）+ E2E（convert.spec.ts） | ◎ |
| AC-06 | 重複TODO化で確認 | Integration（convert.integration.test.ts）+ E2E（convert.spec.ts） | ◎ |
| AC-07 | 選択行障害化 | Integration（convert.integration.test.ts）+ E2E（convert.spec.ts） | ◎ |
| AC-08 | 発生元スナップショット | Integration（convert.integration.test.ts） | ◎ |
| AC-09 | TODO完了切替 | Unit（transitions.test.ts）+ Integration（todos.integration.test.ts） | ◎ |
| AC-10 | 前日/翌日/今日移動 | Unit（date.test.ts）+ Integration（dayNotes.integration.test.ts）+ E2E（dateNavigation.spec.ts） | ◎ |
| AC-11 | 未完了TODO持ち越し | Unit（carryOver.test.ts）+ Integration（carryOver.integration.test.ts）+ E2E（carryOver.spec.ts） | ◎ |
| AC-12 | 重複持ち越し防止 | Unit（carryOver.test.ts）+ Integration（carryOver.integration.test.ts） | ◎ |
| AC-13 | 保存状態 `saving → saved` | Unit（saveStateMachine/debounce.test.ts）+ E2E（autosave.spec.ts） | ◎ |
| AC-14 | 保存失敗で `error` | Unit（retry.test.ts）+ Integration | ◎ |
| AC-15 | キーバインド設定の永続化 | Integration（settings.integration.test.ts）+ E2E（settings.spec.ts） | ◎ |
| AC-16 | Vim `i` で Insert | Unit（escPriority.test.ts）+ E2E（vim.spec.ts） | ◎ |
| AC-17 | Vim Insert `Esc` で Normal | Unit（escPriority.test.ts）+ E2E（vim.spec.ts） | ◎ |
| AC-18 | Vim Normal `Esc` でモード戻り | Unit（escPriority.test.ts）+ E2E（vim.spec.ts） | ◎ |
| AC-19 | IME変換中 `Esc` の優先順位 | Unit（guardIme 経由）+ E2E（ime.spec.ts） | ◎ |
| AC-20 | Vim `h/j/k/l` 移動 | Unit（focus.test.ts）+ E2E（vim.spec.ts） | ◎ |
| AC-21 | 単一ユーザー・PostgreSQL保存 | Integration（全系）+ 認証なしでCRUD動作 | ◎ |
| AC-22 | Post-MVPショートカットは不発 | Unit（postMvp 経由）+ E2E（postMvpShortcuts.spec.ts） | ◎ |

### 3.1 手動確認手順（配布バイナリで実施）

各ACをアプリ上で実際に操作して確認する最低限の手順。

1. **起動**: アプリを起動し、当日の仕事整理モードが表示される（AC-01）
2. **テーマ入力**: 今日のテーマに入力→「保存中...」が一瞬出て消える（保存完了）→再起動で維持（AC-02, AC-13）
3. **TODO操作**: TODO追加→完了切替（取り消し線）→再度未完了（AC-09）
4. **モード切替**: `⌘/Ctrl+J` でノートモード→本文入力→`Esc` で戻る→本文保持（AC-03, AC-04）
5. **TODO化**: ノートモードで行入力→`⌘/Ctrl+Enter` でTODO化→通知→仕事整理モードで確認（AC-05）
6. **日付移動**: 「›」で翌日→空のDayNote自動生成→「‹」で戻る（AC-10）
7. **持ち越し**: TODO追加→「未完了を翌日へ持ち越し」→翌日で確認（AC-11）
8. **Vim切替**: 歯車→Vim→`i`/`Esc`/`h/j/k/l` 動作確認（AC-15〜AC-20）
9. **Post-MVP**: `⌘/Ctrl+K` 等を押しても入力が壊れない（AC-22）

---

## 4. パフォーマンス確認手順（[要件 12.1](dayborad_requirements.md)、T-8-04）

要件 12.1 は定性的な指標（「すぐに」「体感で即時」「引っかからない」）であり、厳密な数値閾値はない。MVPでは手動確認で合格とする。

### 4.1 起動時間

- **確認**: アプリ起動→当日の仕事整理モードが表示されるまでの体感時間
- **合格基準**: 体感で「待たされる」と感じない程度（目安: 数秒以内）
- **測定**: ストップウォッチ等で概算。自動化はPost-MVP

### 4.2 モード切替の即時性

- **確認**: `⌘/Ctrl+J` で仕事整理モード⇄ノートモードを切替
- **合格基準**: 切替が体感で即時（アニメーション遅延なし、[要件 9.2](dayborad_requirements.md)）
- **測定**: 目視。遅延があればE2E（modeSwitch.spec.ts）のタイムアウト（10s）に引っかかるため、自動テストでも担保

### 4.3 入力中の保存で引っかからないこと

- **確認**: テーマ・TODO本文・ノート本文を連続入力し、800msデバウンス保存が発火しても入力が卡らない
- **合格基準**: 入力中にラグ・引っかかりを感じない（[要件 12.1](dayborad_requirements.md)）
- **測定**: 長文（数万文字）をノート本文へ入力し、 CodeMirror の描画と保存状態表示を観察

### 4.4 巨大ノートの性能（[edge_cases.md §6.1](edge_cases.md)）

- **確認**: ノート本文に数万文字入力しても CodeMirror が軽快に動作
- **合格基準**: 実用上の引っかかりがない
- **測定**: 50,000文字程度のテキストを貼り付け、スクロール・編集の体感を確認

---

## 5. 成功指標の測定準備（[要件 4.3](dayborad_requirements.md)）

限定配布後2週間で測定する成功指標と、その計測方法。

| 指標 | MVP目標 | 計測方法 | 判定タイミング |
|------|---------|----------|----------------|
| 初回利用後7日以内に3日以上 DayNote を作成・編集したユーザー率 | 40%以上 | ユーザー調査（アンケート）または日付別DayNote件数の集計 | 配布後2週間 |
| 1日の中で TODO・障害・振り返りのうち2領域以上を入力した日次ノート率 | 60%以上 | ユーザー調査（アンケート） | 配布後2週間 |
| ノートモードの行を TODO/障害へ変換したユーザー率 | 50%以上 | ユーザー調査（アンケート） | 配布後2週間 |
| 自動保存失敗により入力を失った報告件数 | 0件 | ユーザー報告（バグ報告フォーム） | MVP期間中 |
| モード切り替えが遅い・分かりにくいというユーザー報告率 | 20%未満 | ユーザー調査（アンケート） | ユーザーテスト後 |

### 5.1 計測の前提

- MVPでは単一ユーザー・ローカル保存のため、自動アクセス解析は実装しない
- 上記指標は**ユーザーアンケート・ヒアリング**で収集する
- 「入力喪失0件」はバグ報告フォーム（またはヒアリング）で確認

### 5.2 アンケート項目案

限定配布後にユーザーへ回答してもらう項目。

1. 7日間のうち、dayborad を開いて DayNote を作成・編集した日は何日ありましたか？
2. 1日のノートで、TODO・障害・振り返りのうち2つ以上入力したことはありましたか？
3. ノートモードの行を TODO 化・障害化する機能を使いましたか？
4. 入力内容が消えたことはありましたか？（ある場合は状況を教えてください）
5. モード切り替え（⌘J / Esc）について、遅い・分かりにくいと感じましたか？

---

## 6. 品質ゲート（[test_strategy.md §8.2](test_strategy.md)）

限定配布前に以下が全て緑であることを確認する。

| ゲート | コマンド | 備考 |
|--------|----------|------|
| Lint | `pnpm lint` | エラー0 |
| Format | `pnpm format:check` | 差分0 |
| Typecheck | `pnpm typecheck` | エラー0 |
| Unit Test | `pnpm test -- --coverage` | 全pass、domain lines 90%以上、renderer keybindings 60%以上 |
| Integration Test | `pnpm test:integration` | 全pass（PostgreSQL必要） |
| E2E Test | `pnpm test:e2e` | 推奨（CI必須でない、[test_strategy.md §5.3](test_strategy.md)） |

### 6.1 実行前の前提

- PostgreSQL 15 以上が起動済み
- `dayborad_dev`, `dayborad_test`, `dayborad_e2e` の各DBが作成済み（[dev_setup.md §10.4](dev_setup.md)）
- 各DBへマイグレーション適用済み
  ```bash
  DATABASE_URL=postgres://localhost:5432/dayborad_dev pnpm db:migrate && pnpm db:seed
  DATABASE_URL=postgres://localhost:5432/dayborad_test pnpm db:migrate
  DATABASE_URL=postgres://localhost:5432/dayborad_e2e pnpm db:migrate && DATABASE_URL=postgres://localhost:5432/dayborad_e2e pnpm db:seed
  ```

### 6.2 E2E テスト用 DB

E2E テストは開発用DB（dayborad_dev）を汚さないよう、専用の dayborad_e2e を使う（[test_strategy.md §4.1](test_strategy.md) の隔離方針）。`apps/desktop/e2e/helpers.ts` の `launchApp` が未設定時は dayborad_e2e を既定値とする。

---

## 7. 制限事項（MVP）

- **コード署名・公証なし**: 配布バイナリはコード署名されていない。macOS では Gatekeeper 警告が出るため、ユーザーが明示的に許可する必要がある。本格配布時は Apple Developer ID 等の取得が必要
- **PostgreSQL 外部依存**: ユーザー環境の PostgreSQL が必要。バンドルしていないため、セットアップ手順の案内が必須
- **自動更新なし**: Electron の autoUpdater は未対応。バージョンアップは手動再インストール
- **単一ユーザー前提**: 認証・同期なし（[要件 12.3](dayborad_requirements.md)、[architecture.md C7](architecture.md)）

---

## 8. ドキュメントとの対応

| 本書の節 | 対応ドキュメント |
|----------|------------------|
| §1 バイナリビルド | [dev_setup.md §4.2](dev_setup.md) / [architecture.md §2.2](architecture.md) |
| §2 ユーザーセットアップ | [dev_setup.md §3](dev_setup.md) |
| §3 ACチェックリスト | [要件 15](dayborad_requirements.md) / [test_strategy.md §2](test_strategy.md) |
| §4 パフォーマンス | [要件 12.1](dayborad_requirements.md) |
| §5 成功指標 | [要件 4.3](dayborad_requirements.md) |
| §6 品質ゲート | [test_strategy.md §8](test_strategy.md) |

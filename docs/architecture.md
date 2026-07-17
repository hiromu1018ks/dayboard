# dayborad アーキテクチャ設計

本書は、[要件定義書](dayborad_requirements.md) のMVP範囲を「どの実行形態・プロセス構成で実現するか」を固定する設計契約である。実装者が迷わず手を動かせることを目的とし、特に「デスクトップアプリ内ショートカット」と「Hono API」の接続形を確定する。

- 参照: [要件定義書 13. 技術構成](dayborad_requirements.md) / [12. 非機能要件](dayborad_requirements.md)
- 関連: [database_schema.md](database_schema.md) / [api_contract.md](api_contract.md) / [autosave_spec.md](autosave_spec.md)

---

## 1. 設計の前提となる制約

要件定義書から抽出した、アーキテクチャを縛る制約を列挙する。

| # | 制約 | 出典 |
|---|------|------|
| C1 | MVPはPC向け体験を優先する | 3.2, 13.2 |
| C2 | MVPでは**デスクトップアプリ内ショートカット**として実装し、OS全体のグローバルショートカットは使わない | 12.5 |
| C3 | ブラウザ版は将来実装とし、その際はブラウザ既定ショートカットとの衝突を再設計する | 12.5 |
| C4 | Hono.jsをクライアント共通の境界（API層）とする | 13.1, 13.2 |
| C5 | SQLite（libSQL）を主データストアとする | 13.1, 13.2 |
| C6 | ローカルファーストの設計が望ましく、オフラインでも利用できることが望ましい | 12.4 |
| C7 | MVPは単一ユーザー利用を前提とし、外部同期を行わない場合は認証機能は不要 | 12.3 |
| C8 | ドメインモデル・ドメイン操作をUIフレームワークから分離し、将来のWeb/モバイル展開に備える | 13.2 |
| C9 | 入力内容を失わないことを最優先とする | 12.2 |
| C10 | アプリ起動後すぐに今日のノートを表示し、モード切り替えは体感で即時、入力中に保存で引っかからない | 12.1 |

C2とC3の対比から、**MVPは「ブラウザで開くWebアプリ（ホスト型）」ではなく「デスクトップアプリ」**として実装することが確定する。

---

## 2. MVPの実行形態決定

### 2.1 決定：Electronデスクトップアプリ + ローカルHonoサーバー + ローカルSQLite

MVPは以下の実行形態とする。

```text
┌─────────────────────────────────────────────────────────┐
│                  Electron デスクトップアプリ                  │
│                                                         │
│  ┌───────────────────────┐    ┌───────────────────────┐  │
│  │   Renderer Process    │    │    Main Process       │  │
│  │  (React + Vite)       │    │                       │  │
│  │                       │    │  ┌─────────────────┐  │  │
│  │  - 仕事整理モードUI    │    │  │  Hono API Server│  │  │
│  │  - ノートモードUI      │ HTTP │  │  (localhost)    │  │  │
│  │  - CodeMirror         │◄────►│  │  /api/*        │  │  │
│  │  - Tailwind CSS       │    │  └────────┬────────┘  │  │
│  │  - ショートカット制御   │    │           │           │  │
│  └───────────────────────┘    │  ┌────────▼────────┐  │  │
│                               │  │  SQLite (libSQL)│  │  │
│                               │  │  userData 配下  │  │  │
│                               │  └─────────────────┘  │  │
│                               └───────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 この決定の根拠

**なぜデスクトップアプリか（ブラウザWebでないか）**
- C2が「デスクトップアプリ内ショートカット」を明示し、C3がブラウザ版を将来扱いとしているため。
- デスクトップアプリのwebview内であれば、`Cmd/Ctrl+J` `Cmd/Ctrl+T` `Alt+←` などのショートカットをOSブラウザの挙動と衝突させずにアプリ専用として扱える（C2）。

**なぜElectronか（Tauriでないか）**
- スタックがTypeScript/Nodeで統一されており（Hono、React、DBマイグレーション）、Electronのメインプロセス上でHonoを直接起動できる。TauriではHonoを動かすために別途Node/Bunランタイムをsidecarで同梠する必要があり、構成が複雑になる。
- ショートカットの制御、ローカルプロセス管理、SQLite ファイル管理のいずれもNode層で完結する。
- バイナリサイズの大きさはMVPの検証目的では許容範囲であり、将来Tauriへの移行はAPI層とUI層を分離しておくことで可能（C8の分離方針がこれを支える）。

**React Nativeとの関係**
- React NativeはPost-MVPのモバイルクライアント候補とし、MVPのWeb/desktop UIスタック（React + Vite + CodeMirror）は変更しない。
- 将来React Nativeを追加する場合は `apps/mobile` を別クライアントとして作り、`packages/domain` / `packages/shared-types` / Hono API契約を共有する。Web UIコンポーネントをReact Native Webへ寄せて1コードベース化することはMVPでは行わない。

**なぜHonoをメインプロセスでlocalhost HTTPサーバーとして動かすか（IPCでなくHTTPか）**
- Honoを「将来のWeb/モバイルクライアント共通の境界」（C4, C8）としてそのまま再利用するため。Electron IPCに束ねると、クラウドWeb版を作る際にAPI層を再設計する必要がある。
- localhostのみバインドし（C7の単一ユーザー・認証不要前提）、外部からのアクセスを遮断する。
- Renderer ↔ Hono間は標準的な `fetch` で繋ぎ、UIとAPIを独立して開発・テストできる（[api_contract.md](api_contract.md) 並行実装の前提）。

**なぜローカル SQLite（libSQL）か**
- 一般配布を想定すると、利用者に PostgreSQL のインストール・セットアップを求めるのは非現実的。SQLite なら `@libsql/client` を同梱し、ユーザーは何も準備せずに起動できる。
- ローカルファースト・オフライン（C6）を満たすため、データは端末ローカルに置く。SQLite は単一ファイルで、OS 標準の userData ディレクトリ配下へ配置する。
- 単一ユーザー（C7）のため、1つのローカルDBファイルで完結する。
- リポジトリIFで抽象化しているため、将来クラウド同期・複数端末運用に拡張する際は libSQL の埋め込みレプリカ機能や PostgreSQL 等への差し替えが可能。

---

## 3. プロセス構成と責務分担

### 3.1 Main Process（Electronメインプロセス / Node層）

| 責務 | 内容 |
|------|------|
| Hono APIサーバー起動 | アプリ起動時にHonoをlocalhostの空きポート（または固定ポート）で起動し、RendererにそのURLを渡す |
| SQLite 接続・マイグレーション | userData 配下の `dayborad.db` パス解決・`@libsql/client` 接続確認・マイグレーション実行 |
| ライフサイクル管理 | アプリ終了時にHono・DB接続を安全に閉じる |
| ウィンドウ管理 | ブラウザウィンドウの生成・サイズ記憶・フルスクリーン相当の広い表示 |

メインプロセスは**ドメインロジックを持たない**。ドメインロジックはHono API層（および共有ドメインモジュール）に置く。

### 3.2 Renderer Process（React / UI層）

| 責務 | 内容 |
|------|------|
| 画面描画 | 仕事整理モード・ノートモード・設定画面の描画 |
| UI状態管理 | 表示モード（`work`/`note`）、フォーカス、Vim操作状態（`normal`/`insert`）、保存状態 |
| ショートカット制御 | アプリスコープのキーハンドリング（[ui_interaction_spec.md](ui_interaction_spec.md) 参照） |
| 自動保存制御 | デバウンス・リトライ・保存状態遷移（[autosave_spec.md](autosave_spec.md) 参照） |
| CodeMirror統合 | ノート本文編集・Vimキーバインド（標準キーバインド時の本文編集も含む） |

Rendererは**永続化の直接操作を行わない**。すべてHono API経由とする。

### 3.3 Hono API層（ドメイン＋データ境界）

| 責務 | 内容 |
|------|------|
| HTTPエンドポイント | [api_contract.md](api_contract.md) に定義するCRUD・変換・持ち越しエンドポイント |
| ドメインロジック | TODO状態遷移、ノート→TODO/障害変換の正規化、重複判定、持ち越し生成 |
| バリデーション | リクエスト検証・エラー形式の統一 |
| 永続化 | リポジトリ経由で SQLite（libSQL）へ読み書き |
| 共有境界 | 将来のWebクライアント・React Nativeクライアントが同じエンドポイント・スキーマを利用する前提（C4, C8） |

---

## 4. レイヤー構成と依存の方向

依存は常に一方向（UI → API → ドメイン → リポジトリ → DB）とする。

```text
┌──────────────────────────────────────────────┐
│  UI Layer (Renderer / React)                 │
│  components / hooks / keybindings / autosave │
└──────────────────┬───────────────────────────┘
                   │ fetch (HTTP, localhost)
┌──────────────────▼───────────────────────────┐
│  API Layer (Hono)                            │
│  routes / validators / error-handler         │
└──────────────────┬───────────────────────────┘
                   │ 関数呼び出し
┌──────────────────▼───────────────────────────┐
│  Domain Layer (pure TS, framework非依存)      │
│  entities / usecases / conversion / carryover│
└──────────────────┬───────────────────────────┘
                   │ interface
┌──────────────────▼───────────────────────────┐
│  Repository Layer (interface + libsql impl)  │
│  DayNoteRepository / TodoRepository / ...    │
└──────────────────┬───────────────────────────┘
                   │ SQL
┌──────────────────▼───────────────────────────┐
│  SQLite (libSQL)                             │
└──────────────────────────────────────────────┘
```

**重要:** ドメイン層とリポジトリインターフェースはHonoにもReactにも依存しないピュアTypeScriptとする（C8）。これにより、将来React Native側でドメイン検証を再利用したり、リポジトリ実装を差し替えたりできる。

---

## 5. ディレクトリ構成案

モノレポ構成とし、パッケージ境界でレイヤーを分ける。

```text
dayborad/
├── packages/
│   ├── domain/             # ピュアTS。エンティティ・ユースケース・変換・持ち越し
│   ├── shared-types/       # APIリクエスト/レスポンス型（UI/API両方から参照）
│   └── repository/         # リポジトリinterface + SQLite(libSQL)実装 + migration
├── apps/
│   ├── api/                # Honoサーバー（domain, repository, shared-typesに依存）
│   └── desktop/            # Electronアプリ
│       ├── main/           # メインプロセス（Hono起動・DB起動・ウィンドウ管理）
│       └── renderer/       # Reactアプリ（Vite・Tailwind・CodeMirror）
├── docs/
└── package.json            # ワークスペースルート
```

---

## 6. 主要処理フロー

### 6.1 アプリ起動フロー

```text
1. Electron main 起動
2. SQLite ファイルパス解決（userData/dayborad.db）・接続確認
3. マイグレーション実行（最新でなければ適用）
4. Hono API サーバーを localhost で起動（ポート決定）
5. BrowserWindow 生成、Renderer に API のベースURLを注入
6. Renderer が GET /api/day-notes/today/full を呼び出し、当日DayNoteを取得/自動生成
7. 仕事整理モードで当日ノートを表示
```

AC-01（当日DayNoteが存在しない場合の自動生成）はステップ6のAPI側で担保する。

### 6.2 モード切り替えフロー（要件 7.7 / US-MVP-008）

```text
1. Renderer が Cmd/Ctrl+J を捕捉（IME変換中は無視、後述）
2. 表示モード state を work ⇄ note に切替
3. 保留中の自動保存デバウンスを即時フラッシュ（autosave_spec.md の即時保存トリガ）
4. モードに応じたビューを描画（切替は体感即時、C10）
5. note → work に戻った際、変換済み項目があれば短時間ハイライト
```

モード切り替えはRendererローカル状態で完結し、ネットワークを待たない（C10の即時性）。

### 6.3 ノート行→TODO変換フロー（要件 7.8 / US-MVP-009）

```text
1. CodeMirror上で選択行を取得（行番号・行テキスト）
2. Renderer が POST /api/day-notes/:date/convert/todo を呼ぶ
   body: { noteEntryId, lineNumber, lineText }
3. API側で正規化・lineHash生成・重複判定（note_conversion_spec.md）
4. 重複時: 409 で既存候補を返却 → Renderer が確認ダイアログ表示
5. 新規作成時: TodoItem と NoteLineMeta を生成して保存
6. レスポンスを受け取り、該当行に変換済みマークを付与（ノートモードに留まる）
```

---

## 7. 通信とアドレス構成

| 項目 | 値 |
|------|-----|
| プロトコル | HTTP（localhostのみ。TLSはMVP対象外、C7のローカル前提） |
| バインド | `127.0.0.1` のみ（`0.0.0.0`にはバインドしない） |
| ポート | 起動時に空きポートを取得し、Rendererへ環境変数経由で注入。固定ポートは衝突リスクがあるため避ける |
| APIプレフィックス | `/api` |
| 認証 | なし（C7）。将来のホスト型Web版では認証層を追加する設計余地を残す |
| CORS | Rendererの実際のOriginをallowlist化する。開発時はVite dev serverの実Origin（例: `http://localhost:5173` / `http://127.0.0.1:5173`）を設定から明示許可し、パッケージ版はカスタムプロトコル `app://dayborad` の固定Originのみ許可する。`Origin: null` は許可しない |

> **CORS契約:** パッケージ版Rendererから `fetch` するPATCH/POSTはプリフライトを伴うため、Hono側のCORS設定は「localhost Originのみ」ではなく、BrowserWindowで読み込む固定Originを必ず許可する。MVPの本番パッケージは `protocol.registerSchemesAsPrivileged` 等で標準・secureな `app://dayborad` を登録し、RendererをそのOriginで読み込む。`file://` や `data:` 由来の不透明Origin（`Origin: null`）は、サンドボックスiframe等からも発生し得るため許可しない。別案としてRenderer自体を同じlocalhost Originで配信する場合は、そのOriginを固定して許可する。

---

## 8. 自動保存とデータ保証

本節は概要のみ。詳細は [autosave_spec.md](autosave_spec.md) に委ねる。

- 編集ごとにデバウンス（推奨800ms）し、変更単位でPATCHを投げる（[api_contract.md](api_contract.md) の保存単位）。
- モード切替・日付移動・アプリ終了時は保留中のデバウンスを即時フラッシュしてから遷移する（C9, US-MVP-011 AC-5）。
- 保存状態（`idle`/`saving`/`saved`/`error`）をUI右下に表示し、失敗時はリトライする。

---

## 9. ショートカットの所属と優先制御（概要）

詳細は [ui_interaction_spec.md](ui_interaction_spec.md) に委ねる。アーキテクチャ上の要点のみ記す。

- すべてのショートカットは**Rendererのwebviewスコープ**で扱い、OSグローバルフックは使わない（C2）。
- IME変換中の入力はショートカット判定前に除外する（要件 9.3, AC-19）。
- Vimキーバインド時は、CodeMirrorのVim拡張とアプリレイヤの `Space` 系コマンドを協調させる。`h/j/k/l` の優先ルール（テキストカーソル移動 vs 列・項目移動）は ui_interaction_spec.md で固定する。

---

## 10. 将来拡張への接続（Post-MVP）

本構成は以下の拡張を前提としつつ、MVPでは実装しない（要件 5.2 / 16 参照）。

| 拡張 | 本構成が残す余地 |
|------|------------------|
| ホスト型Web版 | Hono APIとshared-typesをそのままクラウドに載せ替え可能。認証層をAPI前面に追加するだけでよい |
| モバイル（React Native） | `apps/mobile` を別クライアントとして追加し、shared-typesとAPI契約を再利用。ドメイン層（packages/domain）をRN側から直接参照可能 |
| 同期・バックアップ | リポジトリインターフェースの奥に同期層を挟める構造 |
| コマンドパレット | UI層の機能追加で完結、API変更不要 |

---

## 11. 決定の要約

| 決定事項 | 採用 | 却下理由 |
|----------|------|----------|
| 実行形態 | Electronデスクトップアプリ | C2/C3がデスクトップアプリを指定 |
| フロントエンド | React + Vite + Tailwind + CodeMirror（Renderer） | 13.1のスタック準拠 |
| API接続形 | localhost HTTP（Honoをメインプロセスで起動） | Honoを将来の共通境界として再利用（C4/C8）。IPC束縛を避ける |
| データストア | ローカル SQLite / libSQL（リポジトリ経由） | C5。配布時に利用者セットアップが不要。リポジトリIFで差し替え可能性を保持 |
| プロセス分離 | Main=Hono+DB起動 / Renderer=UI | Nodeスタック統一とドメイン分離の両立 |
| 認証 | なし（localhost限定・単一ユーザー） | C7 |

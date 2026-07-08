# dayborad 開発環境セットアップ

本書は、dayborad MVPをローカルで開発・実行・テストするための手順を整備する設計契約である。[implementation_plan.md](implementation_plan.md) の各フェーズを始める前に、本書の環境が整っていることを前提とする。

- 関連: [architecture.md](architecture.md) / [database_schema.md §7 migration方針](database_schema.md)
- 前提スタック: Node.js, TypeScript, React, Hono, PostgreSQL, Tailwind CSS, CodeMirror, Electron（[要件定義書 13.1](dayborad_requirements.md)）

> **注記:** 本書は環境構築の **要件・指針** を固定するものであり、各コマンドの実装詳細（package.json scripts の正確な名前等）は [implementation_plan.md](implementation_plan.md) のフェーズ1で整備する。本書の内容は実装開始時の仕様となる。

---

## 1. 前提ソフトウェア

開発者のマシンにインストールが必要なもの。

| ソフトウェア | 必須バージョン | 用途 | イストール方法（例） |
|--------------|----------------|------|----------------------|
| Node.js | **20 LTS 以上** | TypeScript実行・ビルド | [nodejs.org](https://nodejs.org/) または `fnm`/`volta` |
| pnpm | **9 以上** | パッケージ管理（モノレポ） | `npm install -g pnpm` |
| PostgreSQL | **15 以上** | ローカルデータストア（[architecture.md C5](architecture.md)） | Homebrew `brew install postgresql@15` 等 |
| Git | 2.30 以上 | バージョン管理 | （既存） |

Electronは開発依存に含まれるため個別インストール不要。React NativeはPost-MVPで `apps/mobile` として追加する候補であり、MVPのWeb/desktop側スタックはReact + Viteのまま進める（[architecture.md](architecture.md)）。

### 1.1 Nodeバージョンの固定

リポジトリルートに以下を置き、チーム間のバージョン不一致を防ぐ。

- `.nvmrc`: `20`
- `package.json` の `engines`: `{ "node": ">=20", "pnpm": ">=9" }`

---

## 2. リポジトリ構成（モノレポ）

[architecture.md §5](architecture.md) に基づく pnpm workspace 構成。

```text
dayborad/
├── package.json              # ワークスペースルート
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .nvmrc
├── .env.example              # 環境変数テンプレート（.env は gitignore）
├── packages/
│   ├── domain/               # ピュアTS。エンティティ・ユースケース
│   ├── shared-types/         # APIリクエスト/レスポンス型
│   └── repository/           # リポジトリIF + PostgreSQL実装 + migration
├── apps/
│   ├── api/                  # Honoサーバー
│   └── desktop/              # Electronアプリ
│       ├── main/             # メインプロセス
│       └── renderer/         # React + Vite
├── docs/                     # 本書含む設計ドキュメント群
└── ...
```

`pnpm-workspace.yaml` の内容（実装時）:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
  - 'apps/desktop/main'
  - 'apps/desktop/renderer'
```

---

## 3. 初回セットアップ手順

新規開発者がリポジトリを clone してからアプリを起動するまでの手順。

### 3.1 依存関係インストール

```bash
# リポジトリクローン
git clone <repo-url> dayborad
cd dayborad

# Nodeバージョン切替（fnm の例）
fnm use

# パッケージインストール（モノレポ全体）
pnpm install
```

`pnpm install` はワークスペース全体の依存を解決し、Electronバイナリのダウンロードも行う（初回は数分かかる）。

### 3.2 PostgreSQL準備

#### 3.2.1 ローカルPostgreSQL起動

```bash
# Homebrew の例（macOS）
brew services start postgresql@15

# DB作成（開発用）
createdb dayborad_dev
```

既にPostgreSQLが動いている環境では、新規データベース作成のみでよい。

#### 3.2.2 接続情報の設定

`.env.example` を `.env` にコピーし、ローカル環境に合わせて編集。

```bash
cp .env.example .env
```

`.env.example`（実装時に整備）:

```env
# PostgreSQL
DATABASE_URL=postgres://localhost:5432/dayborad_dev

# Hono API（Electron mainが起動時に動的ポートを割り当てるため、
# 開発時の単独起動でのみ使用）
API_PORT=8787
API_HOST=127.0.0.1

# Renderer (Vite) 開発サーバー
VITE_DEV_SERVER_PORT=5173
VITE_API_BASE_URL=http://127.0.0.1:8787/api
```

> **本番（パッケージング後）:** `API_PORT` はElectron mainが起動時に空きポートを取得して決定する（[architecture.md §7](architecture.md)）。`.env` の値は **開発時のHono/Vite単独起動** でのみ使う。

### 3.3 マイグレーション実行

[database_schema.md §7](database_schema.md) の初期マイグレーション `0001_init.sql` を適用。

```bash
# マイグレーション実行（開発用）
pnpm db:migrate

# 初期データ（user_settings デフォルト行）のシード
pnpm db:seed
```

### 3.4 アプリ起動

開発時は2通りの起動方法がある。

#### 3.4.1 Electronアプリとして起動（推奨・統合確認用）

メインプロセスがHonoを起動し、PostgreSQLへ接続し、Rendererをウィンドウで開くまでを一気に行う。

```bash
pnpm dev
```

- Electron main が Hono を内部起動（動的ポート）
- Renderer（Vite）を development モードで Electron ウィンドウに読み込み
- ホットリロード有効

#### 3.4.2 分離起動（APIとUIを別々に、デバッグ用）

UIとAPIを独立して開発・デバッグする際に使う。

```bash
# ターミナル1: Hono API 単独起動
pnpm dev:api
# → http://127.0.0.1:8787/api

# ターミナル2: Renderer (Vite) 単独起動
pnpm dev:renderer
# → http://localhost:5173 （ブラウザで開いて確認可能）
```

ブラウザでの動作確認は **MVP動作確認の補助** であり、ショートカットキー等の最終確認は必ずElectronアプリ上で行う（[architecture.md C2](architecture.md): デスクトップアプリ内ショートカットが要件のため）。

---

## 4. よく使うコマンド（package.json scripts 指針）

実装時に以下の scripts をルート `package.json` に定義する。本書は命名と役割を固定する。

### 4.1 開発

| コマンド | 役割 |
|----------|------|
| `pnpm dev` | Electronアプリ全体を起動（Hono+DB+Renderer統合） |
| `pnpm dev:api` | Hono APIのみ単独起動（[§3.4.2](#342-分離起動apiとuiを別々にデバッグ用)） |
| `pnpm dev:renderer` | Renderer (Vite) のみ単独起動 |

### 4.2 ビルド・パッケージング

| コマンド | 役割 |
|----------|------|
| `pnpm build` | 全パッケージ・アプリのビルド |
| `pnpm build:api` | Hono API のビルド |
| `pnpm build:renderer` | Renderer のプロダクションビルド |
| `pnpm package` | Electronアプリの配布用パッケージ作成（electron-builder 等） |

### 4.3 データベース

| コマンド | 役割 |
|----------|------|
| `pnpm db:migrate` | マイグレーションを最新まで適用（[§3.3](#33-マイグレーション実行)） |
| `pnpm db:rollback` | 直近のマイグレーションを1つ戻す（開発用、本番非推奨） |
| `pnpm db:seed` | 初期データ（user_settings デフォルト行）を登録 |
| `pnpm db:reset` | DBを DROP & recreate & migrate & seed（開発用、データ全消去） |
| `pnpm db:studio` | （任意）Drizzle Studio 等でDBをGUI確認 |

### 4.4 品質保証

| コマンド | 役割 |
|----------|------|
| `pnpm lint` | 全パッケージのESLint実行 |
| `pnpm typecheck` | 全パッケージの `tsc --noEmit` |
| `pnpm test` | 全パッケージのユニットテスト実行 |
| `pnpm test:watch` | watchモード |
| `pnpm test:integration` | 結合テスト（Hono + PostgreSQL） |
| `pnpm test:e2e` | E2Eテスト（Playwright、Electronアプリ対象） |
| `pnpm format` | Prettier でフォーマット |
| `pnpm format:check` | フォーマット確認（CI用） |

---

## 5. 環境変数一覧

### 5.1 開発時（`.env`）

| 変数 | 既定値 | 用途 |
|------|--------|------|
| `DATABASE_URL` | `postgres://localhost:5432/dayborad_dev` | PostgreSQL接続文字列 |
| `API_PORT` | `8787` | Hono 単独起動時のポート |
| `API_HOST` | `127.0.0.1` | Hono のバインドホスト（必ずlocalhost） |
| `VITE_DEV_SERVER_PORT` | `5173` | Vite開発サーバーのポート |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8787/api` | Renderer から見たAPIベースURL（分離起動時） |

### 5.2 実行時（Electronアプリ内部）

Electronアプリ起動時は、mainプロセスが以下を動的生成し、Rendererへ注入する。

| 変数 | 生成方法 | 用途 |
|------|----------|------|
| `API_BASE_URL` | 起動時に空きポート取得 → `http://127.0.0.1:{port}/api` | RendererがfetchするベースURL |

Renderer側は `import.meta.env.VITE_API_BASE_URL`（分離起動時）または mainから注入された `window.__API_BASE_URL__` を参照する設計とする。

---

## 6. PostgreSQL ローカル運用ノート

### 6.1 接続プール

- リポジトリ層で `pg` ライブラリの `Pool` を使用（[database_schema.md §10](database_schema.md)）
- `max: 5` 程度。単一ユーザー・単一プロセス（[architecture.md C7](architecture.md)）のため過剰不要

### 6.2 開発中のDBリセット

スキーマ変更を繰り返す開発時は `pnpm db:reset` で全消去再構築できる。**本番（ローカル実運用）データは消える** ため、実使用中のDBでは使わない。

### 6.3 バックアップ（任意）

`pg_dump` で日次バックアップを取るスクリプトを置いてもよい（要件 16「バックアップ」は Post-MVP だが、ローカル運用の安心感のため）。

```bash
pg_dump dayborad_dev > backups/$(date +%Y%m%d).sql
```

---

## 7. トラブルシューティング（想定）

### 7.1 Honoが起動しない

- ポート衝突: `lsof -i :8787` で確認。`.env` の `API_PORT` を変更
- PostgreSQL未起動: `brew services list` で `postgresql@15` が `started` か確認

### 7.2 マイグレーション失敗

- 循環FK（[database_schema.md §7.3](database_schema.md)）の作成順序ミス: マイグレーションファイルの順序を確認
- 既存テーブルとの衝突: `pnpm db:reset` で初期化後、再適用

### 7.3 Electronウィンドウが真っ白

- Rendererのビルドエラー: `pnpm dev:renderer` 単独でブラウザ表示し、コンソールエラーを確認
- API_BASE_URL の注入ミス: mainプロセスが正しく `window.__API_BASE_URL__` をセットしているか確認

### 7.4 ショートカットキーが効かない

- ブラウザで開いている（分離起動）: デスクトップアプリ内ショートカット（[architecture.md C2](architecture.md)）はElectron環境でのみ完全動作。ブラウザでは `Cmd/Ctrl+T` 等がブラウザに取られる
- IME変換中（[ui_interaction_spec.md §9](ui_interaction_spec.md)）: 日本語変換中はショートカット無効化が仕様

---

## 8. CI で必要なジョブ（参考）

[test_strategy.md](test_strategy.md) / [implementation_plan.md](implementation_plan.md) と連動。CI上で回すジョブの指針。

| ジョブ | 内容 |
|--------|------|
| `lint` | `pnpm lint` |
| `typecheck` | `pnpm typecheck` |
| `unit-test` | `pnpm test` （PostgreSQL不要、ピュアTS層中心） |
| `integration-test` | `pnpm test:integration` （PostgreSQLサービスコンテナ必要） |
| `build` | `pnpm build`（パッケージングまで通すかは別途判断） |

E2E（`pnpm test:e2e`）はElectronアプリを動かす必要があり、CI上のヘッドレス実行には追加設定が必要。MVPの初期CIでは省略し、ローカル/手動で運用してもよい。

---

## 9. ドキュメントとの対応

本書の各手順が他の設計ドキュメントのどこに基づくかを明示し、仕様変更時の追従を容易にする。

| 本書の節 | 対応ドキュメント |
|----------|------------------|
| §1 前提ソフトウェア | [要件定義書 13.1](dayborad_requirements.md) / [architecture.md §2](architecture.md) |
| §2 モノレポ構成 | [architecture.md §5](architecture.md) |
| §3.2 PostgreSQL | [architecture.md C5](architecture.md) / [database_schema.md §10](database_schema.md) |
| §3.3 マイグレーション | [database_schema.md §7](database_schema.md) |
| §3.4 起動フロー | [architecture.md §6.1](architecture.md) |
| §4.3 DBコマンド | [database_schema.md §7](database_schema.md) |
| §5 環境変数 | [architecture.md §7](architecture.md) |
| §7.4 ショートカット | [architecture.md C2](architecture.md) / [ui_interaction_spec.md §9](ui_interaction_spec.md) |

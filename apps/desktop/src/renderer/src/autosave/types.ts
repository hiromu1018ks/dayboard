/**
 * 自動保存の対象別 Saver 抽象（[roadmap.md T-2-07] 設計）
 *
 * 各保存対象（テーマ、TODO本文、ノート本文 等）のサーバー保存処理を抽象化し、
 * useAutosave が対象に依存しないようにする。
 *
 * 設計上の決定: Saver は常に `unknown` のペイロードを受け取る（ジェネリクス廃止）。
 * 理由: useAutosave が複数対象を1つの Map で管理するため、payload 型を消去（erase）
 * する必要がある。各 Saver の実装内で対象別の型へ安全にキャストする。
 *
 * Phase 2 ではテーマ（dayNote:theme）を実装。Phase 3/4 で TODO/Blocker/
 * Reflection/NoteEntry の Saver を追加する。
 *
 * [autosave_spec.md §2.1]: ../../../../../../docs/autosave_spec.md
 */

import type { SaveTarget } from '@dayboard/domain';

/**
 * 保存 API の呼び出し結果。
 * 成功時は void、失敗時は SaveErrorKind（domain/retry.ts）へ変換可能な情報を持つ。
 */
export type SaverResult =
  | { ok: true }
  | { ok: false; status: number | undefined; code: string | undefined; message: string };

/**
 * Saver の失敗結果（ok:false 側）の型。
 */
export type SaverError = Exclude<SaverResult, { ok: true }>;

/**
 * 対象別 Saver。与えられたペイロードをサーバーへ保存する副作用関数。
 *
 * ペイロードは `unknown` で受け取る。各 Saver 実装内で対象別の型へキャストする。
 * PATCH 系は冪等。POST 系は Phase 3 で idempotency ミドルウェアと組み合わせる。
 */
export type Saver = (payload: unknown) => Promise<SaverResult>;

/**
 * useAutosave へ登録する保存対象の定義。
 *
 * @param target  ドメインの SaveTarget（スナップショットのキー生成に用いる）
 * @param saver   サーバー保存関数
 */
export type AutosaveEntry = {
  target: SaveTarget;
  saver: Saver;
};

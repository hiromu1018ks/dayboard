import { describe, it, expect } from 'vitest';

/**
 * テストランナー動作確認用（Phase 0）。
 * Phase 1 以降でドメインロジックの Unit テストに置き換える。
 */
describe('sanity', () => {
  it('テストランナーが動作する', () => {
    expect(1 + 1).toBe(2);
  });
});

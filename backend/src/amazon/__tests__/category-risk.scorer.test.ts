import { describe, expect, test } from 'bun:test';
import { calculateCategoryStats, normalizeProducts } from '../category.normalizer';
import { scoreCategoryRisk } from '../scorers/category-risk.scorer';
import { products } from './fixtures/scoring-fixtures';

describe('amazon category risk scorer', () => {
  test('returns insufficient data under threshold', () => {
    const raw = products(5);
    const score = scoreCategoryRisk({ keyword: 'x', marketplace: 'de', products: normalizeProducts(raw), stats: calculateCategoryStats('x', 'de', raw) });

    expect(score.confidence).toBe('INSUFFICIENT_DATA');
  });

  test('scores crowded category signals', () => {
    const raw = products(50, { review_count: 800 });
    const score = scoreCategoryRisk({ keyword: 'x', marketplace: 'de', products: normalizeProducts(raw), stats: calculateCategoryStats('x', 'de', raw) });

    expect(score.confidence).toBe('HIGH');
    expect(score.score).toBeGreaterThan(3);
  });
});

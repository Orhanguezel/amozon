import { describe, expect, test } from 'bun:test';
import { calculateCategoryStats, normalizeProducts } from '../category.normalizer';
import { scoreOperationalRisk } from '../scorers/operational-risk.scorer';
import { products } from './fixtures/scoring-fixtures';

describe('amazon operational risk scorer', () => {
  test('uses review problem score and critical flags', () => {
    const raw = products(50);
    const score = scoreOperationalRisk({
      keyword: 'x',
      marketplace: 'de',
      products: normalizeProducts(raw),
      stats: calculateCategoryStats('x', 'de', raw),
      reviewProblemScore: 8,
      reviewProblemFlags: ['return', 'quality', 'fit'],
    });

    expect(score.confidence).toBe('HIGH');
    expect(score.score).toBeGreaterThan(6);
  });
});

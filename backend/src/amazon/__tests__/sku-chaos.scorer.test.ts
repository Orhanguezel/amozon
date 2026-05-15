import { describe, expect, test } from 'bun:test';
import { calculateCategoryStats, normalizeProducts } from '../category.normalizer';
import { scoreSkuChaos } from '../scorers/sku-chaos.scorer';
import { products } from './fixtures/scoring-fixtures';

describe('amazon sku chaos scorer', () => {
  test('scores wide price spread and many variants', () => {
    const raw = products(40).map((product, index) => ({ ...product, price: index % 2 ? 15 : 90 }));
    const score = scoreSkuChaos({ keyword: 'x', marketplace: 'de', products: normalizeProducts(raw), stats: calculateCategoryStats('x', 'de', raw) });

    expect(score.confidence).toBe('MEDIUM');
    expect(score.score).toBeGreaterThan(5);
  });
});

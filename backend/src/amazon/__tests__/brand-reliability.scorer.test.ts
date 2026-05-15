import { describe, expect, test } from 'bun:test';
import { calculateCategoryStats, normalizeProducts } from '../category.normalizer';
import { scoreBrandReliability } from '../scorers/brand-reliability.scorer';
import { products } from './fixtures/scoring-fixtures';

describe('amazon brand reliability scorer', () => {
  test('scores brand fragmentation and weak listings', () => {
    const raw = products(50).map((product, index) => ({
      ...product,
      product_title: `Brand${index} Floor Mat`,
      seller_name: index % 3 === 0 ? undefined : product.seller_name,
      rating: index % 4 === 0 ? 3.5 : product.rating,
    }));
    const score = scoreBrandReliability({ keyword: 'x', marketplace: 'de', products: normalizeProducts(raw), stats: calculateCategoryStats('x', 'de', raw) });

    expect(score.confidence).toBe('HIGH');
    expect(score.score).toBeGreaterThan(4);
  });
});

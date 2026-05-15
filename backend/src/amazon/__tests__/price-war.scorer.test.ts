import { describe, expect, test } from 'bun:test';
import { calculateCategoryStats, normalizeProducts } from '../category.normalizer';
import { scorePriceWar } from '../scorers/price-war.scorer';
import { products } from './fixtures/scoring-fixtures';

describe('amazon price war scorer', () => {
  test('excludes price war score when price data is missing', () => {
    const raw = products(40).map((product) => ({ ...product, price: undefined }));
    const score = scorePriceWar({ keyword: 'x', marketplace: 'de', products: normalizeProducts(raw), stats: calculateCategoryStats('x', 'de', raw) });

    expect(score.confidence).toBe('INSUFFICIENT_DATA');
    expect(score.reason).toContain('Fiyat verisi');
  });

  test('scores page price drop and low price cluster', () => {
    const raw = products(50);
    const score = scorePriceWar({
      keyword: 'x',
      marketplace: 'de',
      products: normalizeProducts(raw),
      stats: calculateCategoryStats('x', 'de', raw),
      pageOneAveragePrice: 80,
      pageThreeAveragePrice: 35,
    });

    expect(score.confidence).toBe('HIGH');
    expect(score.score).toBeGreaterThan(3);
  });
});

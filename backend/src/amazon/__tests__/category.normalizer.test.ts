import { describe, expect, test } from 'bun:test';
import { calculateCategoryStats, normalizeProducts } from '../category.normalizer';
import { products } from './fixtures/scoring-fixtures';

describe('amazon category normalizer', () => {
  test('calculates category price and seller statistics', () => {
    const stats = calculateCategoryStats('car mats', 'de', products(5));

    expect(stats.productCount).toBe(5);
    expect(stats.priceMin).toBe(20);
    expect(stats.priceMax).toBe(24);
    expect(stats.priceMedian).toBe(22);
    expect(stats.sellerCount).toBe(5);
    expect(stats.priceSigma).toBeGreaterThan(0);
  });

  test('normalizes products into percentile based 0-10 scores', () => {
    const normalized = normalizeProducts(products(10));

    expect(normalized).toHaveLength(10);
    expect(normalized[0]?.normalizedPriceScore).toBeGreaterThan(0);
    expect(normalized.at(-1)?.normalizedPriceScore).toBe(10);
    expect(normalized.at(-1)?.reviewPercentile).toBe(10);
  });
});

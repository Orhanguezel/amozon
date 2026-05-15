import { describe, expect, test } from 'bun:test';
import { buildPrompt } from '../llm-enrichment';
import { scoreAmazonCategory } from '../amazon.scoring-engine';
import { products } from './fixtures/scoring-fixtures';

describe('llm enrichment prompt honesty', () => {
  test('includes honesty guidance when confidence blockers exist', () => {
    const report = scoreAmazonCategory({
      keyword: 'thermal labels',
      marketplace: 'com',
      products: products(30, { seller_name: undefined }),
      keepaAsinSet: new Set(),
    });
    const prompt = buildPrompt(report);

    expect(prompt).toContain('confidence_blockers');
    expect(prompt).toContain('sınırlı veri');
    expect(prompt).toContain('tahmini');
  });

  test('does not list blocker values when coverage is clean', () => {
    const sample = products(30, { product_url: 'https://www.amazon.com/dp/B0TESTASIN' });
    const report = scoreAmazonCategory({
      keyword: 'thermal labels',
      marketplace: 'com',
      products: sample,
      keepaAsinSet: new Set(['B0TESTASIN']),
    });
    const prompt = buildPrompt(report);

    expect(prompt).toContain('Karar:');
    expect(report.data_quality.confidence_blockers).toHaveLength(0);
  });
});

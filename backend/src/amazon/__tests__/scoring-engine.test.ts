import { describe, expect, test } from 'bun:test';
import { scoreAmazonCategory } from '../amazon.scoring-engine';
import { products } from './fixtures/scoring-fixtures';

describe('amazon scoring engine', () => {
  test('creates full 5-dimensional risk report', () => {
    const report = scoreAmazonCategory({
      keyword: 'silikon paspas',
      marketplace: 'de',
      products: products(50),
      reviewProblemScore: 6,
      reviewProblemFlags: ['quality', 'return'],
    });

    expect(report.keyword).toBe('silikon paspas');
    expect(report.data_points).toBe(50);
    expect(report.scores.category_risk.confidence).toBe('HIGH');
    expect(report.composite_score).toBeNumber();
    expect(['GUVENLI', 'DIKKATLI_OL', 'GIRME', 'MIXED_SIGNAL']).toContain(report.decision);
  });

  test('includes outreach_priority between 1 and 10', () => {
    const report = scoreAmazonCategory({
      keyword: 'silikon paspas',
      marketplace: 'de',
      products: products(50),
    });

    expect(report.outreach_priority).toBeGreaterThanOrEqual(1);
    expect(report.outreach_priority).toBeLessThanOrEqual(10);
  });

  test('includes non-empty persuasion_points', () => {
    const report = scoreAmazonCategory({
      keyword: 'silikon paspas',
      marketplace: 'de',
      products: products(50),
      reviewProblemScore: 7,
    });

    expect(Array.isArray(report.persuasion_points)).toBe(true);
    expect(report.persuasion_points.length).toBeGreaterThan(0);
  });

  test('includes brand_context and enrichment defaults', () => {
    const report = scoreAmazonCategory({ keyword: 'test', marketplace: 'de', products: products(50) });

    expect(report.brand_context.brand_aggregated).toBe(false);
    expect(report.brand_context.brand_name).toBeNull();
    expect(report.enrichment).toBeNull();
  });

  test('includes data quality coverage and blockers', () => {
    const sample = products(50, {
      seller_name: undefined,
      product_url: 'https://www.amazon.com/dp/B0TESTASIN',
    });
    const report = scoreAmazonCategory({
      keyword: 'thermal labels',
      marketplace: 'com',
      products: sample,
      keepaAsinSet: new Set(['B0TESTASIN']),
    });

    expect(report.data_quality.data_points).toBe(50);
    expect(report.data_quality.price_coverage).toBe(1);
    expect(report.data_quality.seller_coverage).toBe(0);
    expect(report.data_quality.keepa_coverage).toBe(1);
    expect(report.data_quality.confidence_blockers).toContain('seller_coverage_low');
    expect(report.data_quality.confidence_blockers).not.toContain('no_keepa_data');
  });

  test('includes sku decisions with action, confidence and reasons', () => {
    const report = scoreAmazonCategory({
      keyword: 'dash cam',
      marketplace: 'com',
      products: products(2, {
        seller_name: undefined,
        price: undefined,
        product_url: 'https://www.amazon.com/dp/B0TESTASIN',
      }),
    });

    expect(report.sku_decisions).toHaveLength(2);
    expect(report.sku_decisions[0]?.action).toBe('UZAK_DUR');
    expect(report.sku_decisions[0]?.confidence).toBe('LOW');
    expect(report.sku_decisions[0]?.signals.seller_status).toBe('missing');
    expect(report.sku_decisions[0]?.signals.price_status).toBe('missing');
    expect(report.sku_decisions[0]?.reasons.join(' ')).toContain('Satıcı bilgisi yok');
  });

  test('includes decision surface summary for operators', () => {
    const report = scoreAmazonCategory({
      keyword: 'thermal labels',
      marketplace: 'com',
      products: products(50, { seller_name: undefined }),
    });

    expect(['AL', 'TAKIP_ET', 'UZAK_DUR']).toContain(report.decision_surface.primary_action);
    expect(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_DATA']).toContain(report.decision_surface.confidence);
    expect(report.decision_surface.confidence_blockers).toContain('seller_coverage_low');
    expect(report.decision_surface.operator_summary).toContain('satıcı kapsaması düşük');
    // legacy_decision holds the pre-gate decision; with low coverage gate, surface decision may differ
    expect(['GUVENLI', 'DIKKATLI_OL', 'GIRME', 'MIXED_SIGNAL']).toContain(report.decision_surface.legacy_decision);
    expect(report.decision_surface.data_gate.status).toBe('ENRICHMENT_REQUIRED');
    expect(report.decision_surface.action_distribution.total).toBe(50);
    expect(report.decision_surface.top_reasons.length).toBeGreaterThan(0);
  });

  test('does not create composite score when confidence is insufficient', () => {
    const report = scoreAmazonCategory({ keyword: 'x', marketplace: 'de', products: products(5) });

    expect(report.composite_score).toBeNull();
    expect(report.decision).toBe('INSUFFICIENT_DATA');
  });
});

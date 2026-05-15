import { describe, expect, test } from 'bun:test';
import { applyCoverageGate, buildActionDistribution, buildDataGate, buildDecisionSurface } from '../amazon.scoring-engine';
import type { AmazonRiskReport, DataQuality } from '../amazon.types';

const scores: AmazonRiskReport['scores'] = {
  category_risk: { score: 2, confidence: 'HIGH', reason: 'kategori uygun' },
  price_war_risk: { score: 2, confidence: 'HIGH', reason: 'fiyat riski düşük' },
  sku_chaos: { score: 2, confidence: 'HIGH', reason: 'sku net' },
  brand_reliability: { score: 2, confidence: 'HIGH', reason: 'marka güvenilir' },
  operational_risk: { score: 2, confidence: 'HIGH', reason: 'operasyon kolay' },
};

function quality(overrides: Partial<DataQuality>): DataQuality {
  return {
    data_points: 30,
    price_coverage: 1,
    seller_coverage: 0,
    keepa_coverage: 0,
    has_price_data: true,
    has_keepa_snapshot: false,
    confidence_blockers: ['seller_coverage_low', 'no_keepa_data'],
    ...overrides,
  };
}

describe('coverage gate', () => {
  test('downgrades zero coverage AL decision to TAKIP_ET', () => {
    const dataQuality = quality({});
    const distribution = buildActionDistribution([]);
    const surface = buildDecisionSurface(scores, 'GUVENLI', dataQuality, 2, distribution, buildDataGate(dataQuality, distribution, false));
    const gated = applyCoverageGate('GUVENLI', surface, dataQuality);

    expect(gated.decision).toBe('DIKKATLI_OL');
    expect(gated.decisionSurface.primary_action).toBe('TAKIP_ET');
    expect(gated.decisionSurface.gate_applied).toBe(true);
  });

  test('keeps original decision when coverage is healthy', () => {
    const dataQuality = quality({ seller_coverage: 0.5, keepa_coverage: 0.5, confidence_blockers: [] });
    const distribution = buildActionDistribution([]);
    const surface = buildDecisionSurface(scores, 'GUVENLI', dataQuality, 2, distribution, buildDataGate(dataQuality, distribution, false));
    const gated = applyCoverageGate('GUVENLI', surface, dataQuality);

    expect(gated.decision).toBe('GUVENLI');
    expect(gated.decisionSurface.primary_action).toBe('AL');
    expect(gated.decisionSurface.gate_applied).toBeUndefined();
  });

  test('downgrades GIRME (UZAK_DUR) to TAKIP_ET when coverage is low — no confident exit either', () => {
    const dataQuality = quality({});
    const distribution = buildActionDistribution([]);
    const surface = buildDecisionSurface(scores, 'GIRME', dataQuality, 8, distribution, buildDataGate(dataQuality, distribution, false));
    const gated = applyCoverageGate('GIRME', surface, dataQuality);
    expect(gated.decisionSurface.primary_action).toBe('TAKIP_ET');
    expect(gated.decisionSurface.gate_applied).toBe(true);
    expect(gated.decisionSurface.coverage_gate?.original_action).toBe('UZAK_DUR');
  });

  test('preserves existing TAKIP_ET decision (no gate needed)', () => {
    const dataQuality = quality({});
    const distribution = buildActionDistribution([]);
    const surface = buildDecisionSurface(scores, 'DIKKATLI_OL', dataQuality, 5, distribution, buildDataGate(dataQuality, distribution, false));
    const gated = applyCoverageGate('DIKKATLI_OL', surface, dataQuality);
    expect(gated.decision).toBe('DIKKATLI_OL');
    expect(gated.decisionSurface.gate_applied).toBeUndefined();
  });

  test('does not gate when only ONE of keepa/seller is low', () => {
    const dataQuality = quality({ seller_coverage: 0, keepa_coverage: 0.5 });
    const distribution = buildActionDistribution([]);
    const surface = buildDecisionSurface(scores, 'GUVENLI', dataQuality, 2, distribution, buildDataGate(dataQuality, distribution, false));
    const gated = applyCoverageGate('GUVENLI', surface, dataQuality);
    // Only seller is low (keepa is 0.5) → no gate
    expect(gated.decision).toBe('GUVENLI');
    expect(gated.decisionSurface.primary_action).toBe('AL');
  });

  test('coverage_gate object carries reason with actual percentages', () => {
    const dataQuality = quality({ seller_coverage: 0.15, keepa_coverage: 0.20 });
    const distribution = buildActionDistribution([]);
    const surface = buildDecisionSurface(scores, 'GUVENLI', dataQuality, 2, distribution, buildDataGate(dataQuality, distribution, false));
    const gated = applyCoverageGate('GUVENLI', surface, dataQuality);
    expect(gated.decisionSurface.coverage_gate?.reason).toContain('%15');
    expect(gated.decisionSurface.coverage_gate?.reason).toContain('%20');
  });
});

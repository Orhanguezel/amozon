import { describe, expect, test } from 'bun:test';
import { filterEligibleProducts, validateSignals } from '../signal.validator';
import type { AmazonRiskReport } from '../amazon.types';

function report(scores: number[]): AmazonRiskReport {
  return {
    keyword: 'x',
    scanned_at: '2026-05-08',
    data_points: 40,
    scores: {
      category_risk: { score: scores[0]!, confidence: 'HIGH', reason: '' },
      sku_chaos: { score: scores[1]!, confidence: 'HIGH', reason: '' },
      price_war_risk: { score: scores[2]!, confidence: 'HIGH', reason: '' },
      brand_reliability: { score: scores[3]!, confidence: 'HIGH', reason: '' },
      operational_risk: { score: scores[4]!, confidence: 'HIGH', reason: '' },
    },
    composite_score: 4,
    decision: 'DIKKATLI_OL',
    summary: '',
  };
}

describe('amazon signal validator', () => {
  test('filters products below review threshold', () => {
    expect(filterEligibleProducts([{ review_count: 5 }, { review_count: 10 }])).toEqual([{ review_count: 10 }]);
  });

  test('marks mixed signal when one dimension is high and others are low', () => {
    const result = validateSignals(report([8, 2, 2, 2, 3]));

    expect(result.decision).toBe('MIXED_SIGNAL');
    expect(result.notes[0]).toContain('Tek sinyal');
  });
});

import { describe, expect, test } from 'bun:test';
import { CompositeScorer, decide, calculateOutreachPriority } from '../composite.scorer';
import type { AmazonRiskReport } from '../amazon.types';

const scores: AmazonRiskReport['scores'] = {
  category_risk: { score: 8, confidence: 'HIGH', reason: '' },
  price_war_risk: { score: 6, confidence: 'MEDIUM', reason: '' },
  sku_chaos: { score: 7, confidence: 'HIGH', reason: '' },
  brand_reliability: { score: 4, confidence: 'LOW', reason: '' },
  operational_risk: { score: 5, confidence: 'HIGH', reason: '' },
};

describe('amazon composite scorer', () => {
  test('calculates weighted score from decision-capable dimensions', () => {
    const result = new CompositeScorer().score(scores);

    expect(result.compositeScore).toBeGreaterThan(6);
    expect(result.decision).toBe('GIRME');
  });

  test('maps decision thresholds', () => {
    expect(decide(3)).toBe('GUVENLI');
    expect(decide(6)).toBe('DIKKATLI_OL');
    expect(decide(6.1)).toBe('GIRME');
  });
});

describe('calculateOutreachPriority', () => {
  test('returns 1 when composite score is null', () => {
    expect(calculateOutreachPriority(null, 5)).toBe(1);
  });

  test('high risk + weak brand = high priority', () => {
    // composite 8, brand 2 → 8*0.7 + (10-2)*0.3 = 5.6 + 2.4 = 8.0
    expect(calculateOutreachPriority(8, 2)).toBe(8);
  });

  test('low risk + strong brand = low priority', () => {
    // composite 2, brand 9 → 2*0.7 + (10-9)*0.3 = 1.4 + 0.3 = 1.7
    expect(calculateOutreachPriority(2, 9)).toBe(1.7);
  });

  test('clamps result between 1 and 10', () => {
    expect(calculateOutreachPriority(10, 0)).toBe(10);
    expect(calculateOutreachPriority(0, 10)).toBe(1);
  });
});

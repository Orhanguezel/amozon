import { describe, expect, test } from 'bun:test';
import { compareSignals, extractKeySignals, type ThesisSignal } from '../thesis.service';
import type { AmazonRiskReport } from '../amazon.types';

const scores: AmazonRiskReport['scores'] = {
  category_risk: { score: 4, confidence: 'HIGH', reason: 'kategori dengeli' },
  price_war_risk: { score: 2, confidence: 'HIGH', reason: 'fiyat savaşı düşük' },
  sku_chaos: { score: 6, confidence: 'MEDIUM', reason: 'sku karışık' },
  brand_reliability: { score: 1, confidence: 'HIGH', reason: 'marka güçlü' },
  operational_risk: { score: 5, confidence: 'MEDIUM', reason: 'operasyon orta' },
};

describe('thesis service pure logic', () => {
  test('extractKeySignals picks low-risk AL support signals', () => {
    const signals = extractKeySignals({
      scores,
      decision_surface: { primary_action: 'AL' } as AmazonRiskReport['decision_surface'],
    });

    expect(signals.map((signal) => signal.key)).toContain('brand_reliability');
    expect(signals.map((signal) => signal.key)).toContain('price_war_risk');
  });

  test('compareSignals marks weakened and broken by score drift', () => {
    const original: ThesisSignal[] = [
      { key: 'price_war_risk', label: 'Fiyat', score: 2, confidence: 'HIGH', reason: 'düşük' },
    ];

    expect(compareSignals(original, [{ ...original[0], score: 4.2 }]).status).toBe('weakened');
    expect(compareSignals(original, [{ ...original[0], score: 5.1 }]).status).toBe('broken');
  });

  test('compareSignals stays active when drift is within tolerance', () => {
    const original: ThesisSignal[] = [
      { key: 'brand_reliability', label: 'Marka', score: 8, confidence: 'HIGH', reason: 'güçlü' },
      { key: 'price_war_risk', label: 'Fiyat', score: 2, confidence: 'HIGH', reason: 'düşük' },
    ];
    const result = compareSignals(original, [
      { ...original[0], score: 7.5 },
      { ...original[1], score: 2.8 },
    ]);
    expect(result.status).toBe('active');
    expect(result.max_delta).toBeLessThanOrEqual(2);
  });

  test('compareSignals reports diff with delta for missing current signal', () => {
    const original: ThesisSignal[] = [
      { key: 'price_war_risk', label: 'Fiyat', score: 3, confidence: 'HIGH', reason: 'orta' },
    ];
    const result = compareSignals(original, []);
    expect(result.diffs[0]?.current_score).toBeNull();
    expect(result.diffs[0]?.delta).toBeNull();
  });

  test('extractKeySignals prioritises high-risk for UZAK_DUR decisions', () => {
    const signals = extractKeySignals({
      scores,
      decision_surface: { primary_action: 'UZAK_DUR' } as AmazonRiskReport['decision_surface'],
    });

    // For UZAK_DUR, the highest-risk signals (sku_chaos=6, operational=5) should rank first
    expect(signals[0]?.key).toBe('sku_chaos');
  });

  test('extractKeySignals filters out INSUFFICIENT_DATA dimensions', () => {
    const partialScores: AmazonRiskReport['scores'] = {
      ...scores,
      sku_chaos: { score: 0, confidence: 'INSUFFICIENT_DATA', reason: 'veri yok' },
    };
    const signals = extractKeySignals({
      scores: partialScores,
      decision_surface: { primary_action: 'AL' } as AmazonRiskReport['decision_surface'],
    });
    expect(signals.find((s) => s.key === 'sku_chaos')).toBeUndefined();
  });
});

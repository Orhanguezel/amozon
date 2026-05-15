import { describe, expect, test } from 'bun:test';
import { deriveRiskBadges } from '../risk-badges';
import type { AmazonRiskReport } from '../amazon.types';

const baseScores: AmazonRiskReport['scores'] = {
  category_risk: { score: 2, confidence: 'HIGH', reason: 'ok' },
  sku_chaos: { score: 2, confidence: 'HIGH', reason: 'ok' },
  price_war_risk: { score: 2, confidence: 'HIGH', reason: 'ok' },
  brand_reliability: { score: 2, confidence: 'HIGH', reason: 'ok' },
  operational_risk: { score: 2, confidence: 'HIGH', reason: 'ok' },
};

describe('risk badges', () => {
  test('does not emit badges below thresholds', () => {
    expect(deriveRiskBadges(baseScores, { seller_coverage: 1, keepa_coverage: 1 })).toEqual([]);
  });

  test('emits expected badges above thresholds (corrected semantics)', () => {
    // RB.1 review düzeltmesi: AMAZON_DOMINANT = dominant brand payı (brand_reliability
    // DEĞİL — o skor parçalanmayı ölçer), HIGH_MAP_CONTROL = DÜŞÜK price_war + marka
    // disiplini (yüksek price_war fiyat savaşıdır, MAP kontrolünün tersi).
    const badges = deriveRiskBadges(
      {
        ...baseScores,
        category_risk: { score: 8, confidence: 'HIGH', reason: 'dominant brand' },
        sku_chaos: { score: 7.5, confidence: 'HIGH', reason: 'chaos' },
        price_war_risk: { score: 1, confidence: 'HIGH', reason: 'rigid prices' },
      },
      { seller_coverage: 0.8, keepa_coverage: 0.8 },
      { dominantBrandRatio: 0.6, sellerCount: 80 },
    );

    expect(badges.map((badge) => badge.type)).toEqual(['AMAZON_DOMINANT', 'HIGH_SELLER_CHAOS', 'HIGH_MAP_CONTROL']);
    expect(badges.every((badge) => !badge.limited)).toBe(true);
  });

  test('does NOT label brand fragmentation as AMAZON_DOMINANT (inversion regression)', () => {
    // Yüksek brand_reliability skoru = marka parçalanması; dominance DEĞİL.
    const badges = deriveRiskBadges(
      { ...baseScores, brand_reliability: { score: 9, confidence: 'HIGH', reason: 'fragmented' } },
      { seller_coverage: 0.8, keepa_coverage: 0.8 },
      { dominantBrandRatio: 0.1, sellerCount: 5 },
    );
    expect(badges.map((b) => b.type)).not.toContain('AMAZON_DOMINANT');
  });

  test('HIGH_MAP_CONTROL fires on LOW price war, not high (inversion regression)', () => {
    const highPriceWar = deriveRiskBadges(
      { ...baseScores, price_war_risk: { score: 9, confidence: 'HIGH', reason: 'price war' } },
      { seller_coverage: 0.8, keepa_coverage: 0.8 },
      { dominantBrandRatio: 0.6, sellerCount: 10 },
    );
    expect(highPriceWar.map((b) => b.type)).not.toContain('HIGH_MAP_CONTROL');

    const rigidPrices = deriveRiskBadges(
      { ...baseScores, price_war_risk: { score: 1, confidence: 'HIGH', reason: 'rigid' } },
      { seller_coverage: 0.8, keepa_coverage: 0.8 },
      { dominantBrandRatio: 0.6, sellerCount: 10 },
    );
    expect(rigidPrices.map((b) => b.type)).toContain('HIGH_MAP_CONTROL');
  });

  test('suppresses badge when supporting dimension confidence is INSUFFICIENT_DATA', () => {
    const badges = deriveRiskBadges(
      { ...baseScores, sku_chaos: { score: 9, confidence: 'INSUFFICIENT_DATA', reason: 'no data' } },
      { seller_coverage: 0.8, keepa_coverage: 0.8 },
      { dominantBrandRatio: 0.1, sellerCount: 5 },
    );
    expect(badges.map((b) => b.type)).not.toContain('HIGH_SELLER_CHAOS');
  });

  test('suppresses badges when both seller and keepa coverage are too low', () => {
    const badges = deriveRiskBadges({
      ...baseScores,
      brand_reliability: { score: 9, confidence: 'HIGH', reason: 'dominant' },
    }, { seller_coverage: 0, keepa_coverage: 0 });

    expect(badges).toEqual([]);
  });

  test('marks badges as limited when one supporting coverage layer is weak', () => {
    const badges = deriveRiskBadges({
      ...baseScores,
      sku_chaos: { score: 8, confidence: 'HIGH', reason: 'chaos' },
    }, { seller_coverage: 0.2, keepa_coverage: 0.9 });

    expect(badges[0]?.limited).toBe(true);
    expect(badges[0]?.label).toContain('sınırlı veri');
  });
});

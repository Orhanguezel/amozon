import { describe, expect, test } from 'bun:test';
import { synthesizeCommercialSummary, generatePersuasionPoints } from '../persuasion.generator';
import type { AmazonRiskReport } from '../amazon.types';

function makeScores(overrides: Partial<AmazonRiskReport['scores']> = {}): AmazonRiskReport['scores'] {
  const base: AmazonRiskReport['scores'] = {
    category_risk: { score: 3, confidence: 'HIGH', reason: 'Düşük rekabet.' },
    price_war_risk: { score: 3, confidence: 'HIGH', reason: 'Fiyat dengeli.' },
    sku_chaos: { score: 3, confidence: 'HIGH', reason: 'SKU düzenli.' },
    brand_reliability: { score: 3, confidence: 'HIGH', reason: 'Marka tutarlı.' },
    operational_risk: { score: 3, confidence: 'HIGH', reason: 'Operasyon normal.' },
  };
  return { ...base, ...overrides };
}

describe('synthesizeCommercialSummary', () => {
  test('AL kararında düşük risk boyutlarını ve fırsatı vurgular', () => {
    const scores = makeScores({ category_risk: { score: 2, confidence: 'HIGH', reason: '' } });
    const result = synthesizeCommercialSummary(scores, 'AL', 3.1);

    expect(result).toContain('bileşik skor: 3.1');
    expect(result.length).toBeGreaterThan(20);
  });

  test('UZAK_DUR kararında en yüksek iki boyutu sentezler', () => {
    const scores = makeScores({
      category_risk: { score: 8, confidence: 'HIGH', reason: '' },
      price_war_risk: { score: 7, confidence: 'HIGH', reason: '' },
    });
    const result = synthesizeCommercialSummary(scores, 'UZAK_DUR', 7.5);

    expect(result).toContain('Kaçınma kararı verildi');
    expect(result).toContain('7.5');
  });

  test('TAKIP_ET kararında izleme tavsiyesi verir', () => {
    const scores = makeScores({
      price_war_risk: { score: 7, confidence: 'HIGH', reason: '' },
      sku_chaos: { score: 6, confidence: 'HIGH', reason: '' },
    });
    const result = synthesizeCommercialSummary(scores, 'TAKIP_ET', 5.5);

    expect(result).toContain('izlenmeli');
    expect(result.length).toBeGreaterThan(20);
  });

  test('bilinen boyut çifti için özel cümle kullanır', () => {
    const scores = makeScores({
      brand_reliability: { score: 7, confidence: 'HIGH', reason: '' },
      operational_risk: { score: 8, confidence: 'HIGH', reason: '' },
    });
    const result = synthesizeCommercialSummary(scores, 'UZAK_DUR', null);

    expect(result).toContain('fırsata işaret ediyor');
  });

  test('compositeScore null olduğunda parantez olmadan çalışır', () => {
    const scores = makeScores();
    const result = synthesizeCommercialSummary(scores, 'AL', null);

    expect(result).not.toContain('undefined');
    expect(result.length).toBeGreaterThan(10);
  });
});

describe('generatePersuasionPoints', () => {
  test('yüksek skor boyutları için uyarı mesajları üretir', () => {
    const scores = makeScores({
      category_risk: { score: 7, confidence: 'HIGH', reason: '' },
      price_war_risk: { score: 8, confidence: 'HIGH', reason: '' },
    });
    const points = generatePersuasionPoints(scores);

    expect(points.length).toBeGreaterThan(0);
    expect(points.some((p) => p.includes('satıcı') || p.includes('fiyat'))).toBe(true);
  });

  test('tüm skorlar düşükse fallback mesajı döner', () => {
    // brand_reliability > 4 ile "Yetkili kanal" kuralı tetiklenmez
    const scores = makeScores({ brand_reliability: { score: 5, confidence: 'HIGH', reason: '' } });
    const points = generatePersuasionPoints(scores);

    expect(points).toHaveLength(1);
    expect(points[0]).toContain('istikrarlı');
  });

  test('en fazla 4 nokta döner', () => {
    const scores = makeScores({
      category_risk: { score: 8, confidence: 'HIGH', reason: '' },
      price_war_risk: { score: 8, confidence: 'HIGH', reason: '' },
      sku_chaos: { score: 8, confidence: 'HIGH', reason: '' },
      operational_risk: { score: 8, confidence: 'HIGH', reason: '' },
    });
    const points = generatePersuasionPoints(scores);

    expect(points.length).toBeLessThanOrEqual(4);
  });
});

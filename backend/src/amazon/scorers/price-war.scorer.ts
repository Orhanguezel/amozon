import { calculateConfidence } from '../confidence.calculator';
import type { AmazonScoreInput, DimensionScore } from '../amazon.types';

export function scorePriceWar(input: AmazonScoreInput): DimensionScore {
  const pricedProducts = input.products.filter((product) => typeof product.price === 'number');
  if (!pricedProducts.length) {
    return { score: 0, confidence: 'INSUFFICIENT_DATA', reason: 'Fiyat verisi bulunamadı; price war skoru dışarıda bırakıldı.' };
  }

  const confidence = calculateConfidence(pricedProducts.length, input.qualityFactors);
  if (confidence === 'INSUFFICIENT_DATA') {
    return { score: 0, confidence, reason: 'Price war riski için yeterli fiyatlı ürün bulunamadı.' };
  }

  const pageOne = input.pageOneAveragePrice ?? input.stats.priceMedian;
  const pageThree = input.pageThreeAveragePrice ?? input.stats.priceMin;
  const dropRatio = pageOne > 0 ? Math.max(0, (pageOne - pageThree) / pageOne) : 0;
  const sigmaRatio = input.stats.priceMedian > 0 ? input.stats.priceSigma / input.stats.priceMedian : 0;
  const lowPriceCluster = pricedProducts.filter((product) => (product.price ?? 0) <= input.stats.priceMedian * 0.8).length / pricedProducts.length;
  let score = Math.min(10, dropRatio * 5 + sigmaRatio * 3 + lowPriceCluster * 4);

  const snapshots = input.keepaSnapshots ?? [];
  let keepaNote = '';

  // Keepa: historical price drop → additional volatility signal
  const keepaWithPrice = snapshots.filter(
    (s) => s.price_30d_min !== null && s.price_90d_avg !== null && s.price_90d_avg > 0,
  );
  if (keepaWithPrice.length > 0) {
    const avgHistoricalDrop = keepaWithPrice.reduce((sum, s) => {
      const drop = (s.price_90d_avg! - s.price_30d_min!) / s.price_90d_avg!;
      return sum + Math.max(0, drop);
    }, 0) / keepaWithPrice.length;
    const keepaBoost = Math.min(3, avgHistoricalDrop * 8);
    score = Math.min(10, score + keepaBoost);
    keepaNote = ` Keepa 90 günlük fiyat düşüş ortalaması: ${(avgHistoricalDrop * 100).toFixed(0)}%.`;
  }

  // Keepa: price_volatility time-series (σ/μ ratio)
  const withVolatility = snapshots.filter((s) => s.price_volatility !== null && s.price_volatility !== undefined);
  if (withVolatility.length > 0) {
    const avgVolatility = withVolatility.reduce((sum, s) => sum + (s.price_volatility ?? 0), 0) / withVolatility.length;
    // σ/μ > 0.2 = yüksek volatilite, max +2 boost
    const volatilityBoost = Math.min(2, avgVolatility * 6);
    score = Math.min(10, score + volatilityBoost);
    keepaNote += ` Fiyat volatilitesi σ/μ=${avgVolatility.toFixed(2)}.`;
  }

  return {
    score: Number(score.toFixed(1)),
    confidence,
    reason: `Sayfa fiyat düşüş oranı ${(dropRatio * 100).toFixed(0)}%, düşük fiyat kümesi ${(lowPriceCluster * 100).toFixed(0)}%.${keepaNote}`,
  };
}

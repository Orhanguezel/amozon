import { calculateConfidence } from '../confidence.calculator';
import type { AmazonScoreInput, DimensionScore } from '../amazon.types';

const criticalFlags = new Set(['return', 'quality', 'broke', 'fit', 'slippery']);

export function scoreOperationalRisk(input: AmazonScoreInput): DimensionScore {
  const confidence = calculateConfidence(input.products.length, input.qualityFactors);
  if (confidence === 'INSUFFICIENT_DATA') {
    return { score: 0, confidence, reason: 'Operasyonel risk için en az 10 veri noktası gerekir.' };
  }

  const flags = input.reviewProblemFlags ?? [];
  const criticalCount = flags.filter((flag) => criticalFlags.has(flag)).length;
  const problemScore = input.reviewProblemScore ?? 0;
  const lowRatedRatio = input.products.filter((product) => (product.rating ?? 5) < 4).length / input.products.length;
  let score = Math.min(10, problemScore * 0.65 + criticalCount * 0.6 + lowRatedRatio * 3);

  // Keepa: Buy Box instability → operational unpredictability signal
  const keepaWithBuyBox = (input.keepaSnapshots ?? []).filter((s) => s.buy_box_change_count > 0);
  let keepaNote = '';
  if (keepaWithBuyBox.length > 0) {
    const avgBuyBoxChanges = keepaWithBuyBox.reduce((sum, s) => sum + s.buy_box_change_count, 0) / keepaWithBuyBox.length;
    // > 5 değişim = yüksek Buy Box instabilite (+2 max)
    const buyBoxBoost = Math.min(2, (avgBuyBoxChanges / 5) * 2);
    score = Math.min(10, score + buyBoxBoost);
    keepaNote = ` Ortalama Buy Box değişim sayısı: ${avgBuyBoxChanges.toFixed(1)}.`;
  }

  // Keepa: seller_count_trend 'up' = daha fazla rakip → operasyonel baskı
  const trendUp = (input.keepaSnapshots ?? []).filter((s) => s.seller_count_trend === 'up').length;
  const trendDown = (input.keepaSnapshots ?? []).filter((s) => s.seller_count_trend === 'down').length;
  if (trendUp > trendDown && trendUp > 0) {
    score = Math.min(10, score + 0.5);
    keepaNote += ' Satıcı sayısı artış trendinde.';
  }

  // Keepa: offer_count_trend 'up' = artan tedarikçi baskısı
  const withOfferTrend = (input.keepaSnapshots ?? []).filter((s) => s.offer_count_trend !== null);
  if (withOfferTrend.length > 0) {
    const offerTrendUp = withOfferTrend.filter((s) => s.offer_count_trend === 'up').length;
    const offerTrendDown = withOfferTrend.filter((s) => s.offer_count_trend === 'down').length;
    if (offerTrendUp > offerTrendDown) {
      score = Math.min(10, score + 0.8);
      keepaNote += ` Teklif sayısı artış trendinde (${offerTrendUp}/${withOfferTrend.length} ürün).`;
    } else if (offerTrendDown > offerTrendUp) {
      score = Math.max(0, score - 0.5);
      keepaNote += ' Teklif sayısı azalma trendinde; pazar daralıyor olabilir.';
    }
  }

  return {
    score: Number(score.toFixed(1)),
    confidence,
    reason: `Review problem skoru ${problemScore.toFixed(1)}, kritik şikayet bayrağı ${criticalCount}.${keepaNote}`,
  };
}

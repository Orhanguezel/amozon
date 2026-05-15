import type { AmazonScoreInput, DimensionScore } from '../amazon.types';
import { calculateConfidence } from '../confidence.calculator';
import { CATEGORY_RISK_CONFIG as C } from '../scoring.config';

export function scoreCategoryRisk(input: AmazonScoreInput): DimensionScore {
  const { stats, products } = input;
  const dataPoints = products.length;
  const confidence = calculateConfidence(dataPoints, input.qualityFactors);

  if (confidence === 'INSUFFICIENT_DATA') {
    return { score: 0, confidence, reason: 'Yetersiz veri: kategori analizi yapılamadı.' };
  }

  const reasons: string[] = [];
  let score = 0;

  // Satıcı yoğunluğu: HIGH_SELLER_COUNT+ satıcı yüksek rekabet
  const sellerDensityScore = Math.min(10, (stats.sellerCount / C.SELLER_DENSITY_DIVISOR));
  score += sellerDensityScore * 0.4;
  if (stats.sellerCount > C.HIGH_SELLER_COUNT) reasons.push(`Yüksek satıcı yoğunluğu (${stats.sellerCount} satıcı)`);

  // Dominant brand oranı: tek marka HIGH_BRAND_RATIO+ pazar payına sahipse yüksek engel
  const brandScore = stats.dominantBrandRatio > C.HIGH_BRAND_RATIO ? 8 : stats.dominantBrandRatio > C.MED_BRAND_RATIO ? 5 : 2;
  score += brandScore * 0.35;
  if (stats.dominantBrandRatio > C.HIGH_BRAND_RATIO) reasons.push(`Dominant marka oranı yüksek (%${Math.round(stats.dominantBrandRatio * 100)})`);

  // Review dağılımı: çoğu ürün HIGH_REVIEW_COUNT+ yorumsa giriş zorlaşır
  const highReviewProducts = products.filter(p => (p.review_count ?? 0) > C.HIGH_REVIEW_COUNT).length;
  const highReviewRatio = dataPoints > 0 ? highReviewProducts / dataPoints : 0;
  const reviewBarrierScore = highReviewRatio > C.HIGH_REVIEW_BARRIER ? 8 : highReviewRatio > C.MED_REVIEW_BARRIER ? 5 : 2;
  score += reviewBarrierScore * 0.25;
  if (highReviewRatio > C.HIGH_REVIEW_BARRIER) reasons.push(`Ürünlerin yarısından fazlasında ${C.HIGH_REVIEW_COUNT}+ yorum mevcut`);

  const final = Math.min(10, Math.round(score * 10) / 10);
  return {
    score: final,
    confidence,
    reason: reasons.length > 0 ? reasons.join('; ') : 'Normal kategori yoğunluğu.',
  };
}

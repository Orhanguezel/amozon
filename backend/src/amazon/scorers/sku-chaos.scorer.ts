import { calculateConfidence } from '../confidence.calculator';
import type { AmazonScoreInput, DimensionScore } from '../amazon.types';

export function scoreSkuChaos(input: AmazonScoreInput): DimensionScore {
  const confidence = calculateConfidence(input.products.length, input.qualityFactors);
  if (confidence === 'INSUFFICIENT_DATA') {
    return { score: 0, confidence, reason: 'SKU karmaşası için en az 10 veri noktası gerekir.' };
  }

  const range = input.stats.priceMax - input.stats.priceMin;
  const median = input.stats.priceMedian || 1;
  const spreadRatio = range / median;
  const sigmaRatio = input.stats.priceSigma / median;
  const variantPressure = Math.min(2, Math.log10(input.stats.productCount + 1));
  const spreadScore = Math.min(4, Math.log1p(spreadRatio) * 2.4);
  const sigmaScore = Math.min(4, Math.log1p(sigmaRatio) * 2.8);
  const score = Math.min(10, spreadScore + sigmaScore + variantPressure);

  return {
    score: Number(score.toFixed(1)),
    confidence,
    reason: `Fiyat aralığı ${range.toFixed(2)}, medyan ${median.toFixed(2)}, sigma ${input.stats.priceSigma.toFixed(2)}, ürün sayısı ${input.stats.productCount}; skor log normalize edildi.`,
  };
}

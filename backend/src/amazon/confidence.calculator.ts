import type { Confidence, QualityFactors } from './amazon.types';
import { DATA_QUALITY_CONFIG, getConfidenceThresholds } from './scoring.config';

export function calculateConfidence(dataPoints: number, qualityFactors?: QualityFactors): Confidence {
  const T = getConfidenceThresholds();
  if (dataPoints <= T.INSUFFICIENT_DATA_MAX) return 'INSUFFICIENT_DATA';
  const base = dataPoints <= T.LOW_MAX ? 'LOW' : dataPoints <= T.MEDIUM_MAX ? 'MEDIUM' : 'HIGH';
  if (!qualityFactors) return base;

  const penalties = [
    qualityFactors.sellerCoverage < DATA_QUALITY_CONFIG.SELLER_COVERAGE_LOW,
    qualityFactors.priceCoverage < DATA_QUALITY_CONFIG.PRICE_COVERAGE_LOW,
  ].filter(Boolean).length;
  return reduceConfidence(base, penalties);
}

export function canMakeDecision(confidence: Confidence) {
  return confidence === 'HIGH' || confidence === 'MEDIUM';
}

function reduceConfidence(base: Confidence, steps: number): Confidence {
  const ladder: Confidence[] = ['INSUFFICIENT_DATA', 'LOW', 'MEDIUM', 'HIGH'];
  const index = Math.max(0, ladder.indexOf(base) - steps);
  return ladder[index]!;
}

import type { CoverageBreakdown, DataQuality } from './amazon.types';

export function buildCoverageBreakdown(dataQuality: Pick<DataQuality, 'keepa_coverage' | 'seller_coverage' | 'scan_age_days'>): CoverageBreakdown {
  const keepaCoverage = clampRatio(dataQuality.keepa_coverage);
  const sellerCoverage = clampRatio(dataQuality.seller_coverage);
  const staleRatio = staleRatioFromAge(dataQuality.scan_age_days);
  const gaps = [
    { blocker: 'seller' as const, gap: 1 - sellerCoverage },
    { blocker: 'keepa' as const, gap: 1 - keepaCoverage },
    { blocker: 'stale' as const, gap: staleRatio },
  ].sort((a, b) => b.gap - a.gap);
  const dominant = gaps[0];

  return {
    keepa_coverage: keepaCoverage,
    seller_coverage: sellerCoverage,
    stale_ratio: staleRatio,
    dominant_blocker: dominant && dominant.gap >= 0.35 ? dominant.blocker : 'none',
  };
}

function clampRatio(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(Math.max(0, Math.min(1, number)).toFixed(2));
}

function staleRatioFromAge(ageDays: unknown) {
  const age = Number(ageDays ?? 0);
  if (!Number.isFinite(age) || age < 7) return 0;
  return Number(Math.min(1, age / 30).toFixed(2));
}

import type { CoverageGate, DataQuality, SkuAction } from './amazon.types';

const CRITICAL_COVERAGE_THRESHOLD = 0.3;

/**
 * Computes whether the scan's coverage is critically low and the primary action
 * should be downgraded to TAKIP_ET. Returns null when no gate is applied.
 *
 * Rules:
 *  - keepa_coverage < 0.3 AND seller_coverage < 0.3 → downgrade to TAKIP_ET
 *  - already TAKIP_ET → no change, no gate applied
 *  - AL → TAKIP_ET (don't recommend buying without coverage)
 *  - UZAK_DUR → TAKIP_ET (don't recommend avoiding without coverage either —
 *    insufficient evidence in both directions)
 */
export function evaluateCoverageGate(
  primaryAction: SkuAction,
  dataQuality: DataQuality,
): CoverageGate | null {
  if (primaryAction === 'TAKIP_ET') return null;

  const keepa = dataQuality.keepa_coverage ?? 0;
  const seller = dataQuality.seller_coverage ?? 0;

  const keepaLow = keepa < CRITICAL_COVERAGE_THRESHOLD;
  const sellerLow = seller < CRITICAL_COVERAGE_THRESHOLD;

  if (!(keepaLow && sellerLow)) return null;

  const keepaPct = Math.round(keepa * 100);
  const sellerPct = Math.round(seller * 100);

  return {
    applied: true,
    original_action: primaryAction,
    downgraded_action: 'TAKIP_ET',
    reason: `Coverage gate: Keepa %${keepaPct}, satıcı %${sellerPct} (her ikisi de %${Math.round(CRITICAL_COVERAGE_THRESHOLD * 100)} altında). ${primaryAction} kararı yeterli kanıt olmadan verilemez; TAKIP_ET olarak indirgenmiştir.`,
  };
}


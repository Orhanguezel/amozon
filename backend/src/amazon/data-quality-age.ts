import { buildCoverageBreakdown } from './coverage-breakdown';

export function computeScanAgeDays(createdAt: unknown, now = new Date()): number | null {
  if (!createdAt) return null;
  const created = createdAt instanceof Date ? createdAt : new Date(String(createdAt));
  const createdMs = created.getTime();
  if (!Number.isFinite(createdMs)) return null;
  const diffMs = now.getTime() - createdMs;
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

export function withScanAge<T extends Record<string, unknown> | null>(
  dataQuality: T,
  createdAt: unknown,
): T & { scan_age_days: number | null } {
  const withAge = {
    ...((dataQuality ?? {}) as T),
    scan_age_days: computeScanAgeDays(createdAt),
  };
  return {
    ...withAge,
    coverage_breakdown: buildCoverageBreakdown({
      keepa_coverage: Number(withAge.keepa_coverage ?? 0),
      seller_coverage: Number(withAge.seller_coverage ?? 0),
      scan_age_days: withAge.scan_age_days,
    }),
  };
}

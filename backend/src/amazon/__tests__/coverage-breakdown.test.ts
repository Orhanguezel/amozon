import { describe, expect, test } from 'bun:test';
import { buildCoverageBreakdown } from '../coverage-breakdown';

describe('coverage breakdown', () => {
  test('marks seller as dominant blocker when seller coverage is zero', () => {
    const breakdown = buildCoverageBreakdown({ seller_coverage: 0, keepa_coverage: 0.8 });
    expect(breakdown.dominant_blocker).toBe('seller');
  });

  test('marks stale as dominant blocker for old scans when coverage is healthy', () => {
    const breakdown = buildCoverageBreakdown({ seller_coverage: 0.9, keepa_coverage: 0.9, scan_age_days: 30 });
    expect(breakdown.dominant_blocker).toBe('stale');
    expect(breakdown.stale_ratio).toBe(1);
  });

  test('returns none when all coverage layers are healthy and fresh', () => {
    const breakdown = buildCoverageBreakdown({ seller_coverage: 0.9, keepa_coverage: 0.9, scan_age_days: 1 });
    expect(breakdown.dominant_blocker).toBe('none');
  });
});

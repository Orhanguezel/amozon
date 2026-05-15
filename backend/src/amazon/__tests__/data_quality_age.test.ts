import { describe, expect, test } from 'bun:test';
import { computeScanAgeDays, withScanAge } from '../data-quality-age';

describe('data quality scan age', () => {
  test('calculates 7+ day old scan age', () => {
    const now = new Date('2026-05-14T12:00:00Z');
    expect(computeScanAgeDays('2026-05-06T11:00:00Z', now)).toBe(8);
  });

  test('adds scan_age_days to data_quality object', () => {
    const aged = withScanAge({ data_points: 5 }, '2026-05-07T00:00:00Z');
    expect(aged.scan_age_days).toBeGreaterThanOrEqual(0);
    expect(aged.data_points).toBe(5);
  });
});

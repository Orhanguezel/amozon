import { describe, expect, test } from 'bun:test';
import { buildPriorityView } from '../priority-view';
import type { SkuDecision } from '../amazon.types';

function sku(overrides: Partial<SkuDecision>): SkuDecision {
  return {
    asin: null,
    title: 'Candidate SKU',
    action: 'TAKIP_ET',
    confidence: 'HIGH',
    decision_tier: 'DECISION_READY',
    reasons: ['Güvenli aday.'],
    signals: {
      price_status: 'normal',
      seller_status: 'real',
      review_tier: 'mid',
      rating_level: 'strong',
      keepa_status: 'available',
    },
    ...overrides,
  };
}

describe('priority view', () => {
  test('sorts HIGH confidence SKUs before lower priority titles', () => {
    const view = buildPriorityView([
      sku({ title: 'Track', action: 'TAKIP_ET' }),
      sku({ title: 'Buy', action: 'AL' }),
      sku({ title: 'Low', confidence: 'LOW', action: 'AL' }),
    ]);

    expect(view.highest_confidence.map((item) => item.title)).toEqual(['Buy', 'Track']);
  });

  test('excludes LOW and INSUFFICIENT_DATA from best_candidate', () => {
    const view = buildPriorityView([
      sku({ title: 'Low', confidence: 'LOW', action: 'AL' }),
      sku({ title: 'Insufficient', confidence: 'INSUFFICIENT_DATA', action: 'AL' }),
    ]);

    expect(view.best_candidate).toHaveLength(0);
    expect(view.empty_reason).toContain('güvenli aday yok');
  });

  test('prioritizes lowest chaos from existing SKU signals', () => {
    const clean = sku({ title: 'Clean' });
    const chaotic = sku({
      title: 'Chaotic',
      signals: {
        price_status: 'low',
        seller_status: 'missing',
        review_tier: 'low',
        rating_level: 'missing',
        keepa_status: 'missing',
      },
    });

    const view = buildPriorityView([chaotic, clean]);
    expect(view.lowest_chaos[0]?.title).toBe('Clean');
  });
});

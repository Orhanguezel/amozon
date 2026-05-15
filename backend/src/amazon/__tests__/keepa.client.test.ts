import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createDbMock } from '../../test/mock-db';

const dbMock = createDbMock();
const env = {
  KEEPA_API_KEY: 'keepa-key',
  KEEPA_DAILY_TOKEN_BUDGET: 5,
};

mock.module('@/db/client', () => ({
  db: dbMock.db,
  pool: dbMock.pool,
}));

mock.module('@/core/env', () => ({ env }));

const fetchMock = mock(() => Promise.resolve(Response.json({
  products: [{
    stats: { min: [0, 990], max: [0, 1290], avg90: [0, 1110] },
    buyBoxSellerIdHistory: ['seller-a', 'seller-b'],
  }],
})));
globalThis.fetch = fetchMock as unknown as typeof fetch;

const {
  isKeepaConfigured,
  shouldFetchKeepa,
  enqueueKeepaAsins,
  processKeepaQueue,
} = await import('../keepa.client');

beforeEach(() => {
  dbMock.reset();
  fetchMock.mockClear();
  env.KEEPA_API_KEY = 'keepa-key';
});

describe('amazon keepa client', () => {
  test('fetches only for insufficient data or high risk products', () => {
    expect(shouldFetchKeepa({ confidence: 'INSUFFICIENT_DATA', score: null })).toBe(true);
    expect(shouldFetchKeepa({ confidence: 'HIGH', score: 7.2 })).toBe(true);
    expect(shouldFetchKeepa({ confidence: 'HIGH', score: 6.8 })).toBe(false);
  });

  test('enqueueKeepaAsins stores unique pending rows', async () => {
    const inserted = await enqueueKeepaAsins('job-1', ['ASIN123456', 'ASIN123456', 'ASIN654321']);

    expect(inserted).toBe(2);
    const inserts = dbMock.poolExecutions.filter((entry) => entry.sql.includes('INSERT INTO amazon_keepa_queue'));
    expect(inserts).toHaveLength(2);
  });

  test('processKeepaQueue consumes budget and marks queue rows done', async () => {
    dbMock.queuePoolExecute([{ id: 'q-1', asin: 'B0TESTASIN1' }]);
    dbMock.queuePoolExecute([{ token_budget: 5, tokens_used: 1 }]);

    const result = await processKeepaQueue(10);

    expect(result).toEqual({ processed: 1, skippedByBudget: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      dbMock.poolExecutions.some((entry) => entry.sql.includes('INSERT INTO amazon_keepa_snapshots')),
    ).toBe(true);
    expect(
      dbMock.poolExecutions.some((entry) => entry.sql.includes("UPDATE amazon_keepa_queue SET status = 'done'")),
    ).toBe(true);
  });

  test('does not enqueue or process queue when Keepa key is missing', async () => {
    env.KEEPA_API_KEY = '';

    expect(isKeepaConfigured()).toBe(false);
    const inserted = await enqueueKeepaAsins('job-1', ['B0TESTASIN1']);
    const result = await processKeepaQueue(10);

    expect(inserted).toBe(0);
    expect(result).toEqual({ processed: 0, skippedByBudget: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(dbMock.poolExecutions).toHaveLength(0);
  });
});

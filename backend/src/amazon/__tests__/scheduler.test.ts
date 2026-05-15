import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createDbMock } from '../../test/mock-db';

const dbMock = createDbMock();
const createJobMock = mock(async (keyword: string, marketplace = 'com') => ({ id: `retry-${keyword}`, keyword, marketplace, status: 'pending' }));
const runAmazonJobMock = mock(async (_jobId: string) => undefined);
const evaluateThesisMock = mock(async (_id: string) => ({
  status: 'weakened',
  weakness_note: 'En büyük sinyal sapması 2.4 puan.',
}));

mock.module('@/db/client', () => ({
  pool: dbMock.pool,
}));

mock.module('@/core/env', () => ({
  env: {
    OXYLABS_USERNAME: '',
    OXYLABS_PASSWORD: '',
    KEEPA_API_KEY: '',
  },
}));

mock.module('@/amazon/keepa.client', () => ({
  isKeepaConfigured: () => false,
  shouldFetchKeepa: () => false,
  enqueueKeepaAsins: async () => 0,
  processKeepaQueue: async () => ({ processed: 0, skippedByBudget: 0 }),
}));

mock.module('@/amazon/amazon.scraper', () => ({
  scrapeAmazonProducts: mock(async () => []),
  scrapeAmazonProductDetail: mock(async () => ({})),
}));

const { runAutoRetryFailedScansWithDeps, runThesisReevaluationWithDeps } = await import('../../scheduler');

beforeEach(() => {
  dbMock.reset();
  createJobMock.mockClear();
  runAmazonJobMock.mockClear();
  evaluateThesisMock.mockClear();
  evaluateThesisMock.mockImplementation(async () => ({
    status: 'weakened',
    weakness_note: 'En büyük sinyal sapması 2.4 puan.',
  }));
});

describe('scheduler automation', () => {
  test('auto-retries retryable failed scans by creating a new job', async () => {
    dbMock.queuePoolExecute([
      {
        id: 'failed-job',
        keyword: 'thermal labels',
        marketplace: 'com',
        error_msg: 'OXYLABS_AMAZON_SEARCH_FAILED_503',
        attempt_count: 1,
        has_newer_active: 0,
      },
    ]);

    const result = await runAutoRetryFailedScansWithDeps({
      createJobFn: createJobMock,
      runAmazonJobFn: runAmazonJobMock,
    });

    expect(result.retried).toBe(1);
    expect(createJobMock).toHaveBeenCalledWith('thermal labels', 'com');
    expect(dbMock.poolExecutions.some((entry) => entry.values?.includes('Geçici hata için otomatik retry'))).toBe(true);
    expect(runAmazonJobMock).toHaveBeenCalledTimes(1);
  });

  test('skips failed scans with newer active attempts', async () => {
    dbMock.queuePoolExecute([
      {
        id: 'failed-job',
        keyword: 'thermal labels',
        marketplace: 'com',
        error_msg: 'timeout',
        attempt_count: 1,
        has_newer_active: 1,
      },
    ]);

    const result = await runAutoRetryFailedScansWithDeps({
      createJobFn: createJobMock,
      runAmazonJobFn: runAmazonJobMock,
    });

    expect(result.retried).toBe(0);
    expect(createJobMock).not.toHaveBeenCalled();
    expect(runAmazonJobMock).not.toHaveBeenCalled();
  });

  test('re-evaluates stale active theses after creating a fresh scan', async () => {
    dbMock.queuePoolExecute([
      {
        id: 'thesis-1',
        keyword: 'thermal labels',
        marketplace: 'com',
        status: 'active',
      },
    ]);

    const result = await runThesisReevaluationWithDeps({
      createJobFn: createJobMock,
      runAmazonJobFn: runAmazonJobMock,
      evaluateThesisFn: evaluateThesisMock,
    });

    expect(result.evaluated).toBe(1);
    expect(result.changed).toBe(1);
    expect(createJobMock).toHaveBeenCalledWith('thermal labels', 'com');
    expect(runAmazonJobMock).toHaveBeenCalledTimes(1);
    expect(evaluateThesisMock).toHaveBeenCalledWith('thesis-1');
    expect(dbMock.poolExecutions.some((entry) => entry.values?.includes('Tez zayıfladı'))).toBe(true);
  });
});

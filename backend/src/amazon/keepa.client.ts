import { randomUUID } from 'node:crypto';

import { env } from '@/core/env';
import { pool } from '@/db/client';

export type KeepaSnapshot = {
  asin: string;
  marketplace: string;
  domain_id: number;
  price_30d_min: number | null;
  price_30d_max: number | null;
  price_90d_avg: number | null;
  buy_box_change_count: number;
  seller_count_trend: 'up' | 'down' | 'flat' | null;
  price_volatility: number | null;
  offer_count_avg: number | null;
  offer_count_trend: 'up' | 'down' | 'flat' | null;
  stock_history_json: unknown;
};

export function isKeepaConfigured(): boolean {
  return Boolean(env.KEEPA_API_KEY);
}

export function shouldFetchKeepa(input: { confidence: string; score?: number | null }) {
  return input.confidence === 'INSUFFICIENT_DATA' || (input.score ?? 0) > 7;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getRemainingDailyBudget(): Promise<number> {
  const date = todayUtcDate();
  const dailyBudget = env.KEEPA_DAILY_TOKEN_BUDGET;
  await pool.execute(
    `INSERT INTO amazon_keepa_daily_budget (budget_date, token_budget, tokens_used)
     VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE token_budget = VALUES(token_budget)`,
    [date, dailyBudget],
  );
  const [rows] = await pool.execute(
    `SELECT token_budget, tokens_used FROM amazon_keepa_daily_budget WHERE budget_date = ? LIMIT 1`,
    [date],
  );
  const row = (rows as Array<{ token_budget?: number | string; tokens_used?: number | string }>)[0];
  const budget = Number(row?.token_budget ?? dailyBudget);
  const used = Number(row?.tokens_used ?? 0);
  return Math.max(0, budget - used);
}

export type KeepaTokenStatus = {
  ok: boolean;
  tokensLeft: number | null;
  refillRate: number | null;
  refillIn: number | null;
  tokensConsumed: number | null;
  tokenFlowReduction: number | null;
  checkedAt: string;
  error?: string;
};

export async function fetchKeepaTokenStatus(): Promise<KeepaTokenStatus> {
  const checkedAt = new Date().toISOString();
  if (!isKeepaConfigured()) {
    return {
      ok: false,
      tokensLeft: null,
      refillRate: null,
      refillIn: null,
      tokensConsumed: null,
      tokenFlowReduction: null,
      checkedAt,
      error: 'KEEPA_NOT_CONFIGURED',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = new URL('https://api.keepa.com/token');
    url.searchParams.set('key', env.KEEPA_API_KEY);
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`KEEPA_TOKEN_STATUS_FAILED_${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    if (data.error) throw new Error('KEEPA_TOKEN_STATUS_ERROR');
    return {
      ok: true,
      tokensLeft: toNullableNumber(data.tokensLeft),
      refillRate: toNullableNumber(data.refillRate),
      refillIn: toNullableNumber(data.refillIn),
      tokensConsumed: toNullableNumber(data.tokensConsumed),
      tokenFlowReduction: toNullableNumber(data.tokenFlowReduction),
      checkedAt,
    };
  } catch (error) {
    return {
      ok: false,
      tokensLeft: null,
      refillRate: null,
      refillIn: null,
      tokensConsumed: null,
      tokenFlowReduction: null,
      checkedAt,
      error: error instanceof Error ? error.message : 'KEEPA_TOKEN_STATUS_UNKNOWN_ERROR',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toNullableNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function consumeDailyTokens(amount: number): Promise<void> {
  if (amount <= 0) return;
  await pool.execute(
    `UPDATE amazon_keepa_daily_budget SET tokens_used = tokens_used + ? WHERE budget_date = ?`,
    [amount, todayUtcDate()],
  );
}

export async function enqueueKeepaAsins(jobId: string, asins: string[]): Promise<number> {
  if (!isKeepaConfigured()) return 0;
  const uniqueAsins = [...new Set(asins.map((asin) => asin.trim()).filter(Boolean))];
  for (const asin of uniqueAsins) {
    await pool.execute(
      `INSERT INTO amazon_keepa_queue (id, job_id, asin, status, retry_count)
       VALUES (?, ?, ?, 'pending', 0)`,
      [randomUUID(), jobId, asin],
    );
  }
  return uniqueAsins.length;
}

export async function processKeepaQueue(limit = 10, jobId?: string): Promise<{ processed: number; skippedByBudget: number }> {
  if (!isKeepaConfigured()) return { processed: 0, skippedByBudget: 0 };
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const [rows] = jobId
    ? await pool.execute(
        `SELECT q.id, q.asin, COALESCE(j.marketplace, 'com') AS marketplace
         FROM amazon_keepa_queue q
         LEFT JOIN amazon_scan_jobs j ON j.id = q.job_id
         WHERE q.status = 'pending' AND q.job_id = ?
         ORDER BY q.created_at ASC
         LIMIT ${safeLimit}`,
        [jobId],
      )
    : await pool.execute(
        `SELECT q.id, q.asin, COALESCE(j.marketplace, 'com') AS marketplace
         FROM amazon_keepa_queue q
         LEFT JOIN amazon_scan_jobs j ON j.id = q.job_id
         WHERE q.status = 'pending'
         ORDER BY q.created_at ASC
         LIMIT ${safeLimit}`,
      );
  const queue = rows as Array<{ id: string; asin: string; marketplace?: string }>;
  if (queue.length === 0) return { processed: 0, skippedByBudget: 0 };

  let remaining = await getRemainingDailyBudget();
  let processed = 0;
  let skippedByBudget = 0;
  for (const item of queue) {
    if (remaining < 1) {
      skippedByBudget += 1;
      continue;
    }
    try {
      const snapshot = await fetchKeepaSnapshot(item.asin, item.marketplace || 'com');
      await saveKeepaSnapshot(snapshot);
      await consumeDailyTokens(1);
      remaining -= 1;
      processed += 1;
      await pool.execute(
        `UPDATE amazon_keepa_queue SET status = 'done', processed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [item.id],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'KEEPA_UNKNOWN_ERROR';
      if (message === 'KEEPA_MARKETPLACE_NOT_SUPPORTED') {
        await pool.execute(
          `UPDATE amazon_keepa_queue SET status = 'done', processed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [item.id],
        );
      } else {
        await pool.execute(
          `UPDATE amazon_keepa_queue
           SET status = 'failed', retry_count = retry_count + 1, last_error = ?, processed_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [message, item.id],
        );
      }
    }
  }

  return { processed, skippedByBudget };
}

export async function fetchKeepaSnapshot(asin: string, marketplace = 'com'): Promise<KeepaSnapshot> {
  if (!isKeepaConfigured()) throw new Error('KEEPA_NOT_CONFIGURED');
  const domainId = keepaDomainId(marketplace);
  if (domainId === null) throw new Error('KEEPA_MARKETPLACE_NOT_SUPPORTED');
  const url = new URL('https://api.keepa.com/product');
  url.searchParams.set('key', env.KEEPA_API_KEY);
  url.searchParams.set('domain', String(domainId));
  url.searchParams.set('asin', asin);
  url.searchParams.set('stats', '90');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`KEEPA_FETCH_FAILED_${res.status}`);
  const data = await res.json() as { products?: Array<{ stats?: { min?: number[]; max?: number[]; avg90?: number[] }; buyBoxSellerIdHistory?: unknown[]; csv?: unknown[] }> };
  const product = data.products?.[0];

  // csv[1] = New price history, csv[12] = New offer count
  const newPriceCsv = product?.csv?.[1];
  const offerCountCsv = product?.csv?.[12];
  const recentPrices = recentValues(newPriceCsv, 90).map((v) => v / 100);
  const recentOffers = recentValues(offerCountCsv, 90);

  return {
    asin,
    marketplace,
    domain_id: domainId,
    price_30d_min: centsToUnit(product?.stats?.min?.[1]),
    price_30d_max: centsToUnit(product?.stats?.max?.[1]),
    price_90d_avg: centsToUnit(product?.stats?.avg90?.[1]),
    buy_box_change_count: product?.buyBoxSellerIdHistory?.length ?? 0,
    seller_count_trend: null,
    price_volatility: computeVolatility(recentPrices),
    offer_count_avg: recentOffers.length > 0 ? Number((recentOffers.reduce((a, b) => a + b, 0) / recentOffers.length).toFixed(1)) : null,
    offer_count_trend: computeTrend(recentOffers),
    stock_history_json: product ?? null,
  };
}

export function keepaDomainId(marketplace = 'com') {
  const normalized = marketplace.toLowerCase().replace(/^amazon\./, '');
  // Only marketplaces Keepa confirmed supports (400 = unsupported → return null)
  const map: Record<string, number> = {
    com: 1,
    'co.uk': 2,
    de: 3,
    fr: 4,
    'co.jp': 5,
    ca: 6,
    it: 8,
    es: 9,
    in: 10,
    'com.mx': 11,
    'com.br': 12,
    'com.au': 13,
    nl: 14,
    pl: 15,
    se: 16,
    sa: 17,
    sg: 18,
    ae: 19,
  };
  return map[normalized] ?? null;
}

function centsToUnit(value: number | undefined) {
  if (typeof value !== 'number' || value < 0) return null;
  return Number((value / 100).toFixed(2));
}

// Keepa CSV format: [keepaMinutes1, value1, keepaMinutes2, value2, ...]
// keepaMinutes is minutes since Jan 21 2011 UTC; -1 = not available
function parseKeepaCsv(csv: unknown): number[] {
  if (!Array.isArray(csv)) return [];
  const values: number[] = [];
  for (let i = 1; i < csv.length; i += 2) {
    const v = csv[i];
    if (typeof v === 'number' && v > 0) values.push(v);
  }
  return values;
}

function keepaMinutesToDate(keepaMin: number): Date {
  return new Date((keepaMin + 21564000) * 60 * 1000);
}

function recentValues(csv: unknown, daysBack = 90): number[] {
  if (!Array.isArray(csv)) return [];
  const cutoffMs = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const values: number[] = [];
  for (let i = 0; i < csv.length - 1; i += 2) {
    const t = csv[i];
    const v = csv[i + 1];
    if (typeof t !== 'number' || typeof v !== 'number' || v <= 0) continue;
    if (keepaMinutesToDate(t).getTime() >= cutoffMs) values.push(v);
  }
  return values;
}

function computeVolatility(values: number[]): number | null {
  if (values.length < 5) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return null;
  const sigma = Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length);
  return Number((sigma / mean).toFixed(4));
}

function computeTrend(values: number[]): 'up' | 'down' | 'flat' | null {
  if (values.length < 6) return null;
  const half = Math.floor(values.length / 2);
  const firstHalfAvg = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondHalfAvg = values.slice(half).reduce((a, b) => a + b, 0) / (values.length - half);
  const ratio = secondHalfAvg / firstHalfAvg;
  if (ratio > 1.1) return 'up';
  if (ratio < 0.9) return 'down';
  return 'flat';
}

export async function saveKeepaSnapshot(snapshot: KeepaSnapshot) {
  await pool.execute(
    `INSERT INTO amazon_keepa_snapshots (
      id, asin, marketplace, keepa_domain_id, price_30d_min, price_30d_max, price_90d_avg,
      buy_box_change_count, seller_count_trend, price_volatility, offer_count_avg, offer_count_trend, stock_history_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      snapshot.asin,
      snapshot.marketplace,
      snapshot.domain_id,
      snapshot.price_30d_min,
      snapshot.price_30d_max,
      snapshot.price_90d_avg,
      snapshot.buy_box_change_count,
      snapshot.seller_count_trend,
      snapshot.price_volatility,
      snapshot.offer_count_avg,
      snapshot.offer_count_trend,
      JSON.stringify(snapshot.stock_history_json ?? null),
    ],
  );
}

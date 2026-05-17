import { isKeepaConfigured, processKeepaQueue } from '@/amazon/keepa.client';
import { scrapeAmazonProductDetail } from '@/amazon/amazon.scraper';
import { env } from '@/core/env';
import { pool } from '@/db/client';
import { createJob } from '@/db/job-store';
import { evaluateThesis } from '@/amazon/thesis.service';
import { randomUUID } from 'node:crypto';

const KEEPA_INTERVAL_MS = 30 * 60 * 1000;
const KEEPA_INITIAL_DELAY_MS = 15_000;
const KEEPA_BATCH_SIZE = 20;

const SELLER_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SELLER_INITIAL_DELAY_MS = 60_000;         // 1 min after server start
// OH.1 — env-configurable; her 2 saatte düşük coverage'lı job parça parça
// hedefe çekilir (Micro plan maliyeti için tek seferde patlama yok).
const SELLER_BATCH_SIZE = env.SELLER_BATCH_SIZE;
const SELLER_POST_SCAN_BATCH = env.SELLER_POST_SCAN_BATCH;
const SELLER_TARGET_COVERAGE = env.SELLER_TARGET_COVERAGE;
const SELLER_MAX_RETRIES = env.SELLER_MAX_RETRIES;
const TRANSIENT_ERR = /\b(429|5\d\d|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up)\b/i;
const AUTH_ERR = /\b(401|403)\b/;
const DAILY_SUMMARY_INTERVAL_MS = 60 * 60 * 1000;
const AUTO_RETRY_INTERVAL_MS = 60 * 60 * 1000;
const THESIS_EVALUATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRYABLE_ERROR_SQL = [
  "error_msg LIKE '%429%'",
  "error_msg LIKE '%500%'",
  "error_msg LIKE '%502%'",
  "error_msg LIKE '%503%'",
  "error_msg LIKE '%504%'",
  "UPPER(error_msg) LIKE '%TIMEOUT%'",
  "UPPER(error_msg) LIKE '%ECONNRESET%'",
].join(' OR ');

async function runKeepaProcessor() {
  if (!isKeepaConfigured()) return;
  try {
    const result = await processKeepaQueue(KEEPA_BATCH_SIZE);
    if (result.processed > 0 || result.skippedByBudget > 0) {
      console.log(`[scheduler] keepa: processed=${result.processed} skipped_budget=${result.skippedByBudget}`);
    }
  } catch (err) {
    console.error('[scheduler] keepa error:', err instanceof Error ? err.message : String(err));
  }
}

async function scrapeWithRetry(
  args: { asin?: string; productUrl: string; marketplace: string },
  marketplace: string,
): Promise<{ detail: Awaited<ReturnType<typeof scrapeAmazonProductDetail>> | null; authError: boolean }> {
  for (let attempt = 0; attempt <= SELLER_MAX_RETRIES; attempt += 1) {
    try {
      const detail = await scrapeAmazonProductDetail(args, marketplace);
      return { detail, authError: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (AUTH_ERR.test(msg)) return { detail: null, authError: true }; // kota/kimlik — dur
      if (attempt < SELLER_MAX_RETRIES && TRANSIENT_ERR.test(msg)) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // sınırlı backoff
        continue;
      }
      return { detail: null, authError: false }; // kalıcı/per-product — atla
    }
  }
  return { detail: null, authError: false };
}

export async function processSellerEnrichmentForJob(jobId: string, marketplace: string, limit = SELLER_BATCH_SIZE): Promise<{ updated: number; attempted: number; aborted: boolean }> {
  const [productRows] = await pool.execute(
    `SELECT id, asin, product_url, seller_name, brand
     FROM amazon_products
     WHERE job_id = ?
       AND product_url IS NOT NULL AND product_url <> ''
       AND ((seller_name IS NULL OR seller_name = '') OR (brand IS NULL OR brand = ''))
     ORDER BY review_count DESC
     LIMIT ${limit}`,
    [jobId],
  );
  const products = productRows as Array<{ id: string; asin: string | null; product_url: string; seller_name: string | null; brand: string | null }>;
  if (!products.length) return { updated: 0, attempted: 0, aborted: false };

  let updated = 0;
  let attempted = 0;
  for (const product of products) {
    attempted += 1;
    const { detail, authError } = await scrapeWithRetry(
      { asin: product.asin ?? undefined, productUrl: product.product_url, marketplace },
      marketplace,
    );
    if (authError) {
      // Oxylabs kota/kimlik hatası — kalan SKU'ları zorlama (maliyet/kota koruması).
      console.error('[scheduler] seller-enrichment aborted: Oxylabs auth/quota error');
      return { updated, attempted, aborted: true };
    }
    if (!detail) continue;
    const sellerName = detail.seller_name ?? detail.buy_box_seller ?? null;
    const brand = detail.brand ?? null;
    if (!sellerName && !brand) continue;
    await pool.execute(
      `UPDATE amazon_products
       SET seller_name = COALESCE(?, seller_name),
           seller_url = COALESCE(?, seller_url),
           brand = COALESCE(?, brand)
       WHERE id = ?`,
      [sellerName, detail.seller_url ?? null, brand, product.id],
    );
    updated += 1;
  }
  return { updated, attempted, aborted: false };
}

async function runSellerEnrichment() {
  if (!env.OXYLABS_USERNAME || !env.OXYLABS_PASSWORD) return;
  try {
    // Find recent done scans with low seller coverage and advance several jobs
    // per tick without exceeding the configured per-job batch.
    const [jobRows] = await pool.execute(`
      SELECT j.id, j.marketplace
      FROM amazon_scan_jobs j
      WHERE j.status = 'done'
        AND j.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND (
          SELECT COUNT(*) FROM amazon_products p
          WHERE p.job_id = j.id
            AND p.seller_name IS NOT NULL AND p.seller_name <> ''
        ) * 1.0 / NULLIF(j.data_points, 0) < ${SELLER_TARGET_COVERAGE}
      ORDER BY j.created_at DESC
      LIMIT 3
    `);
    const jobs = jobRows as Array<{ id: string; marketplace: string }>;
    if (!jobs.length) return;

    let totalUpdated = 0;
    let totalAttempted = 0;
    for (const job of jobs) {
      const { updated, attempted, aborted } = await processSellerEnrichmentForJob(job.id, job.marketplace, SELLER_BATCH_SIZE);
      totalUpdated += updated;
      totalAttempted += attempted;
      if (updated > 0 || attempted > 0 || aborted) {
        console.log(`[scheduler] seller-enrichment: job=${job.id.slice(0, 8)} updated=${updated}/${attempted}${aborted ? ' (ABORTED: Oxylabs auth/quota)' : ''}`);
      }
      if (aborted) {
        await createSchedulerNote(
          'Oxylabs seller enrichment durdu',
          `Seller enrichment Oxylabs auth/kota hatası nedeniyle durdu. Son job=${job.id}, denenen istek=${attempted}.`,
          '/settings',
        ).catch(() => undefined);
        break;
      }
    }
    if (totalAttempted > 0) {
      console.log(`[scheduler] seller-enrichment usage: estimated_oxylabs_requests=${totalAttempted} updated=${totalUpdated}`);
    }
  } catch (err) {
    console.error('[scheduler] seller-enrichment error:', err instanceof Error ? err.message : String(err));
  }
}

async function runDailySummary() {
  try {
    const [existingRows] = await pool.execute(
      `SELECT id FROM amazon_developer_notes
       WHERE subject = ? AND created_at >= CURDATE()
       LIMIT 1`,
      ['Günlük operasyon özeti'],
    );
    if ((existingRows as unknown[]).length) return;

    const [scanRows] = await pool.execute(
      `SELECT
         COUNT(*) AS scans,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM amazon_scan_jobs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    );
    const [keepaRows] = await pool.execute(
      `SELECT COUNT(*) AS keepa_snapshots
       FROM amazon_keepa_snapshots
       WHERE fetched_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    );
    const [llmRows] = await pool.execute(
      `SELECT COUNT(*) AS llm_reports
       FROM amazon_risk_scores
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND enrichment IS NOT NULL
         AND JSON_EXTRACT(enrichment, '$.llm_applied') = true`,
    );

    const scans = (scanRows as Array<Record<string, unknown>>)[0] ?? {};
    const keepa = (keepaRows as Array<Record<string, unknown>>)[0] ?? {};
    const llm = (llmRows as Array<Record<string, unknown>>)[0] ?? {};
    const body = [
      `Son 24 saat: ${Number(scans.scans || 0)} tarama, ${Number(scans.failed || 0)} hata.`,
      `${Number(keepa.keepa_snapshots || 0)} Keepa snapshot işlendi.`,
      `${Number(llm.llm_reports || 0)} LLM enrichment kaydı bulundu.`,
    ].join('\n');

    await pool.execute(
      `INSERT INTO amazon_developer_notes
         (id, subject, body, priority, status, page_path, created_by)
       VALUES (?, ?, ?, 'normal', 'open', '/settings', 'scheduler')`,
      [randomUUID(), 'Günlük operasyon özeti', body],
    );
    console.log('[scheduler] daily summary developer note created');
  } catch (err) {
    console.error('[scheduler] daily-summary error:', err instanceof Error ? err.message : String(err));
  }
}

async function createSchedulerNote(subject: string, body: string, pagePath = '/scans') {
  await pool.execute(
    `INSERT INTO amazon_developer_notes
       (id, subject, body, priority, status, page_path, created_by)
     VALUES (?, ?, ?, 'normal', 'open', ?, 'scheduler')`,
    [randomUUID(), subject, body, pagePath],
  );
}

export async function runAutoRetryFailedScans() {
  return runAutoRetryFailedScansWithDeps({
    createJobFn: createJob,
    runAmazonJobFn: async (jobId: string) => {
      const { runAmazonJob } = await import('@/amazon/amazon.job');
      return runAmazonJob(jobId);
    },
  });
}

export async function runAutoRetryFailedScansWithDeps(deps: {
  createJobFn: typeof createJob;
  runAmazonJobFn: (jobId: string) => Promise<unknown>;
}) {
  try {
    const [rows] = await pool.execute(
      `SELECT j.id, j.keyword, j.marketplace, j.error_msg, j.created_at,
         (
           SELECT COUNT(*)
           FROM amazon_scan_jobs attempts
           WHERE attempts.keyword = j.keyword
             AND attempts.marketplace = j.marketplace
             AND attempts.created_at >= j.created_at
         ) AS attempt_count,
         EXISTS (
           SELECT 1
           FROM amazon_scan_jobs newer
           WHERE newer.keyword = j.keyword
             AND newer.marketplace = j.marketplace
             AND newer.created_at > j.created_at
             AND newer.status IN ('pending', 'running', 'enriching', 'done')
         ) AS has_newer_active
       FROM amazon_scan_jobs j
       WHERE j.status = 'failed'
         AND j.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND (${RETRYABLE_ERROR_SQL})
       ORDER BY j.created_at ASC
       LIMIT 5`,
    );
    const jobs = rows as Array<{ id: string; keyword: string; marketplace: string; error_msg: string | null; attempt_count: number | string; has_newer_active: number | string }>;
    if (!jobs.length) return { retried: 0 };

    let retried = 0;
    for (const job of jobs) {
      if (Number(job.has_newer_active || 0) > 0) continue;
      if (Number(job.attempt_count || 1) > 2) continue;
      const retryJob = await deps.createJobFn(job.keyword, job.marketplace);
      retried += 1;
      await createSchedulerNote(
        'Geçici hata için otomatik retry',
        `Scan ${job.id} geçici hata aldı (${job.error_msg || 'hata yok'}). Yeni retry job: ${retryJob.id}.`,
        '/scans',
      ).catch(() => undefined);
      await deps.runAmazonJobFn(retryJob.id);
    }
    return { retried };
  } catch (err) {
    console.error('[scheduler] auto-retry error:', err instanceof Error ? err.message : String(err));
    return { retried: 0 };
  }
}

export async function runThesisReevaluation() {
  return runThesisReevaluationWithDeps({
    createJobFn: createJob,
    runAmazonJobFn: async (jobId: string) => {
      const { runAmazonJob } = await import('@/amazon/amazon.job');
      return runAmazonJob(jobId);
    },
    evaluateThesisFn: evaluateThesis,
  });
}

export async function runThesisReevaluationWithDeps(deps: {
  createJobFn: typeof createJob;
  runAmazonJobFn: (jobId: string) => Promise<unknown>;
  evaluateThesisFn: typeof evaluateThesis;
}) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, keyword, marketplace, status
       FROM amazon_theses
       WHERE status = 'active'
         AND (last_evaluated_at IS NULL OR last_evaluated_at < DATE_SUB(NOW(), INTERVAL ${env.THESIS_STALE_DAYS} DAY))
       ORDER BY COALESCE(last_evaluated_at, created_at) ASC
       LIMIT 3`,
    );
    const theses = rows as Array<{ id: string; keyword: string; marketplace: string; status: string }>;
    if (!theses.length) return { evaluated: 0, changed: 0 };

    let evaluated = 0;
    let changed = 0;
    for (const thesis of theses) {
      const scanJob = await deps.createJobFn(thesis.keyword, thesis.marketplace);
      await deps.runAmazonJobFn(scanJob.id);
      const updated = await deps.evaluateThesisFn(thesis.id) as { status?: string; weakness_note?: string | null } | null;
      evaluated += 1;
      if (updated?.status && updated.status !== thesis.status) {
        changed += 1;
        await createSchedulerNote(
          `Tez ${updated.status === 'broken' ? 'bozuldu' : 'zayıfladı'}`,
          `Tez ${thesis.id} otomatik yeniden değerlendirme sonrası ${updated.status} durumuna geçti. ${updated.weakness_note || ''}`.trim(),
          '/theses',
        ).catch(() => undefined);
      }
    }
    return { evaluated, changed };
  } catch (err) {
    console.error('[scheduler] thesis re-evaluation error:', err instanceof Error ? err.message : String(err));
    return { evaluated: 0, changed: 0 };
  }
}

export function startScheduler() {
  setTimeout(runKeepaProcessor, KEEPA_INITIAL_DELAY_MS);
  setInterval(runKeepaProcessor, KEEPA_INTERVAL_MS);
  console.log('[scheduler] keepa queue processor active (30 min interval)');

  setTimeout(runSellerEnrichment, SELLER_INITIAL_DELAY_MS);
  setInterval(runSellerEnrichment, SELLER_INTERVAL_MS);
  console.log('[scheduler] seller enrichment active (2 hour interval)');

  setTimeout(runDailySummary, 90_000);
  setInterval(runDailySummary, DAILY_SUMMARY_INTERVAL_MS);
  console.log('[scheduler] daily summary active (hourly guard)');

  setTimeout(runAutoRetryFailedScans, 120_000);
  setInterval(runAutoRetryFailedScans, AUTO_RETRY_INTERVAL_MS);
  console.log('[scheduler] auto retry active (1 hour interval)');

  setTimeout(runThesisReevaluation, 180_000);
  setInterval(runThesisReevaluation, THESIS_EVALUATION_INTERVAL_MS);
  console.log('[scheduler] thesis re-evaluation active (daily interval)');
}

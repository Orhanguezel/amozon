import { randomUUID } from 'node:crypto';
import { pool } from '@/db/client';
import { getJob, markJobRunning, markJobEnriching, markJobDone, markJobFailed } from '@/db/job-store';
import { analyzeProductReviews } from './review.analyzer';
import { scrapeAmazonProducts, type AmazonFilters } from './amazon.scraper';
import type { AmazonProduct } from './amazon.scraper';
import { filterEligibleProducts, deduplicateByAsin } from './signal.validator';
import { scoreAmazonCategory } from './amazon.scoring-engine';
import { enrichReportWithLLM } from './llm-enrichment';
import { calculateCategoryStats, upsertAmazonCategoryStats } from './category.normalizer';
import { enqueueKeepaAsins, processKeepaQueue, isKeepaConfigured } from './keepa.client';
import type { KeepaSnapshot } from './keepa.client';
import { generateKeywordVariations } from './keyword-variation.service';
import { getConfidenceThresholds, getScraperConfig } from './scoring.config';
import type { AmazonRiskReport } from './amazon.types';
import { env } from '@/core/env';
import { processSellerEnrichmentForJob } from '@/scheduler';

interface AmazonJobParams extends AmazonFilters {
  keyword?: string;
  marketplace?: string;
}

const SCRAPE_MAX_ATTEMPTS = 3;
const SCRAPE_RETRY_DELAY_MS = Number(process.env.AMAZON_SCRAPE_RETRY_DELAY_MS ?? 0);

function extractAsin(productUrl?: string | null) {
  return productUrl?.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ?? null;
}

async function saveAmazonProducts(jobId: string, products: AmazonProduct[]) {
  for (const product of products) {
    await pool.execute(
      `INSERT INTO amazon_products (
        id, job_id, title, brand, price, rating, review_count, seller_name, seller_url, product_url, asin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), jobId,
        product.product_title,
        product.brand ?? null,
        product.price ?? null,
        product.rating ?? null,
        product.review_count ?? 0,
        product.seller_name ?? null,
        product.seller_url ?? null,
        product.product_url ?? null,
        extractAsin(product.product_url),
      ],
    );
  }
}

async function saveRiskScore(jobId: string, report: AmazonRiskReport) {
  const id = randomUUID();
  await pool.execute(
    `INSERT INTO amazon_risk_scores (
      id, job_id, keyword,
      category_risk_score, category_risk_confidence, category_risk_reason,
      sku_chaos_score, sku_chaos_confidence, sku_chaos_reason,
      price_war_score, price_war_confidence, price_war_reason,
      brand_reliability_score, brand_reliability_confidence, brand_reliability_reason,
      operational_risk_score, operational_risk_confidence, operational_risk_reason,
      composite_score, decision, summary, data_points,
      data_quality, decision_surface, sku_decisions,
      outreach_priority, persuasion_points, brand_id, brand_name, enrichment
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, jobId, report.keyword,
      report.scores.category_risk.score,     report.scores.category_risk.confidence,    report.scores.category_risk.reason,
      report.scores.sku_chaos.score,         report.scores.sku_chaos.confidence,         report.scores.sku_chaos.reason,
      report.scores.price_war_risk.score,    report.scores.price_war_risk.confidence,    report.scores.price_war_risk.reason,
      report.scores.brand_reliability.score, report.scores.brand_reliability.confidence, report.scores.brand_reliability.reason,
      report.scores.operational_risk.score,  report.scores.operational_risk.confidence,  report.scores.operational_risk.reason,
      report.composite_score, report.decision, report.summary, report.data_points,
      JSON.stringify(report.data_quality),
      JSON.stringify(report.decision_surface),
      JSON.stringify(report.sku_decisions),
      report.outreach_priority,
      JSON.stringify(report.persuasion_points),
      null,
      report.brand_context.brand_name,
      JSON.stringify({
        ...(report.enrichment ?? {}),
        insufficient_data_reason: report.insufficient_data_reason ?? null,
      }),
    ],
  );
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getKeepaSnapshots(asins: string[], marketplace: string): Promise<KeepaSnapshot[]> {
  const unique = [...new Set(asins.filter(Boolean))];
  if (!unique.length) return [];
  const placeholders = unique.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT asin, marketplace, keepa_domain_id AS domain_id,
            price_30d_min, price_30d_max, price_90d_avg,
            buy_box_change_count, seller_count_trend,
            price_volatility, offer_count_avg, offer_count_trend,
            stock_history_json
     FROM amazon_keepa_snapshots
     WHERE asin IN (${placeholders}) AND marketplace = ?`,
    [...unique, marketplace],
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    asin: String(row.asin),
    marketplace: String(row.marketplace),
    domain_id: Number(row.domain_id),
    price_30d_min: toNumberOrNull(row.price_30d_min),
    price_30d_max: toNumberOrNull(row.price_30d_max),
    price_90d_avg: toNumberOrNull(row.price_90d_avg),
    buy_box_change_count: Number(row.buy_box_change_count ?? 0),
    seller_count_trend: (row.seller_count_trend as KeepaSnapshot['seller_count_trend']) ?? null,
    price_volatility: toNumberOrNull(row.price_volatility),
    offer_count_avg: toNumberOrNull(row.offer_count_avg),
    offer_count_trend: (row.offer_count_trend as KeepaSnapshot['offer_count_trend']) ?? null,
    stock_history_json: row.stock_history_json ?? null,
  }));
}

async function logJobError(jobId: string, errorMessage: string): Promise<void> {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM amazon_job_error_logs WHERE job_id = ?`,
    [jobId],
  );
  const previous = Number((rows as Array<{ count?: number | string }>)[0]?.count ?? 0);
  const errorType = errorMessage.split(':')[0].slice(0, 100) || 'UNKNOWN_ERROR';
  await pool.execute(
    `INSERT INTO amazon_job_error_logs (id, job_id, error_type, error_msg, retry_count) VALUES (?, ?, ?, ?, ?)`,
    [randomUUID(), jobId, errorType, errorMessage, previous + 1],
  );
}

function isRetryableScrapeError(errorMessage: string) {
  const normalized = errorMessage.toUpperCase();
  return (
    normalized.includes('429')
    || normalized.includes('500')
    || normalized.includes('502')
    || normalized.includes('503')
    || normalized.includes('504')
    || normalized.includes('TIMEOUT')
    || normalized.includes('ECONNRESET')
  );
}

async function waitForRetry() {
  if (!Number.isFinite(SCRAPE_RETRY_DELAY_MS) || SCRAPE_RETRY_DELAY_MS <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, SCRAPE_RETRY_DELAY_MS));
}

async function scrapeAmazonProductsWithRetry(keyword: string, marketplace: string, params: AmazonJobParams, pages?: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SCRAPE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await scrapeAmazonProducts(keyword, marketplace, params, pages);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= SCRAPE_MAX_ATTEMPTS || !isRetryableScrapeError(message)) break;
      await waitForRetry();
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'OXYLABS_SCRAPE_FAILED'));
}

async function collectAmazonProducts(keyword: string, marketplace: string, params: AmazonJobParams) {
  const scraperConfig = getScraperConfig();
  const thresholds = getConfidenceThresholds();
  const collected: AmazonProduct[] = [];
  const recoveryKeywords: string[] = [];

  collected.push(...await scrapeAmazonProductsWithRetry(keyword, marketplace, params, scraperConfig.SEARCH_PAGES));
  let eligible = filterEligibleProducts(deduplicateByAsin(collected));

  if (scraperConfig.RECOVERY_ENABLED && eligible.length <= thresholds.LOW_MAX) {
    const wider = await scrapeAmazonProductsWithRetry(keyword, marketplace, params, scraperConfig.RECOVERY_PAGES);
    collected.push(...wider);
    eligible = filterEligibleProducts(deduplicateByAsin(collected));
  }

  if (scraperConfig.RECOVERY_ENABLED && eligible.length <= thresholds.LOW_MAX) {
    const variations = await generateKeywordVariations(keyword, scraperConfig.RECOVERY_VARIATION_COUNT);
    for (const variation of variations) {
      recoveryKeywords.push(variation);
      const products = await scrapeAmazonProductsWithRetry(variation, marketplace, params, scraperConfig.RECOVERY_PAGES);
      collected.push(...products);
      eligible = filterEligibleProducts(deduplicateByAsin(collected));
      if (eligible.length > thresholds.LOW_MAX) break;
    }
  }

  return {
    allProducts: collected,
    deduped: deduplicateByAsin(collected),
    eligible,
    recoveryKeywords,
  };
}

export async function runAmazonJob(jobId: string) {
  const job = await getJob(jobId);
  if (!job) throw new Error('JOB_NOT_FOUND');

  const keyword = job.keyword;
  const marketplace = job.marketplace;
  const params = {} as AmazonJobParams;

  await markJobRunning(jobId);

  try {
    const { allProducts, eligible, recoveryKeywords } = await collectAmazonProducts(keyword, marketplace, params);
    await saveAmazonProducts(jobId, eligible);
    await markJobEnriching(jobId, eligible.length);

    const categoryStats = calculateCategoryStats(keyword, marketplace, eligible);
    await upsertAmazonCategoryStats(categoryStats);

    const page1Prices = allProducts.slice(0, 10).map(p => p.price).filter((p): p is number => typeof p === 'number');
    const page3Prices = allProducts.slice(20, 30).map(p => p.price).filter((p): p is number => typeof p === 'number');
    const pageOneAvg   = page1Prices.length ? page1Prices.reduce((a, b) => a + b, 0) / page1Prices.length : null;
    const pageThreeAvg = page3Prices.length ? page3Prices.reduce((a, b) => a + b, 0) / page3Prices.length : null;

    const firstWithUrl = eligible.find(p => p.product_url);
    const reviewAnalysis = firstWithUrl?.product_url
      ? await analyzeProductReviews(firstWithUrl.product_url, marketplace).catch(() => ({ problem_flags: [], problem_score: 0, ai_summary: '' }))
      : { problem_flags: [], problem_score: 0, ai_summary: '' };
    const asins = eligible.map(p => extractAsin(p.product_url)).filter(Boolean) as string[];

    // Pre-score Keepa enrichment: fetch up to 15 ASINs synchronously so the saved score reflects Keepa signals
    if (isKeepaConfigured() && asins.length > 0) {
      try {
        const topAsins = asins.slice(0, 15);
        await enqueueKeepaAsins(jobId, topAsins);
        await processKeepaQueue(15, jobId);
      } catch (keepaErr) {
        const msg = keepaErr instanceof Error ? keepaErr.message : 'KEEPA_PRESCORE_FAILED';
        try { await logJobError(jobId, `keepa-prescore: ${msg}`); } catch { /* non-blocking */ }
      }
    }

    const keepaSnapshots = await getKeepaSnapshots(asins, marketplace);
    const keepaAsinSet = new Set(keepaSnapshots.map(s => s.asin));

    const report = scoreAmazonCategory({
      keyword,
      marketplace,
      products: eligible,
      keepaAsinSet,
      keepaSnapshots,
      pageOneAveragePrice: pageOneAvg,
      pageThreeAveragePrice: pageThreeAvg,
      reviewProblemScore: reviewAnalysis.problem_score,
      reviewProblemFlags: reviewAnalysis.problem_flags,
    });
    report.enrichment = {
      ...(report.enrichment ?? {}),
      recovery_keywords: recoveryKeywords,
      recovery_used: recoveryKeywords.length > 0,
    };

    const finalReport = await enrichReportWithLLM(report);
    await saveRiskScore(jobId, finalReport);

    const postScanTasks: Array<Promise<unknown>> = [];
    if (env.OXYLABS_USERNAME && env.OXYLABS_PASSWORD) {
      postScanTasks.push(processSellerEnrichmentForJob(jobId, marketplace, 20)
        .then(({ updated, attempted }) => {
          if (updated > 0) console.log(`[job] seller enrichment: job=${jobId.slice(0, 8)} updated=${updated}/${attempted}`);
        }));
    }
    if (isKeepaConfigured() && asins.length > 15) {
      postScanTasks.push(enqueueKeepaAsins(jobId, asins.slice(15, 30))
        .then(() => processKeepaQueue(15, jobId))
        .then(({ processed }) => {
          if (processed > 0) console.log(`[job] keepa enrichment: job=${jobId.slice(0, 8)} processed=${processed}`);
        }));
    }
    if (postScanTasks.length > 0) {
      await markJobEnriching(jobId, report.data_points);
      await Promise.all(postScanTasks.map((task) => task.catch((error) => {
        const msg = error instanceof Error ? error.message : 'POST_SCAN_ENRICHMENT_FAILED';
        return logJobError(jobId, msg).catch(() => undefined);
      })));
    }
    await markJobDone(jobId, report.data_points);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN_ERROR';
    try { await logJobError(jobId, msg); } catch { /* log hatası ana akışı engellemez */ }
    await markJobFailed(jobId, msg);
  }
}

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createJob } from '@/db/job-store';
import { pool } from '@/db/client';
import { env } from '@/core/env';
import { runAmazonJob } from '@/amazon/amazon.job';
import { getLatestAmazonRiskReport } from '@/amazon/risk-report.service';
import { buildActionDistribution, buildDataGate, buildDataQuality, buildDecisionSurface, buildSkuDecisions } from '@/amazon/amazon.scoring-engine';
import { withScanAge } from '@/amazon/data-quality-age';
import { closeThesis, createThesis, evaluateThesis, listTheses } from '@/amazon/thesis.service';
import { buildPriorityView } from '@/amazon/priority-view';
import { deriveRiskBadges } from '@/amazon/risk-badges';
import { riskBadgeStatsFromProducts } from '@/amazon/risk-badge-stats';
import type { SkuDecision } from '@/amazon/amazon.types';
import { calculateCategoryStats, normalizeProducts } from '@/amazon/category.normalizer';
import { scoreSkuChaos } from '@/amazon/scorers/sku-chaos.scorer';
import type { AmazonRiskReport, Confidence } from '@/amazon/amazon.types';
import { getCompositeWeights, getConfidenceThresholds, getDecisionThresholds, getFilterConfig, getScraperConfig } from '@/amazon/scoring.config';
import { generateKeywordVariations } from '@/amazon/keyword-variation.service';
import { enqueueKeepaAsins, fetchKeepaTokenStatus, isKeepaConfigured, processKeepaQueue } from '@/amazon/keepa.client';
import type { KeepaSnapshot } from '@/amazon/keepa.client';
import { computeKeepaContributions } from '@/amazon/keepa.contributions';
import { scrapeAmazonProductDetail } from '@/amazon/amazon.scraper';
import { startScheduler } from '@/scheduler';

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

const DEFAULT_KEYWORDS = [
  'thermal labels',
  'cable organizer',
  'surge protector',
  'dash cam',
  'webcam lighting',
];

const EDITABLE_ENV_KEYS = [
  'OXYLABS_USERNAME',
  'OXYLABS_PASSWORD',
  'KEEPA_API_KEY',
  'KEEPA_DAILY_TOKEN_BUDGET',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'SCORING_WEIGHT_CATEGORY_RISK',
  'SCORING_WEIGHT_PRICE_WAR_RISK',
  'SCORING_WEIGHT_SKU_CHAOS',
  'SCORING_WEIGHT_BRAND_RELIABILITY',
  'SCORING_WEIGHT_OPERATIONAL_RISK',
  'SCORING_THRESHOLD_GUVENLI_MAX',
  'SCORING_THRESHOLD_DIKKATLI_OL_MAX',
  'CONFIDENCE_INSUFFICIENT_DATA_MAX',
  'CONFIDENCE_LOW_MAX',
  'CONFIDENCE_MEDIUM_MAX',
  'FILTER_MIN_REVIEW_COUNT',
  'AMAZON_SEARCH_PAGES',
  'AMAZON_RECOVERY_ENABLED',
  'AMAZON_RECOVERY_PAGES',
  'AMAZON_RECOVERY_VARIATION_COUNT',
  'AMAZON_SCRAPER_REVIEW_MIN',
  'AMAZON_SCRAPER_REVIEW_MAX',
  'AMAZON_SCRAPER_RATING_MIN',
  'AMAZON_SCRAPER_RATING_MAX',
  'REQUIRE_PRICE_DATA',
];

function envPath() {
  return join(process.cwd(), '.env');
}

function uploadsDir() {
  return join(process.cwd(), 'uploads', 'developer-notes');
}

async function updateEnvFile(updates: Record<string, string>) {
  const current = await readFile(envPath(), 'utf8').catch(() => '');
  const lines = current.split(/\r?\n/);
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) return line;
    const key = match[1];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
  }

  await writeFile(envPath(), `${next.join('\n').replace(/\n*$/, '')}\n`);
}

function applyRuntimeEnv(updates: Record<string, string>) {
  for (const [key, value] of Object.entries(updates)) process.env[key] = value;
  env.OXYLABS_USERNAME = process.env.OXYLABS_USERNAME || '';
  env.OXYLABS_PASSWORD = process.env.OXYLABS_PASSWORD || '';
  env.KEEPA_API_KEY = process.env.KEEPA_API_KEY || '';
  env.GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  env.KEEPA_DAILY_TOKEN_BUDGET = Number.parseInt(process.env.KEEPA_DAILY_TOKEN_BUDGET || '1000', 10) || 1000;
}

function json(data: JsonValue, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
      ...(init.headers ?? {}),
    },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function uploadContentType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function uploadExtension(type: string, name: string) {
  const lower = `${type} ${name}`.toLowerCase();
  if (lower.includes('png')) return '.png';
  if (lower.includes('webp')) return '.webp';
  if (lower.includes('gif')) return '.gif';
  if (lower.includes('jpeg') || lower.includes('jpg')) return '.jpg';
  return '';
}

async function saveUploadedImage(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return null;
  if (!file.type.startsWith('image/')) throw new Error('ONLY_IMAGE_UPLOAD_ALLOWED');
  if (file.size > 6 * 1024 * 1024) throw new Error('IMAGE_UPLOAD_TOO_LARGE');
  const extension = uploadExtension(file.type, file.name);
  if (!extension) throw new Error('UNSUPPORTED_IMAGE_TYPE');
  const fileName = `${randomUUID()}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await mkdir(uploadsDir(), { recursive: true });
  await writeFile(join(uploadsDir(), fileName), buffer);
  return {
    fileName,
    url: `/api/uploads/${fileName}`,
    size: file.size,
    type: file.type,
  };
}

async function ensureDefaultKeywords() {
  await pool.execute(
    `INSERT IGNORE INTO amazon_keywords (id, keyword, marketplace) VALUES
      (?, ?, 'com'),
      (?, ?, 'com'),
      (?, ?, 'com'),
      (?, ?, 'com'),
      (?, ?, 'com')`,
    DEFAULT_KEYWORDS.flatMap((keyword) => [randomUUID(), keyword]),
  );
}

async function listKeywords(options: { q?: string; limit?: number; offset?: number } = {}) {
  await ensureDefaultKeywords();
  const q = String(options.q || '').trim();
  const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
  const offset = Math.max(Number(options.offset || 0), 0);
  const where = q ? 'WHERE keyword LIKE ? OR marketplace LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`] : [];
  const [rows] = await pool.execute(
    `SELECT id, keyword, marketplace, created_at, updated_at
     FROM amazon_keywords
     ${where}
     ORDER BY keyword ASC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM amazon_keywords ${where}`,
    params,
  );
  const total = Number((countRows as Array<{ total?: number | string }>)[0]?.total ?? 0);
  return { rows: rows as Array<Record<string, unknown>>, total, limit, offset };
}

async function isAllowedKeyword(keyword: string) {
  const [rows] = await pool.execute(
    `SELECT id FROM amazon_keywords WHERE keyword = ? LIMIT 1`,
    [keyword],
  );
  return (rows as unknown[]).length > 0;
}

async function findScanJob(jobId: string) {
  const [rows] = await pool.execute(
    `SELECT id, keyword, marketplace, status, created_at FROM amazon_scan_jobs WHERE id = ? LIMIT 1`,
    [jobId],
  );
  return (rows as Array<{ id: string; keyword: string; marketplace: string; status: string; created_at?: string }>)[0] ?? null;
}

async function listScans(options: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(Number(options.limit ?? 50), 1), 200);
  const offset = Math.max(Number(options.offset ?? 0), 0);
  const filterSql = `WHERE NOT (
       asj.status = 'failed'
       AND EXISTS (
         SELECT 1
         FROM amazon_scan_jobs newer
         WHERE newer.keyword = asj.keyword
           AND newer.marketplace = asj.marketplace
           AND newer.status = 'done'
           AND newer.created_at > asj.created_at
       )
     )`;

  // OH.6 — Önce ince tabloda (JSON yok) sırala+sayfala, sonra ağır JSON
  // kolonlarını yalnızca sayfadaki satırlara join et. Aksi halde MySQL
  // büyük decision_surface/data_quality JSON'larını filesort'a alıp
  // sort_buffer'ı taşırıyor ("Out of sort memory"). Davranış aynıdır.
  const [rows] = await pool.execute(
    `SELECT
       asj.id, asj.keyword, asj.marketplace, asj.status, asj.data_points, asj.error_msg,
       asj.created_at, asj.finished_at,
       ars.composite_score, ars.decision, ars.decision_surface, ars.data_quality
     FROM (
       SELECT id, keyword, marketplace, status, data_points, error_msg, created_at, finished_at
       FROM amazon_scan_jobs asj
       ${filterSql}
       ORDER BY asj.created_at DESC
       LIMIT ${limit} OFFSET ${offset}
     ) asj
     LEFT JOIN amazon_risk_scores ars ON ars.job_id = asj.id
     ORDER BY asj.created_at DESC`,
  );
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM amazon_scan_jobs asj ${filterSql}`,
  );
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);
  const scans = (rows as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    decision_surface: parseJsonObject(row.decision_surface),
    data_quality: withScanAge(parseJsonObject(row.data_quality), row.created_at),
  }));
  return { scans, total, limit, offset };
}

async function getScan(jobId: string) {
  const [scanRows] = await pool.execute(
    `SELECT
       asj.id, asj.keyword, asj.marketplace, asj.status, asj.data_points, asj.error_msg,
       asj.created_at, asj.finished_at,
       ars.composite_score, ars.decision, ars.decision_surface, ars.data_quality
     FROM amazon_scan_jobs asj
     LEFT JOIN amazon_risk_scores ars ON ars.job_id = asj.id
     WHERE asj.id = ?
     LIMIT 1`,
    [jobId],
  );
  const row = (scanRows as Record<string, unknown>[])[0];
  if (!row) return null;

  const scan: Record<string, unknown> & {
    decision_surface: Record<string, unknown> | null;
    data_quality: (Record<string, unknown> & { scan_age_days: number | null }) | null;
  } = {
    ...row,
    decision_surface: parseJsonObject(row.decision_surface),
    data_quality: withScanAge(parseJsonObject(row.data_quality), row.created_at),
  };

  const [riskRows] = await pool.execute(
    `SELECT * FROM amazon_risk_scores WHERE job_id = ? ORDER BY created_at DESC LIMIT 1`,
    [jobId],
  );
  const [products] = await pool.execute(
    `SELECT id, title, price, rating, review_count, seller_name, asin, product_url
     FROM amazon_products
     WHERE job_id = ?
     ORDER BY review_count DESC
     LIMIT 500`,
    [jobId],
  );
  const [keepaRows] = await pool.execute(
    `SELECT
       aks.asin,
       aks.price_30d_min,
       aks.price_30d_max,
       aks.price_90d_avg,
       aks.buy_box_change_count,
       aks.seller_count_trend
     FROM amazon_keepa_snapshots aks
     WHERE aks.asin IN (
       SELECT ap.asin FROM amazon_products ap WHERE ap.job_id = ? AND ap.asin IS NOT NULL
     )
       AND aks.marketplace = ?
     ORDER BY aks.fetched_at DESC
     LIMIT 20`,
    [jobId, String(scan.marketplace || 'com')],
  );
  const keepaTrend = buildKeepaTrend(keepaRows as Array<Record<string, unknown>>, String(scan.marketplace || 'com'));
  const risk = (riskRows as Record<string, unknown>[])[0] ?? null;
  const enrichment = parseJsonObject(risk?.enrichment);
  const keepaAsinSet = new Set((keepaRows as Array<Record<string, unknown>>).map((row) => String(row.asin || '')).filter(Boolean));
  const productRows = products as Array<Record<string, unknown>>;
  const fallbackProducts = productRows.map((product) => ({
    product_title: String(product.title || ''),
    price: numberOrUndefined(product.price),
    rating: numberOrUndefined(product.rating),
    review_count: Number(product.review_count || 0),
    seller_name: typeof product.seller_name === 'string' ? product.seller_name : undefined,
    product_url: typeof product.product_url === 'string' ? product.product_url : undefined,
  }));
  const fallbackDataQuality = buildDataQuality(fallbackProducts, keepaAsinSet);
  const priceMedian = median(fallbackProducts.map((product) => product.price).filter((price): price is number => typeof price === 'number'));
  const fallbackSkuDecisions = buildSkuDecisions(fallbackProducts, keepaAsinSet, priceMedian);
  const fallbackActionDistribution = buildActionDistribution(fallbackSkuDecisions);
  const fallbackDataGate = buildDataGate(fallbackDataQuality, fallbackActionDistribution, false);
  const fallbackDecisionSurface = risk ? buildDecisionSurface(
    riskScoresFromRow(risk),
    normalizeDecision(risk.decision),
    fallbackDataQuality,
    risk.composite_score === null || risk.composite_score === undefined ? null : Number(risk.composite_score),
    fallbackActionDistribution,
    fallbackDataGate,
  ) : null;
  const parsedDataQuality = risk ? withScanAge(fallbackDataQuality, scan.created_at) : null;
  const parsedSkuDecisions = risk ? fallbackSkuDecisions : null;
  const parsedActionDistribution = parsedSkuDecisions ? buildActionDistribution(parsedSkuDecisions as ReturnType<typeof buildSkuDecisions>) : fallbackActionDistribution;
  const parsedDataGate = parsedDataQuality ? buildDataGate(parsedDataQuality as AmazonRiskReport['data_quality'], parsedActionDistribution, false) : fallbackDataGate;
  const parsedDecisionSurface = risk ? mergeDecisionSurface(
    parseJsonObject(risk.decision_surface),
    fallbackDecisionSurface,
    normalizeDecision(risk.decision),
    parsedActionDistribution,
    parsedDataGate,
  ) : null;
  const badgeStats = riskBadgeStatsFromProducts(
    fallbackProducts,
    String(scan.keyword || ''),
    String(scan.marketplace || 'com'),
  );
  const decoratedSurface: Record<string, unknown> | null = parsedDecisionSurface ? {
    ...parsedDecisionSurface,
    priority_view: parsedDecisionSurface.priority_view ?? (parsedSkuDecisions ? buildPriorityView(parsedSkuDecisions as ReturnType<typeof buildSkuDecisions>) : undefined),
    // Risk badge'leri her zaman yeniden türetilir (saf görünürlük katmanı):
    // persist edilmiş eski kopya, güncellenmiş açıklama/eşikleri gölgelememeli.
    risk_badges: deriveRiskBadges(
      riskScoresFromRow(risk ?? {}),
      parsedDataQuality ?? fallbackDataQuality,
      badgeStats,
    ),
  } : null;

  return {
    scan,
    risk: risk ? {
      ...risk,
      data_quality: parsedDataQuality,
      decision_surface: decoratedSurface,
      sku_decisions: parsedSkuDecisions,
      insufficient_data_reason: buildDataIssueReason(parsedDataQuality, decoratedSurface?.data_gate) ?? enrichment?.insufficient_data_reason ?? null,
      keepa_trend: keepaTrend,
    } : null,
    products,
  };
}

async function getDecisionJson(jobId: string, options: { skuLimit?: number; skuOffset?: number; skuAction?: string } = {}) {
  const detail = await getScan(jobId);
  if (!detail) return null;
  const scan = detail.scan as Record<string, unknown> & typeof detail.scan;
  const risk = detail.risk as Record<string, unknown> | null;
  const decisionSurface = risk?.decision_surface as Record<string, unknown> | null | undefined;
  const scores = risk ? {
    category_risk: {
      score: toNumberOrNull(risk.category_risk_score),
      confidence: risk.category_risk_confidence ?? null,
      reason: risk.category_risk_reason ?? null,
    },
    sku_chaos: {
      ...recomputedSkuChaos(detail),
    },
    price_war_risk: {
      score: toNumberOrNull(risk.price_war_score),
      confidence: risk.price_war_confidence ?? null,
      reason: risk.price_war_reason ?? null,
    },
    brand_reliability: {
      score: toNumberOrNull(risk.brand_reliability_score),
      confidence: normalizedScoreConfidence('brand_reliability', risk.brand_reliability_confidence, risk.data_quality),
      reason: normalizedScoreReason('brand_reliability', risk.brand_reliability_reason, risk.data_quality),
    },
    operational_risk: {
      score: toNumberOrNull(risk.operational_risk_score),
      confidence: risk.operational_risk_confidence ?? null,
      reason: risk.operational_risk_reason ?? null,
    },
  } : null;
  const effectiveCompositeScore = scores ? weightedCompositeFromScores(scores) : null;
  const decoratedDecisionSurface = decorateDecisionSurface(decisionSurface, risk?.data_quality, scores);
  const normalizedSkus = normalizeDecisionSkus(risk?.sku_decisions, risk?.data_quality, decoratedDecisionSurface?.data_gate, String(scan.keyword || ''));
  const decisionProducts = (detail.products as Array<Record<string, unknown>>).map((product) => ({
    product_title: String(product.title || ''),
    price: numberOrUndefined(product.price),
    rating: numberOrUndefined(product.rating),
    review_count: Number(product.review_count || 0),
    seller_name: typeof product.seller_name === 'string' ? product.seller_name : undefined,
    product_url: typeof product.product_url === 'string' ? product.product_url : undefined,
  }));
  const decisionBadgeStats = riskBadgeStatsFromProducts(
    decisionProducts,
    String(scan.keyword || ''),
    String(scan.marketplace || 'com'),
  );
  const hardeningDecisionSurface: Record<string, unknown> | null = decoratedDecisionSurface ? {
    ...decoratedDecisionSurface,
    priority_view: decoratedDecisionSurface.priority_view ?? buildPriorityView(normalizedSkus as ReturnType<typeof buildSkuDecisions>),
    // Her zaman yeniden türetilir — persist edilmiş eski badge metni gölgelemesin.
    risk_badges: scores ? deriveRiskBadges(
      scores as AmazonRiskReport['scores'],
      risk?.data_quality as AmazonRiskReport['data_quality'],
      decisionBadgeStats,
    ) : [],
  } : null;
  const skuPage = buildSkuPage(
    normalizedSkus,
    options,
  );
  return {
    scan: {
      id: scan.id,
      keyword: scan.keyword,
      marketplace: scan.marketplace,
      status: scan.status,
      data_points: toNumberOrNull(scan.data_points),
      composite_score: effectiveCompositeScore ?? toNumberOrNull(scan.composite_score),
      stored_composite_score: toNumberOrNull(scan.composite_score),
      legacy_decision: scan.decision,
      primary_action: hardeningDecisionSurface?.primary_action ?? null,
    },
    scores,
    score_method: {
      composite: 'weighted_average_of_decision_capable_dimensions',
      weights: getCompositeWeights(),
      excluded_confidence: ['LOW', 'INSUFFICIENT_DATA'],
      note: 'Composite skor düz aritmetik ortalama değildir; karar üretebilen boyutlar kendi ağırlıklarıyla normalize edilir. Eski scan kayıtlarında stored_composite_score ayrıca korunur.',
    },
    decision_surface: hardeningDecisionSurface ?? null,
    data_quality: risk?.data_quality ?? null,
    sku_decisions: skuPage.items,
    sku_pagination: skuPage.pagination,
    persuasion_points: risk?.persuasion_points ?? [],
    keepa_trend: risk?.keepa_trend ?? null,
    insufficient_data_reason: risk?.insufficient_data_reason ?? buildDataIssueReason(risk?.data_quality, decisionSurface?.data_gate),
    legacy_decision_mapping: {
      GUVENLI: 'AL',
      DIKKATLI_OL: 'TAKIP_ET',
      GIRME: 'UZAK_DUR',
      MIXED_SIGNAL: 'TAKIP_ET',
      INSUFFICIENT_DATA: 'TAKIP_ET',
    },
  };
}

async function triggerKeepaForScan(jobId: string) {
  if (!isKeepaConfigured()) return { ok: false, error: 'KEEPA_NOT_CONFIGURED' };
  const [rows] = await pool.execute(
    `SELECT DISTINCT asin
     FROM amazon_products
     WHERE job_id = ? AND asin IS NOT NULL AND asin <> ''
     LIMIT 20`,
    [jobId],
  );
  const asins = (rows as Array<{ asin: string }>).map((row) => row.asin).filter(Boolean);
  if (!asins.length) return { ok: false, error: 'NO_ASIN_FOR_KEEPA' };
  const queued = await enqueueKeepaAsins(jobId, asins);
  const result = await processKeepaQueue(asins.length, jobId);
  return { ok: true, queued, ...result };
}

async function enrichSellersForScan(jobId: string, limit = 10) {
  const source = await findScanJob(jobId);
  if (!source) return null;
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 30);
  const [rows] = await pool.execute(
    `SELECT id, title, asin, product_url
     FROM amazon_products
     WHERE job_id = ?
       AND product_url IS NOT NULL
       AND product_url <> ''
       AND (seller_name IS NULL OR seller_name = '')
     ORDER BY review_count DESC
     LIMIT ${safeLimit}`,
    [jobId],
  );
  const products = rows as Array<{ id: string; title: string; asin: string | null; product_url: string }>;
  let attempted = 0;
  let updated = 0;
  const errors: Array<{ asin: string | null; error: string }> = [];

  for (const product of products) {
    attempted += 1;
    try {
      const detail = await scrapeAmazonProductDetail({
        asin: product.asin,
        productUrl: product.product_url,
        marketplace: source.marketplace,
      });
      const sellerName = detail.seller_name ?? detail.buy_box_seller ?? null;
      if (!sellerName) continue;
      await pool.execute(
        `UPDATE amazon_products
         SET seller_name = ?, seller_url = COALESCE(?, seller_url)
         WHERE id = ?`,
        [sellerName, detail.seller_url ?? null, product.id],
      );
      updated += 1;
    } catch (error) {
      errors.push({
        asin: product.asin,
        error: error instanceof Error ? error.message : 'SELLER_ENRICHMENT_UNKNOWN_ERROR',
      });
    }
  }

  return {
    ok: true,
    job_id: jobId,
    marketplace: source.marketplace,
    attempted,
    updated,
    errors,
    note: updated > 0
      ? 'Satıcı enrichment tamamlandı; karar JSONunu yeniden kontrol edin.'
      : 'Satıcı bilgisi güncellenemedi; Oxylabs product detail yanıtında seller/buy box alanı olmayabilir.',
  };
}

async function getKeepaStatusForScan(jobId: string) {
  const source = await findScanJob(jobId);
  if (!source) return null;

  const [productRows] = await pool.execute(
    `SELECT
       COUNT(*) AS product_count,
       COUNT(DISTINCT CASE WHEN asin IS NOT NULL AND asin <> '' THEN asin END) AS asin_count
     FROM amazon_products
     WHERE job_id = ?`,
    [jobId],
  );
  const productStats = (productRows as Array<Record<string, unknown>>)[0] ?? {};

  const [snapshotRows] = await pool.execute(
    `SELECT
       COUNT(DISTINCT aks.asin) AS snapshot_asin_count,
       MAX(aks.fetched_at) AS last_snapshot_at
     FROM amazon_keepa_snapshots aks
     INNER JOIN amazon_products ap ON ap.asin = aks.asin
     WHERE ap.job_id = ? AND ap.asin IS NOT NULL AND ap.asin <> '' AND aks.marketplace = ?`,
    [jobId, source.marketplace || 'com'],
  );
  const snapshotStats = (snapshotRows as Array<Record<string, unknown>>)[0] ?? {};

  const [queueRows] = await pool.execute(
    `SELECT
       COUNT(DISTINCT asin) AS queued_asin_count,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done,
       COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
       MAX(processed_at) AS last_processed_at,
       MAX(last_error) AS last_error
     FROM amazon_keepa_queue
     WHERE job_id = ?`,
    [jobId],
  );
  const queueStats = (queueRows as Array<Record<string, unknown>>)[0] ?? {};

  const [budgetRows] = await pool.execute(
    `SELECT token_budget, tokens_used, GREATEST(token_budget - tokens_used, 0) AS remaining
     FROM amazon_keepa_daily_budget
     WHERE budget_date = CURDATE()
     LIMIT 1`,
  );
  const budget = (budgetRows as Array<Record<string, unknown>>)[0] ?? null;
  const asinCount = Number(productStats.asin_count || 0);
  const snapshotAsinCount = Number(snapshotStats.snapshot_asin_count || 0);
  const pending = Number(queueStats.pending || 0);
  const failed = Number(queueStats.failed || 0);
  const configured = isKeepaConfigured();
  const reason = !configured
    ? 'api_key_missing'
    : source.status !== 'done'
      ? 'scan_not_done'
      : asinCount === 0
        ? 'no_asin'
        : snapshotAsinCount > 0
          ? 'snapshot_available'
          : pending > 0
            ? 'queued_or_local_budget_waiting'
            : failed > 0
              ? 'keepa_failed'
              : 'not_requested';

  return {
    configured,
    job_id: jobId,
    scan_status: source.status,
    reason,
    can_fetch: configured && source.status === 'done' && asinCount > 0,
    product_count: Number(productStats.product_count || 0),
    asin_count: asinCount,
    snapshot_asin_count: snapshotAsinCount,
    coverage: asinCount > 0 ? Number((snapshotAsinCount / asinCount).toFixed(2)) : 0,
    last_snapshot_at: snapshotStats.last_snapshot_at ?? null,
    queue: {
      queued_asin_count: Number(queueStats.queued_asin_count || 0),
      pending,
      done: Number(queueStats.done || 0),
      failed,
      last_processed_at: queueStats.last_processed_at ?? null,
      last_error: queueStats.last_error ?? null,
    },
    local_budget: budget ? {
      token_budget: Number(budget.token_budget || 0),
      tokens_used: Number(budget.tokens_used || 0),
      remaining: Number(budget.remaining || 0),
    } : null,
  };
}

function toNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getKeepaDetailForScan(jobId: string) {
  const source = await findScanJob(jobId);
  if (!source) return null;
  const marketplace = source.marketplace || 'com';

  const [rows] = await pool.execute(
    `SELECT
       p.asin, p.title, p.product_price,
       s.price_30d_min, s.price_30d_max, s.price_90d_avg,
       s.buy_box_change_count, s.seller_count_trend,
       s.price_volatility, s.offer_count_avg, s.offer_count_trend,
       s.fetched_at
     FROM (
       SELECT asin, MAX(title) as title, MAX(price) as product_price, MAX(review_count) as review_count
       FROM amazon_products
       WHERE job_id = ? AND asin IS NOT NULL AND asin <> ''
       GROUP BY asin
     ) p
     INNER JOIN (
       SELECT *, ROW_NUMBER() OVER(PARTITION BY asin, marketplace ORDER BY fetched_at DESC) as rn
       FROM amazon_keepa_snapshots
       WHERE marketplace = ?
     ) s ON s.asin = p.asin AND s.rn = 1
     ORDER BY p.review_count DESC`,
    [jobId, marketplace],
  );

  const items = (rows as Array<Record<string, unknown>>).map((row) => {
    const snapshot: KeepaSnapshot = {
      asin: String(row.asin),
      marketplace,
      domain_id: 1,
      price_30d_min: toNum(row.price_30d_min),
      price_30d_max: toNum(row.price_30d_max),
      price_90d_avg: toNum(row.price_90d_avg),
      buy_box_change_count: Number(row.buy_box_change_count ?? 0),
      seller_count_trend: (row.seller_count_trend as KeepaSnapshot['seller_count_trend']) ?? null,
      price_volatility: toNum(row.price_volatility),
      offer_count_avg: toNum(row.offer_count_avg),
      offer_count_trend: (row.offer_count_trend as KeepaSnapshot['offer_count_trend']) ?? null,
      stock_history_json: null,
    };
    return {
      asin: snapshot.asin,
      title: String(row.title ?? ''),
      product_price: toNum(row.product_price),
      price_30d_min: snapshot.price_30d_min,
      price_30d_max: snapshot.price_30d_max,
      price_90d_avg: snapshot.price_90d_avg,
      price_volatility: snapshot.price_volatility,
      offer_count_avg: snapshot.offer_count_avg,
      offer_count_trend: snapshot.offer_count_trend,
      buy_box_change_count: snapshot.buy_box_change_count,
      seller_count_trend: snapshot.seller_count_trend,
      fetched_at: row.fetched_at,
      contributions: computeKeepaContributions(snapshot),
    };
  });

  return { job_id: jobId, marketplace, snapshots: items };
}

type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
type Stage = { status: StageStatus; progress: number; detail: string };

function safeJsonParse(value: unknown): unknown {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value ?? null;
}

async function getScanProgress(jobId: string) {
  const job = await findScanJob(jobId);
  if (!job) return null;
  const marketplace = job.marketplace || 'com';

  const [productCountRows] = await pool.execute(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN asin IS NOT NULL AND asin <> '' THEN 1 ELSE 0 END) AS with_asin,
            SUM(CASE WHEN seller_name IS NOT NULL AND seller_name <> '' THEN 1 ELSE 0 END) AS with_seller,
            SUM(CASE WHEN brand IS NOT NULL AND brand <> '' THEN 1 ELSE 0 END) AS with_brand
     FROM amazon_products WHERE job_id = ?`,
    [jobId],
  );
  const productStats = (productCountRows as Array<Record<string, unknown>>)[0] ?? {};
  const productCount = Number(productStats.total || 0);
  const withAsin = Number(productStats.with_asin || 0);
  const withSeller = Number(productStats.with_seller || 0);
  const withBrand = Number(productStats.with_brand || 0);

  const [keepaQueueRows] = await pool.execute(
    `SELECT
       SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
     FROM amazon_keepa_queue WHERE job_id = ?`,
    [jobId],
  );
  const keepaQueueStats = (keepaQueueRows as Array<Record<string, unknown>>)[0] ?? {};
  const keepaDone = Number(keepaQueueStats.done || 0);
  const keepaPending = Number(keepaQueueStats.pending || 0);
  const keepaFailed = Number(keepaQueueStats.failed || 0);
  const keepaTotal = keepaDone + keepaPending + keepaFailed;

  const [scoreRows] = await pool.execute(
    `SELECT composite_score, decision, decision_surface, data_quality, sku_decisions, enrichment
     FROM amazon_risk_scores WHERE job_id = ? LIMIT 1`,
    [jobId],
  );
  const scoreRow = (scoreRows as Array<Record<string, unknown>>)[0] ?? null;

  const [snapshotRows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM amazon_keepa_snapshots s
     INNER JOIN amazon_products p ON p.asin = s.asin
     WHERE p.job_id = ? AND s.marketplace = ?`,
    [jobId, marketplace],
  );
  const snapshotCount = Number((snapshotRows as Array<Record<string, unknown>>)[0]?.cnt || 0);

  const scrape: Stage = job.status === 'failed'
    ? { status: 'failed', progress: 0, detail: 'Tarama başarısız' }
    : job.status === 'done'
      ? { status: 'done', progress: 100, detail: `${productCount} ürün tarandı` }
      : job.status === 'enriching'
        ? { status: 'done', progress: 100, detail: `${productCount} ürün tarandı` }
      : productCount > 0
        ? { status: 'running', progress: 60, detail: `${productCount} ürün şu ana kadar` }
        : { status: 'running', progress: 10, detail: 'Oxylabs çağrısı bekleniyor' };

  const keepa: Stage = !isKeepaConfigured()
    ? { status: 'skipped', progress: 0, detail: 'Keepa yapılandırılmamış' }
    : keepaTotal === 0 && job.status !== 'done' && job.status !== 'enriching'
      ? { status: 'pending', progress: 0, detail: 'Henüz başlamadı' }
      : keepaTotal === 0
        ? { status: 'done', progress: 100, detail: 'Keepa atlandı' }
        : keepaPending > 0
          ? { status: 'running', progress: Math.round((keepaDone / keepaTotal) * 100), detail: `${keepaDone}/${keepaTotal} ASIN snapshot alındı` }
          : { status: 'done', progress: 100, detail: `${keepaDone} ASIN snapshot${keepaFailed ? `, ${keepaFailed} başarısız` : ''}` };

  const seller: Stage = productCount === 0
    ? { status: 'pending', progress: 0, detail: 'Bekleniyor' }
    : withSeller === productCount
      ? { status: 'done', progress: 100, detail: `${withSeller} satıcı doğrulandı` }
      : withSeller > 0
        ? { status: 'running', progress: Math.round((withSeller / productCount) * 100), detail: `${withSeller}/${productCount} satıcı doğrulandı` }
        : { status: 'running', progress: 5, detail: 'Satıcı enrichment başlatıldı' };

  const scoring: Stage = scoreRow
    ? { status: 'done', progress: 100, detail: '5 boyut skoru hesaplandı' }
    : job.status === 'failed'
      ? { status: 'failed', progress: 0, detail: 'Skor üretilemedi' }
      : { status: 'pending', progress: 0, detail: 'Skor hesaplanmadı' };

  const enrichmentJson = scoreRow ? safeJsonParse(scoreRow.enrichment) as Record<string, unknown> | null : null;
  const llmApplied = Boolean(enrichmentJson && (enrichmentJson as Record<string, unknown>).llm_applied);
  const reasoning: Stage = scoreRow
    ? { status: 'done', progress: 100, detail: llmApplied ? 'LLM cross-dimension sentezi tamam' : 'Deterministic reasoning hazır' }
    : { status: 'pending', progress: 0, detail: 'Skor sonrası üretilecek' };

  const lineage: Stage = snapshotCount > 0
    ? { status: 'done', progress: 100, detail: `${snapshotCount} ASIN için lineage hazır` }
    : withAsin > 0 && isKeepaConfigured()
      ? { status: 'pending', progress: 0, detail: 'Keepa snapshot bekleniyor' }
      : { status: 'skipped', progress: 0, detail: 'Lineage için Keepa verisi yok' };

  let summary: Record<string, unknown> | null = null;
  if (job.status === 'done' && scoreRow) {
    const skuDecisions = safeJsonParse(scoreRow.sku_decisions) as Array<Record<string, unknown>> | null;
    const dataQuality = safeJsonParse(scoreRow.data_quality) as Record<string, unknown> | null;
    const decisionReady = Array.isArray(skuDecisions)
      ? skuDecisions.filter((s) => s.decision_tier === 'DECISION_READY').length
      : 0;
    const priority = Array.isArray(skuDecisions)
      ? skuDecisions.filter((s) => s.decision_tier === 'DECISION_READY' && (s.action === 'AL' || s.action === 'UZAK_DUR')).length
      : 0;
    const blockers = Array.isArray(dataQuality?.confidence_blockers) ? dataQuality?.confidence_blockers as string[] : [];
    const missingNote = blockers.length
      ? blockers.map((b: string) => {
          switch (b) {
            case 'seller_coverage_low': return 'Satıcı kapsaması düşük';
            case 'low_price_coverage': return 'Fiyat kapsaması düşük';
            case 'no_keepa_data': return 'Keepa verisi yok';
            case 'insufficient_data_points': return 'Yetersiz veri';
            default: return b;
          }
        }).join(', ')
      : null;

    const scanAgeDays = Math.floor((Date.now() - new Date(job.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24));
    const [progressProductRows] = await pool.execute(
      `SELECT title, price, rating, review_count, seller_name, product_url
       FROM amazon_products WHERE job_id = ?`,
      [jobId],
    );
    const progressProducts = (progressProductRows as Array<Record<string, unknown>>).map((product) => ({
      product_title: String(product.title || ''),
      price: numberOrUndefined(product.price),
      rating: numberOrUndefined(product.rating),
      review_count: Number(product.review_count || 0),
      seller_name: typeof product.seller_name === 'string' ? product.seller_name : undefined,
      product_url: typeof product.product_url === 'string' ? product.product_url : undefined,
    }));
    const parsedDataQuality = withScanAge(dataQuality, job.created_at);
    const typedSkuDecisions = Array.isArray(skuDecisions) ? (skuDecisions as SkuDecision[]) : [];
    const progressScores = riskScoresFromRow(scoreRow as Record<string, unknown>);
    const progressBadgeStats = riskBadgeStatsFromProducts(
      progressProducts,
      String(job.keyword || ''),
      marketplace,
    );
    summary = {
      data_points: productCount,
      decision_ready_count: decisionReady,
      priority_count: priority,
      missing_data_note: missingNote,
      composite_score: scoreRow.composite_score ? Number(scoreRow.composite_score) : null,
      decision: (scoreRow.decision as string) || null,
      brand_coverage: productCount > 0 ? Number((withBrand / productCount).toFixed(2)) : 0,
      seller_coverage: productCount > 0 ? Number((withSeller / productCount).toFixed(2)) : 0,
      keepa_coverage: Number(parsedDataQuality?.keepa_coverage ?? 0),
      scan_age_days: scanAgeDays,
      stale_data: scanAgeDays > 7,
      data_quality: parsedDataQuality,
      priority_view: buildPriorityView(typedSkuDecisions),
      risk_badges: deriveRiskBadges(progressScores, parsedDataQuality, progressBadgeStats),
    };
  }

  return {
    job_id: jobId,
    keyword: job.keyword,
    marketplace,
    status: job.status,
    stages: { scrape, keepa, seller, scoring, reasoning, lineage },
    summary,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function mergeDecisionSurface(
  stored: Record<string, unknown> | null,
  fallback: Record<string, unknown> | null,
  legacyDecision: AmazonRiskReport['decision'],
  actionDistribution: unknown,
  dataGate: unknown,
): Record<string, unknown> | null {
  if (!fallback && !stored) return null;
  return {
    ...(fallback ?? {}),
    ...(stored ?? {}),
    legacy_decision: stored?.legacy_decision ?? legacyDecision,
    action_distribution: stored?.action_distribution ?? actionDistribution,
    data_gate: stored?.data_gate ?? dataGate,
  };
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedScoreConfidence(key: string, confidence: unknown, dataQuality: unknown) {
  if (key === 'brand_reliability' && sellerCoverage(dataQuality) < 0.05) return 'LOW';
  return confidence ?? null;
}

function normalizedScoreReason(key: string, reason: unknown, dataQuality: unknown) {
  if (key === 'brand_reliability' && sellerCoverage(dataQuality) < 0.05) {
    return 'Satıcı kapsaması yok; marka riski gerçek seller verisiyle doğrulanamadı, sadece başlık/listing sinyali olarak okunmalı.';
  }
  return reason ?? null;
}

function sellerCoverage(dataQuality: unknown) {
  const quality = dataQuality && typeof dataQuality === 'object'
    ? dataQuality as Record<string, unknown>
    : parseJsonObject(dataQuality);
  const value = Number(quality?.seller_coverage);
  return Number.isFinite(value) ? value : 0;
}

function weightedCompositeFromScores(scores: Record<string, { score: number | null; confidence: unknown }>) {
  const weights = getCompositeWeights() as Record<string, number>;
  const entries = Object.entries(scores)
    .filter(([key, value]) => key in weights && typeof value.score === 'number' && (value.confidence === 'HIGH' || value.confidence === 'MEDIUM'));
  const weightTotal = entries.reduce((sum, [key]) => sum + (weights[key] ?? 0), 0);
  if (weightTotal <= 0) return null;
  const weighted = entries.reduce((sum, [key, value]) => sum + (value.score ?? 0) * (weights[key] ?? 0), 0);
  return Number((weighted / weightTotal).toFixed(1));
}

function decorateDecisionSurface(
  surface: Record<string, unknown> | null | undefined,
  dataQuality: unknown,
  scores?: Record<string, { score: number | null; confidence: unknown; reason: unknown }> | null,
): Record<string, unknown> | null {
  if (!surface) return null;
  const coverage = sellerCoverage(dataQuality);
  const actionGating = {
    AL: coverage < 0.5
      ? 'AL aksiyonu için satıcı kapsaması en az %50 olmalı; mevcut scan satıcı doğrulaması gerektiriyor.'
      : null,
  };
  return {
    ...surface,
    top_reasons: scores ? topReasonsFromScores(scores) : surface.top_reasons,
    action_gating: actionGating,
    unreachable_actions: Object.entries(actionGating)
      .filter(([, reason]) => Boolean(reason))
      .map(([action]) => action),
  };
}

function topReasonsFromScores(scores: Record<string, { score: number | null; confidence: unknown; reason: unknown }>) {
  return Object.values(scores)
    .filter((score) => typeof score.reason === 'string' && score.reason.trim())
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
    .slice(0, 3)
    .map((score) => String(score.reason));
}

function recomputedSkuChaos(detail: { scan: Record<string, unknown>; products: unknown }) {
  const rawProducts = Array.isArray(detail.products) ? detail.products.map((product) => {
    const row = product as Record<string, unknown>;
    return {
      product_title: String(row.title || ''),
      price: numberOrUndefined(row.price),
      rating: numberOrUndefined(row.rating),
      review_count: Number(row.review_count || 0),
      seller_name: typeof row.seller_name === 'string' ? row.seller_name : undefined,
      product_url: typeof row.product_url === 'string' ? row.product_url : undefined,
    };
  }) : [];
  const stats = calculateCategoryStats(String(detail.scan.keyword || ''), String(detail.scan.marketplace || 'com'), rawProducts);
  const result = scoreSkuChaos({
    keyword: String(detail.scan.keyword || ''),
    marketplace: String(detail.scan.marketplace || 'com'),
    products: normalizeProducts(rawProducts),
    stats,
  });
  return result;
}

function skuPageOptions(url: URL) {
  return {
    skuLimit: Number(url.searchParams.get('sku_limit') || url.searchParams.get('limit') || 50),
    skuOffset: Number(url.searchParams.get('sku_offset') || url.searchParams.get('offset') || 0),
    skuAction: url.searchParams.get('action') || '',
  };
}

function buildSkuPage(skus: unknown[], options: { skuLimit?: number; skuOffset?: number; skuAction?: string }) {
  const action = String(options.skuAction || '').toUpperCase();
  const filtered = action ? skus.filter((sku) => {
    return Boolean(sku && typeof sku === 'object' && String((sku as Record<string, unknown>).action || '').toUpperCase() === action);
  }) : skus;
  const limit = Math.min(Math.max(Number(options.skuLimit || 50), 0), 100);
  const offset = Math.max(Number(options.skuOffset || 0), 0);
  return {
    items: limit === 0 ? [] : filtered.slice(offset, offset + limit),
    pagination: {
      total: filtered.length,
      limit,
      offset,
      next_offset: offset + limit < filtered.length ? offset + limit : null,
      action_filter: action || null,
      endpoint: '/api/scans/{jobId}/skus',
    },
  };
}

function normalizeDecisionSkus(skus: unknown, dataQuality: unknown, dataGate: unknown, keyword = '') {
  if (!Array.isArray(skus)) return [];
  const sellerMissingGlobal = sellerCoverage(dataQuality) < 0.5;
  const gated = Boolean(dataGate && typeof dataGate === 'object' && (dataGate as Record<string, unknown>).status !== 'READY');
  return skus.map((sku) => {
    if (!sku || typeof sku !== 'object') return sku;
    const row = sku as Record<string, unknown>;
    const reasons = Array.isArray(row.reasons) ? row.reasons.filter((reason) => {
      return !(sellerMissingGlobal && reason === 'Satıcı bilgisi yok; güvenilirlik doğrulanamıyor.');
    }) : [];
    return {
      ...row,
      gated,
      gated_reason: gated ? 'Scan veri gate nedeniyle enrichment gerektiriyor; SKU aksiyonu kesin karar değil, öncelik sinyalidir.' : null,
      relevance: keywordRelevance(keyword, String(row.title || '')),
      reasons: reasons.length ? reasons : row.reasons,
    };
  });
}

function keywordRelevance(keyword: string, title: string) {
  const tokens = keyword.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  const normalizedTitle = title.toLowerCase();
  const matched = tokens.filter((token) => keywordTokenMatches(token, normalizedTitle));
  const ratio = tokens.length ? matched.length / tokens.length : 1;
  return {
    status: ratio >= 0.75 ? 'matched' : ratio >= 0.4 ? 'partial' : 'low',
    matched_terms: matched,
    missing_terms: tokens.filter((token) => !matched.includes(token)),
    note: ratio >= 0.75 ? null : 'Keyword eşleşmesi zayıf; kategori dışı ürün olabilir.',
  };
}

function keywordTokenMatches(token: string, normalizedTitle: string) {
  const synonyms: Record<string, string[]> = {
    organizer: ['organizer', 'organiser', 'tidy', 'management', 'holder', 'clips', 'clip', 'strap', 'straps', 'sleeve', 'sleeving', 'box', 'wrap', 'raceway'],
    organiser: ['organizer', 'organiser', 'tidy', 'management', 'holder', 'clips', 'clip', 'strap', 'straps', 'sleeve', 'sleeving', 'box', 'wrap', 'raceway'],
    cable: ['cable', 'cord', 'wire', 'lead'],
    dash: ['dash', 'dashboard', 'car'],
    cam: ['cam', 'camera', 'dashcam'],
    webcam: ['webcam', 'camera', 'video'],
    lighting: ['lighting', 'light', 'lamp', 'led'],
    surge: ['surge', 'power', 'protector', 'strip', 'outlet'],
    protector: ['protector', 'protection', 'surge', 'strip', 'outlet'],
    thermal: ['thermal', 'label', 'labels', 'printer'],
    labels: ['label', 'labels', 'sticker', 'stickers'],
  };
  return (synonyms[token] ?? [token]).some((candidate) => normalizedTitle.includes(candidate));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function riskScoresFromRow(row: Record<string, unknown>) {
  return {
    category_risk: {
      score: Number(row.category_risk_score ?? 0),
      confidence: normalizeConfidence(row.category_risk_confidence),
      reason: String(row.category_risk_reason || ''),
    },
    sku_chaos: {
      score: Number(row.sku_chaos_score ?? 0),
      confidence: normalizeConfidence(row.sku_chaos_confidence),
      reason: String(row.sku_chaos_reason || ''),
    },
    price_war_risk: {
      score: Number(row.price_war_score ?? 0),
      confidence: normalizeConfidence(row.price_war_confidence),
      reason: String(row.price_war_reason || ''),
    },
    brand_reliability: {
      score: Number(row.brand_reliability_score ?? 0),
      confidence: normalizeConfidence(row.brand_reliability_confidence),
      reason: String(row.brand_reliability_reason || ''),
    },
    operational_risk: {
      score: Number(row.operational_risk_score ?? 0),
      confidence: normalizeConfidence(row.operational_risk_confidence),
      reason: String(row.operational_risk_reason || ''),
    },
  };
}

function normalizeConfidence(value: unknown): Confidence {
  const normalized = String(value || 'LOW').toUpperCase();
  return ['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_DATA'].includes(normalized) ? normalized as Confidence : 'LOW';
}

function normalizeDecision(value: unknown): AmazonRiskReport['decision'] {
  const normalized = String(value || 'INSUFFICIENT_DATA').toUpperCase();
  return ['GUVENLI', 'DIKKATLI_OL', 'GIRME', 'MIXED_SIGNAL', 'INSUFFICIENT_DATA'].includes(normalized)
    ? normalized as AmazonRiskReport['decision']
    : 'INSUFFICIENT_DATA';
}

function buildKeepaTrend(rows: Array<Record<string, unknown>>, marketplace = 'com') {
  const avg = (key: string) => {
    const values = rows
      .map((row) => Number(row[key]))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!values.length) return null;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  };

  if (rows.length === 0 && marketplace !== 'com') {
    return {
      sample_count: rows.length,
      source_scope: 'keepa_snapshot_aggregate',
      price_points: [],
      buy_box_change_avg: null,
      seller_count_trend_avg: null,
      missing_fields: ['marketplace_aligned_price_points', 'buy_box_change_avg', 'seller_count_trend_avg'],
      note: `${marketplace} marketplace için Keepa snapshot yok; marketplace uyumlu Keepa enrichment gerekir.`,
    };
  }

  const buyBoxChangeAvg = avg('buy_box_change_count');
  const sellerCountTrendAvg = avg('seller_count_trend');
  const missingFields = [
    buyBoxChangeAvg === null ? 'buy_box_change_avg' : null,
    sellerCountTrendAvg === null ? 'seller_count_trend_avg' : null,
    rows.length === 0 ? 'price_points' : null,
  ].filter((field): field is string => Boolean(field));

  return {
    sample_count: rows.length,
    source_scope: 'keepa_snapshot_aggregate',
    price_points: [
      { label: '30d min', price: avg('price_30d_min') },
      { label: '90d avg', price: avg('price_90d_avg') },
      { label: '30d max', price: avg('price_30d_max') },
    ].filter((point): point is { label: string; price: number } => point.price !== null),
    buy_box_change_avg: buyBoxChangeAvg,
    seller_count_trend_avg: sellerCountTrendAvg,
    missing_fields: missingFields,
    note: missingFields.length
      ? 'Bu scan için bazı Keepa Buy Box/seller trend alanları snapshotta yok; detail enrichment gerekir.'
      : 'Keepa snapshot alanları mevcut.',
  };
}

function buildDataIssueReason(dataQuality: unknown, dataGate: unknown) {
  const gate = dataGate && typeof dataGate === 'object' ? dataGate as Record<string, unknown> : null;
  const quality = dataQuality && typeof dataQuality === 'object' ? dataQuality as Record<string, unknown> : null;
  if (!gate && !quality) return null;
  const gateMessage = typeof gate?.message === 'string' ? gate.message : '';
  const blockers = Array.isArray(quality?.confidence_blockers) ? quality.confidence_blockers : [];
  if (!gateMessage && !blockers.length) return null;
  return [gateMessage, blockers.length ? `Veri uyarıları: ${blockers.join(', ')}.` : ''].filter(Boolean).join(' ');
}

async function getKeepaUsage() {
  const [todayRows] = await pool.execute(
    `SELECT budget_date, token_budget, tokens_used, GREATEST(token_budget - tokens_used, 0) AS remaining
     FROM amazon_keepa_daily_budget
     WHERE budget_date = CURDATE()
     LIMIT 1`,
  );
  const [historyRows] = await pool.execute(
    `SELECT budget_date, token_budget, tokens_used, GREATEST(token_budget - tokens_used, 0) AS remaining
     FROM amazon_keepa_daily_budget
     ORDER BY budget_date DESC
     LIMIT 7`,
  );
  const [queueRows] = await pool.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN status = 'done' AND DATE(processed_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS done_today,
       COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_total
     FROM amazon_keepa_queue`,
  );

  return {
    configured: Boolean(env.KEEPA_API_KEY),
    localDailyBudget: env.KEEPA_DAILY_TOKEN_BUDGET,
    dailyBudget: env.KEEPA_DAILY_TOKEN_BUDGET,
    live: await fetchKeepaTokenStatus(),
    today: (todayRows as Record<string, unknown>[])[0] ?? null,
    history: historyRows,
    queue: (queueRows as Record<string, unknown>[])[0] ?? { pending: 0, done_today: 0, failed_total: 0 },
  };
}

async function getHealth() {
  const keepaUsage = await getKeepaUsage();
  const [errorRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM amazon_job_error_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
  );
  const [oxylabsRows] = await pool.execute(
    `SELECT
       COUNT(DISTINCT j.id) AS scans_24h,
       COUNT(p.id) AS product_rows_24h,
       SUM(CASE WHEN p.seller_name IS NOT NULL AND p.seller_name <> '' THEN 1 ELSE 0 END) AS seller_rows_24h
     FROM amazon_scan_jobs j
     LEFT JOIN amazon_products p ON p.job_id = j.id
     WHERE j.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
  );
  const [schedulerRows] = await pool.execute(
    `SELECT
       MAX(CASE WHEN status = 'done' THEN processed_at ELSE NULL END) AS last_keepa_run,
       MAX(processed_at) AS last_keepa_queue_run
     FROM amazon_keepa_queue`,
  );
  const queue = keepaUsage.queue as Record<string, unknown>;
  const today = keepaUsage.today as Record<string, unknown> | null;
  const scheduler = (schedulerRows as Array<Record<string, unknown>>)[0] ?? {};
  const oxylabs = (oxylabsRows as Array<Record<string, unknown>>)[0] ?? {};
  const scans24h = Number(oxylabs.scans_24h || 0);
  const productRows24h = Number(oxylabs.product_rows_24h || 0);
  const sellerRows24h = Number(oxylabs.seller_rows_24h || 0);
  const estimatedRequests24h = scans24h + sellerRows24h;
  return {
    status: 'ok',
    uptime_seconds: Math.round(process.uptime()),
    keepa: {
      budget_remaining: today ? Number(today.remaining || 0) : keepaUsage.localDailyBudget,
      budget_total: today ? Number(today.token_budget || 0) : keepaUsage.localDailyBudget,
      queue_pending: Number(queue.pending || 0),
    },
    scheduler: {
      last_keepa_run: scheduler.last_keepa_run ?? scheduler.last_keepa_queue_run ?? null,
      last_seller_run: null,
    },
    oxylabs: {
      configured: Boolean(env.OXYLABS_USERNAME && env.OXYLABS_PASSWORD),
      estimated_requests_last_24h: estimatedRequests24h,
      average_requests_per_scan: scans24h > 0 ? Number((estimatedRequests24h / scans24h).toFixed(1)) : 0,
      seller_detail_rows_last_24h: sellerRows24h,
      product_rows_last_24h: productRows24h,
      cache_hit_rate: null,
    },
    errors_last_24h: Number((errorRows as Array<Record<string, unknown>>)[0]?.total || 0),
  };
}

// OH.8 — Kota/maliyet görünürlüğü: operatör scan öncesi/sonrası tüketimi görür.
// Salt-okuma; skor/karar mantığına dokunmaz.
// OH.8b — Cache hit/miss sayacı (process-lifetime, in-memory).
// `since` ile birlikte dönülür; restart sonrası sıfırlanır (operatör için yeterli görünürlük).
const cacheStats = {
  since: new Date().toISOString(),
  hits: 0,
  misses: 0,
  forced: 0,
};

async function getQuota() {
  const keepaUsage = await getKeepaUsage();
  const today = keepaUsage.today as Record<string, unknown> | null;
  const queue = keepaUsage.queue as Record<string, unknown>;
  const [oxRows] = await pool.execute(
    `SELECT
       COUNT(DISTINCT j.id) AS scans_24h,
       COUNT(p.id) AS product_rows_24h,
       SUM(CASE WHEN p.seller_name IS NOT NULL AND p.seller_name <> '' THEN 1 ELSE 0 END) AS seller_rows_24h
     FROM amazon_scan_jobs j
     LEFT JOIN amazon_products p ON p.job_id = j.id
     WHERE j.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
  );
  const [cacheRows] = await pool.execute(
    `SELECT
       COUNT(*) AS total_24h,
       SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_24h
     FROM amazon_scan_jobs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
  );
  const ox = (oxRows as Array<Record<string, unknown>>)[0] ?? {};
  const scans24h = Number(ox.scans_24h || 0);
  const sellerRows24h = Number(ox.seller_rows_24h || 0);
  const estReq24h = scans24h + sellerRows24h;
  const avgPerScan = scans24h > 0 ? Number((estReq24h / scans24h).toFixed(1)) : 0;
  const cache = (cacheRows as Array<Record<string, unknown>>)[0] ?? {};

  return {
    keepa: {
      configured: isKeepaConfigured(),
      budget_total: today ? Number(today.token_budget || 0) : keepaUsage.localDailyBudget,
      budget_remaining: today ? Number(today.remaining || 0) : keepaUsage.localDailyBudget,
      tokens_used_today: today ? Number(today.tokens_used || 0) : 0,
      queue_pending: Number(queue.pending || 0),
    },
    oxylabs: {
      configured: Boolean(env.OXYLABS_USERNAME && env.OXYLABS_PASSWORD),
      estimated_requests_last_24h: estReq24h,
      average_requests_per_scan: avgPerScan,
      seller_detail_rows_last_24h: sellerRows24h,
    },
    per_scan_estimate: {
      oxylabs_requests: avgPerScan || null,
      note: 'Tahmini değer son 24s ortalamasından türetilir; ilk taramalarda boş olabilir.',
    },
    cache: {
      ttl_minutes: env.SCAN_CACHE_TTL_MIN,
      scans_last_24h: Number(cache.total_24h || 0),
      done_last_24h: Number(cache.done_24h || 0),
      // OH.8b — cache hit/miss görünürlüğü (process-lifetime)
      since: cacheStats.since,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      forced_rescans: cacheStats.forced,
      hit_rate: (cacheStats.hits + cacheStats.misses + cacheStats.forced) > 0
        ? Number((cacheStats.hits / (cacheStats.hits + cacheStats.misses + cacheStats.forced)).toFixed(2))
        : null,
      note: 'Aynı keyword/marketplace için TTL içinde tamamlanmış tarama varsa yeniden taramadan önce seçim sunulur (kota koruması). hit/miss sayaçları işlem başlangıcından itibarendir.',
    },
  };
}

function normalizePriority(value: unknown) {
  const priority = String(value || 'normal').trim().toLowerCase();
  return ['low', 'normal', 'high', 'critical'].includes(priority) ? priority : 'normal';
}

function normalizeNoteStatus(value: unknown) {
  const status = String(value || 'open').trim().toLowerCase();
  return ['open', 'reviewing', 'resolved', 'archived'].includes(status) ? status : 'open';
}

async function listDeveloperNotes(options: { limit?: number; offset?: number; status?: string } = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
  const offset = Math.max(Number(options.offset || 0), 0);
  const status = String(options.status || '').trim();
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const [rows] = await pool.execute(
    `SELECT id, subject, body, priority, status, page_path, attachment_url, created_by, created_at, updated_at
     FROM amazon_developer_notes
     ${where}
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM amazon_developer_notes ${where}`,
    params,
  );
  const total = Number((countRows as Array<{ total?: number | string }>)[0]?.total ?? 0);
  return { notes: rows as Array<Record<string, unknown>>, total, limit, offset };
}

async function createDeveloperNote(body: Record<string, unknown>) {
  const subject = String(body.subject || '').trim();
  const noteBody = String(body.body || '').trim();
  if (!subject || !noteBody) return null;
  const note = {
    id: randomUUID(),
    subject,
    body: noteBody,
    priority: normalizePriority(body.priority),
    status: normalizeNoteStatus(body.status),
    page_path: String(body.page_path || '').trim() || null,
    attachment_url: String(body.attachment_url || '').trim() || null,
    created_by: String(body.created_by || '').trim() || null,
  };
  await pool.execute(
    `INSERT INTO amazon_developer_notes
       (id, subject, body, priority, status, page_path, attachment_url, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [note.id, note.subject, note.body, note.priority, note.status, note.page_path, note.attachment_url, note.created_by],
  );
  return note;
}

function runInBackground(jobId: string) {
  runAmazonJob(jobId)
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      console.error(`Amazon job failed: ${jobId}: ${message}`);
    });
}

function isAuthorized(request: Request): boolean {
  const secret = env.API_SECRET;
  if (!secret) return true; // auth disabled when secret not configured
  const authHeader = request.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${secret}`;
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  console.log(`[DEBUG] ${request.method} ${path}`);

  if (request.method === 'OPTIONS') return json({});
  if (path === '/health') return json({ ok: true });
  if (path.startsWith('/api/') && !isAuthorized(request)) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  if (path === '/api/health' && request.method === 'GET') {
    return json(await getHealth() as JsonValue);
  }

  if (path === '/api/quota' && request.method === 'GET') {
    return json(await getQuota() as JsonValue);
  }
  if (path === '/api/uploads' && request.method === 'POST') {
    const upload = await saveUploadedImage(request);
    if (!upload) return json({ error: 'file_required' }, { status: 400 });
    return json(upload, { status: 201 });
  }

  const uploadMatch = path.match(/^\/api\/uploads\/([a-f0-9-]+\.(?:png|jpg|jpeg|webp|gif))$/i);
  if (uploadMatch && request.method === 'GET') {
    const fileName = uploadMatch[1];
    const buffer = await readFile(join(uploadsDir(), fileName)).catch(() => null);
    if (!buffer) return json({ error: 'not_found' }, { status: 404 });
    return new Response(buffer, {
      headers: {
        'content-type': uploadContentType(fileName),
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  }

  if (path === '/api/keywords' && request.method === 'GET') {
    const result = await listKeywords({
      q: url.searchParams.get('q') || '',
      limit: Number(url.searchParams.get('limit') || 50),
      offset: Number(url.searchParams.get('offset') || 0),
    });
    return json({
      keywords: result.rows,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    } as JsonValue);
  }

  if (path === '/api/keywords' && request.method === 'POST') {
    const body = await readJson(request);
    const keyword = String(body.keyword || '').trim();
    const marketplace = String(body.marketplace || 'com').trim() || 'com';
    if (!keyword) return json({ error: 'keyword_required' }, { status: 400 });

    const id = randomUUID();
    await pool.execute(
      `INSERT INTO amazon_keywords (id, keyword, marketplace)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE keyword = VALUES(keyword), marketplace = VALUES(marketplace)`,
      [id, keyword, marketplace],
    );
    return json({ id, keyword, marketplace }, { status: 201 });
  }

  if (path === '/api/keywords/variations' && request.method === 'POST') {
    const body = await readJson(request);
    const keyword = String(body.keyword || '').trim();
    const count = Number(body.count || getScraperConfig().RECOVERY_VARIATION_COUNT);
    if (!keyword) return json({ error: 'keyword_required' }, { status: 400 });
    const variations = await generateKeywordVariations(keyword, count);
    return json({ keyword, variations });
  }

  if (path === '/api/settings' && request.method === 'GET') {
    return json({
      dbName: 'Amozon DB',
      oxylabsConfigured: Boolean(env.OXYLABS_USERNAME && env.OXYLABS_PASSWORD),
      keepaConfigured: Boolean(env.KEEPA_API_KEY),
      keepaDailyBudget: env.KEEPA_DAILY_TOKEN_BUDGET,
      groqConfigured: Boolean(env.GROQ_API_KEY),
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
      scoringConfig: {
        weights: getCompositeWeights(),
        thresholds: getDecisionThresholds(),
        confidence: getConfidenceThresholds(),
        filters: getFilterConfig(),
        scraper: getScraperConfig(),
      },
    });
  }

  if (path === '/api/settings' && request.method === 'PATCH') {
    const body = await readJson(request);
    const updates: Record<string, string> = {};

    for (const key of EDITABLE_ENV_KEYS) {
      if (!(key in body)) continue;
      const value = String(body[key] ?? '').trim();
      if (value) updates[key] = value;
    }

    if (Object.keys(updates).length) {
      await updateEnvFile(updates);
      applyRuntimeEnv(updates);
    }

    return json({ ok: true, updatedKeys: Object.keys(updates) });
  }

  if (path === '/api/keepa/usage' && request.method === 'GET') {
    return json(await getKeepaUsage() as JsonValue);
  }

  if (path === '/api/theses' && request.method === 'GET') {
    return json({ theses: await listTheses({
      status: url.searchParams.get('status') || '',
      limit: Number(url.searchParams.get('limit') || 50),
      offset: Number(url.searchParams.get('offset') || 0),
    }) as JsonValue });
  }

  if (path === '/api/developer-notes' && request.method === 'GET') {
    return json(await listDeveloperNotes({
      limit: Number(url.searchParams.get('limit') || 50),
      offset: Number(url.searchParams.get('offset') || 0),
      status: url.searchParams.get('status') || '',
    }) as JsonValue);
  }

  if (path === '/api/developer-notes' && request.method === 'POST') {
    const note = await createDeveloperNote(await readJson(request));
    if (!note) return json({ error: 'subject_and_body_required' }, { status: 400 });
    return json(note as JsonValue, { status: 201 });
  }

  if (path === '/api/scans' && request.method === 'GET') {
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const result = await listScans({ limit, offset });
    return json(result as JsonValue);
  }

  if (path === '/api/scans' && request.method === 'POST') {
    const body = await readJson(request);
    const rawAsin = String(body.asin || '').trim().toUpperCase();
    const marketplace = String(body.marketplace || 'com').trim() || 'com';
    const autoAdd = Boolean(body.auto_add);

    let keyword = String(body.keyword || '').trim();
    let seedAsin: string | null = null;
    let seedAsinTitle: string | null = null;

    // ASIN modu — ürün başlığından keyword türet, normal scan akışı devam eder
    if (rawAsin && !keyword) {
      const { isAsin, resolveAsinToKeyword } = await import('@/amazon/asin-resolver');
      if (!isAsin(rawAsin)) return json({ error: 'invalid_asin_format' }, { status: 400 });
      try {
        const resolved = await resolveAsinToKeyword(rawAsin, marketplace);
        keyword = resolved.keyword;
        seedAsin = rawAsin;
        seedAsinTitle = resolved.title;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'ASIN_RESOLVE_FAILED';
        // OH.2 — Oxylabs erişim/kota hatasını geçersiz ASIN'den ayır.
        const dataSourceDown = /_(401|403|408|429|5\d\d)$|NOT_CONFIGURED|TIMEOUT|ECONNRESET|ECONNREFUSED/i.test(msg);
        if (dataSourceDown) {
          return json(
            { error: 'data_source_unavailable', detail: msg, message: 'Veri kaynağı (Oxylabs) şu an erişilemez; lütfen biraz sonra tekrar deneyin.' },
            { status: 503 },
          );
        }
        return json(
          { error: 'asin_resolve_failed', detail: msg, message: 'ASIN çözümlenemedi; ASIN geçerli ve ürün erişilebilir olmalı.' },
          { status: 400 },
        );
      }
    }

    if (!keyword) return json({ error: 'keyword_or_asin_required' }, { status: 400 });
    if (!(await isAllowedKeyword(keyword))) {
      if (!autoAdd && !seedAsin) return json({ error: 'keyword_not_allowed' }, { status: 400 });
      await pool.execute(
        `INSERT IGNORE INTO amazon_keywords (id, keyword, marketplace) VALUES (UUID(), ?, ?)`,
        [keyword, marketplace],
      );
    }

    // OH.7 — Kota koruması: aynı keyword+marketplace için TTL içinde tamamlanmış
    // scan varsa yeniden tarama yapma; operatöre "cached kullan / yeniden tara"
    // seçeneği sun. force:true ile bypass. Veri-akışı katmanı; skor değişmez.
    const force = Boolean(body.force);
    if (force) cacheStats.forced += 1;
    if (!force) {
      const [cacheRows] = await pool.execute(
        `SELECT id, created_at,
                TIMESTAMPDIFF(MINUTE, created_at, NOW()) AS age_min
         FROM amazon_scan_jobs
         WHERE keyword = ? AND marketplace = ? AND status = 'done'
           AND created_at >= DATE_SUB(NOW(), INTERVAL ${env.SCAN_CACHE_TTL_MIN} MINUTE)
         ORDER BY created_at DESC
         LIMIT 1`,
        [keyword, marketplace],
      );
      const cached = (cacheRows as Array<{ id: string; created_at: unknown; age_min: number | string }>)[0];
      if (cached) {
        cacheStats.hits += 1;
        const ageMin = Number(cached.age_min) || 0;
        return json({
          cached_available: true,
          jobId: cached.id,
          keyword,
          marketplace,
          seed_asin: seedAsin,
          seed_asin_title: seedAsinTitle,
          cached_at: cached.created_at,
          age_minutes: ageMin,
          ttl_minutes: env.SCAN_CACHE_TTL_MIN,
          message: `Bu keyword için ${ageMin} dk önce tamamlanmış bir tarama var. Kotayı korumak için mevcut sonucu kullanabilir veya yeniden tarayabilirsiniz.`,
        });
      }
    }

    if (!force) cacheStats.misses += 1;
    const job = await createJob(keyword, marketplace);
    runInBackground(job.id);
    return json({ jobId: job.id, keyword, seed_asin: seedAsin, seed_asin_title: seedAsinTitle, cached_available: false });
  }

  const scanRetryMatch = path.match(/^\/api\/scans\/([^/]+)\/retry$/);
  if (scanRetryMatch && request.method === 'POST') {
    const source = await findScanJob(scanRetryMatch[1]);
    if (!source) return json({ error: 'not_found' }, { status: 404 });
    const job = await createJob(source.keyword, source.marketplace);
    runInBackground(job.id);
    return json({ jobId: job.id, keyword: job.keyword, marketplace: job.marketplace });
  }

  const scanThesisMatch = path.match(/^\/api\/scans\/([^/]+)\/thesis$/);
  if (scanThesisMatch && request.method === 'POST') {
    const body = await readJson(request);
    console.log(`[DEBUG] Creating thesis for ${scanThesisMatch[1]}`);
    const thesis = await createThesis(scanThesisMatch[1], String(body.operator_notes || ''));
    if (!thesis) {
      console.log(`[DEBUG] Thesis creation returned null for ${scanThesisMatch[1]}`);
      return json({ error: 'not_found' }, { status: 404 });
    }
    return json(thesis as JsonValue, { status: 201 });
  }

  const scanKeepaStatusMatch = path.match(/^\/api\/scans\/([^/]+)\/keepa\/status$/);
  if (scanKeepaStatusMatch && request.method === 'GET') {
    const status = await getKeepaStatusForScan(scanKeepaStatusMatch[1]);
    if (!status) return json({ error: 'not_found' }, { status: 404 });
    return json(status as JsonValue);
  }

  const scanKeepaDetailMatch = path.match(/^\/api\/scans\/([^/]+)\/keepa-detail$/);
  if (scanKeepaDetailMatch && request.method === 'GET') {
    const detail = await getKeepaDetailForScan(scanKeepaDetailMatch[1]);
    if (!detail) return json({ error: 'not_found' }, { status: 404 });
    return json(detail as JsonValue);
  }

  const scanProgressMatch = path.match(/^\/api\/scans\/([^/]+)\/progress$/);
  if (scanProgressMatch && request.method === 'GET') {
    const progress = await getScanProgress(scanProgressMatch[1]);
    if (!progress) return json({ error: 'not_found' }, { status: 404 });
    return json(progress as JsonValue);
  }

  const scanKeepaMatch = path.match(/^\/api\/scans\/([^/]+)\/keepa$/);
  if (scanKeepaMatch && request.method === 'POST') {
    const source = await findScanJob(scanKeepaMatch[1]);
    if (!source) return json({ error: 'not_found' }, { status: 404 });
    if (source.status !== 'done') return json({ error: 'scan_not_done' }, { status: 400 });
    const result = await triggerKeepaForScan(scanKeepaMatch[1]);
    return json(result as JsonValue, { status: result.ok ? 200 : 400 });
  }

  const scanSellerEnrichmentMatch = path.match(/^\/api\/scans\/([^/]+)\/seller-enrichment$/);
  if (scanSellerEnrichmentMatch && request.method === 'POST') {
    const body = await readJson(request);
    const result = await enrichSellersForScan(scanSellerEnrichmentMatch[1], Number(body.limit || 10));
    if (!result) return json({ error: 'not_found' }, { status: 404 });
    return json(result as JsonValue);
  }

  const scanDecisionJsonMatch = path.match(/^\/api\/scans\/([^/]+)\/decision-json$/);
  if (scanDecisionJsonMatch && request.method === 'GET') {
    const result = await getDecisionJson(scanDecisionJsonMatch[1], skuPageOptions(url));
    if (!result) return json({ error: 'not_found' }, { status: 404 });
    return json(result as JsonValue);
  }

  const scanDecisionMatch = path.match(/^\/api\/scans\/([^/]+)\/decision$/);
  if (scanDecisionMatch && request.method === 'GET') {
    const result = await getDecisionJson(scanDecisionMatch[1], skuPageOptions(url));
    if (!result) return json({ error: 'not_found' }, { status: 404 });
    return json(result as JsonValue);
  }

  const scanSkusMatch = path.match(/^\/api\/scans\/([^/]+)\/skus$/);
  if (scanSkusMatch && request.method === 'GET') {
    const result = await getDecisionJson(scanSkusMatch[1], skuPageOptions(url));
    if (!result) return json({ error: 'not_found' }, { status: 404 });
    return json({
      scan: result.scan,
      sku_decisions: result.sku_decisions,
      sku_pagination: result.sku_pagination,
    } as JsonValue);
  }

  const riskScoreMatch = path.match(/^\/api\/risk-scores\/([^/]+)$/);
  if (riskScoreMatch && request.method === 'GET') {
    const keyword = decodeURIComponent(riskScoreMatch[1]);
    const marketplace = url.searchParams.get('marketplace') || 'com';
    const report = await getLatestAmazonRiskReport(keyword, marketplace);
    if (!report) return json({ error: 'not_found' }, { status: 404 });
    return json(report as JsonValue);
  }

  const thesisEvaluateMatch = path.match(/^\/api\/theses\/([^/]+)\/evaluate$/);
  if (thesisEvaluateMatch && request.method === 'POST') {
    const thesis = await evaluateThesis(thesisEvaluateMatch[1]);
    if (!thesis) return json({ error: 'not_found' }, { status: 404 });
    return json(thesis as JsonValue);
  }

  const thesisCloseMatch = path.match(/^\/api\/theses\/([^/]+)\/close$/);
  if (thesisCloseMatch && request.method === 'POST') {
    const thesis = await closeThesis(thesisCloseMatch[1]);
    if (!thesis) return json({ error: 'not_found' }, { status: 404 });
    return json(thesis as JsonValue);
  }

  const scanMatch = path.match(/^\/api\/scans\/([^/]+)$/);
  if (scanMatch && request.method === 'GET') {
    const scan = await getScan(scanMatch[1]);
    if (!scan) return json({ error: 'not_found' }, { status: 404 });
    return json(scan as JsonValue);
  }

  const keywordMatch = path.match(/^\/api\/keywords\/([^/]+)$/);
  if (keywordMatch && request.method === 'PATCH') {
    const body = await readJson(request);
    const keyword = String(body.keyword || '').trim();
    const marketplace = String(body.marketplace || 'com').trim() || 'com';
    if (!keyword) return json({ error: 'keyword_required' }, { status: 400 });

    const [result] = await pool.execute(
      `UPDATE amazon_keywords SET keyword = ?, marketplace = ? WHERE id = ?`,
      [keyword, marketplace, keywordMatch[1]],
    );
    const affectedRows = Number((result as { affectedRows?: number }).affectedRows ?? 0);
    if (!affectedRows) return json({ error: 'not_found' }, { status: 404 });
    return json({ id: keywordMatch[1], keyword, marketplace });
  }

  if (keywordMatch && request.method === 'DELETE') {
    const [result] = await pool.execute(
      `DELETE FROM amazon_keywords WHERE id = ?`,
      [keywordMatch[1]],
    );
    const affectedRows = Number((result as { affectedRows?: number }).affectedRows ?? 0);
    if (!affectedRows) return json({ error: 'not_found' }, { status: 404 });
    return json({ ok: true });
  }

  const developerNoteMatch = path.match(/^\/api\/developer-notes\/([^/]+)$/);
  if (developerNoteMatch && request.method === 'PATCH') {
    const body = await readJson(request);
    const fields: string[] = [];
    const values: Array<string | null> = [];
    if ('subject' in body) {
      const subject = String(body.subject || '').trim();
      if (!subject) return json({ error: 'subject_required' }, { status: 400 });
      fields.push('subject = ?');
      values.push(subject);
    }
    if ('body' in body) {
      const noteBody = String(body.body || '').trim();
      if (!noteBody) return json({ error: 'body_required' }, { status: 400 });
      fields.push('body = ?');
      values.push(noteBody);
    }
    if ('priority' in body) {
      fields.push('priority = ?');
      values.push(normalizePriority(body.priority));
    }
    if ('status' in body) {
      fields.push('status = ?');
      values.push(normalizeNoteStatus(body.status));
    }
    if ('page_path' in body) {
      fields.push('page_path = ?');
      values.push(String(body.page_path || '').trim() || null);
    }
    if ('attachment_url' in body) {
      fields.push('attachment_url = ?');
      values.push(String(body.attachment_url || '').trim() || null);
    }
    if (!fields.length) return json({ error: 'no_updates' }, { status: 400 });
    values.push(developerNoteMatch[1]);

    const [result] = await pool.execute(
      `UPDATE amazon_developer_notes SET ${fields.join(', ')} WHERE id = ?`,
      values,
    );
    const affectedRows = Number((result as { affectedRows?: number }).affectedRows ?? 0);
    if (!affectedRows) return json({ error: 'not_found' }, { status: 404 });
    return json({ ok: true });
  }

  if (developerNoteMatch && request.method === 'DELETE') {
    const [result] = await pool.execute(
      `DELETE FROM amazon_developer_notes WHERE id = ?`,
      [developerNoteMatch[1]],
    );
    const affectedRows = Number((result as { affectedRows?: number }).affectedRows ?? 0);
    if (!affectedRows) return json({ error: 'not_found' }, { status: 404 });
    return json({ ok: true });
  }

  return json({ error: 'not_found' }, { status: 404 });
}

Bun.serve({
  port: env.PORT,
  fetch: (request) => handleRequest(request).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    console.error(message);
    return json({ error: message }, { status: 500 });
  }),
});

console.log(`Amozon backend API running at http://localhost:${env.PORT}`);
startScheduler();

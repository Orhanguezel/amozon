import { pool } from '@/db/client';
import { buildActionDistribution, buildDataGate, buildDataQuality, buildDecisionSurface, buildSkuDecisions } from './amazon.scoring-engine';
import type { AmazonRiskReport, Confidence } from './amazon.types';

export async function getLatestAmazonRiskReport(keyword: string, marketplace = 'com') {
  const [rows] = await pool.execute(
    `SELECT ars.*, asj.keyword, asj.marketplace, asj.created_at AS scanned_at
     FROM amazon_risk_scores ars
     JOIN amazon_scan_jobs asj ON asj.id = ars.job_id
     WHERE asj.keyword = ? AND asj.marketplace = ?
     ORDER BY ars.created_at DESC
     LIMIT 1`,
    [keyword, marketplace],
  );
  const row = (rows as Record<string, unknown>[])[0];
  if (!row) return null;

  const [productRows] = await pool.execute(
    `SELECT title, price, rating, review_count, seller_name, product_url
     FROM amazon_products
     WHERE job_id = ?
     LIMIT 500`,
    [String(row.job_id)],
  );
  const [keepaRows] = await pool.execute(
    `SELECT aks.asin, aks.price_30d_min, aks.price_30d_max, aks.price_90d_avg
     FROM amazon_keepa_snapshots aks
     WHERE aks.asin IN (
       SELECT ap.asin FROM amazon_products ap WHERE ap.job_id = ? AND ap.asin IS NOT NULL
     )
       AND aks.marketplace = ?
     ORDER BY aks.fetched_at DESC
     LIMIT 20`,
    [String(row.job_id), String(row.marketplace || 'com')],
  );
  const keepaTrend = buildKeepaTrend(keepaRows as Array<Record<string, unknown>>, String(row.marketplace || 'com'));
  const keepaAsinSet = new Set((keepaRows as Array<Record<string, unknown>>).map((keepaRow) => String(keepaRow.asin || '')).filter(Boolean));
  const fallbackProducts = (productRows as Array<Record<string, unknown>>).map((product) => ({
    product_title: String(product.title || ''),
    price: numberOrUndefined(product.price),
    rating: numberOrUndefined(product.rating),
    review_count: Number(product.review_count || 0),
    seller_name: typeof product.seller_name === 'string' ? product.seller_name : undefined,
    product_url: typeof product.product_url === 'string' ? product.product_url : undefined,
  }));
  const dataQuality = parseJson(row.data_quality) ?? buildDataQuality(fallbackProducts, keepaAsinSet);
  const skuDecisions = parseJson(row.sku_decisions) ?? buildSkuDecisions(
    fallbackProducts,
    keepaAsinSet,
    median(fallbackProducts.map((product) => product.price).filter((price): price is number => typeof price === 'number')),
  );
  const actionDistribution = buildActionDistribution(skuDecisions as ReturnType<typeof buildSkuDecisions>);
  const dataGate = buildDataGate(dataQuality as AmazonRiskReport['data_quality'], actionDistribution, false);
  const scores = {
    category_risk: {
      score: Number(row.category_risk_score ?? 0),
      confidence: normalizeConfidence(row.category_risk_confidence),
      reason: String(row.category_risk_reason ?? 'Kategori yoğunluğu ve satıcı dağılımı değerlendirildi.'),
    },
    sku_chaos: {
      score: Number(row.sku_chaos_score ?? 0),
      confidence: normalizeConfidence(row.sku_chaos_confidence),
      reason: String(row.sku_chaos_reason ?? 'Fiyat aralığı, sigma ve varyant baskısı değerlendirildi.'),
    },
    price_war_risk: {
      score: Number(row.price_war_score ?? 0),
      confidence: normalizeConfidence(row.price_war_confidence),
      reason: String(row.price_war_reason ?? 'Fiyat kırılımı ve düşük fiyat kümesi değerlendirildi.'),
    },
    brand_reliability: {
      score: Number(row.brand_reliability_score ?? 0),
      confidence: normalizeConfidence(row.brand_reliability_confidence),
      reason: String(row.brand_reliability_reason ?? 'Marka tutarlılığı ve listing kalitesi değerlendirildi.'),
    },
    operational_risk: {
      score: Number(row.operational_risk_score ?? 0),
      confidence: normalizeConfidence(row.operational_risk_confidence),
      reason: String(row.operational_risk_reason ?? 'Yorum problem skoru ve kritik şikayetler değerlendirildi.'),
    },
  };
  const compositeScore = row.composite_score === null || row.composite_score === undefined ? null : Number(row.composite_score);
  const fallbackDecisionSurface = buildDecisionSurface(
    scores,
    normalizeDecision(row.decision),
    dataQuality as AmazonRiskReport['data_quality'],
    compositeScore,
    actionDistribution,
    dataGate,
  );
  const storedDecisionSurface = parseJson(row.decision_surface) as Record<string, unknown> | null;
  const decisionSurface = {
    ...fallbackDecisionSurface,
    ...(storedDecisionSurface ?? {}),
    legacy_decision: storedDecisionSurface?.legacy_decision ?? normalizeDecision(row.decision),
    action_distribution: storedDecisionSurface?.action_distribution ?? actionDistribution,
    data_gate: storedDecisionSurface?.data_gate ?? dataGate,
  };
  const enrichment = row.enrichment
    ? (typeof row.enrichment === 'string' ? JSON.parse(row.enrichment) : row.enrichment) as Record<string, unknown>
    : null;

  return {
    keyword: row.keyword,
    scanned_at: row.scanned_at,
    data_points: Number(row.data_points ?? 0),
    scores,
    composite_score: compositeScore,
    decision: row.decision,
    summary: row.summary ?? '',
    insufficient_data_reason: enrichment?.insufficient_data_reason ?? null,
    data_quality: dataQuality,
    decision_surface: decisionSurface,
    sku_decisions: skuDecisions,
    outreach_priority: row.outreach_priority !== null && row.outreach_priority !== undefined ? Number(row.outreach_priority) : 1,
    persuasion_points: row.persuasion_points
      ? (typeof row.persuasion_points === 'string' ? JSON.parse(row.persuasion_points) : row.persuasion_points) as string[]
      : [],
    brand_context: {
      brand_aggregated: false,
      brand_name: (row.brand_name as string | null) ?? null,
      sku_count: null,
    },
    enrichment,
    keepa_trend: keepaTrend,
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
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

function parseJson(value: unknown) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

  const points = [
    { label: '30d min', price: avg('price_30d_min') },
    { label: '90d avg', price: avg('price_90d_avg') },
    { label: '30d max', price: avg('price_30d_max') },
  ].filter((point): point is { label: string; price: number } => point.price !== null);
  return {
    sample_count: rows.length,
    source_scope: 'keepa_snapshot_aggregate',
    price_points: points,
    buy_box_change_avg: avg('buy_box_change_count'),
    seller_count_trend_avg: avg('seller_count_trend'),
    missing_fields: rows.length ? [] : ['price_points'],
    note: rows.length
      ? 'Keepa snapshot agregasyonu mevcut.'
      : 'Bu scan için Keepa snapshot yok; detail enrichment gerekir.',
  };
}

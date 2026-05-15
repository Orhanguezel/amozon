import { calculateCategoryStats, normalizeProducts } from './category.normalizer';
import { CompositeScorer, calculateOutreachPriority } from './composite.scorer';
import { evaluateCoverageGate } from './coverage-gate';
import { generatePersuasionPoints, synthesizeCommercialSummary } from './persuasion.generator';
import { validateSignals } from './signal.validator';
import { scoreBrandReliability } from './scorers/brand-reliability.scorer';
import { scoreCategoryRisk } from './scorers/category-risk.scorer';
import { scoreOperationalRisk } from './scorers/operational-risk.scorer';
import { scorePriceWar } from './scorers/price-war.scorer';
import { scoreSkuChaos } from './scorers/sku-chaos.scorer';
import type { AmazonProduct } from './amazon.scraper';
import type { ActionDistribution, AmazonRiskReport, DataGate, DataQuality, DecisionSurface, NormalizedProduct, SkuAction, SkuDecision, SkuDecisionTier, SkuSignals } from './amazon.types';
import { DATA_QUALITY_CONFIG, getConfidenceThresholds, getScraperConfig } from './scoring.config';

import type { KeepaSnapshot } from './keepa.client';

export function scoreAmazonCategory(input: {
  keyword: string;
  marketplace: string;
  products: AmazonProduct[];
  keepaAsinSet?: Set<string>;
  keepaSnapshots?: KeepaSnapshot[];
  pageOneAveragePrice?: number | null;
  pageThreeAveragePrice?: number | null;
  reviewProblemScore?: number;
  reviewProblemFlags?: string[];
}): AmazonRiskReport {
  const stats = calculateCategoryStats(input.keyword, input.marketplace, input.products);
  const products = normalizeProducts(input.products);
  const dataQuality = buildDataQuality(products, input.keepaAsinSet ?? new Set());
  const skuDecisions = buildSkuDecisions(products, input.keepaAsinSet ?? new Set(), stats.priceMedian);
  const actionDistribution = buildActionDistribution(skuDecisions);
  const scoreInput = {
    ...input,
    products,
    stats,
    qualityFactors: {
      sellerCoverage: dataQuality.seller_coverage,
      priceCoverage: dataQuality.price_coverage,
      hasKeepaData: dataQuality.has_keepa_snapshot,
    },
  };
  const scores = {
    category_risk: scoreCategoryRisk(scoreInput),
    sku_chaos: scoreSkuChaos(scoreInput),
    price_war_risk: scorePriceWar(scoreInput),
    brand_reliability: scoreBrandReliability(scoreInput),
    operational_risk: scoreOperationalRisk(scoreInput),
  };
  const hasPriceData = products.some((product) => typeof product.price === 'number');
  const scraperConfig = getScraperConfig();
  const scored = new CompositeScorer().score(scores);
  const compositeScore = scraperConfig.REQUIRE_PRICE_DATA && !hasPriceData ? null : scored.compositeScore;
  const decision = scraperConfig.REQUIRE_PRICE_DATA && !hasPriceData ? 'INSUFFICIENT_DATA' : scored.decision;
  const validated = validateSignals(
    { scores, decision },
    { hasPriceData },
  );
  const dataGate = buildDataGate(dataQuality, actionDistribution, scraperConfig.REQUIRE_PRICE_DATA && !hasPriceData);
  const decisionSurface = buildDecisionSurface(scores, validated.decision, dataQuality, compositeScore, actionDistribution, dataGate);
  const gated = applyCoverageGate(validated.decision, decisionSurface, dataQuality);
  const insufficientDataReason = buildInsufficientDataReason({
    products,
    scores,
    compositeScore,
    hasPriceData,
  });

  return {
    keyword: input.keyword,
    scanned_at: new Date().toISOString(),
    data_points: products.length,
    scores,
    composite_score: compositeScore,
    decision: gated.decision,
    summary: [
      `${products.length} Amazon ürünü analiz edildi.`,
      insufficientDataReason ?? (compositeScore === null ? 'Veri güveni yetersiz.' : `Composite skor ${compositeScore}.`),
      dataQuality.confidence_blockers.length ? `Veri kalite uyarıları: ${dataQuality.confidence_blockers.map(dataQualityLabel).join(', ')}.` : '',
      ...validated.notes,
    ].filter(Boolean).join(' '),
    insufficient_data_reason: insufficientDataReason,
    data_quality: dataQuality,
    decision_surface: gated.decisionSurface,
    sku_decisions: skuDecisions,
    outreach_priority: calculateOutreachPriority(compositeScore, scores.brand_reliability.score),
    persuasion_points: generatePersuasionPoints(scores),
    brand_context: { brand_aggregated: false, brand_name: null, sku_count: null },
    enrichment: null,
  };
}

export function applyCoverageGate(
  decision: AmazonRiskReport['decision'],
  decisionSurface: DecisionSurface,
  dataQuality: DataQuality,
) {
  const action = primaryActionFromDecision(decision);
  const coverageGate = evaluateCoverageGate(action, dataQuality);
  if (!coverageGate) return { decision, decisionSurface };
  return {
    decision: 'DIKKATLI_OL' as AmazonRiskReport['decision'],
    decisionSurface: {
      ...decisionSurface,
      legacy_decision: decision,
      primary_action: 'TAKIP_ET' as const,
      confidence: decisionSurface.confidence === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' as const : 'LOW' as const,
      gate_applied: true,
      coverage_gate: coverageGate,
      operator_summary: 'ÖN DEĞERLENDİRME — satıcı kapsaması düşük ve Keepa kapsaması düşük; AL/UZAK DUR yerine TAKİP ET olarak izlenmeli.',
    },
  };
}

export function buildDecisionSurface(
  scores: AmazonRiskReport['scores'],
  decision: AmazonRiskReport['decision'],
  dataQuality: DataQuality,
  compositeScore: number | null,
  actionDistribution: ActionDistribution = emptyActionDistribution(),
  dataGate: DataGate = buildDataGate(dataQuality, actionDistribution, false),
): DecisionSurface {
  const topReasons = Object.values(scores)
    .filter((score) => score.reason)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((score) => score.reason);
  const confidence = decisionSurfaceConfidence(decision, dataQuality);
  const primaryAction = primaryActionFromDecision(decision);

  return {
    legacy_decision: decision,
    primary_action: primaryAction,
    confidence,
    confidence_blockers: dataQuality.confidence_blockers,
    top_reasons: topReasons,
    operator_summary: operatorSummary(primaryAction, confidence, dataQuality, compositeScore, dataGate, scores),
    data_gate: dataGate,
    action_distribution: actionDistribution,
  };
}

export function buildActionDistribution(skuDecisions: SkuDecision[]): ActionDistribution {
  const counts: Record<SkuAction, number> = { AL: 0, TAKIP_ET: 0, UZAK_DUR: 0 };
  const confirmedCounts: Record<SkuAction, number> = { AL: 0, TAKIP_ET: 0, UZAK_DUR: 0 };
  for (const decision of skuDecisions) {
    counts[decision.action] += 1;
    if (decision.decision_tier === 'DECISION_READY') confirmedCounts[decision.action] += 1;
  }
  const total = skuDecisions.length;
  const [dominantAction, dominantCount] = (Object.entries(counts) as Array<[SkuAction, number]>)
    .sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const dominantRatio = total > 0 ? dominantCount / total : 0;
  const confirmedTotal = Object.values(confirmedCounts).reduce((a, b) => a + b, 0);
  const singleActionWarning = confirmedTotal >= 10 && (confirmedCounts.AL + confirmedCounts.TAKIP_ET + confirmedCounts.UZAK_DUR > 0)
    && Object.values(confirmedCounts).filter((c) => c > 0).length === 1
    ? `Tüm onaylı SKU'lar ${skuActionLabel(dominantAction)} aksiyonuna düştü; ek enrichment önerilir.`
    : null;

  return {
    total,
    counts,
    confirmed_counts: confirmedCounts,
    dominant_action: total > 0 ? dominantAction : null,
    dominant_ratio: Number(dominantRatio.toFixed(2)),
    single_action_warning: singleActionWarning,
  };
}

export function buildDataGate(
  dataQuality: DataQuality,
  actionDistribution: ActionDistribution = emptyActionDistribution(),
  priceDataRequiredMissing = false,
): DataGate {
  const reasons: DataGate['reasons'] = [];
  if (dataQuality.confidence_blockers.includes('insufficient_data_points')) reasons.push('insufficient_data_points');
  if (priceDataRequiredMissing || !dataQuality.has_price_data) reasons.push('price_data_required');
  if (dataQuality.confidence_blockers.includes('seller_coverage_low')) reasons.push('seller_enrichment_required');
  if (dataQuality.confidence_blockers.includes('low_price_coverage')) reasons.push('price_coverage_low');
  if (dataQuality.confidence_blockers.includes('no_keepa_data') || dataQuality.keepa_coverage < 0.5) reasons.push('keepa_enrichment_recommended');
  if (actionDistribution.single_action_warning) reasons.push('single_action_distribution');

  const status: DataGate['status'] = reasons.includes('insufficient_data_points') || reasons.includes('price_data_required')
    ? 'INSUFFICIENT_DATA'
    : reasons.length
      ? 'ENRICHMENT_REQUIRED'
      : 'READY';

  return {
    status,
    reasons: [...new Set(reasons)],
    message: dataGateMessage(status, [...new Set(reasons)]),
  };
}

export function buildSkuDecisions(
  products: Array<NormalizedProduct | AmazonProduct>,
  keepaAsinSet: Set<string>,
  priceMedian: number,
): SkuDecision[] {
  return products.map((product) => {
    const asin = extractAsinFromUrl(product.product_url);
    const signals: SkuSignals = {
      price_status: priceStatus(product.price, priceMedian),
      seller_status: product.seller_name?.trim() ? 'real' : 'missing',
      review_tier: reviewTier(product.review_count ?? 0),
      rating_level: ratingLevel(product.rating),
      keepa_status: asin ? (keepaAsinSet.has(asin) ? 'available' : 'missing') : 'no_asin',
    };
    const blockerCount = skuBlockerCount(signals);
    const action = skuAction(signals, blockerCount);
    const confidence = skuConfidence(blockerCount);
    const tier = skuDecisionTier(signals);
    const reasons = buildSkuNarrative(signals, action, product.brand);

    return {
      asin,
      title: product.product_title,
      action,
      confidence,
      decision_tier: tier,
      reasons,
      signals,
    };
  });
}

function skuDecisionTier(signals: SkuSignals): SkuDecisionTier {
  const hasPriceData = signals.price_status !== 'missing';
  const hasReviews = signals.review_tier !== 'low';
  if (hasPriceData && hasReviews) return 'DECISION_READY';
  if (hasPriceData && signals.keepa_status === 'available') return 'PRIORITY_SIGNAL';
  if (hasPriceData && signals.seller_status === 'real') return 'PRIORITY_SIGNAL';
  return 'PENDING_ENRICHMENT';
}

function buildSkuNarrative(signals: SkuSignals, action: SkuAction, brand?: string | null): string[] {
  const reasons: string[] = [];

  // Cross-dimension kombinasyon narratives — önce güçlü kombinasyonlar
  if (signals.seller_status === 'real' && signals.price_status === 'low' && signals.review_tier === 'high') {
    reasons.push('Amazon listingi düşük fiyatlı ve yüksek sosyal kanıtlı; platform kaynaklı fiyat baskısı, rakip marka için güç penceresi dar.');
  } else if (signals.seller_status === 'real' && signals.price_status === 'high' && signals.keepa_status === 'available') {
    reasons.push('Doğrulanmış satıcı, yüksek fiyat ve Keepa geçmişi mevcut; fiyat istikrarı kontrol edilmeli — monopol mi yoksa premium segment mi belirsiz.');
  } else if (signals.seller_status === 'real' && signals.review_tier === 'high' && signals.rating_level === 'strong') {
    reasons.push('Güvenilir satıcı + yüksek yorum + güçlü puan; kategoride köklü listing, yeni girişe direnç yüksek.');
  } else if (signals.seller_status === 'missing' && signals.keepa_status !== 'available' && signals.price_status !== 'missing') {
    reasons.push('Satıcı ve Keepa verisi yok; fiyat sinyali tek dayanak, karar öncesi enrichment gerekli.');
  } else if (signals.price_status === 'high' && signals.seller_status === 'missing') {
    reasons.push('Yüksek fiyat + satıcı bilinmiyor; marka tescili veya tekel satıcı olabilir — satıcı doğrulaması önerilir.');
  } else if (signals.review_tier === 'low' && signals.price_status === 'low') {
    reasons.push('Düşük sosyal kanıt ve düşük fiyat birlikte; olgunlaşmamış veya ölü listing riski var.');
  } else if (signals.rating_level === 'weak' && signals.review_tier === 'high') {
    reasons.push('Yüksek yorum ama zayıf puan; müşteri şikayeti yoğun, kalite sorununu çözen girecek için fırsat mı incelenmeli.');
  }

  if (brand) {
    reasons.push(`Marka: ${brand} (doğrulanmış).`);
  }

  // Sinyal-bazlı fallback reasons — kombinasyon yakalanmadıysa
  if (!reasons.length || reasons[0].includes('enrichment')) {
    if (signals.price_status === 'missing') reasons.push('Fiyat verisi yok; karşılaştırma yapılamıyor.');
    if (signals.price_status === 'low') reasons.push('Kategori medyanının altında fiyatlı; fiyat baskısı var.');
    if (signals.price_status === 'high') reasons.push('Kategori ortalamasının üzerinde; premium segment.');
    if (signals.seller_status === 'missing') reasons.push('Satıcı bilgisi yok; güvenilirlik doğrulanamıyor.');
    if (signals.review_tier === 'low') reasons.push('Düşük yorum sayısı; sosyal kanıt yetersiz.');
    if (signals.review_tier === 'high') reasons.push('Yüksek yorum sayısı; köklü listing.');
    if (signals.rating_level === 'weak') reasons.push('Puan 4.0 altında; yorum kalitesi sorunlu olabilir.');
    if (signals.rating_level === 'missing') reasons.push('Puan verisi yok.');
    if (signals.keepa_status === 'missing') reasons.push('Keepa fiyat geçmişi yok; fiyat istikrarı bilinmiyor.');
    if (signals.keepa_status === 'no_asin') reasons.push('ASIN çözümlenemedi; Keepa verisi eklenemiyor.');
    if (action === 'AL' && !reasons.length) reasons.push('Tüm sinyaller olumlu; veri kalitesi yeterli.');
  }

  if (action === 'UZAK_DUR' && signals.review_tier === 'low' && signals.price_status !== 'normal') {
    reasons.unshift('Düşük sosyal kanıt ve uç fiyat sinyali birlikte risk oluşturuyor.');
  }

  return [...new Set(reasons)].slice(0, 4);
}

export function buildDataQuality(products: Array<NormalizedProduct | AmazonProduct>, keepaAsinSet: Set<string>): DataQuality {
  const total = products.length;
  const withPrice = products.filter((product) => typeof product.price === 'number').length;
  const withSeller = products.filter((product) => Boolean(product.seller_name?.trim())).length;
  const asinList = products
    .map((product) => extractAsinFromUrl(product.product_url))
    .filter((asin): asin is string => Boolean(asin));
  const withKeepa = asinList.filter((asin) => keepaAsinSet.has(asin)).length;
  const priceCoverage = total > 0 ? withPrice / total : 0;
  const sellerCoverage = total > 0 ? withSeller / total : 0;
  const keepaCoverage = asinList.length > 0 ? withKeepa / asinList.length : 0;
  const thresholds = getConfidenceThresholds();
  const blockers: DataQuality['confidence_blockers'] = [];

  if (sellerCoverage < DATA_QUALITY_CONFIG.SELLER_COVERAGE_LOW) blockers.push('seller_coverage_low');
  if (priceCoverage < DATA_QUALITY_CONFIG.PRICE_COVERAGE_LOW) blockers.push('low_price_coverage');
  if (keepaCoverage === 0) blockers.push('no_keepa_data');
  if (total <= thresholds.INSUFFICIENT_DATA_MAX) blockers.push('insufficient_data_points');

  return {
    data_points: total,
    price_coverage: Number(priceCoverage.toFixed(2)),
    seller_coverage: Number(sellerCoverage.toFixed(2)),
    keepa_coverage: Number(keepaCoverage.toFixed(2)),
    has_price_data: priceCoverage > 0,
    has_keepa_snapshot: keepaCoverage > 0,
    confidence_blockers: blockers,
  };
}

export function extractAsinFromUrl(productUrl?: string | null) {
  return productUrl?.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ?? null;
}

function priceStatus(price: number | undefined, priceMedian: number): SkuSignals['price_status'] {
  if (typeof price !== 'number') return 'missing';
  if (priceMedian > 0 && price < priceMedian * 0.7) return 'low';
  if (priceMedian > 0 && price > priceMedian * 1.3) return 'high';
  return 'normal';
}

function reviewTier(reviewCount: number): SkuSignals['review_tier'] {
  if (reviewCount < 50) return 'low';
  if (reviewCount <= 500) return 'mid';
  return 'high';
}

function ratingLevel(rating: number | undefined): SkuSignals['rating_level'] {
  if (typeof rating !== 'number') return 'missing';
  if (rating < 4) return 'weak';
  if (rating < 4.5) return 'acceptable';
  return 'strong';
}

function skuBlockerCount(signals: SkuSignals) {
  return [
    signals.price_status === 'missing',
    signals.seller_status === 'missing',
    signals.keepa_status === 'missing' || signals.keepa_status === 'no_asin',
    signals.rating_level === 'missing',
  ].filter(Boolean).length;
}

function skuAction(signals: SkuSignals, blockerCount: number): SkuAction {
  if (signals.price_status === 'missing') return 'UZAK_DUR';
  if (signals.rating_level === 'weak') return 'UZAK_DUR';
  if (signals.seller_status === 'missing' && signals.keepa_status !== 'available' && signals.price_status !== 'normal') return 'UZAK_DUR';
  if (signals.review_tier === 'low' && (signals.price_status === 'high' || signals.price_status === 'low')) return 'UZAK_DUR';
  if (signals.seller_status === 'real' && signals.keepa_status === 'available' && blockerCount === 0) return 'AL';
  if (signals.seller_status === 'real' && signals.rating_level === 'strong' && signals.review_tier === 'high' && signals.price_status === 'normal') return 'AL';
  if (blockerCount >= 3) return 'UZAK_DUR';
  if (blockerCount >= 1) return 'TAKIP_ET';
  return 'AL';
}

function skuConfidence(blockerCount: number): SkuDecision['confidence'] {
  if (blockerCount >= 2) return 'LOW';
  if (blockerCount === 0) return 'HIGH';
  return 'MEDIUM';
}

function skuReasons(signals: SkuSignals, action: SkuAction) {
  const reasons: string[] = [];
  if (signals.price_status === 'missing') reasons.push('Fiyat verisi yok; fiyat karşılaştırması yapılamıyor.');
  if (signals.price_status === 'low') reasons.push('Kategori medyanının altında fiyatlı; fiyat baskısı var.');
  if (signals.price_status === 'high') reasons.push('Kategori ortalamasının üzerinde; premium segment.');
  if (signals.seller_status === 'missing') reasons.push('Satıcı bilgisi yok; güvenilirlik doğrulanamıyor.');
  if (signals.review_tier === 'low') reasons.push('Düşük yorum sayısı; sosyal kanıt yetersiz.');
  if (signals.review_tier === 'high') reasons.push('Yüksek yorum sayısı; köklü listing.');
  if (signals.rating_level === 'weak') reasons.push('Puan 4.0 altında; yorum kalitesi sorunlu olabilir.');
  if (signals.rating_level === 'missing') reasons.push('Puan verisi yok.');
  if (signals.keepa_status === 'missing') reasons.push('Keepa fiyat geçmişi çekilmedi; fiyat istikrarı bilinmiyor.');
  if (signals.keepa_status === 'no_asin') reasons.push('ASIN çözümlenemedi; Keepa verisi eklenemiyor.');
  if (action === 'UZAK_DUR' && signals.review_tier === 'low' && signals.price_status !== 'normal') {
    reasons.unshift('Düşük sosyal kanıt ve uç fiyat sinyali birlikte risk oluşturuyor.');
  }
  if (action === 'AL' && !reasons.length) reasons.push('Veri kalitesi yeterli.');
  return [...new Set(reasons)].slice(0, 4);
}

function primaryActionFromDecision(decision: AmazonRiskReport['decision']): SkuAction {
  switch (decision) {
    case 'GUVENLI':
      return 'AL';
    case 'GIRME':
      return 'UZAK_DUR';
    case 'DIKKATLI_OL':
    case 'MIXED_SIGNAL':
    case 'INSUFFICIENT_DATA':
    default:
      return 'TAKIP_ET';
  }
}

function decisionSurfaceConfidence(decision: AmazonRiskReport['decision'], dataQuality: DataQuality): DecisionSurface['confidence'] {
  if (decision === 'INSUFFICIENT_DATA' || dataQuality.confidence_blockers.includes('insufficient_data_points')) return 'INSUFFICIENT_DATA';
  const blockerCount = dataQuality.confidence_blockers.filter((blocker) => blocker !== 'no_keepa_data').length;
  if (blockerCount >= 2) return 'LOW';
  if (blockerCount === 1) return 'MEDIUM';
  return 'HIGH';
}

function operatorSummary(
  action: SkuAction,
  confidence: DecisionSurface['confidence'],
  dataQuality: DataQuality,
  compositeScore: number | null,
  dataGate: DataGate,
  scores?: AmazonRiskReport['scores'],
) {
  if (dataGate.status === 'ENRICHMENT_REQUIRED') {
    return dataGate.message;
  }
  if (confidence === 'INSUFFICIENT_DATA') {
    return 'Veri sayısı karar için yetersiz; ek tarama veya keyword genişletme gerekli.';
  }
  if (dataQuality.confidence_blockers.includes('seller_coverage_low')) {
    return 'Satıcı verisi zayıf; karar öncesi satıcı/marka doğrulaması gerekli.';
  }
  if (dataQuality.confidence_blockers.includes('low_price_coverage')) {
    return 'Fiyat kapsaması düşük; fiyat karşılaştırması sınırlı güvenle yapılabilir.';
  }
  if (dataQuality.confidence_blockers.includes('no_keepa_data')) {
    return 'Keepa trendi yok; fiyat istikrarı için Keepa kontrolü önerilir.';
  }
  if (scores) {
    return synthesizeCommercialSummary(scores, action, compositeScore);
  }
  if (action === 'AL') {
    return `Veri kalitesi yeterli; ${compositeScore === null ? 'risk düşük görünüyor' : `bileşik skor ${compositeScore}`}.`;
  }
  if (action === 'UZAK_DUR') {
    return `Risk seviyesi yüksek; ${compositeScore === null ? 'karar için veri kalitesi ayrıca kontrol edilmeli' : `bileşik skor ${compositeScore}`}.`;
  }
  return `Orta risk bandı; ${compositeScore === null ? 'ek veriyle izlenmeli' : `bileşik skor ${compositeScore}`}.`;
}

function emptyActionDistribution(): ActionDistribution {
  return {
    total: 0,
    counts: { AL: 0, TAKIP_ET: 0, UZAK_DUR: 0 },
    confirmed_counts: { AL: 0, TAKIP_ET: 0, UZAK_DUR: 0 },
    dominant_action: null,
    dominant_ratio: 0,
    single_action_warning: null,
  };
}

function dataGateMessage(status: DataGate['status'], reasons: DataGate['reasons']) {
  if (status === 'READY') return 'Veri kalitesi karar yüzeyi için hazır.';
  if (status === 'INSUFFICIENT_DATA') {
    if (reasons.includes('price_data_required')) return 'Fiyat verisi eksik; karar yayınlamadan önce ek tarama veya fiyat enrichment gerekli.';
    return 'Veri noktası yetersiz; ek sayfa tarama, keyword varyasyonu veya tekrar deneme gerekli.';
  }
  const messages: string[] = [];
  if (reasons.includes('seller_enrichment_required')) messages.push('satıcı kapsaması düşük');
  if (reasons.includes('keepa_enrichment_recommended')) messages.push('Keepa kapsaması düşük');
  if (reasons.includes('price_coverage_low')) messages.push('fiyat kapsaması düşük');
  if (reasons.includes('single_action_distribution')) messages.push('SKU aksiyon dağılımı tek aksiyona sıkışmış');
  return `Karar öncesi enrichment önerilir: ${messages.join(', ')}.`;
}

function skuActionLabel(action: SkuAction | null) {
  switch (action) {
    case 'AL':
      return 'AL';
    case 'UZAK_DUR':
      return 'UZAK DUR';
    case 'TAKIP_ET':
      return 'TAKİP ET';
    default:
      return 'bilinmeyen';
  }
}

function buildInsufficientDataReason(input: {
  products: ReturnType<typeof normalizeProducts>;
  scores: AmazonRiskReport['scores'];
  compositeScore: number | null;
  hasPriceData: boolean;
}) {
  if (input.compositeScore !== null) return null;

  const reasons: string[] = [];
  const thresholds = getConfidenceThresholds();
  const minDecisionData = thresholds.LOW_MAX + 1;
  const hardMinimum = thresholds.INSUFFICIENT_DATA_MAX + 1;

  if (input.products.length < hardMinimum) {
    reasons.push(`Filtrelerden sonra yalnızca ${input.products.length} uygun ürün kaldı; en az ${hardMinimum} ürün gerekiyor.`);
  } else if (input.products.length < minDecisionData) {
    reasons.push(`Filtrelerden sonra ${input.products.length} uygun ürün kaldı; karar üretmek için en az ${minDecisionData} ürün gerekiyor.`);
  }

  const lowConfidence = Object.entries(input.scores)
    .filter(([, score]) => score.confidence === 'LOW' || score.confidence === 'INSUFFICIENT_DATA')
    .map(([key, score]) => `${dimensionLabel(key)}: ${score.reason}`);
  if (lowConfidence.length) reasons.push(`Düşük güvenli boyutlar: ${lowConfidence.join(' | ')}`);

  if (!input.hasPriceData) reasons.push('Fiyat verisi bulunamadığı için fiyat savaşı riski hesaplanamadı.');

  return reasons.length ? reasons.join(' ') : 'Veri güveni karar üretmek için yetersiz.';
}

function dimensionLabel(key: string) {
  switch (key) {
    case 'category_risk':
      return 'Kategori Riski';
    case 'sku_chaos':
      return 'SKU Karmaşası';
    case 'price_war_risk':
      return 'Fiyat Savaşı';
    case 'brand_reliability':
      return 'Marka Güveni';
    case 'operational_risk':
      return 'Operasyon Riski';
    default:
      return key;
  }
}

function dataQualityLabel(blocker: DataQuality['confidence_blockers'][number]) {
  switch (blocker) {
    case 'seller_coverage_low':
      return 'satıcı kapsaması düşük';
    case 'low_price_coverage':
      return 'fiyat kapsaması düşük';
    case 'no_keepa_data':
      return 'Keepa snapshot yok';
    case 'insufficient_data_points':
      return 'veri noktası yetersiz';
    default:
      return blocker;
  }
}

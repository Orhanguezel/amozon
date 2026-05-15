import type { PrioritySku, PriorityView, SkuDecision } from './amazon.types';

const DEFAULT_LIMIT = 3;

export function buildPriorityView(skuDecisions: SkuDecision[], limit = DEFAULT_LIMIT): PriorityView {
  const safeLimit = Math.max(1, Math.min(limit, 10));
  const highestConfidence = skuDecisions
    .filter((sku) => sku.confidence === 'HIGH')
    .sort(prioritySort)
    .slice(0, safeLimit)
    .map(toPrioritySku);
  const lowestChaos = skuDecisions
    .filter((sku) => sku.confidence !== 'INSUFFICIENT_DATA')
    .sort(chaosSort)
    .slice(0, safeLimit)
    .map(toPrioritySku);
  const bestCandidate = skuDecisions
    .filter((sku) => sku.confidence === 'HIGH' && (sku.action === 'AL' || sku.action === 'TAKIP_ET'))
    .sort(bestCandidateSort)
    .slice(0, safeLimit)
    .map(toPrioritySku);

  return {
    highest_confidence: highestConfidence,
    lowest_chaos: lowestChaos,
    best_candidate: bestCandidate,
    empty_reason: bestCandidate.length ? null : 'Bu taramada öne çıkan güvenli aday yok.',
  };
}

function toPrioritySku(sku: SkuDecision): PrioritySku {
  return {
    asin: sku.asin,
    title: sku.title,
    action: sku.action,
    confidence: sku.confidence,
    reason: sku.reasons[0] ?? 'Veri kalitesi yeterli.',
  };
}

function prioritySort(a: SkuDecision, b: SkuDecision) {
  return actionRank(a) - actionRank(b) || tierRank(a) - tierRank(b) || titleSort(a, b);
}

function chaosSort(a: SkuDecision, b: SkuDecision) {
  return chaosRank(a) - chaosRank(b) || prioritySort(a, b);
}

function bestCandidateSort(a: SkuDecision, b: SkuDecision) {
  return actionRank(a) - actionRank(b) || chaosRank(a) - chaosRank(b) || tierRank(a) - tierRank(b) || titleSort(a, b);
}

function actionRank(sku: SkuDecision) {
  if (sku.action === 'AL') return 0;
  if (sku.action === 'TAKIP_ET') return 1;
  return 2;
}

function tierRank(sku: SkuDecision) {
  if (sku.decision_tier === 'DECISION_READY') return 0;
  if (sku.decision_tier === 'PRIORITY_SIGNAL') return 1;
  return 2;
}

function chaosRank(sku: SkuDecision) {
  const signals = sku.signals;
  return [
    signals.price_status === 'low' || signals.price_status === 'high',
    signals.seller_status === 'missing',
    signals.keepa_status === 'missing' || signals.keepa_status === 'no_asin',
    signals.rating_level === 'weak' || signals.rating_level === 'missing',
  ].filter(Boolean).length;
}

function titleSort(a: SkuDecision, b: SkuDecision) {
  return a.title.localeCompare(b.title, 'tr');
}

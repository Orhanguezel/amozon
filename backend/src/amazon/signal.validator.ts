import type { AmazonRiskReport } from './amazon.types';
import { getFilterConfig, MIXED_SIGNAL_CONFIG as MS } from './scoring.config';

export function filterEligibleProducts<T extends { review_count?: number }>(products: T[]) {
  const filterConfig = getFilterConfig();
  return products.filter((product) => (product.review_count ?? 0) >= filterConfig.MIN_REVIEW_COUNT);
}

function extractAsinFromUrl(url?: string): string | null {
  return url?.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ?? null;
}

// Aynı ASIN'den sadece en yüksek review_count'lu kaydı tutar.
// ASIN çekilemeyen ürünler pass-through (bozulmuyor).
export function deduplicateByAsin<T extends { product_url?: string; review_count?: number }>(products: T[]): T[] {
  const seen = new Map<string, T>();
  const noAsin: T[] = [];
  for (const p of products) {
    const asin = extractAsinFromUrl(p.product_url);
    if (!asin) { noAsin.push(p); continue; }
    const existing = seen.get(asin);
    if (!existing || (p.review_count ?? 0) > (existing.review_count ?? 0)) seen.set(asin, p);
  }
  return [...seen.values(), ...noAsin];
}

export function validateSignals(report: Pick<AmazonRiskReport, 'scores' | 'decision'>, context: { pageCount?: number; hasPriceData?: boolean } = {}) {
  const notes: string[] = [];
  let decision = report.decision;

  if (context.pageCount === 1) notes.push('Tek sayfa sonuç var; kategori analizi referans amaçlıdır.');
  if (context.hasPriceData === false) notes.push('Fiyat verisi eksik; price war skoru karar dışı bırakılmalıdır.');

  // INSUFFICIENT_DATA → MIXED_SIGNAL override yasak: veri yokken sinyal kalitesi değerlendirilemez.
  if (decision === 'INSUFFICIENT_DATA') return { decision, notes };

  const dimensionScores = Object.values(report.scores).map((item) => item.score);
  const highCount = dimensionScores.filter((score) => score >= MS.HIGH_SCORE_MIN).length;
  const lowCount = dimensionScores.filter((score) => score <= MS.LOW_SCORE_MAX).length;

  if (highCount === MS.HIGH_COUNT_TRIGGER && lowCount >= MS.LOW_COUNT_TRIGGER) {
    decision = 'MIXED_SIGNAL';
    notes.push('Tek sinyal yüksek, diğer sinyaller düşük; manuel kontrol gerekir.');
  }

  return { decision, notes };
}

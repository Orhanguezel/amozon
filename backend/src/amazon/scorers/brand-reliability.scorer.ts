import { calculateConfidence } from '../confidence.calculator';
import type { AmazonScoreInput, DimensionScore } from '../amazon.types';

function brandToken(title: string) {
  return title.split(/\s+/).find(Boolean)?.toLowerCase() ?? '';
}

export function scoreBrandReliability(input: AmazonScoreInput): DimensionScore {
  const confidence = input.qualityFactors && input.qualityFactors.sellerCoverage < 0.05
    ? 'LOW'
    : calculateConfidence(input.products.length, input.qualityFactors);
  if (confidence === 'INSUFFICIENT_DATA') {
    return { score: 0, confidence, reason: 'Marka güvenilirliği için en az 10 veri noktası gerekir.' };
  }

  // Gerçek brand alanını tercih et, yoksa başlık tokenı kullan
  const brands = new Map<string, number>();
  let scrapedBrandCount = 0;
  let weakListings = 0;
  let sellerUnverifiedListings = 0;
  for (const product of input.products) {
    const brand = product.brand?.toLowerCase().trim();
    if (brand) {
      brands.set(brand, (brands.get(brand) ?? 0) + 1);
      scrapedBrandCount += 1;
    } else {
      const token = brandToken(product.product_title);
      if (token) brands.set(token, (brands.get(token) ?? 0) + 1);
    }
    if (!product.seller_name) sellerUnverifiedListings += 1;
    if (!product.product_url || (product.rating ?? 0) < 4) weakListings += 1;
  }

  const brandSource = scrapedBrandCount > input.products.length * 0.5 ? 'scraped' : 'title_token';
  const brandFragmentation = Math.min(4, brands.size / Math.max(1, input.products.length) * 6);
  const weakListingRisk = weakListings / input.products.length * 4;
  const priceDeviationRisk = input.stats.priceMedian > 0 ? Math.min(2, input.stats.priceSigma / input.stats.priceMedian * 3) : 0;
  let score = Math.min(10, brandFragmentation + weakListingRisk + priceDeviationRisk);

  // Keepa: seller_count_trend 'up' = yeni satıcı girişi → marka parçalanması ve disiplin kaybı riski artar
  let keepaNote = '';
  const snapshots = input.keepaSnapshots ?? [];
  if (snapshots.length >= 3) {
    const trendUp = snapshots.filter((s) => s.seller_count_trend === 'up').length;
    const trendDown = snapshots.filter((s) => s.seller_count_trend === 'down').length;
    if (trendUp >= 2 && trendUp > trendDown) {
      score = Math.min(10, score + 1.0);
      keepaNote = ` Keepa: satıcı sayısı artış trendinde (${trendUp}/${snapshots.length} ürün).`;
    }
  }

  const sourceNote = brandSource === 'scraped'
    ? `Marka verisi doğrulanmış (${scrapedBrandCount}/${input.products.length} ürün).`
    : `Marka verisi başlık tokenından tahmin edildi; doğrulanmamış.`;

  return {
    score: Number(score.toFixed(1)),
    confidence,
    reason: input.qualityFactors && input.qualityFactors.sellerCoverage < 0.05
      ? `${sourceNote} ${brands.size} marka, ${sellerUnverifiedListings} satıcı-doğrulanmamış listing.${keepaNote}`
      : `${sourceNote} ${brands.size} marka, ${sellerUnverifiedListings} satıcı-doğrulanmamış listing, ${weakListings} düşük kaliteli listing, fiyat sapması ${input.stats.priceSigma.toFixed(2)}.${keepaNote}`,
  };
}

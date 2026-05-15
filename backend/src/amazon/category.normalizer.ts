import type { AmazonProduct } from './amazon.scraper';
import type { AmazonCategoryStats, NormalizedProduct } from './amazon.types';
import { randomUUID } from 'node:crypto';
import { pool } from '@/db/client';
import { OUTLIER_CONFIG } from './scoring.config';

function sortedValues(products: AmazonProduct[], key: 'price' | 'review_count' | 'rating'): number[] {
  return products
    .map(p => p[key])
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b);
}

function calcMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function calcSigma(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length);
}

// Tukey IQR yöntemi — sigma/median hesabından aşırı uç fiyatları temizler
function removeOutliers(sorted: number[]): number[] {
  if (sorted.length < OUTLIER_CONFIG.MIN_SAMPLE) return sorted;
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - OUTLIER_CONFIG.IQR_MULTIPLIER * iqr;
  const upper = q3 + OUTLIER_CONFIG.IQR_MULTIPLIER * iqr;
  return sorted.filter(v => v >= lower && v <= upper);
}

// Değerin sıralı dizideki yüzdelik dilimini 0-10 skoruna çevirir
function percentileScore(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 5;
  const rank = sorted.filter(v => v <= value).length;
  return (rank / sorted.length) * 10;
}

export function buildCategoryStats(
  products: AmazonProduct[],
  keyword: string,
  marketplace: string,
): AmazonCategoryStats {
  const prices = sortedValues(products, 'price');
  const cleanPrices = removeOutliers(prices);
  const sellers = new Set(products.map(p => p.seller_name).filter(Boolean));

  const sellerCounts = new Map<string, number>();
  for (const p of products) {
    if (p.seller_name) sellerCounts.set(p.seller_name, (sellerCounts.get(p.seller_name) ?? 0) + 1);
  }
  const maxCount = Math.max(0, ...sellerCounts.values());

  return {
    keyword,
    marketplace,
    productCount: products.length,
    priceMin: cleanPrices[0] ?? 0,
    priceMax: cleanPrices[cleanPrices.length - 1] ?? 0,
    priceMedian: calcMedian(cleanPrices),
    priceSigma: calcSigma(cleanPrices),
    sellerCount: sellers.size,
    dominantBrandRatio: products.length > 0 ? maxCount / products.length : 0,
  };
}

export const calculateCategoryStats = (keyword: string, marketplace: string, products: AmazonProduct[]) =>
  buildCategoryStats(products, keyword, marketplace);

export async function upsertAmazonCategoryStats(stats: AmazonCategoryStats) {
  await pool.execute(
    `INSERT INTO amazon_category_stats (
      id, keyword, marketplace, product_count, price_min, price_max, price_median, price_sigma, seller_count, dominant_brand_ratio
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      product_count = VALUES(product_count),
      price_min = VALUES(price_min),
      price_max = VALUES(price_max),
      price_median = VALUES(price_median),
      price_sigma = VALUES(price_sigma),
      seller_count = VALUES(seller_count),
      dominant_brand_ratio = VALUES(dominant_brand_ratio)`,
    [
      randomUUID(),
      stats.keyword,
      stats.marketplace,
      stats.productCount,
      stats.priceMin,
      stats.priceMax,
      stats.priceMedian,
      stats.priceSigma,
      stats.sellerCount,
      stats.dominantBrandRatio,
    ],
  );
}

export function normalizeProducts(
  products: AmazonProduct[],
): NormalizedProduct[] {
  const prices  = removeOutliers(sortedValues(products, 'price'));
  const reviews = sortedValues(products, 'review_count');
  const ratings = sortedValues(products, 'rating');

  return products.map(p => {
    const pricePercentile  = p.price        ? percentileScore(p.price, prices)         : 5;
    const reviewPercentile = p.review_count ? percentileScore(p.review_count, reviews) : 5;
    const ratingPercentile = p.rating       ? percentileScore(p.rating, ratings)        : 5;

    return {
      ...p,
      pricePercentile,
      reviewPercentile,
      ratingPercentile,
      normalizedPriceScore:  pricePercentile,
      normalizedReviewScore: reviewPercentile,
      normalizedRatingScore: ratingPercentile,
    };
  });
}

import type { AmazonProduct } from './amazon.scraper';
import { buildCategoryStats } from './category.normalizer';

export type RiskBadgeStats = {
  dominantBrandRatio: number;
  sellerCount: number;
};

export function riskBadgeStatsFromProducts(
  products: AmazonProduct[],
  keyword: string,
  marketplace: string,
): RiskBadgeStats {
  const stats = buildCategoryStats(products, keyword, marketplace);
  return {
    dominantBrandRatio: stats.dominantBrandRatio,
    sellerCount: stats.sellerCount,
  };
}

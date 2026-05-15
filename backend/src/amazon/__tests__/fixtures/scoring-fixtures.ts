import type { AmazonProduct } from '../../amazon.scraper';

export function products(count = 40, overrides: Partial<AmazonProduct> = {}): AmazonProduct[] {
  return Array.from({ length: count }, (_, index) => ({
    product_title: `${index % 2 === 0 ? 'BrandA' : `Brand${index}`} Thermal Label ${index}`,
    price: 20 + index,
    rating: index % 7 === 0 ? 3.7 : 4.3,
    review_count: 20 + index * 12,
    seller_name: `Seller ${index % 12}`,
    seller_url: `https://amazon.example/seller/${index % 12}`,
    product_url: `https://amazon.example/product/${index}`,
    ...overrides,
  }));
}

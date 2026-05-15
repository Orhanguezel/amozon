import type { AmazonProduct } from './amazon.scraper';

export interface AmazonSeller {
  seller_name: string;
  seller_url?: string;
  products: AmazonProduct[];
}

export function extractUniqueSellers(products: AmazonProduct[]) {
  const bySeller = new Map<string, AmazonSeller>();
  for (const product of products) {
    const key = product.seller_url || product.seller_name || product.product_url || product.product_title;
    const seller = bySeller.get(key) ?? { seller_name: product.seller_name || product.product_title, seller_url: product.seller_url, products: [] };
    seller.products.push(product);
    bySeller.set(key, seller);
  }
  return [...bySeller.values()];
}

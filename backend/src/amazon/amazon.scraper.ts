import { env } from '@/core/env';
import { getScraperConfig } from './scoring.config';

export interface AmazonProduct {
  product_title: string;
  brand?: string;
  price?: number;
  rating?: number;
  review_count?: number;
  product_url?: string;
  seller_name?: string;
  seller_url?: string;
}

export interface AmazonProductDetail {
  seller_name?: string;
  seller_url?: string;
  buy_box_seller?: string;
  buy_box_winner?: string;
  brand?: string;
  raw?: unknown;
}

export type ProductDetailInput = {
  asin?: string | null;
  productUrl?: string | null;
  marketplace?: string;
};

export interface AmazonFilters {
  review_min?: number;
  review_max?: number;
  rating_min?: number;
  rating_max?: number;
  price_min?: number;
  price_max?: number;
}

function numberFrom(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const n = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function textFrom(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const text = value.trim();
    return text || undefined;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return textFrom(record.name)
      ?? textFrom(record.seller_name)
      ?? textFrom(record.merchant_name)
      ?? textFrom(record.store_name);
  }
  return undefined;
}

function findTextDeep(value: unknown, keys: string[], depth = 0): string | undefined {
  if (!value || depth > 5) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTextDeep(item, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const found = textFrom(record[key]);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    const found = findTextDeep(nested, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function amazonDomain(marketplace: string) {
  const m = marketplace.toLowerCase().replace(/^amazon\./, '');
  const map: Record<string, string> = {
    'co.uk': 'amazon.co.uk', de: 'amazon.de', fr: 'amazon.fr', it: 'amazon.it',
    es: 'amazon.es', ca: 'amazon.ca', 'co.jp': 'amazon.co.jp', in: 'amazon.in',
    'com.mx': 'amazon.com.mx', 'com.br': 'amazon.com.br', 'com.au': 'amazon.com.au',
    nl: 'amazon.nl', pl: 'amazon.pl', se: 'amazon.se', sa: 'amazon.sa',
    sg: 'amazon.sg', ae: 'amazon.ae',
  };
  return `https://www.${map[m] ?? 'amazon.com'}`;
}

function resolveProductUrl(url: unknown, marketplace: string): string | undefined {
  if (typeof url !== 'string' || !url) return undefined;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${amazonDomain(marketplace)}${url}`;
  return undefined;
}

function normalizeProduct(item: Record<string, unknown>, marketplace = 'com'): AmazonProduct {
  const sellerName = textFrom(item.seller_name)
    ?? textFrom(item.seller)
    ?? textFrom(item.merchant)
    ?? textFrom(item.merchant_name)
    ?? textFrom(item.store_name)
    ?? textFrom(item.buybox_seller)
    ?? textFrom(item.buy_box_seller);
  const sellerUrl = textFrom(item.seller_url)
    ?? textFrom(item.merchant_url)
    ?? textFrom(item.store_url);

  return {
    product_title: String(item.title ?? item.product_title ?? item.name ?? ''),
    brand: textFrom(item.brand ?? item.brand_name) ?? undefined,
    price: numberFrom(item.price ?? item.price_str),
    rating: numberFrom(item.rating),
    review_count: numberFrom(item.reviews_count ?? item.review_count),
    product_url: resolveProductUrl(item.url ?? item.product_url, marketplace),
    seller_name: sellerName,
    seller_url: sellerUrl,
  };
}

function matchesFilters(product: AmazonProduct, filters: AmazonFilters) {
  const reviews = product.review_count ?? 0;
  const rating = product.rating ?? 0;
  const price = product.price ?? 0;
  if (filters.review_min !== undefined && reviews < filters.review_min) return false;
  if (filters.review_max !== undefined && reviews > filters.review_max) return false;
  if (filters.rating_min !== undefined && rating < filters.rating_min) return false;
  if (filters.rating_max !== undefined && rating > filters.rating_max) return false;
  if (filters.price_min !== undefined && price < filters.price_min) return false;
  if (filters.price_max !== undefined && price > filters.price_max) return false;
  return true;
}

export async function scrapeAmazonProducts(keyword: string, marketplace = 'com', filters: AmazonFilters = {}, pages?: number) {
  if (!env.OXYLABS_USERNAME || !env.OXYLABS_PASSWORD) throw new Error('OXYLABS_NOT_CONFIGURED');
  const scraperConfig = getScraperConfig();
  const effectiveFilters = {
    review_min: scraperConfig.SCRAPER_REVIEW_MIN,
    review_max: scraperConfig.SCRAPER_REVIEW_MAX,
    rating_min: scraperConfig.SCRAPER_RATING_MIN,
    rating_max: scraperConfig.SCRAPER_RATING_MAX,
    ...filters,
  };
  const safePages = Math.min(Math.max(Number(pages ?? scraperConfig.SEARCH_PAGES) || 1, 1), 20);
  const token = Buffer.from(`${env.OXYLABS_USERNAME}:${env.OXYLABS_PASSWORD}`).toString('base64');
  const res = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: { authorization: `Basic ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'amazon_search', query: keyword, domain: marketplace, pages: safePages, parse: true }),
  });
  if (!res.ok) throw new Error(`OXYLABS_AMAZON_SEARCH_FAILED_${res.status}`);
  const data = await res.json() as { results?: Array<{ content?: { results?: { organic?: Record<string, unknown>[] } } }> };
  const items = data.results?.flatMap(r => r.content?.results?.organic ?? []) ?? [];
  return items.map(item => normalizeProduct(item, marketplace)).filter(p => p.product_title && matchesFilters(p, effectiveFilters));
}

export async function scrapeAmazonReviews(productUrl: string, marketplace = 'com') {
  if (!env.OXYLABS_USERNAME || !env.OXYLABS_PASSWORD) throw new Error('OXYLABS_NOT_CONFIGURED');
  const token = Buffer.from(`${env.OXYLABS_USERNAME}:${env.OXYLABS_PASSWORD}`).toString('base64');
  const res = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: { authorization: `Basic ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'amazon_reviews', url: productUrl, domain: marketplace, pages: 1, parse: true }),
  });
  if (!res.ok) throw new Error(`OXYLABS_AMAZON_REVIEWS_FAILED_${res.status}`);
  const data = await res.json() as { results?: Array<{ content?: { reviews?: Array<{ content?: string; title?: string }> } }> };
  return (data.results?.flatMap(r => r.content?.reviews ?? []) ?? []).slice(0, 50);
}

export async function scrapeAmazonProductDetail(input: ProductDetailInput | string, marketplaceArg = 'com'): Promise<AmazonProductDetail> {
  if (!env.OXYLABS_USERNAME || !env.OXYLABS_PASSWORD) throw new Error('OXYLABS_NOT_CONFIGURED');
  const normalized = typeof input === 'string'
    ? { productUrl: input, marketplace: marketplaceArg }
    : input;
  const marketplace = normalized.marketplace || marketplaceArg || 'com';
  const asin = normalized.asin?.trim();
  const productUrl = normalized.productUrl?.trim();
  if (!asin && !productUrl) throw new Error('PRODUCT_DETAIL_INPUT_REQUIRED');
  const token = Buffer.from(`${env.OXYLABS_USERNAME}:${env.OXYLABS_PASSWORD}`).toString('base64');
  const body = asin
    ? { source: 'amazon_product', query: asin, domain: marketplace, parse: true }
    : { source: 'amazon', url: productUrl, domain: marketplace, parse: true };
  const res = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: { authorization: `Basic ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OXYLABS_AMAZON_PRODUCT_FAILED_${res.status}`);
  const data = await res.json() as { results?: Array<{ content?: Record<string, unknown> }> };
  const content = data.results?.[0]?.content ?? {};
  const sellerName = textFrom(content.seller_name)
    ?? textFrom(content.seller)
    ?? textFrom(content.merchant)
    ?? textFrom(content.merchant_name)
    ?? textFrom(content.buybox_seller)
    ?? textFrom(content.buy_box_seller)
    ?? textFrom(content.buy_box_winner)
    ?? findTextDeep(content, ['seller_name', 'seller', 'merchant', 'merchant_name', 'store_name', 'sold_by', 'ships_from', 'buybox_seller', 'buy_box_seller', 'buy_box_winner']);
  const sellerUrl = textFrom(content.seller_url)
    ?? textFrom(content.merchant_url)
    ?? textFrom(content.store_url)
    ?? findTextDeep(content, ['seller_url', 'merchant_url', 'store_url', 'url']);
  const buyBoxSeller = textFrom(content.buybox_seller)
    ?? textFrom(content.buy_box_seller)
    ?? textFrom(content.buy_box_winner)
    ?? findTextDeep(content, ['buybox_seller', 'buy_box_seller', 'buy_box_winner', 'seller_name', 'seller', 'merchant_name']);
  const brand = textFrom(content.brand)
    ?? textFrom(content.brand_name)
    ?? textFrom(content.manufacturer)
    ?? findTextDeep(content, ['brand', 'brand_name', 'manufacturer']);
  return {
    seller_name: sellerName,
    seller_url: sellerUrl,
    buy_box_seller: buyBoxSeller,
    buy_box_winner: buyBoxSeller,
    brand,
    raw: content,
  };
}

import { env } from '@/core/env';

const ASIN_REGEX = /^(B0[A-Z0-9]{8}|[0-9]{10})$/;

export function isAsin(value: string): boolean {
  return ASIN_REGEX.test(value.trim().toUpperCase());
}

/**
 * Resolves an ASIN to a keyword suitable for the standard scan pipeline.
 *
 * Strategy: fetch the product's title via Oxylabs `amazon_product`, then derive
 * a 3-4 word keyword phrase by trimming brand boilerplate and length.
 *
 * Returns: { keyword, title, brand, raw_title } so the caller can save metadata.
 */
export async function resolveAsinToKeyword(
  asin: string,
  marketplace = 'com',
): Promise<{ keyword: string; title: string; brand: string | null }> {
  if (!env.OXYLABS_USERNAME || !env.OXYLABS_PASSWORD) {
    throw new Error('OXYLABS_NOT_CONFIGURED');
  }
  const cleanAsin = asin.trim().toUpperCase();
  if (!isAsin(cleanAsin)) throw new Error('INVALID_ASIN_FORMAT');

  const token = Buffer.from(`${env.OXYLABS_USERNAME}:${env.OXYLABS_PASSWORD}`).toString('base64');
  const res = await fetch('https://realtime.oxylabs.io/v1/queries', {
    method: 'POST',
    headers: { authorization: `Basic ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'amazon_product', query: cleanAsin, domain: marketplace, parse: true }),
  });
  if (!res.ok) throw new Error(`OXYLABS_ASIN_RESOLVE_FAILED_${res.status}`);
  const data = await res.json() as { results?: Array<{ content?: Record<string, unknown> }> };
  const content = data.results?.[0]?.content ?? {};
  const rawTitle = typeof content.title === 'string' ? content.title.trim() : '';
  if (!rawTitle) throw new Error('ASIN_TITLE_NOT_FOUND');

  const brand = typeof content.brand === 'string'
    ? content.brand.trim()
    : typeof content.manufacturer === 'string'
      ? content.manufacturer.trim()
      : null;

  const keyword = deriveKeywordFromTitle(rawTitle, brand);
  return { keyword, title: rawTitle, brand };
}

/**
 * Reduces a long Amazon product title to a 3-4 word category-search keyword.
 *
 * Heuristics:
 *  - Strip the brand name (Amazon titles start with brand)
 *  - Strip common marketing words and pack sizes ("Pack of 2", "with X")
 *  - Take first 4 words after cleaning
 *  - Cap at 60 chars
 */
export function deriveKeywordFromTitle(title: string, brand: string | null): string {
  let cleaned = title;
  if (brand) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`^${escaped}\\s+`, 'i'), '');
  }
  cleaned = cleaned
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bPack of \d+\b/gi, ' ')
    .replace(/\b\d+\s?-?\s?(pack|count|piece|pcs|set|in 1)\b/gi, ' ')
    .replace(/[,|–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter((w) => w.length > 1).slice(0, 4);
  const keyword = words.join(' ').slice(0, 60).trim();
  return keyword || title.slice(0, 60);
}

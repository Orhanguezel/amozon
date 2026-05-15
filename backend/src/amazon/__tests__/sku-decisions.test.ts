import { describe, expect, test } from 'bun:test';
import { buildSkuDecisions, buildDataQuality, extractAsinFromUrl } from '../amazon.scoring-engine';
import type { AmazonProduct } from '../amazon.scraper';

function product(overrides: Partial<AmazonProduct> = {}): AmazonProduct {
  return {
    product_title: 'Test Product',
    price: 29.99,
    rating: 4.3,
    review_count: 200,
    seller_name: 'Test Seller',
    seller_url: 'https://amazon.example/seller/1',
    product_url: 'https://www.amazon.com/Test-Product/dp/B0TESTASIN',
    ...overrides,
  };
}

describe('extractAsinFromUrl', () => {
  test('/dp/ formatından ASIN çıkarır', () => {
    expect(extractAsinFromUrl('https://www.amazon.com/dp/B08N5WRWNW')).toBe('B08N5WRWNW');
  });

  test('/gp/product/ formatından ASIN çıkarır', () => {
    expect(extractAsinFromUrl('https://www.amazon.com/gp/product/B08N5WRWNW')).toBe('B08N5WRWNW');
  });

  test('title/ kısmı olan URL\'den ASIN çıkarır', () => {
    expect(extractAsinFromUrl('https://www.amazon.com/Product-Name/dp/B08NCMVJXT')).toBe('B08NCMVJXT');
  });

  test('ASIN yoksa null döner', () => {
    expect(extractAsinFromUrl('https://www.amazon.com/search?k=test')).toBeNull();
    expect(extractAsinFromUrl(undefined)).toBeNull();
    expect(extractAsinFromUrl(null)).toBeNull();
  });
});

describe('buildSkuDecisions', () => {
  test('fiyat ve satıcı eksikse UZAK_DUR döner', () => {
    const decisions = buildSkuDecisions(
      [product({ price: undefined, seller_name: undefined })],
      new Set(),
      25,
    );

    expect(decisions[0]?.action).toBe('UZAK_DUR');
    expect(decisions[0]?.signals.price_status).toBe('missing');
    expect(decisions[0]?.signals.seller_status).toBe('missing');
    expect(decisions[0]?.reasons.join(' ')).toContain('Fiyat verisi yok');
  });

  test('keepa verisi olan ürün için keepa_status=available', () => {
    const decisions = buildSkuDecisions(
      [product()],
      new Set(['B0TESTASIN']),
      25,
    );

    expect(decisions[0]?.signals.keepa_status).toBe('available');
  });

  test('keepa verisi olmayan ASIN için keepa_status=missing', () => {
    const decisions = buildSkuDecisions([product()], new Set(), 25);

    expect(decisions[0]?.signals.keepa_status).toBe('missing');
  });

  test('ASIN olmayan ürün için keepa_status=no_asin', () => {
    const decisions = buildSkuDecisions(
      [product({ product_url: 'https://amazon.example/product/no-asin' })],
      new Set(),
      25,
    );

    expect(decisions[0]?.signals.keepa_status).toBe('no_asin');
  });

  test('price_status: medyan üzerinde fiyat → high', () => {
    const decisions = buildSkuDecisions([product({ price: 50 })], new Set(), 25);

    expect(decisions[0]?.signals.price_status).toBe('high');
  });

  test('price_status: medyan altında fiyat → low', () => {
    const decisions = buildSkuDecisions([product({ price: 10 })], new Set(), 25);

    expect(decisions[0]?.signals.price_status).toBe('low');
  });

  test('priceMedian=0 ise tüm fiyatlı ürünler normal döner', () => {
    const decisions = buildSkuDecisions([product({ price: 99 })], new Set(), 0);

    expect(decisions[0]?.signals.price_status).toBe('normal');
  });

  test('her kararın action, confidence, reasons ve signals alanları dolu', () => {
    const decisions = buildSkuDecisions([product(), product({ price: undefined })], new Set(), 25);

    for (const d of decisions) {
      expect(d.action).toBeTruthy();
      expect(d.confidence).toBeTruthy();
      expect(Array.isArray(d.reasons)).toBe(true);
      expect(d.signals).toBeTruthy();
    }
  });
});

describe('buildDataQuality', () => {
  test('fiyat ve satıcı kapsamasını doğru hesaplar', () => {
    const prods = [
      product(),
      product({ price: undefined }),
      product({ seller_name: undefined }),
    ];
    const dq = buildDataQuality(prods, new Set());

    expect(dq.data_points).toBe(3);
    expect(dq.price_coverage).toBeCloseTo(2 / 3, 1);
    expect(dq.seller_coverage).toBeCloseTo(2 / 3, 1);
  });

  test('keepa kapsamasını ASIN üzerinden hesaplar', () => {
    const prods = [
      product({ product_url: 'https://www.amazon.com/dp/B0ASIN0011' }),
      product({ product_url: 'https://www.amazon.com/dp/B0ASIN0022' }),
    ];
    const dq = buildDataQuality(prods, new Set(['B0ASIN0011']));

    expect(dq.keepa_coverage).toBe(0.5);
    expect(dq.has_keepa_snapshot).toBe(true);
  });

  test('boş ürün listesinde sıfır coverage döner', () => {
    const dq = buildDataQuality([], new Set());

    expect(dq.data_points).toBe(0);
    expect(dq.price_coverage).toBe(0);
    expect(dq.seller_coverage).toBe(0);
    expect(dq.keepa_coverage).toBe(0);
  });
});

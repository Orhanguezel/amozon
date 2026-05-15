/**
 * Demo seed — inserts 3 realistic completed scans into the DB so the panel is not empty.
 * Usage: bun run scripts/demo-seed.ts
 *
 * Safe to re-run: uses INSERT IGNORE on keywords and checks for existing job_ids.
 */
import { randomUUID } from 'node:crypto';
import { pool } from '@/db/client';

const DEMO_SCANS = [
  {
    keyword: 'kablo düzenleyici masa',
    marketplace: 'com',
    decision: 'GUVENLI',
    composite_score: 3.2,
    data_points: 94,
    summary: 'Kategori düzenli, fiyat aralığı stabil, satıcı dağılımı geniş. Giriş için uygun.',
    scores: {
      category_risk: { score: 2.8, confidence: 'HIGH', reason: 'Rekabetçi ama istikrarlı bir kategori; yeni satıcılar için yer var.' },
      sku_chaos:     { score: 3.1, confidence: 'HIGH', reason: 'SKU çeşitliliği orta düzeyde; dominant ürün yok.' },
      price_war_risk:{ score: 2.5, confidence: 'HIGH', reason: 'Fiyat sapması düşük; aşırı fiyat baskısı gözlemlenmedi.' },
      brand_reliability:{ score: 3.8, confidence: 'MEDIUM', reason: 'Tanımlı markalar var ancak pazar payı dağınık.' },
      operational_risk:{ score: 3.0, confidence: 'HIGH', reason: 'Lojistik profil temiz; küçük ölçekli satıcılar baskın.' },
    },
    products: [
      { title: 'Masa Üstü Kablo Tutucu Düzenleyici 5li Set', price: 12.99, rating: 4.3, review_count: 1820, seller_name: 'CableOrg Store', asin: 'B08ABCDE01' },
      { title: 'Silikon Kablo Klipsi Yönetim Sistemi 10 Adet', price: 8.49,  rating: 4.1, review_count: 956,  seller_name: null,            asin: 'B08ABCDE02' },
      { title: 'Yapışkanlı Kablo Kanalı Masaaltı Düzenleyici', price: 15.99, rating: 4.5, review_count: 3210, seller_name: 'TechEasy DE',   asin: 'B08ABCDE03' },
      { title: 'USB Kablo Sarıcı Kulaklık Düzenleyici', price: 6.99,  rating: 3.9, review_count: 412,  seller_name: null,            asin: 'B08ABCDE04' },
      { title: 'Plastik Kablo Koruyucu Spiral Sarma 10m', price: 9.99,  rating: 4.2, review_count: 2140, seller_name: 'ProCable GmbH', asin: 'B08ABCDE05' },
    ],
    data_quality: {
      data_points: 94,
      price_coverage: 0.91,
      seller_coverage: 0.60,
      keepa_coverage: 0.0,
      has_price_data: true,
      has_keepa_snapshot: false,
      confidence_blockers: ['seller_coverage_low', 'no_keepa_data'],
    },
    decision_surface: {
      primary_action: 'AL',
      confidence: 'MEDIUM',
      confidence_blockers: ['seller_coverage_low', 'no_keepa_data'],
      top_reasons: [
        'Fiyat aralığı istikrarlı, yüksek fiyat baskısı yok.',
        'Kategori açık; dominant tek marka yok.',
        'Giriş için uygun veri profili.',
      ],
      operator_summary: 'Düşük riskli kategori. Satıcı verisi eksik; Keepa ile fiyat geçmişi doğrulanırsa güven artar.',
      data_gate: { status: 'ENRICHMENT_REQUIRED', reasons: ['seller_coverage_low', 'no_keepa_data'], message: 'Keepa ve satıcı zenginleştirmesi sonrası karar netleşir.' },
      action_distribution: { total: 5, counts: { AL: 3, TAKIP_ET: 1, UZAK_DUR: 1 }, dominant_action: 'AL', dominant_ratio: 0.60, single_action_warning: null },
    },
    sku_decisions: [
      { asin: 'B08ABCDE03', title: 'Yapışkanlı Kablo Kanalı Masaaltı Düzenleyici', action: 'AL', confidence: 'HIGH', reasons: ['Yüksek yorum sayısı güvenilirliği kanıtlıyor.', 'Fiyat ortalamanın üzerinde ama savunulabilir.'], signals: { price_status: 'normal', seller_status: 'real', review_tier: 'high', rating_level: 'good', keepa_status: 'unavailable' } },
      { asin: 'B08ABCDE01', title: 'Masa Üstü Kablo Tutucu Düzenleyici 5li Set', action: 'AL', confidence: 'HIGH', reasons: ['Stabil yorum profili.', 'Gerçek satıcı mevcut.'], signals: { price_status: 'normal', seller_status: 'real', review_tier: 'high', rating_level: 'good', keepa_status: 'unavailable' } },
      { asin: 'B08ABCDE05', title: 'Plastik Kablo Koruyucu Spiral Sarma 10m', action: 'AL', confidence: 'MEDIUM', reasons: ['İyi yorum sayısı.', 'Gerçek satıcı mevcut.'], signals: { price_status: 'normal', seller_status: 'real', review_tier: 'high', rating_level: 'good', keepa_status: 'unavailable' } },
      { asin: 'B08ABCDE02', title: 'Silikon Kablo Klipsi Yönetim Sistemi 10 Adet', action: 'TAKIP_ET', confidence: 'LOW', reasons: ['Satıcı bilgisi doğrulanamadı.', 'Enrichment ile güven artabilir.'], signals: { price_status: 'normal', seller_status: 'missing', review_tier: 'medium', rating_level: 'good', keepa_status: 'unavailable' } },
      { asin: 'B08ABCDE04', title: 'USB Kablo Sarıcı Kulaklık Düzenleyici', action: 'UZAK_DUR', confidence: 'LOW', reasons: ['Satıcı bilgisi yok.', 'Düşük yorum sayısı.'], signals: { price_status: 'low', seller_status: 'missing', review_tier: 'low', rating_level: 'average', keepa_status: 'unavailable' } },
    ],
  },
  {
    keyword: 'plastik saklama kutusu mutfak',
    marketplace: 'com',
    decision: 'DIKKATLI_OL',
    composite_score: 5.8,
    data_points: 132,
    summary: 'Kategori orta risk; fiyat baskısı belirgin, marka dağılımı geniş. Dikkatli değerlendirme gerekli.',
    scores: {
      category_risk: { score: 5.5, confidence: 'HIGH', reason: 'Kalabalık kategori; yeni girişler için güçlü marka gerekli.' },
      sku_chaos:     { score: 6.2, confidence: 'HIGH', reason: 'Yüksek SKU çeşitliliği; ürün farklılaştırması şart.' },
      price_war_risk:{ score: 6.8, confidence: 'HIGH', reason: 'Fiyat baskısı yüksek; düşük marjlı ürünler baskın.' },
      brand_reliability:{ score: 4.9, confidence: 'MEDIUM', reason: 'Güçlü markalar var; bilinmeyenler için yer sınırlı.' },
      operational_risk:{ score: 5.1, confidence: 'HIGH', reason: 'Orta büyüklüklü operatörler için yüksek stok döngüsü gerekiyor.' },
    },
    products: [
      { title: 'Hava Geçirmez Plastik Saklama Kabı Seti 5 Parça', price: 19.99, rating: 4.4, review_count: 5630, seller_name: 'KitchenPro', asin: 'B09BCDE001' },
      { title: 'Şeffaf Gıda Saklama Kutusu Buzdolabı Düzenleyici', price: 14.99, rating: 4.0, review_count: 2180, seller_name: null,         asin: 'B09BCDE002' },
      { title: 'Kapaklı Plastik Konteyner 1.5L 3 Adet', price: 11.49, rating: 3.7, review_count: 890,  seller_name: null,         asin: 'B09BCDE003' },
      { title: 'Mikrodalgaya Uygun Saklama Kabı Premium Set', price: 24.99, rating: 4.6, review_count: 8920, seller_name: 'OXO Official', asin: 'B09BCDE004' },
      { title: 'Ekonomik Plastik Kutu 12li Paket', price: 7.99,  rating: 3.5, review_count: 340,  seller_name: null,         asin: 'B09BCDE005' },
    ],
    data_quality: {
      data_points: 132,
      price_coverage: 0.88,
      seller_coverage: 0.40,
      keepa_coverage: 0.0,
      has_price_data: true,
      has_keepa_snapshot: false,
      confidence_blockers: ['seller_coverage_low', 'no_keepa_data'],
    },
    decision_surface: {
      primary_action: 'TAKIP_ET',
      confidence: 'MEDIUM',
      confidence_blockers: ['seller_coverage_low', 'no_keepa_data'],
      top_reasons: [
        'Fiyat baskısı yüksek; marj sıkışma riski var.',
        'Satıcı kapsaması düşük; gerçek rekabet bilinmiyor.',
        'Güçlü markalara karşı farklılaşma stratejisi şart.',
      ],
      operator_summary: 'Orta risk. Fiyat savaşı başlamış görünüyor; Keepa ile geçmiş doğrulanmalı.',
      data_gate: { status: 'ENRICHMENT_REQUIRED', reasons: ['seller_coverage_low', 'no_keepa_data'], message: 'Keepa fiyat geçmişi ve satıcı zenginleştirmesi ile risk profili netleşir.' },
      action_distribution: { total: 5, counts: { AL: 1, TAKIP_ET: 2, UZAK_DUR: 2 }, dominant_action: 'UZAK_DUR', dominant_ratio: 0.40, single_action_warning: null },
    },
    sku_decisions: [
      { asin: 'B09BCDE004', title: 'Mikrodalgaya Uygun Saklama Kabı Premium Set', action: 'AL', confidence: 'HIGH', reasons: ['En yüksek yorum sayısı; güçlü sosyal kanıt.', 'Gerçek marka satıcısı.'], signals: { price_status: 'normal', seller_status: 'real', review_tier: 'high', rating_level: 'good', keepa_status: 'unavailable' } },
      { asin: 'B09BCDE001', title: 'Hava Geçirmez Plastik Saklama Kabı Seti 5 Parça', action: 'TAKIP_ET', confidence: 'MEDIUM', reasons: ['Yüksek rekabetli fiyat noktası.', 'Gerçek satıcı var ama marj dar.'], signals: { price_status: 'low', seller_status: 'real', review_tier: 'high', rating_level: 'good', keepa_status: 'unavailable' } },
      { asin: 'B09BCDE002', title: 'Şeffaf Gıda Saklama Kutusu Buzdolabı Düzenleyici', action: 'TAKIP_ET', confidence: 'LOW', reasons: ['Satıcı bilgisi doğrulanamadı.'], signals: { price_status: 'normal', seller_status: 'missing', review_tier: 'high', rating_level: 'average', keepa_status: 'unavailable' } },
      { asin: 'B09BCDE003', title: 'Kapaklı Plastik Konteyner 1.5L 3 Adet', action: 'UZAK_DUR', confidence: 'LOW', reasons: ['Düşük rating.', 'Satıcı bilgisi yok.'], signals: { price_status: 'low', seller_status: 'missing', review_tier: 'medium', rating_level: 'average', keepa_status: 'unavailable' } },
      { asin: 'B09BCDE005', title: 'Ekonomik Plastik Kutu 12li Paket', action: 'UZAK_DUR', confidence: 'LOW', reasons: ['Çok düşük fiyat; marj yok.', 'Düşük rating ve satıcı bilgisi yok.'], signals: { price_status: 'very_low', seller_status: 'missing', review_tier: 'low', rating_level: 'poor', keepa_status: 'unavailable' } },
    ],
  },
  {
    keyword: 'bebek oyuncakları 0-12 ay',
    marketplace: 'com',
    decision: 'GIRME',
    composite_score: 8.1,
    data_points: 78,
    summary: 'Yüksek riskli kategori. Güçlü markalar hâkim, fiyat savaşı aktif, düzenleyici riskler var.',
    scores: {
      category_risk: { score: 8.5, confidence: 'HIGH', reason: 'Bebek ürünleri yoğun denetim ve sertifika gerektirir; yeni girişler için yüksek bariyer.' },
      sku_chaos:     { score: 7.8, confidence: 'HIGH', reason: 'Yüksek SKU çeşitliliği; kategori doymaya yakın.' },
      price_war_risk:{ score: 8.2, confidence: 'HIGH', reason: 'Büyük markalar agresif fiyatlandırma uyguluyor.' },
      brand_reliability:{ score: 8.9, confidence: 'HIGH', reason: 'Fisher-Price, Chicco gibi güçlü markalar baskın; bilinmeyenler için yer yok.' },
      operational_risk:{ score: 7.5, confidence: 'MEDIUM', reason: 'Yüksek iade oranı ve güvenlik standartları operasyon maliyetini artırıyor.' },
    },
    products: [
      { title: 'Fisher-Price Bebek Aktivite Merkezi 0-12 Ay', price: 49.99, rating: 4.7, review_count: 18240, seller_name: 'Fisher-Price Official', asin: 'B10CDEF001' },
      { title: 'Chicco Çıngırak Set Bebek Oyuncağı', price: 22.99, rating: 4.5, review_count: 9810,  seller_name: 'Chicco DE',             asin: 'B10CDEF002' },
      { title: 'Yumuşak Bebek Diş Kaşıyıcı Oyuncak', price: 8.99,  rating: 3.8, review_count: 234,   seller_name: null,                   asin: 'B10CDEF003' },
      { title: 'Renkli Halka Çevirme Bebek Oyunu', price: 12.99, rating: 3.6, review_count: 156,   seller_name: null,                   asin: 'B10CDEF004' },
      { title: 'Bebek Yatağı Üstü Dönen Oyuncak Seti', price: 35.99, rating: 4.2, review_count: 2890,  seller_name: 'MomCare GmbH',         asin: 'B10CDEF005' },
    ],
    data_quality: {
      data_points: 78,
      price_coverage: 0.92,
      seller_coverage: 0.60,
      keepa_coverage: 0.0,
      has_price_data: true,
      has_keepa_snapshot: false,
      confidence_blockers: ['no_keepa_data'],
    },
    decision_surface: {
      primary_action: 'UZAK_DUR',
      confidence: 'HIGH',
      confidence_blockers: ['no_keepa_data'],
      top_reasons: [
        'Güçlü markaların baskısı altında fiyatlandırma imkânsız.',
        'Sertifika ve güvenlik gereksinimleri giriş bariyerini yüksek tutuyor.',
        'Fiyat savaşı aktif; küçük operatörler için marj yok.',
      ],
      operator_summary: 'Yüksek riskli kategori. Mevcut veri yeterli; Keepa olmadan da UZAK DUR kararı güvenli.',
      data_gate: { status: 'READY', reasons: [], message: 'Veri yeterli; karar güvenilir.' },
      action_distribution: { total: 5, counts: { AL: 0, TAKIP_ET: 1, UZAK_DUR: 4 }, dominant_action: 'UZAK_DUR', dominant_ratio: 0.80, single_action_warning: null },
    },
    sku_decisions: [
      { asin: 'B10CDEF001', title: 'Fisher-Price Bebek Aktivite Merkezi 0-12 Ay', action: 'UZAK_DUR', confidence: 'HIGH', reasons: ['Güçlü marka sahipli; rakip ürün konumlandırması mümkün değil.'], signals: { price_status: 'normal', seller_status: 'real', review_tier: 'very_high', rating_level: 'excellent', keepa_status: 'unavailable' } },
      { asin: 'B10CDEF002', title: 'Chicco Çıngırak Set Bebek Oyuncağı', action: 'UZAK_DUR', confidence: 'HIGH', reasons: ['Marka baskısı çok yüksek.'], signals: { price_status: 'normal', seller_status: 'real', review_tier: 'very_high', rating_level: 'good', keepa_status: 'unavailable' } },
      { asin: 'B10CDEF005', title: 'Bebek Yatağı Üstü Dönen Oyuncak Seti', action: 'UZAK_DUR', confidence: 'MEDIUM', reasons: ['Fiyat baskısı yüksek.'], signals: { price_status: 'normal', seller_status: 'real', review_tier: 'high', rating_level: 'good', keepa_status: 'unavailable' } },
      { asin: 'B10CDEF003', title: 'Yumuşak Bebek Diş Kaşıyıcı Oyuncak', action: 'UZAK_DUR', confidence: 'LOW', reasons: ['Satıcı bilgisi yok.', 'Düşük yorum sayısı.'], signals: { price_status: 'low', seller_status: 'missing', review_tier: 'very_low', rating_level: 'average', keepa_status: 'unavailable' } },
      { asin: 'B10CDEF004', title: 'Renkli Halka Çevirme Bebek Oyunu', action: 'TAKIP_ET', confidence: 'LOW', reasons: ['Satıcı bilgisi yok.', 'Düşük rating ve yorum sayısı.'], signals: { price_status: 'low', seller_status: 'missing', review_tier: 'very_low', rating_level: 'poor', keepa_status: 'unavailable' } },
    ],
  },
] as const;

async function seedKeywords() {
  for (const scan of DEMO_SCANS) {
    await pool.execute(
      `INSERT IGNORE INTO amazon_keywords (id, keyword, marketplace) VALUES (UUID(), ?, ?)`,
      [scan.keyword, scan.marketplace],
    );
  }
  console.log(`[seed] ${DEMO_SCANS.length} keywords inserted (IGNORE on duplicate)`);
}

async function scanExists(keyword: string, marketplace: string): Promise<boolean> {
  const [rows] = await pool.execute(
    `SELECT id FROM amazon_scan_jobs WHERE keyword = ? AND marketplace = ? AND status = 'done' LIMIT 1`,
    [keyword, marketplace],
  );
  return (rows as unknown[]).length > 0;
}

async function seedScan(scan: typeof DEMO_SCANS[number]) {
  if (await scanExists(scan.keyword, scan.marketplace)) {
    console.log(`[seed] skip: "${scan.keyword}" already has a done scan`);
    return;
  }

  const jobId = randomUUID();
  const finishedAt = new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  await pool.execute(
    `INSERT INTO amazon_scan_jobs (id, keyword, marketplace, status, data_points, created_at, finished_at)
     VALUES (?, ?, ?, 'done', ?, DATE_SUB(?, INTERVAL 5 MINUTE), ?)`,
    [jobId, scan.keyword, scan.marketplace, scan.data_points, finishedAt, finishedAt],
  );

  for (const product of scan.products) {
    await pool.execute(
      `INSERT INTO amazon_products (id, job_id, title, price, rating, review_count, seller_name, product_url, asin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), jobId,
        product.title, product.price, product.rating, product.review_count,
        product.seller_name,
        `https://www.amazon.com/dp/${product.asin}`,
        product.asin,
      ],
    );
  }

  const s = scan.scores;
  const riskId = randomUUID();
  await pool.execute(
    `INSERT INTO amazon_risk_scores (
       id, job_id, keyword,
       category_risk_score, category_risk_confidence, category_risk_reason,
       sku_chaos_score, sku_chaos_confidence, sku_chaos_reason,
       price_war_score, price_war_confidence, price_war_reason,
       brand_reliability_score, brand_reliability_confidence, brand_reliability_reason,
       operational_risk_score, operational_risk_confidence, operational_risk_reason,
       composite_score, decision, summary, data_points,
       data_quality, decision_surface, sku_decisions,
       outreach_priority, persuasion_points, brand_id, brand_name, enrichment
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      riskId, jobId, scan.keyword,
      s.category_risk.score,     s.category_risk.confidence,    s.category_risk.reason,
      s.sku_chaos.score,         s.sku_chaos.confidence,         s.sku_chaos.reason,
      s.price_war_risk.score,    s.price_war_risk.confidence,    s.price_war_risk.reason,
      s.brand_reliability.score, s.brand_reliability.confidence, s.brand_reliability.reason,
      s.operational_risk.score,  s.operational_risk.confidence,  s.operational_risk.reason,
      scan.composite_score, scan.decision, scan.summary, scan.data_points,
      JSON.stringify(scan.data_quality),
      JSON.stringify(scan.decision_surface),
      JSON.stringify(scan.sku_decisions),
      scan.decision === 'GUVENLI' ? 5.0 : 1.0,
      JSON.stringify([]),
      null, null, null,
    ],
  );

  console.log(`[seed] "${scan.keyword}" → ${scan.decision} (${scan.data_points} pts, jobId=${jobId})`);
}

async function main() {
  console.log('[seed] Starting demo seed...');
  await seedKeywords();
  for (const scan of DEMO_SCANS) {
    await seedScan(scan);
  }
  console.log('[seed] Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});

# Amazon Ticari Karar Motoru — Güncelleme Ceklist

> **Kaynak:** `amazon-scoring-engine-teknik-rapor.pdf` (8 Mayıs 2026)
> **Durum tespiti tarihi:** 2026-05-08

---

## Durum Tespiti — Mevcut vs. Hedef

### Mevcut Altyapı (Yeniden Kullanılacak — %60)

| Dosya | Durum | Not |
|-------|-------|-----|
| `amazon.scraper.ts` | AKTIF | Oxylabs entegrasyonu çalışıyor, 3 sayfa, filtreler mevcut |
| `seller.extractor.ts` | AKTIF | Ürünleri satıcıya göre gruplayarak hazırlıyor |
| `review.analyzer.ts` | AKTIF | Negatif kelime + AI problem skoru — operational_risk'e donör |
| `amazon.job.ts` | AKTIF | Async job pipeline korunacak, pipeline adımları değişecek |
| `amazon.scorer.ts` | REFACTOR | Seller-centric 15 satır → product/category-centric wrapper'a dönüşecek |

### Kritik Mimari Fark

```
MEVCUT:  Keyword → Scrape → Satıcı Grupla → Satıcı Skoru (0-10) → lead_candidates
HEDEF:   Keyword → Scrape → Kategori İstat. → 5 Bağımsız Skor → Composite → risk_scores
```

> **Not:** Rapor PostgreSQL diyor. Proje MySQL + Drizzle ORM kullanıyor.
> Tüm tablolar MySQL olarak implement edilecek, seed SQL kuralı geçerli.

---

## BACKEND — Yeni Kod (Codex Görevi)

### B1 — DB Schema (`021_amazon_scoring_schema.sql`)

- [x] `amazon_scan_jobs` tablosu: `id, keyword, marketplace, status, data_points, error_msg, created_at, finished_at`
- [x] `amazon_products` tablosu: `id, job_id, title, price, rating, review_count, seller_name, seller_url, product_url, asin, created_at`
- [x] `amazon_category_stats` tablosu: `id, keyword, marketplace, product_count, price_min, price_max, price_median, price_sigma, seller_count, dominant_brand_ratio, updated_at`
- [x] `amazon_risk_scores` tablosu: `id, job_id, keyword, category_risk_score, category_risk_confidence, sku_chaos_score, sku_chaos_confidence, price_war_score, price_war_confidence, brand_reliability_score, brand_reliability_confidence, operational_risk_score, operational_risk_confidence, composite_score, decision, summary, data_points, created_at`
- [x] `amazon_keepa_snapshots` tablosu: `id, asin, price_30d_min, price_30d_max, price_90d_avg, buy_box_change_count, seller_count_trend, stock_history_json, fetched_at`
- [x] Drizzle schema dosyası: `backend/src/modules/lead-machine/amazon/amazon.schema.ts`
- [x] Seed SQL kuralı: `020_market_operations_schema.sql` sonrası `021_amazon_scoring_schema.sql`

### B2 — Kategori Normalizasyonu

- [x] `category.normalizer.ts` — Her keyword için istatistik hesaplama:
  - min, max, median, standart sapma (sigma) hesaplama
  - Percentile sıralama (bireysel ürün/satıcıyı kategoriye göre normalize et)
  - Çıktı: `NormalizedProduct[]` (0-10 normalize skor)
- [x] `amazon_category_stats` tablosuna yaz/güncelle

### B3 — 5 Bağımsız Scoring Modülü

- [x] `scorers/category-risk.scorer.ts`
  - Girdi: unique seller sayısı, dominant brand oranı, review dağılımı
  - Çıktı: `{ score: number, confidence: Confidence, reason: string }`
  
- [x] `scorers/sku-chaos.scorer.ts`
  - Girdi: fiyat min/max/sigma, benzeri ürün sayısı, aynı keyword'de varyant sayısı
  - Çıktı: `{ score: number, confidence: Confidence, reason: string }`
  
- [x] `scorers/price-war.scorer.ts`
  - Girdi: Sayfa 1 ortalama fiyat vs Sayfa 3, Keepa fiyat geçmişi (opsiyonel)
  - Çıktı: `{ score: number, confidence: Confidence, reason: string }`
  
- [x] `scorers/brand-reliability.scorer.ts`
  - Girdi: marka tutarlılığı, satıcıdan satıcıya fiyat sapması, listing kalitesi
  - Çıktı: `{ score: number, confidence: Confidence, reason: string }`
  
- [x] `scorers/operational-risk.scorer.ts`
  - Girdi: review.analyzer.ts'den problem_score + negatif kelimeler, iade/kalite şikayetleri
  - Çıktı: `{ score: number, confidence: Confidence, reason: string }`

### B4 — Composite Scorer & Decision Engine

- [x] `composite.scorer.ts`
  - Ağırlıklar: category_risk %25, price_war %25, sku_chaos %20, brand_reliability %15, operational_risk %15
  - Karar etiketleri: 0-3 → `GUVENLI`, 4-6 → `DIKKATLI_OL`, 7-10 → `GIRME`
  - Ağırlıklar constructor parametresi olmalı (kullanıcı özelleştirmesi için)

### B5 — Confidence Katmanı

- [x] `confidence.calculator.ts`
  - `data_points < 10` → `INSUFFICIENT_DATA` döndür, skor üretme
  - `data_points 10-30` → `LOW` (sadece referans amaçlı)
  - `data_points > 30` → `HIGH` (karara esas alınabilir)
  - Karar etiketi sadece `HIGH` veya `MEDIUM` güvenden üretilsin

### B6 — Multi-Signal Validator (False Positive/Negative Kontrolü)

- [x] `signal.validator.ts`
  - Tek sinyal yüksek, diğerleri düşükse: `MIXED_SIGNAL` etiketi üret
  - Threshold eliminasyon:
    - `review_count < 10` → ürünü analize dahil etme
    - Sadece 1 sayfa sonuç → kategori analizi atla, sadece ürün analizi
    - Fiyat verisi eksikse → price_war_score dışarıda bırak, diğerlerini üret

### B7 — Keepa API Entegrasyonu

- [x] `keepa.client.ts`
  - 30/60/90 günlük fiyat geçmişi çekme
  - Buy Box sahipliği değişim sıklığı
  - Satıcı sayısı trendi
  - Stok durumu geçmişi
  - **Token optimizasyonu:** Sadece `INSUFFICIENT_DATA` veya yüksek riskli (`score > 7`) ürünleri Keepa'ya gönder
  - Günlük token bütçesi izleme + kuyruk sistemi (bütçe aşılırsa queue'ya al)
- [x] `amazon_keepa_snapshots` tablosuna yaz
- [x] `env.ts`'e `KEEPA_API_KEY` ekle

### B8 — Job Pipeline Güncelleme

- [x] `amazon.job.ts` güncelleme:
  ```
  Scrape (3 sayfa) 
    → Threshold filtrele (review < 10 eleme) 
    → Category stats hesapla & kaydet
    → Normalize (percentile)
    → 5 scorer paralel çalıştır
    → Keepa (koşullu)
    → Composite score
    → Signal validator
    → amazon_risk_scores'a yaz
    → Geriye dönük uyumluluk: lead_candidates'a da yaz (eski panel için)
  ```
- [x] Job idempotent olmalı: aynı `job_id` ile tekrar çalışırsa override etsin
- [x] Hata loglama: hata türü, retry sayısı, timestamp

### B9 — API Endpoints

- [x] `POST /admin/lead-machine/amazon/scan` — keyword + marketplace + options alır, job başlatır
- [x] `GET /admin/lead-machine/amazon/scan/:jobId` — job durumu sorgular
- [x] `GET /admin/lead-machine/amazon/risk-scores/:keyword` — son tarama sonucunu döndürür
- [x] Response formatı (PDF Bölüm 10):
  ```json
  {
    "keyword": "silikon paspas",
    "scanned_at": "...",
    "data_points": 47,
    "scores": {
      "category_risk":     { "score": 7.2, "confidence": "HIGH",   "reason": "..." },
      "sku_chaos":         { "score": 8.1, "confidence": "HIGH",   "reason": "..." },
      "price_war_risk":    { "score": 6.0, "confidence": "MEDIUM", "reason": "..." },
      "brand_reliability": { "score": 4.5, "confidence": "HIGH",   "reason": "..." },
      "operational_risk":  { "score": 5.0, "confidence": "MEDIUM", "reason": "..." }
    },
    "composite_score": 6.6,
    "decision": "DIKKATLI_OL",
    "summary": "..."
  }
  ```

### B10 — Tip Tanımları

- [x] `amazon.types.ts` oluştur:
  - `Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA'`
  - `Decision = 'GUVENLI' | 'DIKKATLI_OL' | 'GIRME' | 'MIXED_SIGNAL'`
  - `DimensionScore = { score: number; confidence: Confidence; reason: string }`
  - `AmazonRiskReport` (tam output şeması)

### B11 — Test Dosyaları

- [x] `__tests__/category-risk.scorer.test.ts`
- [x] `__tests__/sku-chaos.scorer.test.ts`
- [x] `__tests__/price-war.scorer.test.ts`
- [x] `__tests__/brand-reliability.scorer.test.ts`
- [x] `__tests__/operational-risk.scorer.test.ts`
- [x] `__tests__/composite.scorer.test.ts`
- [x] `__tests__/confidence.calculator.test.ts`
- [x] `__tests__/signal.validator.test.ts`
- [x] 5 farklı kategori için gerçek JSON çıktı fixture'ları (`fixtures/` altında)

### B12 — Dokümantasyon

- [x] `SCORING_LOGIC.md` — Her skor nasıl hesaplanıyor, eşik değerleri, ağırlıklar (PDF Bölüm 9 gereksinimi)

---

## BACKEND — Refactor (Cursor Görevi)

### R1 — `amazon.scorer.ts` Migrasyonu

- [x] Mevcut `scoreAmazonSeller()` fonksiyonu `@deprecated` olarak işaretle
- [x] Eski fonksiyonu `legacy.scorer.ts`'e taşı (geriye dönük uyumluluk için)
- [x] `amazon.scorer.ts`'i yeni sistemin entry point'i yap (composite scorer'ı wrap et)

### R2 — `amazon.job.ts` Entegrasyonu

- [x] Eski `seller-centric` flow'u `runAmazonJobLegacy()` olarak yeniden adlandır
- [x] `runAmazonJob()` → yeni 5-boyutlu pipeline'ı çağırsın
- [x] `lead_candidates`'a yazma backward compat. için korunsun

### R3 — Mevcut Testlerin Güncellenmesi

- [x] `__tests__/amazon.test.ts` → `scoreAmazonSeller` mock'larını güncelle
- [x] `__tests__/lead-machine.controller.test.ts` → yeni endpoint'leri ekle

---

## ADMIN PANEL — UI (Antigravity Görevi — MVP Sonrası)

> Rapor MVP'de panel istemez. Ancak `amazon-lead-search-panel.tsx` zaten mevcut.
> Aşağıdakiler MVP sonrası faz olarak planlanmıştır.

### A1 — `amazon-lead-search-panel.tsx` Güncellemesi

- [x] Mevcut satıcı tablosu + puanı gösterme yerine 5-boyutlu risk raporu göster
- [x] Her boyut için renk kodlu badge: GUVENLI (yeşil), DIKKATLI_OL (sarı), GIRME (kırmızı)
- [x] Composite score büyük sayı olarak göster + karar etiketi
- [x] Confidence level (HIGH/MEDIUM/LOW) her boyutun yanında
- [x] `reason` açıklamaları collapsible tooltip/accordion içinde
- [x] MIXED_SIGNAL durumu için özel uyarı bloğu

### A2 — Yeni Bileşen: `risk-score-card.tsx`

- [x] 5 boyutlu skoru radar chart veya bar chart olarak görselleştir (recharts)
- [x] `data_points` badge'i (kaç veri noktasından üretildi)
- [x] Keepa verisi varsa fiyat trendi mini-chart

### A3 — Smoke Test Güncellemesi

- [x] `__tests__/market-components.smoke.test.tsx` — yeni bileşenler için import smoke test ekle

---

## Görev Dağılımı Özeti

| Ajan | Görevler | Öncelik |
|------|----------|---------|
| **Codex** | B1–B12 (tüm yeni backend kodu) | Sprint 1 |
| **Cursor** | R1–R3 (refactor + test güncelleme) | Sprint 1 — B8 tamamlandıktan sonra |
| **Antigravity** | A1–A3 (UI doğrulama) | Sprint 2 — MVP sonrası |

---

## Çalışma Sırası (Bağımlılık Grafiği)

```
B10 (Tipler)
  → B2 (Normalizer) + B5 (Confidence) + B6 (Validator)
    → B3 (5 Scorer)
      → B4 (Composite)
        → B7 (Keepa — opsiyonel, koşullu)
          → B8 (Job Pipeline)
            → B9 (API Endpoints)
              → B1 (DB Schema) — paralel başlayabilir
                → B11 (Testler)
                  → B12 (SCORING_LOGIC.md)
                    → R1–R3 (Refactor)
                      → A1–A3 (UI — Sprint 2)
```

> B1 (DB schema) diğer her şeyden bağımsız olarak **paralel** başlayabilir.

---

## MVP Teslim Kriterleri (PDF Bölüm 9)

- [x] 5 scoring modülü bağımsız olarak test edilebilir
- [x] Pipeline: Scrape → Normalize → Score → Output uçtan uca çalışıyor
- [x] Confidence katmanı: data_points < 10 → skor üretilmiyor
- [x] 5 farklı kategoride gerçek JSON çıktı mevcut
- [x] `SCORING_LOGIC.md` tamamlandı
- [x] MySQL schema dosyası (`021_*.sql`) tamamlandı
- [x] Keepa entegrasyon modülü yazıldı (test edildi)

**Kalan teknik borç:**
- [x] Keepa günlük token bütçesi ve kuyruk sistemi kalıcı tablo/worker olarak ayrıştırılacak.
- [x] Amazon scoring retry sayacı ayrı alan veya log tablosu ile izlenecek.

**MVP'de YOK:**
- Admin panel / dashboard (Sprint 2)
- Otomatik kategori tarama cron'ları (Sprint 2)
- Kullanıcı yönetimi (zaten mevcut)

# Amozon — Sistem Mimarisi

**Son güncelleme:** 14 Mayıs 2026 (Phase 4 — V1 Stabilizasyon)

## Genel Bakış

Amozon, Amazon pazarlarında kategori bazlı ticari karar üreten bir explainable decision engine'dir. Operatör bir kategori veya anahtar kelime girer, sistem:

1. Amazon'dan ürün listesi tarar (Oxylabs)
2. ASIN'leri için Keepa snapshot çeker (fiyat geçmişi, satıcı sayısı, buy box hareketi)
3. Eksik satıcı verilerini Oxylabs product-detail ile zenginleştirir
4. 5 boyutta risk skorlar (kategori, fiyat savaşı, SKU kaosu, marka güveni, operasyon)
5. Cross-dimension LLM sentezi üretir (Groq llama-3.3-70b JSON mode)
6. SKU bazlı karar tier'ları çıkarır (DECISION_READY / PRIORITY_SIGNAL / PENDING_ENRICHMENT)
7. Coverage gate ile düşük veride agresif kararı engeller
8. Tezleri (AL/TAKIP_ET) zamanla izler, sinyaller bozulursa uyarır

## Bileşenler

```
┌─────────────────────────────────────────────────────────────────┐
│                       admin_panel (Next.js)                     │
│  /scan (Single Journey)  /scans  /products  /theses  /settings  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ /api/* (Bearer Auth)
┌─────────────────────────────▼───────────────────────────────────┐
│                       backend (Fastify-like, Bun)               │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────────────┐ │
│  │ amazon.job   │  │ scoring-engine │  │ thesis.service       │ │
│  │ - scrape     │  │ - 5 scorers    │  │ - createThesis       │ │
│  │ - enrich     │  │ - coverage gate│  │ - evaluateThesis     │ │
│  │ - score      │  │ - composite    │  │ - compareSignals     │ │
│  └──────┬───────┘  └────────┬───────┘  └──────────────────────┘ │
│         │                   │                                    │
│  ┌──────▼───────┐  ┌────────▼───────┐  ┌──────────────────────┐ │
│  │ scheduler    │  │ llm-enrichment │  │ keepa.client         │ │
│  │ - keepa 30m  │  │ - JSON mode    │  │ - fetchSnapshot      │ │
│  │ - seller 2h  │  │ - honesty rule │  │ - processQueue       │ │
│  │ - retry 1h   │  │ - dimension+   │  │ - volatility/trend   │ │
│  │ - daily sum. │  │   SKU narrate  │  │                      │ │
│  │ - thesis 1d  │  │                │  │                      │ │
│  └──────────────┘  └────────────────┘  └──────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   ┌─────────┐         ┌──────────┐          ┌──────────┐
   │ MySQL   │         │ Oxylabs  │          │  Keepa   │
   │ 11 tabl │         │ Amazon   │          │  API     │
   └─────────┘         └──────────┘          └──────────┘
```

## Veritabanı Şeması

Aktif tablolar (`backend/src/db/seed/sql/` altında):

| Tablo | Amaç |
|---|---|
| `amazon_scan_jobs` | Scan iş kayıtları (status: pending/running/enriching/done/failed) |
| `amazon_products` | Scan'in ürettiği ürünler (asin, brand, seller_name, price, ratings) |
| `amazon_category_stats` | Kategori bazlı istatistik snapshot'ları |
| `amazon_risk_scores` | 5 boyut skoru + composite + decision + sku_decisions JSON + decision_surface JSON |
| `amazon_keepa_snapshots` | ASIN bazlı Keepa verisi (price_30d_min, price_90d_avg, price_volatility σ/μ, offer_count_avg, offer_count_trend, buy_box_change_count) |
| `amazon_keepa_queue` | Keepa fetch kuyruğu (status: pending/done/failed) |
| `amazon_keepa_daily_budget` | Günlük Keepa token bütçesi (default 600) |
| `amazon_keywords` | Anahtar kelime havuzu |
| `amazon_job_error_logs` | Scan hata geçmişi (auto-retry kararı için) |
| `amazon_developer_notes` | İç iletişim notları + scheduler tarafından otomatik üretilen günlük özet/uyarı notları |
| `amazon_theses` | **Phase 4 TM** — Aktive edilmiş tezler, status: active/weakened/broken/closed |

## Scan Akışı (Phase 4 sonrası)

```
1. Operatör /scan sayfasında keyword + marketplace yazar, Başlat tıklar
2. POST /api/scans { keyword, marketplace, auto_add: true }
   → amazon_scan_jobs INSERT, runAmazonJob arka planda başlar
3. runAmazonJob:
   a. status = running
   b. scrapeAmazonProducts (Oxylabs, 1-3 sayfa, gerekirse recovery + AI varyasyon)
   c. eligible ürünler filterEligibleProducts ile süzülür
   d. saveAmazonProducts → amazon_products INSERT
   e. PRE-SCORE KEEPA: ilk 15 ASIN için synchronous fetch (Phase 3)
   f. scoreAmazonCategory (5 scorer + coverage gate)
   g. enrichReportWithLLM (Groq JSON, dimension reasons + SKU narratives)
   h. saveRiskScore → amazon_risk_scores INSERT
   i. status = enriching
   j. POST-SCAN PARALLEL: seller enrichment + remaining Keepa (Promise.all)
   k. status = done

4. Frontend /scan sayfası 2 saniyede bir GET /api/scans/:jobId/progress
   → 6 aşama (scrape, keepa, seller, scoring, reasoning, lineage) progress bar
   → done olduğunda summary kartı (skor, karar, karar-hazır SKU, öncelikli SKU)

5. Operatör isterse "Tezi Aktive Et" → POST /api/scans/:jobId/thesis
   → amazon_theses INSERT (original_scores + key_signals snapshot)

6. Scheduler arka planda:
   - 30 dakikada bir kalan Keepa kuyruğu işlenir
   - 2 saatte bir eski scan'lerin seller coverage'ı zenginleştirilir
   - 1 saatte bir failed scan'ler retry edilir (geçici hata için)
   - Saatte bir günlük özet developer note
   - Günde bir aktif tezler re-evaluate edilir (7+ gün eski olanlar)
```

## Phase 4 Yeni Yetenekler

### J1 — Single Journey
- `/amozon/scan` sayfası: tek-ekran keyword → progress → özet
- `GET /api/scans/:jobId/progress` endpoint: 6 aşama + summary
- `auto_add: true` ile yeni keyword'lerin tek tıkla scan'i

### CH — Confidence Honesty
- **LLM Honesty Rule:** `data_quality.confidence_blockers` LLM prompt'una input olarak verilir; "tahmini", "sınırlı veri ile", "doğrulanmamış" ifadeleri zorunlu kılınır
- **Coverage Gate:** keepa_coverage<0.3 VE seller_coverage<0.3 → AL/UZAK_DUR → TAKIP_ET'e indirgenir; `coverage_gate` field decision_surface'a eklenir
- **Stale Data Badge:** 7+ gün eski scan'ler "Veri bayat" işareti alır
- **UI Düşük Confidence Sinyalleri:** LOW confidence dimension'lar sarı border-left + italic reason

### TM — Thesis Memory / Invalidation
- AL/TAKIP_ET kararı verilince operatör "Tezi Aktive Et" — `amazon_theses` kaydı
- `extractKeySignals`: scan'in en güçlü 2-3 sinyalini snapshot'lar
- `evaluateThesis`: aynı keyword'le yeni scan tetikler, `compareSignals` ile sapma ölçer
- Sapma kuralı: >2 puan → weakened, 3+ veya çoklu sapma → broken
- Scheduler günlük re-evaluation (7+ gün eski tezler için)
- Status değişimi → otomatik developer note

### UX2 — Auto Enrichment Serileştirme
- Post-scan seller + remaining-Keepa tasks `Promise.all` ile beklenir
- Yeni status `enriching`: scrape done → enriching → done
- Operatör "done" gördüğünde tüm enrichment gerçekten tamamlanmış olur

### UX4 — Günlük Kullanım Güvenilirliği
- `GET /api/health` endpoint: uptime, Keepa budget, scheduler last runs, error count
- AdminShell sticky banner: Keepa budget <%20 olunca uyarı
- Auto-retry: geçici hatalı (5xx, timeout) scan'ler 1 saat sonra max 2 retry
- Daily summary: gece bir kere developer note (X tarama, Y hata, Z snapshot, W LLM çağrısı)

## Veri Akışı: Sinyal → Skor

```
Amazon listesi → eligible ürünler (filter)
                ↓
   ┌────────────┴────────────────┐
   ▼                             ▼
amazon_products              ASIN listesi (top 15)
                                 ↓
                       Keepa snapshot fetch (sync)
                                 ↓
                          amazon_keepa_snapshots
                                 ↓
   ┌─────────────────────────────┴───────────┐
   ▼                                         ▼
5 Scorer:                            data_quality:
- category_risk                      - keepa_coverage
- price_war_risk (volatility,        - seller_coverage
  historical drop, low cluster)      - price_coverage
- sku_chaos                          - confidence_blockers
- brand_reliability (real brand,
  seller_count_trend)
- operational_risk (buy_box,
  offer_count_trend)
                                         ↓
   ┌────────────────────────────────────────┘
   ▼
CompositeScorer → decision
                  ↓
            buildDecisionSurface
                  ↓
            applyCoverageGate  ← coverage_blockers check
                  ↓
           enrichReportWithLLM ← honesty directive injection
                  ↓
            saveRiskScore
```

## LLM Enrichment Detayı

`backend/src/amazon/llm-enrichment.ts`:

- **Model:** Groq `llama-3.3-70b-versatile` (JSON mode)
- **Tek çağrı, 4 katman çıktı:**
  1. `operator_summary` (max 180 char)
  2. `persuasion_points[]` (3 madde)
  3. `dimension_reasons` (5 boyut için çapraz referanslı reason)
  4. `sku_narratives` (top 5 SKU için özel narrative)
- **Honesty injection:** confidence_blockers boş değilse, prompt'a strict directive eklenir
- **Fallback:** LLM fail veya parse fail → deterministic template korunur (synthesizeCommercialSummary)
- **Top SKU seçimi:** decision_tier (DECISION_READY > PRIORITY_SIGNAL) ve action (AL > UZAK_DUR > TAKIP_ET) sıralaması

## Scheduler Görevleri

| Görev | Sıklık | İlk gecikme | Amaç |
|---|---|---|---|
| `runKeepaProcessor` | 30 dk | 15s | Pending Keepa queue işleme |
| `runSellerEnrichment` | 2 saat | 60s | Düşük coverage scan'lerde seller verisi tamamlama |
| `runDailySummary` | 1 saat (idempotent) | 90s | Günde 1 developer note (yarına geçmiş varsa skip) |
| `runAutoRetryFailedScans` | 1 saat | 120s | Geçici hatalı son 24h scan'leri retry (max 2 attempt) |
| `runThesisReevaluation` | 1 gün | 180s | last_evaluated_at 7+ gün eski active tezler için yeni scan + karşılaştırma |

## Auth & Erişim

- **nginx basic auth:** `demo / demo2026` (public demo erişimi için)
- **Panel app login:** `admin / amozon2026` (cookie session, 24h)
- **Backend API:** `Authorization: Bearer $BACKEND_API_SECRET`
- **Panel → Backend:** API_SECRET admin server-side route'unda enjekte edilir

## Konfigürasyon (Settings sayfası)

- API anahtarları: Oxylabs, Keepa, Groq, OpenAI
- Skorlama ağırlıkları: 5 boyut weight
- Karar eşikleri: GUVENLI_MAX, DIKKATLI_OL_MAX
- Confidence band'leri: INSUFFICIENT_DATA_MAX, LOW_MAX, MEDIUM_MAX
- Scraper davranışı: SEARCH_PAGES, RECOVERY_ENABLED, RECOVERY_VARIATION_COUNT, review/rating filtreleri
- Keepa günlük token bütçesi

## Test Kapsamı

- **Backend unit test:** 83 test, 4 dosya kategorisi
  - Scorer: 5 boyut + composite + outreach priority
  - SKU decisions: extractAsinFromUrl, buildSkuDecisions, signals
  - Data quality: scan_age_days, coverage hesaplamaları
  - LLM enrichment: prompt honesty kuralı
  - Coverage gate: AL/UZAK_DUR downgrade matris, boundary
  - Thesis service: extractKeySignals, compareSignals
  - E2E scan job (mock DB)

## Deploy Topology

- VPS: `vps-paspas` (178.210.161.181:22667)
- PM2 process'leri: `amozon-api` (port 8186), `amozon-panel` (port 3196)
- Reverse proxy: nginx → `/amozon/*` location
- Public URL: `https://panel.avrasyaotomotiv.net/amozon/`
- DB: MariaDB/MySQL `amazon_scoring`

## Bilinen Sınırlar

1. **Keepa volatility:** En az 5 fiyat noktası gerekir (yeni listingler için null)
2. **Marketplace çeşitliliği:** Keepa bazı küçük marketplace'lerde 400 döner (`KEEPA_MARKETPLACE_NOT_SUPPORTED`)
3. **LLM cost:** Her scan ~1 Groq call (~2KB in, ~1.5KB out)
4. **Daily budget:** Keepa 600 token/gün (Settings'ten ayarlanabilir)
5. **Oxylabs rate:** 429 ihtimaline karşı scraper 3 attempt retry

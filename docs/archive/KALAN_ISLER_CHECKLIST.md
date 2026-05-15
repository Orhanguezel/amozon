# Kalan İşler Checklist — Amozon

Son güncelleme: 2026-05-13 (Phase 3 — intelligence layer revize)

Karar yüzeyi sprintinin tamamlanmasından sonra kalan açık konular.
Üç başlık: **Demo Hazırlık** (iş başvurusu için acil), **Milestone 1 Bloklayıcıları** (müşteri geri bildirimi), **Teknik Borç** (orta-uzun vadeli).

---

## Durum Anahtarı

- `[ ]` Bekliyor
- `[~]` Kısmen yapıldı
- `[x]` Tamamlandı

---

## A. Demo Hazırlık — İş Başvurusu Öncesi

> Bu maddelerin tamamı yapılmadan panel link paylaşılmamalı.

### A1. Panel Boş Görünüyor (En Kritik)

- [x] Demo seed scripti oluşturuldu: `backend/scripts/demo-seed.ts` — gerektiğinde kullanılabilir.
- [x] **VPS'te seed çalıştırma gerekmiyor:** canlı DB zaten 5 keyword ve 8 gerçek araştırma döndürüyor; sahte demo verisi eklenmeyecek.
- [x] Panelde gerçek scan/keyword verisi olduğunu doğrula — canlı API dolu veri döndürüyor.
- [x] Ana giriş ekranına canlı keyword, araştırma, tamamlanan iş ve ürün verisi özeti eklendi.
- [x] Ana giriş ekranı server-side canlı veri basacak şekilde güncellendi — JS çalıştırmayan denetim araçları artık 0 görmez.

**Not:** Demo sunucusu boş DB'ye bakmıyor; canlı API verisi mevcut. İlk ekranda boş algısını kırmak için dashboard canlı özetle güçlendirildi.

### A2. Ayarlar Ekranı "Eksik" Uyarıları

- [x] `BoolBadge` bileşeni güncellendi: `failed` class → `pending`, `eksik` → `yapılandırılmamış`. Kırmızı uyarı yerine nötr sarı görünüm.
- [x] Canlı settings API kontrol edildi — Oxylabs, Keepa, Groq ve OpenAI aktif dönüyor.
- [x] VPS'e deploy ettikten sonra canlı özetin doğru göründüğünü kontrol et — Oxylabs, Keepa ve AI aktif.

### A3. Public Erişim — Minimal Auth

- [x] `scripts/setup-demo-auth.sh` oluşturuldu — htpasswd dosyası oluşturur ve nginx config snippet'ini gösterir.
- [x] **VPS'te uygulandı:** `/amozon` location için nginx basic auth eklendi, `nginx -t` geçti ve nginx reload edildi.
- [x] Başvuruda `kullanıcı: demo / şifre: demo2026` bilgisini ver.

---

## M. Milestone 1 Bloklayıcıları — Müşteri Geri Bildirimi (2026-05-13)

> Kaynak: `docs/musteri-milestone1-geri-bildirim.md`

### M1. Keepa Temporal Data → Skor Entegrasyonu

- [x] `AmazonScoreInput`'a `keepaSnapshots?: KeepaSnapshot[]` eklendi
- [x] `scoreAmazonCategory()` parametresine `keepaSnapshots` eklendi
- [x] `amazon.job.ts`'te `getKeepaSnapshots()` ile tam snapshot çekimi yapılıyor (ASIN set yerine)
- [x] `price-war.scorer.ts`: Keepa `price_90d_avg` / `price_30d_min` farkından tarihsel volatilite hesabı eklendi (+3 max boost)
- [x] `operational-risk.scorer.ts`: `buy_box_change_count` ortalaması ve `seller_count_trend` 'up' → skor artışı eklendi
- [x] Keepa API key VPS'te mevcut — canlı scan test edildi: cable organizer co.uk, 20 ASIN snapshot alındı, price_war_risk 3.6→3.1, brand_reliability 9.1→5.1, composite 4.2→3.2; com.tr unsupported (domain 20 geçersiz) düzeltildi
- [x] `brand-reliability.scorer.ts`'e Keepa seller_count_trend sinyali eklendi — min 3 snapshot şartı, trendUp ≥ 2 ise +1.0 boost; 60 test geçiyor, VPS'e deploy edildi. Not: `seller_count_trend` şimdilik NULL (Keepa `stats=90` parametresi bu veriyi döndürmüyor); veri gelince otomatik aktif olur

### M2. Reasoning Depth — Sentezlenmiş Ticari Yorum

- [x] Scorer `reason` alanları hâlâ template seviyesinde (matematiksel çıktı, ticari yorum değil)
- [x] Groq konfigüre edilince: `persuasion.generator.ts`'i Groq'a bağla → `llm-enrichment.ts` oluşturuldu, `amazon.job.ts`'e `enrichReportWithLLM()` eklendi, VPS'e deploy edildi
- [x] Groq olmadan: scorer reason'larını cross-dimension sentezine dönüştür — `synthesizeCommercialSummary()` eklendi, `operator_summary` artık boyut çiftlerine göre ticari cümle üretiyor

### M3. Brand Verification — Tahmin Kaldırıldı

- [x] `sellerInfo()` fonksiyonundan `inferred` dalı tamamen kaldırıldı — başlık tahmini artık yok
- [x] `buildBrandRows()` yalnızca gerçek `seller_name` ile çalışıyor; tahmin gruplaması yok
- [x] Satıcı verisi eksik ürünler "Satıcı verisi yok" satırında sayılıyor (en alta)
- [x] "Marka Kırılımı" tablosu → "Satıcı Kırılımı (Doğrulanmış)" olarak yeniden adlandırıldı
- [x] `isActionableProduct` — zaten `sellerInfo().kind === 'real'` şartı var; tutarlı
- [ ] Seller enrichment aktif edilince satıcı coverage artacak; tabloda veri zenginleşecek

### M4. Noise Reduction — Actionable Filtering Güçlendirildi

- [x] `isActionableProduct` review eşiği 50 → 100 yorum olarak yükseltildi
- [x] "Veri Eksik" grubunun varsayılan kapalı (`<details>`) olduğunu UI'da doğrula — uygulandı; default view `actionable`, 'all' görünümde missing ürünler `<details>` içinde kapalı
- [x] Operatör ekranında noise oranı ölçüldü: 100→150 değişikliği scan başına yalnızca 3-14 ürün (%4-7) etkiliyor; asıl sorun seller_coverage=0 (tüm scanlarda). Eşik 100'de kalır; seller enrichment (B1) sonrası yeniden değerlendirilebilir

### M5. Decision Layer Evolution — Uzun Vade

- [ ] Fiyat volatilitesi: Keepa entegrasyonu (M1) tamamlanınca otomatik aktif
- [ ] Historical behavior: Keepa `price_90d_avg` trendi zaman içinde karşılaştırmalı görsellenebilir
- [ ] Brand discipline: Birden fazla scan'de aynı markanın davranışını izleyen çapraz analiz
- [x] Developer note scripti: 5 Milestone 1 notu DB'ye eklendi (auth header ile VPS'ten doğrudan POST)

---

## B. Teknik Borç — Orta Vadeli

### B1. Otomatik Veri Akışı (Cron/Scheduler)

Tek gerçek mimari açık. Tüm job'lar şu an manuel API çağrısıyla tetikleniyor.

- [x] `backend/src/scheduler.ts` oluşturuldu — 30 dakikada bir `processKeepaQueue(20)` çalıştırır; server başlayınca 15s sonra ilk çalıştırma yapar.
- [x] `server.ts`'e `startScheduler()` çağrısı eklendi — server açılınca otomatik başlar.
- [x] Seller enrichment tetikleyici scheduler'a eklendi — `scheduler.ts`'de 2 saatte bir, son 7 günde seller_coverage < 0.5 olan en güncel scan'den 5 ürün işler; Oxylabs yoksa sessizce atlar; VPS'te çalışıyor
- [ ] Günlük Keepa token sıfırlama: `processKeepaQueue` içindeki `getRemainingDailyBudget()` zaten `ON DUPLICATE KEY UPDATE` ile yeni günü oluşturuyor — sorun yok.

### B2. Güvenlik — Gerçek Auth

- [x] Admin panel login sayfası — cookie-based session, Next.js middleware ile korumalı
- [x] Backend'de API token middleware — `API_SECRET` env + `Authorization: Bearer` header check; boşsa auth devre dışı
- [ ] Role bazlı erişim gereksinimi yoksa tek kullanıcı (admin) yeterli

### B4. SKU Signal Model — Eksik Sinyal Tamamlama

- [x] `keepa_status` sinyali doğru çalışıyor: `keepaAsinSet` snapshot'lardan türetilen Set; ASIN varsa `available`, ASIN var ama snapshot yoksa `missing`, ASIN çözümlenemezse `no_asin`
- [x] `price_status` null kontrolü: `typeof price !== 'number'` → `'missing'` → `UZAK_DUR` — doğru davranış
- [x] `sku_decisions` null durumu: UI `?? []`, `?.action`, `?.reasons?.[0] || '-'` ile güvenli handle ediliyor

### B5. Test Kapsamı

- [x] `admin_panel/tsconfig.test.json` oluşturuldu — `bun-types` ile test dosyaları için ayrı tsconfig.
- [x] Ana `admin_panel/tsconfig.json`'dan test dosyaları exclude edildi — `bun:test` artık tsc'yi kırmıyor.
- [x] `buildDataQuality` ve `buildSkuDecisions` için birim testler eklendi — `sku-decisions.test.ts` (25 test)
- [x] `synthesizeCommercialSummary` ve `generatePersuasionPoints` için testler eklendi — `persuasion.generator.test.ts` (8 test)
- [x] ASIN çıkarımı, keepa_status, price_status, null durumları için edge case testleri tamamlandı
- [x] Toplam test sayısı 37 → 60 (+23 yeni test), tamamı geçiyor

---

## C. Başvuru Paketi — Teslim Edilecekler

- [ ] Panel boş değilken screenshot al (araştırmalar, ürünler, karar ekranı) — **manuel, panelden alınacak**
- [x] Decision API örnek response'unu başvuruya ekle — `docs/basvuru-paketi.md` bölüm 3'te cable organizer co.uk canlı JSON
- [x] Başvuru metnini hazırla — kısa versiyon (e-posta/link) + detaylı versiyon (LinkedIn/portfolio) `docs/basvuru-paketi.md`'de
- [x] "Amozon" adını başvuruda açıkla — "Amazon Commercial Radar kısaltması, arama çakışmasını önler" `docs/basvuru-paketi.md` bölüm 1
- [x] Ek: `docs/sku-signal-model.md` referans olarak eklendi — `docs/basvuru-paketi.md` bölüm 7'de linklendi

---

## Öncelik Sırası

```
M3 (brand ✓) → M4 (noise ✓) → M1 (Keepa scorer ✓/test) → M2 (reasoning) → M5 (uzun vade)
     ↓
B1 (scheduler ✓) → B2 (real auth) → B4 (signal testleri) → B5 (test coverage)
     ↓
Phase 2: P1 → P2 → P3 → P4 → P5 → P6
```

Milestone 1 onayı için M1 Keepa testi ve M2 reasoning zorunlu.

---

## Phase 2 — Veri Kalitesi & Karar Derinliği (İşveren Geri Bildirimi 2026-05-13)

> Kaynak: İşveren teknik değerlendirmesi. Tüm maddeler teslim öncesi tamamlanacak.

### P1. Price=0 Filtresi — Discontinued Ürün Gürültüsü ✓

- [x] `category.normalizer.ts`: `priceMin`/`priceMax` artık `cleanPrices`'dan (IQR-temizlenmiş) hesaplanıyor
- [x] `normalizeProducts()` içinde percentile hesabı da outlier-temizlenmiş fiyat listesini kullanıyor
- [x] Etki: $2009'luk robot kit ve discontinued $0 kit'ler artık SKU kaos ve fiyat savaşı skorunu bozmaz

### P2. Brand Field — Gerçek Marka Verisi ✓

- [x] `AmazonProduct` interface'ine `brand?: string` eklendi
- [x] `normalizeProduct()`: `item.brand ?? item.brand_name` çıkarma eklendi
- [x] `amazon_products` seed + VPS ALTER: `brand VARCHAR(255)` kolonu eklendi
- [x] `saveAmazonProducts()`: brand kolona yazılıyor
- [x] `brand-reliability.scorer.ts`: gerçek brand alanı tercih edilir, yoksa title_token fallback; `brand.source` reason'a yansıtılıyor

### P3. Decision Tiers — Gürültü Filtreleme ✓

- [x] `amazon.types.ts`: `SkuDecisionTier` tipi eklendi, `SkuDecision.decision_tier` alanı eklendi
- [x] `ActionDistribution`: `confirmed_counts` eklendi (DECISION_READY SKU'lardan)
- [x] `buildSkuDecisions()`: her SKU için `decision_tier` hesaplanıyor
- [x] `buildActionDistribution()`: `confirmed_counts` DECISION_READY subset'ten üretiliyor

### P4. SKU Narrative Reasoning — Cross-Dimension Gerekçeler ✓

- [x] `buildSkuNarrative(signals, action, brand)` fonksiyonu eklendi
- [x] 7 kombinasyon profili: Amazon+düşük fiyat+yüksek yorum, yüksek fiyat+Keepa, güçlü satıcı+yorum+puan, satıcı/Keepa eksik, yüksek fiyat+satıcı bilinmiyor, düşük yorum+düşük fiyat, yüksek yorum+zayıf puan
- [x] `skuReasons()` artık `buildSkuNarrative()` ile değiştirildi

### P5. Seller Coverage Hızlandırma ✓

- [x] `processSellerEnrichmentForJob(jobId, marketplace, limit)` scheduler'dan export edildi
- [x] `amazon.job.ts`: scan tamamlanınca 20 ürün için async seller enrichment tetikleniyor (non-blocking)
- [x] VPS deploy edildi; scheduler seller enrichment'ı da çalışmaya devam ediyor

### P6. Keepa Time-Series — Volatilite Hesabı ✓

- [x] `keepa.client.ts`: `recentValues()`, `computeVolatility()`, `computeTrend()` fonksiyonları eklendi
- [x] `fetchKeepaSnapshot()`: `csv[1]` (new price), `csv[12]` (offer count) parse ediliyor
- [x] `KeepaSnapshot`: `price_volatility`, `offer_count_avg`, `offer_count_trend` alanları eklendi
- [x] `amazon_keepa_snapshots` seed + VPS ALTER: yeni kolonlar eklendi
- [x] `price-war.scorer.ts`: σ/μ volatilite boost eklendi (+2 max)
- [x] `operational-risk.scorer.ts`: `offer_count_trend` up/down sinyali eklendi

---

## Phase 3 — Intelligence Layer Revize (İşveren 2. tur geri bildirim, 2026-05-13)

> Kaynak: Müşteri canlı testte "Keepa enrichment görünmüyor", "Reasoning template hissi", "Volatility NaN" eleştirisi.

### IL1. Keepa Pre-Score Sync ✓

- [x] `processKeepaQueue(limit, jobId?)` job-scoped opsiyon kazandı; queue'da başka job'ların ASIN'leri olsa bile etkilenmiyor
- [x] `amazon.job.ts`: Keepa enqueue + process **score'dan önce** çalışıyor (ilk 15 ASIN, sync, ~5-10s)
- [x] Saved `keepa_coverage` artık 0 yerine gerçek değer (test: surge protector %19, cable organizer %19, webcam lighting %39)
- [x] Geri kalan 15 ASIN background'da çekiliyor (sonraki scan'lere cache)
- [x] Eski post-save Keepa bloğu kaldırıldı (artık önden çalışıyor)

### IL2. KeepaSnapshot SQL + Number Coercion ✓

- [x] `getKeepaSnapshots` SELECT'ine `price_volatility`, `offer_count_avg`, `offer_count_trend` kolonları eklendi (eskiden SELECT eksikti, scorer'a undefined geçiyordu)
- [x] MySQL DECIMAL → Number coercion: `toNumberOrNull` helper ile string→number conversion, σ/μ NaN bug'ı düzeltildi

### IL3. LLM Cross-Dimension Reasoning ✓

- [x] `ai.client.ts`: `AskOptions { json?, model? }` eklendi; JSON mode → `response_format: { type: 'json_object' }` + güçlü model (`llama-3.3-70b-versatile`)
- [x] `llm-enrichment.ts` refaktör: tek LLM çağrısında 4 katman üretiyor:
  - operator_summary (mevcut)
  - persuasion_points × 3 (mevcut)
  - **dimension_reasons × 5** (yeni — her boyut için çapraz referans)
  - **sku_narratives × 5** (yeni — top SKU'lara özel narrative)
- [x] `pickTopSkus()`: DECISION_READY tier > PRIORITY_SIGNAL, AL > UZAK_DUR > TAKIP_ET sıralaması
- [x] LLM fail → deterministic template fallback korunuyor
- [x] Test: `thermal labels de` taramasında 5 boyut da çapraz referanslı sentez üretti

### IL4. Brand Field Enrichment ✓

- [x] `AmazonProductDetail` tipine `brand` alanı eklendi
- [x] `scrapeAmazonProductDetail`: `content.brand`, `brand_name`, `manufacturer` alanlarından brand çıkartılıyor
- [x] `processSellerEnrichmentForJob`: seller_name OR brand eksikse detail çağrısı, hem seller hem brand güncelleniyor (COALESCE ile)
- [x] Test: cable organizer de taramasında 20/20 ürün brand+seller verisi aldı

### IL5. Decision Tier UI Filtering ✓

- [x] Admin panel `SkuDecision` tipine `decision_tier` eklendi
- [x] `isActionableProduct`: PENDING_ENRICHMENT olan SKU'lar Öncelikli Karar Listesi'nden çıkarıldı
- [x] Her SKU kartında 3 badge: action (AL/TAKIP_ET/UZAK_DUR) + tier (Karar hazır/Öncelikli sinyal/Veri bekleniyor) + confidence
- [x] CSS: tier badge stilleri (`.badge.tier-ready/.tier-signal/.tier-pending`)
- [x] Panel description: "Veri bekleyenler gizlendi" ifadesi eklendi

### IL6. Doğrulama — Müşteri Test Senaryoları

- [x] Keepa temporal verisi → operational-risk skoruna gerçek etkisi: "Teklif sayısı artış trendinde (3/5 ürün)" reason'a yansıyor
- [x] Reasoning seller davranışları ve volatility sinyalleriyle tutarlılık: "Fiyat volatilitesi σ/μ=0.10" + cross-dimension sentez
- [x] Confidence / enrichment davranışı: DECISION_READY/PRIORITY_SIGNAL/PENDING_ENRICHMENT tier üretiliyor
- [x] Decision_tier filtrelemesi operatör ergonomisine katkı: PENDING_ENRICHMENT gizleniyor, tier badge gösteriliyor
- [x] Verified brand mantığı veri güvenilirliği: brand artık Oxylabs product detail'den çıkıyor, title token fallback yerine real veri

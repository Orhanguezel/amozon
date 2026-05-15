# Amozon Kullanıcı İstekleri, Taahhütler ve MVP Durum Checklist

**Hazirlama tarihi:** 11 Mayis 2026  
**Incelenen kaynaklar:**

- `müsterimesajlari.md`
- `amazon-proje-taahhut-listesi.md`
- `AMAZON_SCORING_ENGINE_CHECKLIST.md`
- `amazon-scoring-engine-teknik-rapor.pdf`
- `amazon-scoring-mvp-plan.pdf`
- Mevcut repo/kod durumu

**Durum anahtari:**

- `[x]` Tamam
- `[-]` Kismi / calisiyor ama eksik veya dogrulama gerekiyor
- `[ ]` Eksik
- `[n/a]` MVP disi / ileriki faz notu

---

## 1. Kullanıcının Net İstedikleri

### 1.1 Cekirdek Urun Amaci

- [x] Sistem "hangi urun iyi?" degil, "hangi urun riskli?" sorusuna cevap vermeli.
- [x] Ticari karar destek motoru olmali; kotu karar risklerini filtrelemeli.
- [x] Scoring sistemi aciklanabilir olmali; her skorun gerekcesi uretilmeli.
- [x] Zorla skor uretmemeli; yetersiz veride `INSUFFICIENT_DATA` diyebilmeli.
- [x] Sade ve optimize edilebilir bir MVP olmali.
- [x] Ilk fazda buyuk sistem yerine scoring cekirdegi dogrulanmali.

### 1.2 5 Boyutlu Scoring

- [x] Kategori risk puani: seller yogunlugu, dominant brand orani, review dagilimi.
- [x] SKU chaos puani: fiyat spread, sigma, benzer urun/varyant kalabaligi.
- [x] Price war riski: sayfa 1 vs sayfa 3 fiyat trendi, race-to-bottom sinyali.
- [x] Brand reliability puani: marka/fiyat/listing tutarliligi.
- [x] Operational risk: negatif review, iade/kalite sikayetleri, AI problem skoru.
- [x] Composite skor: agirlikli karar skoru.
- [x] Karar etiketleri: `GUVENLI`, `DIKKATLI_OL`, `GIRME`.
- [x] `MIXED_SIGNAL` mekanizmasi: tek sinyal yuksekse asiri sert karar engellenmeli.

### 1.3 Confidence ve Belirsizlik

- [x] `HIGH`, `MEDIUM`, `LOW`, `INSUFFICIENT_DATA` confidence katmani olmali.
- [x] `data_points < 10` durumunda karar uretmemeli.
- [x] Dusuk veriyle uretilen skorlar karar icin zorlanmamali.
- [x] Her skorda kac veri noktasindan uretildigi gorunmeli.

### 1.4 Category Normalization

- [x] Sabit esik yerine kategori bazli normalizasyon uygulanmali.
- [x] Min, max, median, sigma hesaplanmali.
- [x] Percentile tabanli normalize skor uretilebilmeli.
- [x] Farkli kategoriler kendi dagilimina gore degerlendirilmeli.

### 1.5 Veri Pipeline

- [x] Amazon search verisi Oxylabs ile cekilmeli.
- [x] Urun, fiyat, rating, review count, seller, URL, ASIN kaydedilmeli.
- [x] Job bazli tarama akisi olmali.
- [x] Hata durumunda job failed olmali ve hata loglanmali.
- [x] Retry mantigi eklendi; Oxylabs 429/5xx/timeout gibi gecici scrape hatalari failed olmadan once 3 kez deneniyor.
- [x] Gereksiz demo mode kaldirildi.
- [x] Sadece belirlenen keyword seti kullaniliyor: `thermal labels`, `cable organizer`, `surge protector`, `dash cam`, `webcam lighting`.

### 1.6 Keepa Entegrasyonu

- [x] Keepa API key env/config uzerinden verilebilmeli.
- [x] Keepa token butcesi takip edilmeli.
- [x] Keepa queue sistemi olmali.
- [x] Fiyat gecmisi, Buy Box, seller trend, stok gecmisi snapshot yapisi mevcut.
- [x] Token ekonomisi icin sadece belirsiz veya yuksek riskli urunler Keepa'ya gitmeli.
- [x] Keepa verisi token ekonomisiyle toplanıyor; Products analizinde snapshot sayısı, fiyat trendi, Buy Box değişimi ve seller trend görünümü var.

### 1.7 JSON Risk Karti

- [x] Keyword, scanned_at, data_points donmeli.
- [x] 5 skor boyutu `score`, `confidence`, `reason` ile donmeli.
- [x] Composite score ve decision donmeli.
- [x] Summary donmeli.
- [x] `outreach_priority` alani eklendi.
- [x] `persuasion_points` alani eklendi.
- [x] `brand_context` alani eklendi.
- [x] `enrichment` genisleme alani eklendi.
- [n/a] Kullanıcı bu aşamada outreach otomasyonu istemedi; sadece JSON/schema hazırlığı istedi.

### 1.8 Configurable Architecture

- [x] Scoring agirliklari merkezi config dosyasinda.
- [x] Threshold degerleri merkezi config dosyasinda.
- [x] Config degisikligi icin scoring kodunu bastan yazmak gerekmiyor.
- [x] Admin panelden agirlik/threshold duzenleme eklendi; Settings > Scoring Ayarları yeni scanlerde kullanilacak `.env` degerlerini guncelliyor.

### 1.9 Source Code ve Sahiplik

- [x] Source code standalone repo icinde toparlandi.
- [x] `RIGHTS_TRANSFER.md` mevcut.
- [x] Backend ve admin panel repo icinde.
- [x] Eski dokumanlarda MarketPulse path referanslari ve eski dosya adlari var; `FINAL_TESLIM_KURULUM_KULLANIM.md` ile güncel standalone teslim path'i netleştirildi.
- [x] `docs/` klasoru taahhut dosyasinda geciyor ama mevcut repo kokunde yok; final teslim dokümanında güncel dosya listesi repo köküne göre yazıldı.

---

## 2. Operator Panel / Admin Panel Ihtiyaclari

Kullanıcı ilk MVP'de paneli öncelememiş, ancak ayrı mesajlarda "Amazon operatör paneli ve karar ekranı" istemiş. Mevcut repo bu yönde ilerletiliyor.

### 2.1 Panel Temel Mimari

- [x] `admin_panel/` Next.js uygulamasi mevcut.
- [x] Backend API ile konusuyor.
- [x] Ana navigasyon mevcut: Dashboard, Scans, Products, Settings.
- [x] Admin panel `http://localhost:3096` uzerinde calisiyor.
- [x] Backend API `http://localhost:8186` uzerinde calisiyor.
- [x] Settings ekraninda API kodlari girilebiliyor.

### 2.2 Scan ve Karar Ekrani

- [x] Panelden scan baslatma var.
- [x] Job status takip var.
- [x] Risk ozeti ve decision badge var.
- [x] 5 boyutlu risk gorsellestirme var.
- [x] Radar/bar tarzinda grafikler var.
- [x] `/scans` operasyon/job takibine, `/products` urun ve pazar analizine ayrildi.
- [x] "Al / takip et / uzak dur" operator karar dili UI'a eklendi; decision degerinden otomatik aksiyon uretiliyor.
- [x] Alarm/uyari sistemi eklendi; Scans panelinde failed, GIRME ve INSUFFICIENT_DATA uyarilari otomatik ozetleniyor.

### 2.3 Urun ve Kategori Filtreleri

- [x] Products sayfasinda scan secip urun tablosu gorulebiliyor.
- [x] Urun tablolarinda price/rating/review/seller/asin/url bilgisi var.
- [x] Kategori/keyword bazli secim ve gelismis filtre ekrani var.
- [x] Seller, review count, price band, scan decision, operator aksiyon ve min composite filtreleri eklendi.
- [x] Kategori karsilastirma ekrani Products sayfasina eklendi; tamamlanmis scanler keyword bazinda karsilastiriliyor.

### 2.4 Brand ve Marka Odakli Gorunum

- [x] JSON schema'da `brand_context` alani var.
- [x] Brand reliability scoring var.
- [x] Brand-aggregated panel ekrani eklendi; Products sayfasinda marka kirilimi gorunuyor.
- [x] Marka ekosistemi / seller stability gorunumu eklendi; marka bazli seller sayisi gorunuyor.
- [x] Distribution discipline operator gorunumu eklendi; marka bazli ortalama fiyat ve SKU yogunlugu gorunuyor.

### 2.5 API ve Site Settings

- [x] Oxylabs username/password panelden girilebiliyor.
- [x] Keepa API key panelden girilebiliyor.
- [x] Keepa daily token budget panelden girilebiliyor.
- [x] Groq API key panelden girilebiliyor.
- [x] OpenAI API key panelden girilebiliyor.
- [x] Bos secret alanlari mevcut degeri ezmiyor.
- [x] Settings API `PATCH /api/settings` mevcut.
- [x] `market_pulse` DB adi settings ekranindan kaldirildi; uygulama `Amozon DB` gosteriyor.
- [x] Hydration warning icin extension kaynakli `body` attribute mismatch bastirildi.

---

## 3. Taahhut / MVP Plan Karsilastirmasi

### 3.1 Milestone 1 - Scoring Cekirdegi

- [x] 5 scoring modulu.
- [x] Her modulu bagimsiz test eden test dosyalari.
- [x] Merkezi `scoring.config.ts`.
- [x] Composite scorer.
- [x] `MIXED_SIGNAL`.
- [x] `INSUFFICIENT_DATA`.
- [x] Ilk demo JSON uretimi kod seviyesinde mevcut.
- [x] Eski fixture isimleri musteri keyword'leriyle uyumsuzdu; `thermal-labels`, `dash-cam`, `webcam-lighting`, `cable-organizer`, `surge-protector` fixture'lariyla degistirildi.

### 3.2 Milestone 2 - Pipeline Entegrasyonu

- [x] Oxylabs scraper adaptoru.
- [x] Job orchestrator.
- [x] MySQL schema.
- [x] Products/category_stats/risk_scores/keepa tabloları.
- [x] Hata loglama.
- [x] Category normalization.
- [x] Confidence hesaplama.
- [x] MVP plan PDF'inde PostgreSQL yaziyor; musteri mesajinda MySQL kabul edilmis. `FINAL_TESLIM_KURULUM_KULLANIM.md` içinde MySQL/MariaDB tercihi açıklandı.

### 3.3 Milestone 3 - Final Teslim

- [x] Kod temizligi temel seviyede yapildi.
- [x] README mevcut.
- [x] SCORING_LOGIC.md mevcut.
- [x] Standalone repo yapisi mevcut: `backend/`, `admin_panel/`, `frontend/`.
- [x] Tum haklar dosyasi mevcut.
- [x] 5 keyword gercek test sonuc dosyalari repo icinde standart bir `test-results/` klasorune eklendi: `test-results/2026-05-11-5keyword-results.md`.
- [x] Eski taahhut dosyasinda "165 test / 27 dosya" yaziyor; `FINAL_TESLIM_KURULUM_KULLANIM.md` içinde güncel standalone test sonucu 31 pass / 0 fail olarak belirtildi.
- [x] Teslim dokumantasyonunda eski MarketPulse/admin path referanslari var; musteriye verilecek final dokuman sadeleştirildi.

---

## 4. Mevcut Kod Durumu Kontrolu

### 4.1 Backend

- [x] `backend/src/server.ts` HTTP API sunucusu mevcut.
- [x] `backend/src/run-job.ts` CLI runner mevcut.
- [x] `backend/src/amazon/amazon.scraper.ts` Oxylabs entegrasyonu mevcut.
- [x] `backend/src/amazon/amazon.job.ts` pipeline mevcut.
- [x] `backend/src/amazon/risk-report.service.ts` risk raporu formatlama mevcut.
- [x] `backend/src/amazon/keepa.client.ts` Keepa queue/snapshot mevcut.
- [x] `backend/src/db/seed/sql/021_amazon_scoring_schema.sql` schema mevcut.
- [x] `bun run backend:build` basarili.
- [x] `bun run backend:test` basarili: 31 pass, 0 fail.

### 4.2 Backend API

- [x] `GET /health`
- [x] `GET /api/settings`
- [x] `PATCH /api/settings`
- [x] `GET /api/keepa/usage`
- [x] `GET /api/scans`
- [x] `POST /api/scans`
- [x] `GET /api/scans/:jobId`
- [x] Teknik rapordaki eski `/admin/lead-machine/amazon/...` endpoint path'leri mevcut standalone API'de yok; güncel endpoint path'leri `FINAL_TESLIM_KURULUM_KULLANIM.md` içine işlendi.
- [x] `GET /api/risk-scores/:keyword?marketplace=com` direkt keyword bazli son risk endpoint'i eklendi.

### 4.3 Admin Panel

- [x] `admin_panel/src/app/scans/page.tsx`
- [x] `admin_panel/src/app/products/page.tsx`
- [x] `admin_panel/src/app/settings/page.tsx`
- [x] `admin_panel/src/components/admin/ScansPanel.tsx`
- [x] `admin_panel/src/components/admin/ProductsPanel.tsx`
- [x] `admin_panel/src/components/admin/SettingsPanel.tsx`
- [x] `admin_panel/src/components/admin/analytics.tsx`
- [x] `bun run admin:build` basarili.
- [x] Ana dashboard `AmozonDashboard.tsx` sade modül giriş ekranına refactor edildi; scan/product logic tekrarları kaldırıldı.
- [x] Admin smoke/unit test eklendi: `admin_panel/src/components/admin/__tests__/admin.smoke.test.tsx`.

### 4.4 Dokumantasyon

- [x] Ana README mevcut.
- [x] Backend Amazon README mevcut.
- [x] SCORING_LOGIC.md mevcut.
- [x] RIGHTS_TRANSFER.md mevcut.
- [x] Taahhut/checklist dosyalari eski path ve eski sayilar iceriyor; final teslim dokumaninda güncel değerler ayrı ve net yazıldı.
- [x] Final teslim icin tek, temiz "KURULUM + KULLANIM + TESLIM ICERIGI" dokumani eklendi: `FINAL_TESLIM_KURULUM_KULLANIM.md`.

---

## 5. Kullanıcı Mesajlarından Çıkan Ek Notlar

### 5.0 Yeni Kullanıcı Teknik Değerlendirmesi - Decision Surface

- [-] 11 Mayıs 2026 tarihli kullanıcı teknik değerlendirme notları ayrı checklist olarak işlendi: `KULLANICI_GERI_BILDIRIM_DECISION_SURFACE_CHECKLIST.md`.
- [-] Yeni yön netleşti: sistem klasik dashboard değil, hızlı `AL / TAKİP ET / UZAK DUR` kararı üreten decision surface olarak ilerlemeli.
- [-] Reasoning clarity, confidence realism, noise reduction, sade JSON ve SKU-level karar yapısı bir sonraki sprintin ana odağıdır.
- [x] Keepa Trend boş mesajı scan bazlı açıklayıcı hale getirildi; ASIN, snapshot, kuyruk, hata ve yerel limit bilgisi gösteriliyor.
- [x] `Marka tahmini` gerçek satıcıdan UI seviyesinde ayrıldı; ürün tablosunda gerçek satıcı, marka tahmini ve eksik veri ayrı rozetlerle gösteriliyor.
- [x] SKU bazlı kısa ticari reasoning backend JSON içinde üretiliyor ve Products ekranında ürün tablosuna bağlandı.
- [x] Decision-surface JSON kontratı dokümante edildi ve Products ekranında karar yüzeyi olarak gösterildi.
- [x] Scans ekranı decision surface mantığına taşındı: karar dağılımı, scan bazlı ana aksiyon, karar özeti ve veri kalitesi uyarıları gösteriliyor.
- [x] Products ekranında öncelikli karar listesi ve varsayılan aksiyon alınabilir ürün görünümü eklendi; düşük kaliteli kayıtlar "Veri eksik" görünümüne ayrıldı.

### 5.1 Bu Fazda Istenmeyenler

- [n/a] Outreach otomasyonu istenmiyor.
- [n/a] Karar verici enrichment entegrasyonu istenmiyor.
- [n/a] Agresif realtime polling istenmiyor.
- [n/a] Buyuk dashboard karmasasi istenmiyor.
- [n/a] User management MVP kapsaminda degil.
- [n/a] Otomatik cron kategori taramalari MVP kapsaminda degil.

### 5.2 Ileriki Fazlara Hazirlik

- [x] Outreach icin `outreach_priority` ve `persuasion_points` alanlari hazir.
- [x] External enrichment icin `enrichment` alani hazir.
- [x] Brand aggregation icin `brand_context` alani hazir.
- [n/a] Bu alanlar MVP'de schema hazirligi olarak tamam; derin enrichment/outreach otomasyonu ileriki faz kapsaminda.

### 5.3 Token Ekonomisi ve Cadence

- [x] Keepa token budget var.
- [x] Queue var.
- [x] Gereksiz Keepa cagrisini azaltan kosul var.
- [x] Scan scheduling/cadence politikasi dokümante edildi: `SCAN_CADENCE_POLICY.md`.
- [x] Noise reduction icin Scans paneline "Karar Stabilitesi" gorunumu eklendi.

---

## 6. Oncelikli Eksik / Risk Listesi

1. [x] Final teslim dokumani temizlenmeli: eski MarketPulse path'leri, eski test sayilari ve PostgreSQL/MySQL farki `FINAL_TESLIM_KURULUM_KULLANIM.md` içinde açıkça düzeltildi.
2. [x] 5 musteri keyword'u icin gercek sonuc arsivi olusturuldu: `test-results/2026-05-11-5keyword-results.md`.
3. [x] Eski fixture'lar musteri konusuyla uyumsuzdu; yeni 5 keyword fixture'i ile degistirildi.
4. [x] Admin panelde "Al / Takip Et / Uzak Dur" karar dili eklendi.
5. [x] Alarm/uyari sistemi eklendi.
6. [x] Products sayfasina gerçek filtreleme eklendi: ürün/ASIN, seller, fiyat bandı, review count, decision, operator aksiyon ve min composite.
7. [x] Brand-aggregated operator gorunumu Products sayfasina eklendi.
8. [x] Admin panel icin smoke test eklendi.
9. [x] API dokumani yeni endpoint path'lerine gore guncellendi.
10. [x] `GET /api/risk-scores/:keyword` muadili son risk sonucu endpoint'i eklendi.
11. [x] `AmozonDashboard.tsx`, `ScansPanel`, `ProductsPanel` arasindaki tekrarlar sadeleştirildi.
12. [x] Scan cadence / polling politikasi dokümante edildi.

---

## 7. Teslim Karari

### MVP Cekirdegi

- Durum: `[x]` Teslim edilebilir cekirdek mevcut.
- Gerekce: Scoring modulleri, confidence, normalization, Keepa, DB schema, job pipeline, JSON risk karti ve backend testleri calisiyor.

### Kullanıcıya Verilecek Paket

- Durum: `[x]` Teslime hazir.
- Gerekce: Kod calisiyor; final dokuman, eski referans temizligi ve 5 keyword sonuc arsivi tamamlandı.

### Operator Panel

- Durum: `[x]` MVP icin tamam.
- Gerekce: Panel calisiyor; scan/products/settings/keywords var. Alarm, gelismis filtre, brand view ve "al/takip et/uzak dur" karar dili eklendi.

### Sonraki En Mantikli Sprint

1. Final dokuman temizligi.
2. 5 keyword gercek test arsivi.
3. Admin panel karar dili ve filtreleri.
4. Alarm ve brand view.
5. Admin smoke test.

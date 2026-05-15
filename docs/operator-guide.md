# Amozon — Operatör Rehberi

**Son güncelleme:** 14 Mayıs 2026 (Phase 4 — V1 Stabilizasyon)

Bu rehber, Amozon panelini günlük operasyonda kullanan operatör/analist içindir. Yeni bir kategori taraması başlatmak, sonuçları yorumlamak ve tezleri izlemek için temel akışlar burada.

## Giriş

Panel adresi: `https://panel.avrasyaotomotiv.net/amozon/`

İki katmanlı kimlik doğrulama vardır:

1. **Tarayıcı popup:** nginx basic auth — `demo / demo2026`
2. **Panel login:** `admin / amozon2026` (24 saat cookie session)

## Sol Menü

| Menü | İçerik |
|---|---|
| Panel | Modüllere hızlı erişim ve durum özeti |
| **Yeni Tarama** ⭐ | **Tek-ekran scan journey** (yeni — Phase 4) |
| Anahtar Kelimeler | Keyword havuzu yönetimi |
| Araştırmalar | Geçmiş scan listesi ve detay |
| Ürünler | Scan'in ürün tablosu, lineage, karar yüzeyi |
| **Tezler** ⭐ | **AL/TAKIP_ET kararlarının izleme listesi** (yeni — Phase 4) |
| Ayarlar | API anahtarları, skorlama ağırlıkları, health card |
| Dokümantasyon | Bu rehberin in-app versiyonu |
| Yazılımcı Notu | Geliştirme notları arşivi |

## Akış 1: Yeni Kategori Taraması (Tek-Ekran Journey)

> **Eski akış 4-5 sayfaya yayılmıştı; yeni akış tek sayfada bitiyor.**

1. Sol menüden **Yeni Tarama**'ya tıkla
2. İnput'a şunlardan birini yaz:
   - **Kategori/keyword:** "cable organizer", "wireless charger"
   - **ASIN:** "B0CY3PMWJF" (10 karakter; B0 + 8 harf/rakam veya 10 rakam)
   - ASIN tespit edilince "🔎 ASIN modu" ipucu görünür: sistem ürün başlığını çekip kategori türetir
3. Marketplace seç (com, co.uk, de, fr, es, it, com.tr)
4. **Başlat** tıkla — keyword havuzda yoksa otomatik eklenir
5. Aşama bazlı ilerleme paneli açılır:
   - **Tarama** (Oxylabs): 75-200 ürün
   - **Keepa Snapshot** (15 ASIN sync, 15 background)
   - **Satıcı Doğrulama** (Oxylabs product-detail)
   - **Skorlama** (5 boyut)
   - **Reasoning** (LLM cross-dimension sentez)
   - **Lineage** (ASIN bazlı contribution analizi)
6. Tamamlanınca özet kartı:
   - **Skor** /10
   - **Karar** (GUVENLI / DIKKATLI_OL / MIXED_SIGNAL / GIRME)
   - **Karar Hazır SKU** sayısı
   - **Öncelikli SKU** sayısı (AL veya UZAK_DUR olarak işaretlenenler)
   - **Marka ve Satıcı Kapsaması** (%)
   - **Eksik veri uyarısı** varsa
7. "Sonuçları İncele" → /products sayfasında detaylı görünüm
8. AL/TAKIP_ET kararı verilirse "Tezi Aktive Et" görünür

**Tarama süresi:** 15-25 saniye (scrape + sync Keepa). Sonra `enriching` durumunda 60-90 saniye daha (seller + remaining Keepa). Operatör progress bar'da bunu canlı görür.

## Akış 2: Tarama Sonucu Yorumlama (/products)

1. Üst dropdown'dan scan seç (en yenisi default)
2. **Karar Yüzeyi** kartı:
   - Skor + karar badge
   - Operatör özet (LLM ile sentezlenmiş, max 180 char)
   - 3 üst sebep (top_reasons)
   - **Coverage Gate uyarısı** (varsa): "ÖN DEĞERLENDİRME — satıcı kapsaması düşük..."
   - **Stale Data badge** (7+ gün eski scan ise)
3. **5 boyut skoru** (kartlar):
   - Her dimension için skor, confidence, LLM cross-dimension reason
   - LOW confidence ise sarı border-left + italic
4. **Karar Yüzeyi sub-grid:** AL / TAKIP_ET / UZAK_DUR sayıları (action_distribution)
5. **Öncelikli Karar Listesi:** Karar-hazır + öncelikli sinyal tier'larında top 6 SKU
6. **Keepa Lineage paneli** (varsa):
   - Her ASIN için: 90 gün ort, 30 gün min, volatilite σ/μ, ort. teklif, teklif trendi, buy box değişim
   - Hangi sinyalin hangi dimension'a beslediği tablo
7. **İleri enrichment araçları** (default kapalı):
   - "Keepa Trend Çek" butonu (manual queue trigger)
   - "Seller Enrichment" butonu (eksik satıcılar için)
8. **Brand Breakdown** (Satıcı Kırılımı - Doğrulanmış):
   - Yalnızca gerçek seller_name olan ürünler
   - Tahmin yapılmaz

## Akış 3: Tez İzleme (/theses) — Phase 4 Yeni

> **Tez (thesis):** Bir AL/TAKIP_ET kararının arkasında yatan sinyal kümesi. Operatör tezi aktif ettiğinde sistem bunu izlemeye alır.

### Tezi Aktive Et

1. /scan'de tamamlanan bir taramada karar AL veya TAKIP_ET ise
2. Özet kartında **"Tezi Aktive Et"** butonu görünür
3. Tıklayınca:
   - O an'ki 5 boyut skoru snapshot alınır (original_scores)
   - En güçlü 2-3 sinyal `key_signals` olarak işaretlenir
   - `amazon_theses` tablosuna kayıt → status = active

### Tezleri İncele

`/theses` sayfası 4 tab:

| Tab | İçerik |
|---|---|
| **Aktif** | Hala geçerli görünen tezler |
| **Zayıfladı** | 1+ key sinyalde >2 puan sapma var |
| **Bozuldu** | 3+ sapma veya karar eşiği aşıldı |
| **Kapalı** | Operatör manuel kapatmış (arşiv) |

Her tez kartında:
- Keyword + marketplace
- Decision (AL/TAKIP_ET)
- Oluşturma tarihi
- Key signal karşılaştırması (eski skor → yeni skor + delta)
- Status badge
- Aksiyon butonları:
  - **Şimdi Değerlendir** — yeni scan tetikleyip karşılaştırır
  - **Kapat** — manuel arşiv

### Otomatik Re-Evaluation

Scheduler günde 1 kere `last_evaluated_at` 7+ gün eski aktif tezleri otomatik değerlendirir:
1. Aynı keyword + marketplace için yeni scan tetiklenir
2. Yeni 5 boyut skoru hesaplanır
3. `compareSignals(original_key_signals, current_signals)`:
   - Max delta ≤ 2 → status değişmez, `last_evaluated_at` güncellenir
   - Max delta > 2 → status = `weakened`
   - 3+ delta veya composite_score karar eşiğini geçti → status = `broken`
4. Status değişimi varsa otomatik developer note ("Tez X zayıfladı/bozuldu")

## Akış 4: Sağlık ve Güvenilirlik

### Ayarlar > Health Card

Settings sayfasında üstte canlı sağlık göstergesi:
- **API uptime** (saniye)
- **Keepa budget** (X/Y kaldı, %20 altında kırmızı banner)
- **Scheduler son çalışmaları** (keepa, seller)
- **Son 24h hata sayısı**

### Sticky Budget Banner

Keepa günlük token bütçesi %20 altına düşünce panel üstünde sticky banner:
> ⚠ Keepa günlük kotası azalıyor (X/Y kaldı). Ayarlar > API Kodları'ndan limit artırılabilir.

### Otomatik Retry

Failed scan'lerin geçici hata aldığı (5xx, 429, timeout) tespit edilirse, 1 saatte bir scheduler max 2 retry başlatır. Operatör müdahalesine gerek yok.

### Günlük Özet

Her gece scheduler bir developer note ekler:
- "Son 24 saat: X tarama, Y hata."
- "Z Keepa snapshot işlendi."
- "W LLM enrichment kaydı bulundu."

Yazılımcı Notu sekmesinden görüntülenebilir.

## Akış 5: Anahtar Kelime Yönetimi

> Yeni Tarama sayfasındaki `auto_add` özelliği keyword'leri otomatik ekler. Manuel havuz yönetimi için:

1. **Anahtar Kelimeler** sayfası
2. Yeni keyword ekle: kelime + marketplace
3. AI varyasyon paneli: ana keyword'den 5-10 varyasyon üretir
4. Tarama geçmişinde olmayan keyword'ler de buradan listelenir

## Karar Yorumlama Kılavuzu

### Coverage Gate Tetiklenmiş Tarama

UI'da "ÖN DEĞERLENDİRME" banner görüyorsanız:
- **Anlamı:** Hem satıcı hem Keepa coverage %30 altında
- **Sistem davranışı:** AL/UZAK_DUR yerine TAKIP_ET'e indirgendi
- **Operatör eylem:** İleri enrichment araçları'ndan manuel Keepa veya Seller fetch et, sonra yeniden değerlendir

### "Veri Bayat" Badge

- **Anlamı:** Scan 7+ gün önce yapılmış
- **Eylem:** Aynı keyword için yeni tarama başlat

### Düşük Confidence Dimension

- **Anlamı:** O boyut için yeterli/güvenilir veri yok (sarı border-left)
- **Eylem:** Sebep "tahmini" / "sınırlı veri ile" gibi ifadelerle reason'da belirtilir; karar verirken düşük ağırlık ver

### SKU Tier'ları

| Tier | Anlamı | Operatör eylem |
|---|---|---|
| **DECISION_READY** | Tüm sinyaller var (fiyat + yorum + seller) | Karar verilebilir |
| **PRIORITY_SIGNAL** | 1-2 önemli sinyal var, biri eksik | Eksik sinyali manuel doldur |
| **PENDING_ENRICHMENT** | Çoğu sinyal eksik | Operatör listesinde gösterilmez (gizlenmiş) |

## Sorun Giderme

| Belirti | Olası neden | Çözüm |
|---|---|---|
| Scan FAILED — "Unable to connect" | VPS network kesintisi veya Oxylabs erişim sorunu | Scheduler 1 saat içinde retry'lar; veya manuel "Yeniden Dene" |
| Keepa coverage %0 | Token bütçesi tükenmiş | Settings > Keepa Yerel Günlük Limit artır + yeni tarama |
| Operatör listesi boş | Tüm SKU'lar PENDING_ENRICHMENT | İleri Araçlar > Seller Enrichment çalıştır |
| LLM reasoning template hissi | LLM JSON parse başarısız (fallback aktif) | PM2 log'da `[llm] parseInsights returned null` ara |
| Tez "Şimdi Değerlendir" boş döner | Aynı keyword için yeni done scan yok | Manuel scan başlat, sonra evaluate |

## Hızlı Başvuru — Sık Kullanılan Endpoint'ler

API client kullanan integrasyonlar için (`Authorization: Bearer <secret>`):

- `POST /api/scans` — yeni scan başlat
- `GET /api/scans/:jobId/progress` — canlı ilerleme
- `GET /api/scans/:jobId` — scan detayı
- `GET /api/scans/:jobId/keepa-detail` — ASIN lineage
- `POST /api/scans/:jobId/thesis` — tez aktive et
- `GET /api/theses?status=active` — aktif tezler
- `POST /api/theses/:id/evaluate` — manuel re-eval
- `GET /api/health` — sağlık göstergesi

Tam API referansı: `docs/api-reference.md`

# Amozon Final Teslim, Kurulum ve Kullanım Dokümanı

**Proje:** Amozon Amazon Scraping ve Ticari Risk Scoring Motoru  
**Teslim tarihi:** 11 Mayıs 2026  
**Runtime:** Bun + TypeScript  
**Veritabanı:** MySQL/MariaDB  
**Panel:** Next.js Admin Panel

---

## 1. Teslim Kapsamı

Bu repo Amazon keyword araştırmalarını canlı scraping ile çalıştıran, ürünleri veritabanına kaydeden ve kategori bazlı ticari risk skoru üreten standalone pakettir.

Teslim edilen ana parçalar:

- `backend/`: Amazon scraping, job pipeline, scoring engine, MySQL şema ve API server.
- `admin_panel/`: Operasyon paneli; dashboard, keyword yönetimi, scan başlatma, ürün/pazar analizi ve settings ekranları.
- `frontend/`: İleride public/kullanıcı arayüzü için ayrılmış boş alan.
- `README.md`: Geliştirici kurulum notları.
- `RIGHTS_TRANSFER.md`: Hak devri notu.
- `MUSTERI_TAAHHUT_MVP_DURUM_CHECKLIST.md`: Kullanıcı istekleri, taahhütler ve güncel durum checklist'i.
- `backend/src/amazon/SCORING_LOGIC.md`: Skor mantığı ve eşik dokümantasyonu.
- `SCAN_CADENCE_POLICY.md`: Scan ritmi, polling ve token ekonomisi politikası.

Bu paket MarketPulse içinden ayrılmıştır; teslim edilecek çalışma sınırı artık `amozon/` repo köküdür. Eski tekliflerde geçen MarketPulse path'leri referans niteliğindedir, güncel teslim path'i bu repodur.

---

## 2. Teknik Notlar

Teklif PDF'lerinde PostgreSQL ifadesi geçmektedir. Kullanıcı mesajlarında MySQL/MariaDB ilk MVP için kabul edildiği için bu standalone teslim MySQL/MariaDB üzerine kurulmuştur.

Güncel test durumu:

- Backend test komutu: `bun run backend:test`
- Güncel sonuç: `31 pass, 0 fail`
- Test kapsamı: scoring modülleri, confidence, signal validator, Keepa client, composite scorer ve job e2e mock akışı.

Eski taahhüt dokümanlarında geçen `165 test / 27 dosya` ifadesi MarketPulse tarafındaki daha geniş bağlamdan kalmıştır. Bu standalone Amozon reposunun güncel doğrulanmış test sonucu yukarıdaki gibidir.

---

## 3. Kurulum

Repo kökünde:

```bash
bun run install:all
```

Backend env dosyası:

```txt
backend/.env
```

Minimum gerekli değişkenler:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=app
DB_PASSWORD=app
DB_NAME=amozon_db

OXYLABS_USERNAME=
OXYLABS_PASSWORD=

KEEPA_API_KEY=
KEEPA_DAILY_TOKEN_BUDGET=300

GROQ_API_KEY=
OPENAI_API_KEY=
```

Admin env dosyası:

```txt
admin_panel/.env.local
```

Beklenen değer:

```env
BACKEND_API_URL=http://localhost:8186
```

---

## 4. Veritabanı Şeması

Şema uygulama:

```bash
bun run db:schema
```

Bu komut aşağıdaki ana tabloları oluşturur veya günceller:

- `amazon_scan_jobs`
- `amazon_products`
- `amazon_category_stats`
- `amazon_risk_scores`
- `amazon_keepa_snapshots`
- `amazon_job_error_logs`
- `amazon_keepa_daily_budget`
- `amazon_keepa_queue`
- `amazon_keywords`

Varsayılan keyword seed listesi:

- `thermal labels`
- `cable organizer`
- `surge protector`
- `dash cam`
- `webcam lighting`

---

## 5. Çalıştırma

Backend API:

```bash
bun run backend:dev
```

Varsayılan backend adresi:

```txt
http://localhost:8186
```

Admin panel:

```bash
bun run admin:dev
```

Varsayılan admin adresi:

```txt
http://localhost:3096
```

Build:

```bash
bun run build
```

Test:

```bash
bun run backend:test
```

---

## 6. Admin Panel Kullanımı

### Dashboard

Genel operasyon görünümü ve son scan/risk özetleri için kullanılır.

### Keywords

Scan yapılacak keyword havuzu burada yönetilir.

Yapılabilen işlemler:

- Keyword ekleme
- Keyword düzenleme
- Keyword silme
- Keyword arama
- Sayfalı listeleme

Binlerce keyword senaryosu için backend `q`, `limit`, `offset` parametreleriyle sayfalı arama döndürür.

### Scans

Kayıtlı keywordlerden biri seçilerek canlı Amazon scan başlatılır.

Akış:

1. Keyword ara.
2. Dropdown'dan keyword seç.
3. Marketplace seç.
4. `Başlat` butonuyla scan oluştur.
5. Job durumunu tabloda takip et.

Yeni scan başlatmak için keyword'ün `amazon_keywords` tablosunda kayıtlı olması gerekir.

### Products

Tamamlanmış scan sonuçları dropdown ile seçilir.

Gösterilenler:

- Seçili scan özeti
- 5 boyutlu risk radar grafiği
- Fiyat histogramı
- Rating dağılımı
- Fiyat özeti
- Satıcı kırılımı
- Ürün tablosu

### Settings

API kodları ve kullanım durumları burada yönetilir.

Panelden girilebilen değerler:

- Oxylabs username/password
- Keepa API key
- Keepa günlük token bütçesi
- Groq API key
- OpenAI API key

Boş bırakılan secret alanları mevcut `.env` değerini ezmez.

---

## 7. Backend API Özeti

Health:

```txt
GET /health
```

Settings:

```txt
GET /api/settings
PATCH /api/settings
```

Keywords:

```txt
GET /api/keywords?q=<arama>&limit=50&offset=0
POST /api/keywords
PATCH /api/keywords/:keywordId
DELETE /api/keywords/:keywordId
```

Scans:

```txt
GET /api/scans
POST /api/scans
GET /api/scans/:jobId
GET /api/scans/:jobId/decision-json
```

Risk scores:

```txt
GET /api/risk-scores/:keyword?marketplace=com
```

Keepa:

```txt
GET /api/keepa/usage
```

Not: Eski teknik raporda geçen `/admin/lead-machine/amazon/...` endpoint path'leri MarketPulse içindeki eski modül yapısına aitti. Standalone Amozon tesliminde güncel API path'leri yukarıdaki gibidir.

---

## 8. Scoring Çıktısı

Her tamamlanan job için `amazon_risk_scores` tablosuna risk raporu yazılır.

Ana karar alanları:

- `category_risk_score`
- `sku_chaos_score`
- `price_war_score`
- `brand_reliability_score`
- `operational_risk_score`
- `composite_score`
- `decision`
- `summary`
- `data_points`
- `outreach_priority`
- `persuasion_points`
- `brand_name`
- `enrichment`

Karar değerleri:

- `GUVENLI`
- `DIKKATLI_OL`
- `GIRME`
- `MIXED_SIGNAL`
- `INSUFFICIENT_DATA`

Confidence değerleri:

- `HIGH`
- `MEDIUM`
- `LOW`
- `INSUFFICIENT_DATA`

---

## 9. MVP Kapsam Dışı

Kullanıcı mesajlarına göre aşağıdaki işler ilk MVP dışında tutulmuştur:

- Outreach otomasyonu
- Karar verici enrichment entegrasyonu
- Kullanıcı yönetimi
- Otomatik cron kategori taramaları
- Agresif realtime polling
- Büyük dashboard karmaşıklığı

Bu alanlar ileriki faz için schema ve JSON tasarımında genişletilebilir bırakılmıştır.

---

## 10. Bilinen Sonraki İyileştirmeler

Teslim edilebilir çekirdek hazırdır. Sonraki sprint için önerilen işler:

- 5 kullanıcı keyword'ü için gerçek test sonuç arşivi üretmek.
- Eski fixture dosyalarını kullanıcı keyword'leriyle değiştirmek.
- Admin panelde `Al / Takip Et / Uzak Dur` karar dilini eklemek.
- Alarm/uyarı sistemi eklemek.
- Products sayfasına gelişmiş ürün filtreleri eklemek.
- Brand-aggregated operatör görünümü eklemek.
- Admin panel smoke testleri eklemek.
- Son risk sonucu endpoint'i mevcuttur: `GET /api/risk-scores/:keyword?marketplace=com`.
- Scan cadence politikası dokümante edildi: `SCAN_CADENCE_POLICY.md`.

---

## 11. Hak Devri

Kaynak kod, konfigürasyon, SQL şeması, testler ve dokümantasyon üzerinde kullanım, değiştirme, çoğaltma ve başka sistemlere entegre etme hakları alıcıya devredilmek üzere paketlenmiştir.

Detay notu:

```txt
RIGHTS_TRANSFER.md
```

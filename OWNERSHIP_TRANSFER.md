# Amozon — Ownership Transfer Paketi

V1 – Bedrock teknik kabul: 2026-05-21. Bu doküman sistemin yeni sahibe devri için gereken her şeyi içerir.

---

## 1. Repository Transferi

GitHub repo: `Orhanguezel/amozon` (branch: `main`).

Devir seçenekleri (repo sahibi tarafından yapılır — hesap seviyesi işlem):
- **Tam sahiplik transferi:** GitHub → repo → Settings → "Transfer ownership" → alıcı kullanıcı/organizasyon adı.
- **veya Admin daveti:** Settings → Collaborators → alıcıyı `Admin` rolüyle ekle.

> Not: Repo transferi GitHub hesabı üzerinden yapılır; kod tarafında ek işlem yoktur. Transfer sonrası `main` branch doğrudan güncel ve deploy edilebilir durumdadır.

---

## 2. Veritabanı Dump / Export

VPS'te hazırlandı (`/var/www/amozon/transfer/`):

| Dosya | İçerik |
|-------|--------|
| `amazon_scoring_YYYYMMDD.sql.gz` | Tam dump (şema + veri, ~185MB gzip) |
| `amazon_scoring_schema_YYYYMMDD.sql` | Sadece şema (referans, ~14KB) |

Geri yükleme:
```bash
gunzip -c amazon_scoring_YYYYMMDD.sql.gz | mysql -u root amazon_scoring
```

**11 tablo:** amazon_category_stats, amazon_developer_notes, amazon_job_error_logs, amazon_keepa_daily_budget, amazon_keepa_queue, amazon_keepa_snapshots, amazon_keywords, amazon_products, amazon_risk_scores, amazon_scan_jobs, amazon_theses.

Şema dosyaları repoda da mevcut: `backend/src/db/seed/sql/` (sıralı `0XX_*.sql`). Sıfırdan kurulumda bu seed dosyaları yeterlidir.

---

## 3. .env / Config Yapısı

| Dosya | Amaç |
|-------|------|
| `backend/.env.example` | Backend tüm env değişkenleri (güncel, açıklamalı) |
| `admin_panel/.env.example` | Admin panel env değişkenleri |

Kurulumda `.env.example` → `.env` (backend) ve `.env.local` (admin_panel) olarak kopyalanır, değerler doldurulur.

**Kritik dış servis hesapları (alıcının kendi hesabında olmalı):**
- **Oxylabs Web Scraper API** — Amazon search + product verisi (abonelik gerekli)
- **Keepa API** — fiyat geçmişi
- **Groq veya OpenAI** — LLM reasoning

`API_SECRET` üç yerde aynı olmalı: `backend/.env`, `admin_panel/.env.local` (`BACKEND_API_SECRET` + `NEXT_PUBLIC_API_SECRET`).

---

## 4. Deployment / Kurulum Adımları

**Stack:** Backend Bun + TypeScript (Fastify-tarzı HTTP), Admin Panel Next.js 16, MySQL, PM2.

```bash
# 1. Bağımlılıklar
bun run install:all          # backend + admin_panel

# 2. Env dosyaları
cp backend/.env.example backend/.env
cp admin_panel/.env.example admin_panel/.env.local
#   → değerleri doldur (DB, Oxylabs, Keepa, LLM, API_SECRET)

# 3. Veritabanı (sıfırdan)
mysql -u root -e "CREATE DATABASE amazon_scoring;"
#   şema: backend/src/db/seed/sql/ altındaki 0XX_*.sql dosyalarını sırayla uygula
#   veya hazır dump'ı geri yükle (bkz. bölüm 2)

# 4. Build
bun run build                # backend (tsc) + admin (next build)

# 5. Çalıştırma (PM2)
pm2 start "bun run start" --name amozon-api    --cwd backend
pm2 start "bun run start" --name amozon-panel  --cwd admin_panel
pm2 save
```

**Portlar:** Backend `8186`, Admin Panel `3196` (Next basePath `/amozon`).
**Nginx:** `/amozon` → panel (3196), panel kendi API route'ları üzerinden backend'e proxy yapar. Statik varlıklar `/amozon/_next/static/` auth'suz cache'lenir.

Detaylı mimari: `docs/architecture.md` · API referansı: `docs/api-reference.md` · Operatör rehberi: `docs/operator-guide.md`.

---

## 5. Cron & Background Job Listesi

Tüm zamanlanmış işler `backend/src/scheduler.ts` içinde, backend süreciyle birlikte çalışır (ayrı OS cron'u gerekmez):

| İş | Aralık | Görev |
|----|--------|-------|
| Keepa queue processor | 30 dakika | Bekleyen ASIN'ler için Keepa snapshot çeker (bütçe sınırlı) |
| Seller enrichment | 2 saat | Düşük seller coverage'lı job'ları parça parça hedefe çeker (OH.1) |
| Daily summary | 1 saat (günde 1 kez yazar) | Günlük operasyon özeti developer note üretir |
| Auto-retry | 1 saat | Geçici hata almış (5xx/timeout) scan'leri yeniden dener (max 2) |
| Thesis re-evaluation | 24 saat | `THESIS_STALE_DAYS`+ gün eski aktif tezleri yeniden değerlendirir |

Konfigürasyon: ilgili aralıklar ve eşikler `backend/.env` (bkz. `.env.example`) üzerinden ayarlanabilir.

---

## 6. Devir Kontrol Listesi

- [ ] Repository sahipliği/admin daveti alıcıya verildi
- [ ] DB dump (`amazon_scoring_*.sql.gz`) alıcıya teslim edildi
- [ ] `.env.example` dosyaları gözden geçirildi; alıcı kendi servis anahtarlarını oluşturacak
- [ ] Deployment adımları alıcıyla doğrulandı
- [ ] Oxylabs / Keepa / LLM abonelikleri alıcı hesabına taşındı
- [ ] VPS erişimi (gerekirse) veya yeni sunucu kurulumu planlandı

---

## V1.5 Backlog (Devir Sonrası)

Kabul kapsamı dışında, ayrıca ele alınacak:
- Strict ASIN mode (fallback'siz)
- Optional no-fallback sniper flow
- Fast-fail optimization
- Seller depth / batching iyileştirmesi

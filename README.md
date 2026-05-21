# Amozon — Amazon Commercial Radar

Amazon pazarlarında kategori bazlı **explainable decision engine**. Operatör keyword (veya ASIN) girer; sistem 5 boyutta risk skoru + LLM cross-dimension reasoning + tez izleme katmanıyla "AL / TAKIP_ET / UZAK_DUR" kararı üretir.

## Klasörler

- `backend/`: Oxylabs/Keepa/LLM kullanan Amazon scraping ve scoring motoru (Bun + TypeScript)
- `admin_panel/`: Operatör paneli — Single Journey, Tezler, Karar Yüzeyi, Lineage (Next.js 16)
- `frontend/`: İleride public/kullanıcı arayüzü için ayrılmış alan

## Faz Özeti

| Faz | İçerik | Durum |
|-----|--------|-------|
| Milestone 1 | 5 boyut scorer + scan job + admin panel iskelet | ✅ |
| Phase 2 | IQR outlier · Brand field · Decision tiers · SKU narrative · Keepa time-series | ✅ |
| Phase 3 | Intelligence Layer — Keepa pre-score sync · Cross-dim LLM reasoning · Brand verification · Lineage | ✅ |
| Phase 4 | V1 Stabilizasyon — Single Journey · Confidence Honesty · Thesis Memory · Auto-Enrichment · Reliability | ✅ |
| Phase 4.5–4.7 | Operator Clarity & Operational Hardening — risk badge'leri, cache reuse, kota görünürlüğü | ✅ |
| Phase 5 (planlı) | Threat Intelligence — seller coverage hedef, segmentation, BuyBox dominance | — |

## Öne Çıkan Özellikler

- **Single Journey** (`/scan`): keyword/ASIN yaz → tek ekranda 6 aşama progress → özet
- **Confidence Honesty**: düşük/eksik veride "tahmini" dili + coverage gate ile karar indirgeme
- **Thesis Memory** (`/theses`): AL kararları "tez" olarak izlenir; sinyaller bozulunca uyarı
- **Operator Clarity**: öncelik görünümü, risk badge'leri, coverage breakdown
- **Operational Hardening**: scan cache reuse, Keepa/Oxylabs kota görünürlüğü, `/api/health`

## Kurulum

```bash
bun run install:all                          # backend + admin_panel

cp backend/.env.example backend/.env          # değerleri doldur
cp admin_panel/.env.example admin_panel/.env.local

bun run build                                 # backend (tsc) + admin (next build)
```

Veritabanı şeması: `backend/src/db/seed/sql/` altındaki sıralı `0XX_*.sql` dosyaları.
Tüm env değişkenleri ve açıklamaları: `backend/.env.example` ve `admin_panel/.env.example`.

## Çalıştırma

```bash
bun run backend:dev      # backend (varsayılan port 8186)
bun run admin:dev        # admin panel
```

Önce backend, sonra admin paneli başlatın. Panel, kendi Next API route'ları üzerinden backend'e proxy yapar.

## Test

```bash
cd backend && bun test               # backend birim/entegrasyon testleri
cd admin_panel && bun test           # panel smoke testleri
```

## Deploy & Devir

Kurulum, deployment adımları, cron/background job listesi ve sahiplik devri:
**[OWNERSHIP_TRANSFER.md](./OWNERSHIP_TRANSFER.md)**

## Notlar

- DB değişikliği yaparken **ALTER kullanmayın** — `backend/src/db/seed/sql/0XX_*.sql` dosyasını güncelleyip şemayı yeniden uygulayın.
- Dış servis abonelikleri (Oxylabs, Keepa, Groq/OpenAI) sistem sahibinin kendi hesabında olmalıdır.

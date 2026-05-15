# Amozon — Amazon Commercial Radar

Amazon pazarlarında kategori bazlı **explainable decision engine**. Operatör keyword girer; sistem 5 boyutta risk skoru + LLM cross-dimension reasoning + tez izleme katmanıyla "AL / TAKIP_ET / UZAK_DUR" kararı üretir.

**Canlı panel:** https://panel.avrasyaotomotiv.net/amozon/

## Klasörler

- `backend/`: Oxylabs/Keepa/LLM kullanan Amazon scraping ve scoring motoru (Bun + TypeScript)
- `admin_panel/`: Operatör paneli — Single Journey, Tezler, Karar Yüzeyi, Lineage (Next.js 16)
- `frontend/`: İleride public/kullanıcı arayüzü için ayrılmış alan
- `docs/`: Referans dokümanlar
  - [architecture.md](./docs/architecture.md) — sistem mimarisi
  - [operator-guide.md](./docs/operator-guide.md) — operatör rehberi
  - [api-reference.md](./docs/api-reference.md) — backend endpoint referansı
  - [sku-signal-model.md](./docs/sku-signal-model.md) — SKU bazlı sinyal modeli (Milestone 1)
  - [basvuru-paketi.md](./docs/basvuru-paketi.md) — proje teslim paketi
  - `archive/` — geçmiş faz ceklist'leri

## Aktif Çalışma

- **[YARINKI_ISLER_PHASE4.md](./YARINKI_ISLER_PHASE4.md)** — Phase 4 V1 Stabilizasyon iş listesi
- **müsterimesajlari.md** — Kullanıcı iletişim geçmişi

## Faz Özeti

| Faz | İçerik | Durum |
|---|---|---|
| Milestone 1 | 5 boyut scorer + scan job + admin panel iskelet | ✅ |
| Phase 2 | IQR outlier · Brand field · Decision tiers · SKU narrative · Seller speedup · Keepa time-series | ✅ |
| Phase 3 | Intelligence Layer — Keepa pre-score sync · Cross-dim LLM reasoning · Brand verification · Keepa lineage · Inline scan | ✅ |
| **Phase 4** | **V1 Stabilizasyon — Single Journey · Confidence Honesty · Thesis Memory · Auto-Enrichment · Reliability** | ✅ Local + deploy tamamlandı |
| Phase 5 (planlı) | Threat Intelligence — Seller coverage hedef, segmentation, BuyBox dominance, stratejik reasoning | — |

## Phase 4 Yeni Özellikler

- **Single Journey** (`/scan`): keyword yaz → tek ekranda 6 aşama progress bar → özet
- **Confidence Honesty**: LLM "tahmini/sınırlı veri" ifadelerini zorunlu kılar; coverage gate AL/UZAK_DUR'u TAKIP_ET'e indirir
- **Thesis Memory** (`/theses`): AL kararları "tez" olarak izlenir; sinyaller bozulunca "zayıfladı/bozuldu" uyarısı
- **Auto Enrichment**: Scan "done" denildiğinde tüm seller/Keepa hazır (Promise.all + `enriching` ara status)
- **Reliability**: `/api/health` endpoint, budget banner, otomatik retry, günlük özet

## Kurulum

```bash
bun run install:all
```

Backend env dosyası:

```txt
backend/.env
```

Gerekli ana değerler:

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
```

## Backend

Şema uygulama:

```bash
bun run db:schema
```

Canlı Amazon scan:

```bash
bun run scan -- --keyword "thermal labels" --marketplace com
```

Backend server:

```bash
bun run backend:dev
```

Backend test/build:

```bash
bun run backend:test
bun run backend:build
```

`backend/` klasörü içindeysen:

```bash
bun run dev
```

## Admin Panel

```bash
bun run admin:dev
```

Varsayılan adres:

```txt
http://localhost:3096
```

Panel `admin_panel/.env.local` içindeki `AMOZON_ROOT=../backend` ayarıyla backend `.env` dosyasını ve backend runner'ını kullanır.
Panel `BACKEND_API_URL=http://localhost:8186` üzerinden backend API'ye bağlanır. Önce backend'i, sonra admin paneli çalıştırın.

## Test

```bash
cd backend && bun test          # 83 backend test (Phase 4 sonrası)
cd admin_panel && bun run typecheck
```

## Deploy

VPS: `vps-paspas` SSH alias (178.210.161.181:22667)

```bash
# Backend
cd backend && bun run build
rsync -az --delete dist/ vps-paspas:/var/www/amozon/backend/dist/

# Panel (basePath ile build zorunlu)
cd admin_panel
NEXT_PUBLIC_BASE_PATH=/amozon NEXT_PUBLIC_API_SECRET=$BACKEND_API_SECRET bun run build
rsync -az --delete .next/ vps-paspas:/var/www/amozon/admin_panel/.next/

# Restart
ssh vps-paspas 'pm2 restart amozon-api amozon-panel --update-env'
```

## Notlar

- Komut satırındaki `<...>` ifadelerini aynen yazmayın; gerçek değer verin.
- DB değişikliği yaparken **ALTER kullanmayın** — `backend/src/db/seed/sql/0XX_*.sql` dosyasını güncelleyip seed'i tetikleyin (CLAUDE.md kuralı).
- Detaylı operatör akışı: [docs/operator-guide.md](./docs/operator-guide.md)
- Sistem mimarisi: [docs/architecture.md](./docs/architecture.md)
- API referansı: [docs/api-reference.md](./docs/api-reference.md)

```bash
bun run scan -- --job-id 024fdf57-53ac-4d4d-be0f-cc77d24830a3
```

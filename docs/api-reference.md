# Amozon — Backend API Referansı

**Base URL:** `http://localhost:8186` (lokal) · `https://panel.avrasyaotomotiv.net/amozon/api/*` (prod)
**Auth:** `Authorization: Bearer $BACKEND_API_SECRET`
**Son güncelleme:** 14 Mayıs 2026 (Phase 4)

## Genel

Tüm endpoint'ler JSON döner. Hata durumlarında:

```json
{ "error": "error_code" }
```

HTTP kodlar: 200 ok, 201 created, 400 invalid input, 401 unauthorized, 404 not found, 500 server error.

---

## Scan Endpoint'leri

### `POST /api/scans`

Yeni scan başlatır. **Keyword veya ASIN** ile başlatılabilir.

**Body (keyword modu):**
```json
{
  "keyword": "cable organizer",
  "marketplace": "com",
  "auto_add": true
}
```

`auto_add: true` — keyword havuzda yoksa otomatik ekler.

**Body (ASIN modu — Phase 4 yeni):**
```json
{
  "asin": "B0CY3PMWJF",
  "marketplace": "com"
}
```

ASIN modunda sistem önce Oxylabs'tan ürün başlığını çeker, başlıktan 3-4 kelimelik keyword türetir, sonra normal kategori taraması yapar. Yanıtta `seed_asin` ve `seed_asin_title` döner.

**Response 200 (keyword):**
```json
{ "jobId": "uuid", "keyword": "cable organizer", "seed_asin": null }
```

**Response 200 (ASIN):**
```json
{
  "jobId": "uuid",
  "keyword": "2.5K Dash Cam WiFi",
  "seed_asin": "B0CY3PMWJF",
  "seed_asin_title": "iZEEKER 2.5K Dash Cam WiFi Dash Camera..."
}
```

**Error 400:** `keyword_or_asin_required`, `keyword_not_allowed`, `invalid_asin_format`, `asin_resolve_failed`

**ASIN format:** `B0` + 8 büyük harf/rakam, veya 10 rakam (kitap ISBN).

---

### `GET /api/scans`

Tüm scan'leri listeler (en yeni ilk).

**Response:**
```json
{
  "scans": [
    {
      "id": "uuid",
      "keyword": "cable organizer",
      "marketplace": "com",
      "status": "done",
      "data_points": 200,
      "composite_score": "3.2",
      "decision": "DIKKATLI_OL",
      "created_at": "2026-05-14T10:00:00Z",
      "finished_at": "2026-05-14T10:00:25Z",
      "decision_surface": { ... },
      "data_quality": { ... }
    }
  ]
}
```

---

### `GET /api/scans/:jobId`

Scan detayı + ürün listesi.

**Response:** scan, risk, products

---

### `GET /api/scans/:jobId/progress` ⭐ Phase 4

Tek-ekran journey için canlı ilerleme.

**Response:**
```json
{
  "job_id": "uuid",
  "keyword": "cable organizer",
  "marketplace": "com",
  "status": "running" | "enriching" | "done" | "failed",
  "stages": {
    "scrape":    { "status": "done", "progress": 100, "detail": "75 ürün tarandı" },
    "keepa":     { "status": "running", "progress": 60, "detail": "9/15 ASIN snapshot alındı" },
    "seller":    { "status": "pending", "progress": 25, "detail": "5/20 ürün satıcı verisi" },
    "scoring":   { "status": "done", "progress": 100, "detail": "5 boyut skoru hesaplandı" },
    "reasoning": { "status": "done", "progress": 100, "detail": "LLM cross-dimension sentezi tamam" },
    "lineage":   { "status": "done", "progress": 100, "detail": "12 ASIN için contribution çıkartıldı" }
  },
  "summary": {
    "data_points": 75,
    "decision_ready_count": 12,
    "priority_count": 8,
    "missing_data_note": "Satıcı kapsaması düşük",
    "composite_score": 3.1,
    "decision": "DIKKATLI_OL",
    "brand_coverage": 0.27,
    "seller_coverage": 0.27,
    "scan_age_days": 0,
    "stale_data": false
  } | null
}
```

`summary` yalnızca status=done veya enriching olduğunda dolar.

---

### `POST /api/scans/:jobId/retry`

Failed/insufficient scan'i yeniden dener.

**Response:** `{ jobId, keyword, marketplace }`

---

### `POST /api/scans/:jobId/keepa`

Manuel Keepa fetch tetikler (sıfır coverage scan'leri zenginleştirmek için).

**Response:** `{ ok: true, queued: 20, processed: 20, skippedByBudget: 0 }`

---

### `GET /api/scans/:jobId/keepa/status`

Bir scan için Keepa kapsama özeti.

**Response:**
```json
{
  "configured": true,
  "scan_status": "done",
  "asin_count": 75,
  "snapshot_asin_count": 30,
  "coverage": 0.4,
  "queue": { "pending": 0, "done": 30, "failed": 0 },
  "local_budget": { "remaining": 419, "tokens_used": 181, "token_budget": 600 }
}
```

---

### `GET /api/scans/:jobId/keepa-detail` ⭐ Phase 3

ASIN bazlı Keepa lineage + scoring contribution analizi.

**Response:**
```json
{
  "job_id": "uuid",
  "marketplace": "com",
  "snapshots": [
    {
      "asin": "B0XYZ...",
      "title": "Product title...",
      "product_price": 12.99,
      "price_30d_min": 11.50,
      "price_90d_avg": 13.20,
      "price_volatility": 0.131,
      "offer_count_avg": 6.1,
      "offer_count_trend": "down",
      "buy_box_change_count": 2,
      "seller_count_trend": null,
      "fetched_at": "2026-05-14T...",
      "contributions": [
        {
          "signal": "price_volatility",
          "label": "Fiyat volatilitesi",
          "value": "σ/μ=0.131",
          "dimensions": ["price_war_risk"],
          "description": "Zaman serisi standart sapma / ortalama oranı..."
        }
      ]
    }
  ]
}
```

---

### `POST /api/scans/:jobId/seller-enrichment`

Manuel seller enrichment tetikler.

**Body:** `{ "limit": 20 }`

---

### `GET /api/scans/:jobId/skus` · `/decision` · `/decision-json`

Sadece SKU kararlarını veya karar kontratını döndürür (entegrasyon için sade JSON).

---

## Thesis Endpoint'leri ⭐ Phase 4 TM

### `POST /api/scans/:jobId/thesis`

Bir scan'in kararını "tez" olarak aktive eder.

**Body:**
```json
{ "operator_notes": "Premium segmente girilebilir" }
```

**Response:** Tam tez objesi (id, original_scores, key_signals, status=active...)

**Error:** Karar UZAK_DUR ise `THESIS_REQUIRES_AL_OR_TAKIP_ET`

---

### `GET /api/theses?status=active|weakened|broken|closed&limit=50&offset=0`

Tezleri listeler. Status filtrelemesi opsiyonel.

**Response:**
```json
{
  "theses": [
    {
      "id": "uuid",
      "job_id": "uuid",
      "keyword": "cable organizer",
      "marketplace": "com",
      "decision": "AL",
      "original_scores": { ... },
      "key_signals": [
        { "key": "brand_reliability", "label": "Marka Güveni", "score": 8.2, "confidence": "HIGH", "reason": "..." }
      ],
      "original_composite_score": 3.1,
      "current_composite_score": 4.5,
      "status": "weakened",
      "weakness_note": "En büyük sinyal sapması 2.4 puan.",
      "operator_notes": "Premium segmente girilebilir",
      "created_at": "...",
      "last_evaluated_at": "...",
      "closed_at": null
    }
  ]
}
```

---

### `POST /api/theses/:id/evaluate`

Tezi manuel olarak yeniden değerlendirir. Aynı keyword + marketplace için yeni scan'in sinyallerini orjinalle karşılaştırır.

**Response:** Güncellenmiş tez (status değişebilir)

---

### `POST /api/theses/:id/close`

Operatör tezi kapatır (arşivler).

**Response:** `{ status: "closed", closed_at: "..." }`

---

## Sistem Sağlığı

### `GET /api/health` ⭐ Phase 4

Operasyon sağlığı.

**Response:**
```json
{
  "status": "ok",
  "uptime_seconds": 14400,
  "keepa": {
    "budget_remaining": 419,
    "budget_total": 600,
    "queue_pending": 0
  },
  "scheduler": {
    "last_keepa_run": "2026-05-14T19:11:38.000Z",
    "last_seller_run": "2026-05-14T18:00:00.000Z"
  },
  "errors_last_24h": 0
}
```

---

## Keyword Yönetimi

### `GET /api/keywords?q=foo&marketplace=com`
### `POST /api/keywords` — `{ keyword, marketplace }`
### `PATCH /api/keywords/:id` — `{ keyword?, marketplace? }`
### `DELETE /api/keywords/:id`
### `POST /api/keywords/variations` — `{ base, count }` (AI varyasyon)

---

## Settings & Ayarlar

### `GET /api/settings`

Backend env durumunu döner (Oxylabs/Keepa/Groq/OpenAI konfigüre mi).

### `PATCH /api/settings`

Body'de gönderilen `.env` anahtarları runtime'da güncellenir.

**Body örneği:**
```json
{
  "KEEPA_DAILY_TOKEN_BUDGET": "1000",
  "SCORING_WEIGHT_CATEGORY_RISK": "0.18"
}
```

### `GET /api/keepa/usage`

Canlı Keepa token durumu + yerel günlük kullanım + queue özeti.

---

## Developer Notes (Yazılımcı Notu)

### `GET /api/developer-notes?status=open|resolved&limit=20`
### `POST /api/developer-notes` — `{ subject, body, priority?, page_path? }`
### `PATCH /api/developer-notes/:id` — `{ subject?, body?, status? }`
### `DELETE /api/developer-notes/:id`

---

## Risk Scores

### `GET /api/risk-scores/:keyword?marketplace=com`

Keyword için en son risk raporunu döner (cache amaçlı).

---

## User Management

### `GET /api/users`
### `POST /api/users` — `{ username, fullName, password, role }`
### `PATCH /api/users/:id`
### `DELETE /api/users/:id`

Rol: `admin | operator | viewer`

---

## File Uploads

### `POST /api/uploads` (multipart/form-data)
### `GET /api/uploads/:fileName`

Developer notes'ta ek dosyalar için.

---

## Status Kodları Referansı

| Code | Anlam |
|---|---|
| 200 | OK |
| 201 | Created (yeni kaynak) |
| 400 | Invalid input |
| 401 | Unauthorized (Bearer token eksik/yanlış) |
| 404 | Not found |
| 500 | Server error (log'a yansır) |

## Tipik Akış (cURL Örnekleri)

```bash
# Auth header
H='Authorization: Bearer Am0z0nSecr3t2026'
BASE=http://localhost:8186

# 1. Yeni scan
curl -s -X POST "$BASE/api/scans" -H "$H" -H 'Content-Type: application/json' \
  -d '{"keyword":"cable organizer","marketplace":"com","auto_add":true}'
# → {"jobId":"abc-123"}

# 2. Canlı ilerleme (poll every 2s)
curl -s "$BASE/api/scans/abc-123/progress" -H "$H"

# 3. Detay
curl -s "$BASE/api/scans/abc-123" -H "$H"

# 4. Tezi aktive et
curl -s -X POST "$BASE/api/scans/abc-123/thesis" -H "$H" \
  -d '{"operator_notes":"izleniyor"}'

# 5. Tezleri listele
curl -s "$BASE/api/theses?status=active" -H "$H"

# 6. Health check
curl -s "$BASE/api/health" -H "$H"
```

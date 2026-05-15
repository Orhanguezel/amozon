# Amozon — Başvuru Paketi

**Tarih:** 13 Mayıs 2026  
**Proje:** Amozon · Amazon Ticari Radar  
**Panel:** https://panel.avrasyaotomotiv.net/amozon/ (demo: `demo` / `demo2026`)

---

## 1. Proje Özeti

**Amozon**, Amazon pazarlarını ticari girişe açık olup olmadığına göre analiz eden karar destek aracıdır. Bir operatör keyword girer; sistem 5 boyutlu risk analiziyle giriş yapılmalı mı, izlenmeli mi, yoksa uzak durulmalı mı kararı üretir.

**"Amozon" adı bilinçlidir** — *Amazon Commercial Radar*'ın kısaltması. Hem ürünü tanımlar hem de arama motorlarında Amazon'la doğrudan çakışmaz.

### Temel Özellikler

- **5 Boyutlu Risk Skorlayıcı** — kategori rekabeti, fiyat savaşı riski, SKU kaos oranı, marka güvenilirliği, operasyonel risk; her boyut bağımsız güven seviyesiyle (HIGH/MEDIUM/LOW/INSUFFICIENT_DATA) üretilir
- **Karar Yüzeyi** — `AL / TAKIP_ET / UZAK_DUR` kararı + confidence bloklayıcı sistemi; düşük güven varken `AL` aksiyonu otomatik kilitlenir
- **SKU Sinyal Modeli** — her ürün için `price_status`, `seller_status`, `review_tier`, `rating_level`, `keepa_status` sinyalleri
- **Keepa Entegrasyonu** — tarihsel fiyat trendi ve satıcı sayısı değişimini skor girdisi olarak kullanır
- **LLM Enrichment** — Groq/OpenAI varsa Türkçe ticari özet + persuasion points üretir; yoksa template fallback çalışır
- **Data Gate** — yetersiz satıcı/Keepa kapsama varsa enrichment zorunluluğu karar yüzeyine yansır

### Tech Stack

| Katman | Teknoloji |
|--------|-----------|
| Backend | Fastify 5, Bun, TypeScript, MySQL, Drizzle ORM |
| Admin Panel | Next.js 16, React 19, Tailwind v4, RTK Query |
| AI | Groq (llama-3.3-70b), OpenAI (gpt-4o-mini), Promise.race timeout |
| Veri | Oxylabs (Amazon scraper), Keepa API, in-house review analyzer |
| DevOps | PM2, Nginx (basic auth + reverse proxy), VPS |

---

## 2. Mimari Derinlik

### Skorlayıcı Mimarisi

Her scorer bağımsız bir modül; `AmazonScoreInput` aldı, `RiskScore` döndürür:

```
AmazonProduct[] + KeepaSnapshot[]
         ↓
  signal.validator.ts    ← isActionable filtresi (min 100 review)
         ↓
  category-risk.scorer   → score, confidence, reason
  price-war.scorer       → Keepa tarihsel volatilite dahil
  sku-chaos.scorer       → fiyat σ, spread, varyant baskısı
  brand-reliability.scorer → 96 brand token → yüksek chaos sinyal
  operational-risk.scorer → review problem pattern, şikayet bayrakları
         ↓
  composite.scorer.ts    ← weighted average (LOW/INSUFFICIENT_DATA excluded)
         ↓
  decision_surface       ← AL/TAKIP_ET/UZAK_DUR + confidence blockers
         ↓
  enrichReportWithLLM()  ← Groq/OpenAI ticari yorum (async, 12s timeout)
```

### Veri Kalitesi Sistemi

Skor üretmeden önce `data_quality` objesi hesaplanır:
- `seller_coverage` < 0.5 → `seller_coverage_low` bloklayıcı → `AL` aksiyonu kilitlenir
- `keepa_coverage` = 0 → `no_keepa_data` → tarihsel trende güvenilmez
- Bloklayıcılar hem `confidence_blockers`'a hem `action_gating`'e yansır

Bu tasarım sayesinde sistem **veri yokken yanlış yüksek güven üretmez**.

---

## 3. Decision API — Örnek Response

**Senaryo:** `cable organizer` / `co.uk` / 167 ürün analizi

```json
{
  "scan": {
    "keyword": "cable organizer",
    "marketplace": "co.uk",
    "data_points": 167,
    "composite_score": 4.2,
    "primary_action": "TAKIP_ET"
  },
  "scores": {
    "category_risk": {
      "score": 2.0,
      "confidence": "MEDIUM",
      "reason": "Normal kategori yoğunluğu."
    },
    "sku_chaos": {
      "score": 7.2,
      "confidence": "HIGH",
      "reason": "Fiyat aralığı 49.57, medyan 8.99, sigma 4.97, ürün sayısı 167; skor log normalize edildi."
    },
    "price_war_risk": {
      "score": 3.6,
      "confidence": "MEDIUM",
      "reason": "Sayfa fiyat düşüş oranı 13%, düşük fiyat kümesi 33%."
    },
    "brand_reliability": {
      "score": 9.1,
      "confidence": "MEDIUM",
      "reason": "96 marka tokenı, 167 zayıf listing, fiyat sapması 4.97."
    },
    "operational_risk": {
      "score": 0.1,
      "confidence": "MEDIUM",
      "reason": "Review problem skoru 0.0, kritik şikayet bayrağı 0."
    }
  },
  "decision_surface": {
    "primary_action": "TAKIP_ET",
    "confidence": "MEDIUM",
    "confidence_blockers": ["seller_coverage_low", "no_keepa_data"],
    "top_reasons": [
      "96 marka tokenı, 167 zayıf listing, fiyat sapması 4.97.",
      "Fiyat aralığı 49.57, medyan 8.99, sigma 4.97, ürün sayısı 167.",
      "Sayfa fiyat düşüş oranı 13%, düşük fiyat kümesi 33%."
    ],
    "action_distribution": {
      "total": 167,
      "counts": { "AL": 6, "TAKIP_ET": 72, "UZAK_DUR": 89 },
      "dominant_action": "UZAK_DUR",
      "dominant_ratio": 0.53
    },
    "action_gating": {
      "AL": "AL aksiyonu için satıcı kapsaması en az %50 olmalı."
    },
    "unreachable_actions": ["AL"]
  },
  "data_quality": {
    "price_coverage": 1.0,
    "seller_coverage": 0.19,
    "keepa_coverage": 0.0
  }
}
```

**Okunması:** 96 markalı bu kategoride SKU kaos ve marka güvenilirliği riski yüksek (7.2 ve 9.1). Fiyat savaşı şimdilik ılımlı (3.6) ve operasyonel risk temiz (0.1). Seller kapsama %19 olduğundan `AL` aksiyonu otomatik kilitlendi — veri zenginleştirildikten sonra yeniden değerlendirilebilir.

---

## 4. Başvuru Metni — Kısa Versiyon

> Başvuru e-postası veya portfolio linki açıklaması için.

---

Son dönemde Amazon pazar analizi için tam kapsamlı bir karar destek aracı geliştirdim: **Amozon**.

Proje; Fastify 5 + Next.js 16 + MySQL + Bun üzerine kurulu production-ready bir sistem. Temel fikir şu: bir Amazon kategorisine girmek için doğru an mı, izlenmeli mi, yoksa uzak mı durulmalı — bu kararı beş boyutlu risk modeliyle skorlayıp operatöre açıklama dahil sunmak.

Mimari açıdan öne çıkan iki karar:

1. **Veri kalitesi sistemi** — satıcı ve Keepa kapsama düşükken sistem yüksek güven üretmez; yetersiz veri, karar yüzeyini bloklar ve hangi enrichment gerektiğini gösterir.
2. **LLM enrichment katmanı** — Groq/OpenAI varsa asenkron çalışır, 12s timeout ile ana pipeline'ı engellemez, yoksa template fallback devreye girer.

Demo: https://panel.avrasyaotomotiv.net/amozon/ (`demo` / `demo2026`)  
Teknik mimari dokümanı: `docs/sku-signal-model.md` (repoda mevcut)

---

## 5. Başvuru Metni — Detaylı Versiyon

> LinkedIn açıklaması, proje portfolio kartı veya iş başvurusu kapak mektubu için.

---

**Proje: Amozon — Amazon Ticari Radar**

Amazon'da bir kategoriye girilip girilmeyeceğine dair veri odaklı karar üretmek için sıfırdan bir araç geliştirdim. Üç aylık süreçte çalışan sistemin özellikleri:

**Teknik Katmanlar:**
- **Scraping:** Oxylabs üzerinden Amazon US/UK/DE/TR pazarları; anti-bot bypass, ürün URL çıkarımı, sayfa 1 / sayfa 3 fiyat karşılaştırması
- **Scoring Engine:** 5 bağımsız scorer modülü (category risk, price war, SKU chaos, brand reliability, operational risk). Her scorer kendi güven seviyesiyle çalışır; düşük güvenli boyutlar composite skora dahil edilmez
- **Keepa Entegrasyonu:** 90 günlük fiyat geçmişi ve satıcı sayısı trendi scorer'lara sinyal olarak eklendi
- **Karar Yüzeyi:** `AL / TAKIP_ET / UZAK_DUR` kararı, confidence bloklayıcılar, aksiyon kitleme mekanizması (satıcı kapsama < %50 ise `AL` üretilemez)
- **LLM Katmanı:** Groq/OpenAI entegrasyonu — ticari özet ve persuasion points Türkçe üretilir; model yoksa template fallback
- **Admin Panel:** Next.js 16 + RTK Query; canlı scan, SKU kırılımı, satıcı doğrulama, Keepa tetikleme

**Mimari Kararlar:**
- `scoreAmazonCategory()` senkron kalır — test edilmesi kolay, LLM asenkron katman ayrı
- Scorer'lar birbirinden bağımsız; yeni boyut eklemek mevcut kodu bozmaz
- Data gate sistemi: veri yetersizse güven üretme, enrichment gerekliliğini yüzeye taşı

**Sonuç:** 8 pazar × N keyword kombinasyonu taranabiliyor; her scan için ürün seviyesinde sinyal + kategori seviyesinde karar + LLM yorumu üretiliyor.

---

## 6. Screenshot Kontrol Listesi

> Panel açıkken alınacak ekran görüntüleri (manuel):

- [ ] Dashboard — canlı özetle (keyword sayısı, toplam scan, son araştırma)
- [ ] Scan listesi — birden fazla tamamlanmış araştırma
- [ ] Karar ekranı — cable organizer co.uk (TAKIP_ET, confidence blockers görünür)
- [ ] SKU kırılımı — actionable ürünler, her birinde AL/TAKIP_ET/UZAK_DUR badge
- [ ] Ayarlar — Keepa, Groq, Oxylabs aktif gösterir

---

## 7. Ekler

- **Mimari tasarım dokümanı:** [`docs/sku-signal-model.md`](./sku-signal-model.md)
- **Scoring config (ağırlıklar ve eşikler):** `backend/src/amazon/scoring.config.ts`
- **Scorer modülleri:** `backend/src/amazon/scorers/`
- **LLM enrichment:** `backend/src/amazon/llm-enrichment.ts`

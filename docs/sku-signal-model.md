# SKU Signal Model & Data Quality — Mimari Tasarım

**Yazar:** Claude Code (Mimar)
**Tarih:** 11 Mayıs 2026
**Hedef okuyucu:** Codex (uygulayacak), Claude Code (doğrulayacak)
**Amaç:** Kullanıcı geri bildirimi → decision surface dönüşümü için gereken per-product signal modeli ve data_quality nesnesinin referans tasarımı.

---

## Bağlam

Mevcut 5 scorer (`category_risk`, `sku_chaos`, `price_war_risk`, `brand_reliability`, `operational_risk`) tamamı **scan/keyword seviyesinde** çalışır; `AmazonCategoryStats` aggregatlarını kullanır. Tek tek ürünlerin (`AmazonProduct`) kendi kararı, aksiyonu veya reasoning'i **yoktur**.

Bu doküman eksik olan iki katmanı tanımlar:

1. **SKU Signal Model** — her ürün için hesaplanan 5 sinyal alanı
2. **Data Quality Object** — scan bazında veri kalitesi özeti

Her iki katman da kural tabanlı, deterministik ve AI gerektirmez.

---

## 1. SKU Signal Model

### 1.1 Sinyal Alanları

Her `AmazonProduct` için aşağıdaki 5 sinyal hesaplanır:

```typescript
type SkuSignals = {
  price_status: 'missing' | 'low' | 'normal' | 'high';
  seller_status: 'real' | 'missing';
  review_tier: 'low' | 'mid' | 'high';
  rating_level: 'missing' | 'weak' | 'acceptable' | 'strong';
  keepa_status: 'available' | 'pending' | 'no_asin' | 'missing';
};
```

### 1.2 Hesaplama Kuralları

Tüm kurallar `NormalizedProduct` ve `AmazonCategoryStats` üzerinden çalışır. Stats nesnesi zaten `scoreAmazonCategory()` içinde mevcut; bu yüzden ek DB sorgusu gerekmez.

#### `price_status`
```
product.price == null             → 'missing'
product.price < stats.priceMedian * 0.70  → 'low'
product.price > stats.priceMedian * 1.30  → 'high'
diğer                            → 'normal'
```

#### `seller_status`
```
product.seller_name != null && trim() != ''  → 'real'
diğer                                        → 'missing'
```

#### `review_tier`
```
product.review_count < 50    → 'low'
product.review_count <= 500  → 'mid'
product.review_count > 500   → 'high'
```
Not: `FILTER_CONFIG.MIN_REVIEW_COUNT = 10` olduğu için pipeline'a giren tüm ürünler >= 10 yoruma sahiptir. Eşikler kullanıcı odaklı (`50`, `500`) seçildi.

#### `rating_level`
```
product.rating == null        → 'missing'
product.rating < 4.0          → 'weak'
product.rating >= 4.0 < 4.5   → 'acceptable'
product.rating >= 4.5         → 'strong'
```

#### `keepa_status`
ASIN bilgisi `product_url`'den çıkarılır (mevcut `extractAsinFromUrl` helper `signal.validator.ts`'de kullanılıyor, oradan alınabilir).

```
ASIN çıkarılamıyorsa               → 'no_asin'
ASIN var, keepa_snapshots'ta kayıt var → 'available'
ASIN var, kayıt yok                → 'missing'
```
Not: `keepa_status` hesabı DB join gerektirir. Bu sinyal `amazon.scoring-engine.ts`'de değil, `risk-report.service.ts`'de doldurulur (aşağıda akış detayı var).

### 1.3 Per-SKU Action Mantığı

> **UI Uyarısı (Codex geri bildirimi):** Per-SKU `AL / TAKİP ET / UZAK DUR` etiketleri scan-level karar etiketleriyle aynı kelimelerdir. Operatör karıştırabilir.
> - Scan-level: "bu kategoriye girmeli miyim?" sorusunun cevabı
> - SKU-level: "bu ürün veri kalitesi açısından güvenilir bir referans noktası mı?" sorusunun cevabı
>
> UI'da per-SKU action'ı farklı bir etiketle göstermek gerekir. Öneri: "Veri Kalitesi: Güvenilir / İzle / Eksik Veri" — ya da scan-level badge'in yanında küçük bir "veri" ikonu ile ayrıştırma.
> Codex bunu uygularken `SkuAction` tipini değiştirmemeli; UI katmanında farklı label kullanmalı.

Scan-level action (kategori kararı) → operatöre "bu kategoriye gir/girme" der.
**Per-SKU action farklıdır:** "bu ürün veri kalitesi açısından ne kadar güvenilir bir referans noktası?"

```typescript
type SkuAction = 'AL' | 'TAKIP_ET' | 'UZAK_DUR';
```

Hesaplama kuralı:

```
blocker sayısı = 0                               → 'AL'
blocker sayısı = 1-2 veya rating 'weak'          → 'TAKIP_ET'
blocker sayısı >= 3 veya price_status 'missing'
  + seller_status 'missing' aynı anda            → 'UZAK_DUR'
```

Buradaki "blocker":
- `price_status == 'missing'`
- `seller_status == 'missing'`
- `keepa_status == 'missing' || 'no_asin'`
- `rating_level == 'missing'`

### 1.4 Per-SKU Confidence

```
başlangıç: 'MEDIUM'
blocker sayısı >= 2 → 'LOW'
tüm sinyaller temiz (hiç blocker yok) → 'HIGH'
```

### 1.5 Per-SKU Reasoning Cümleleri

Her sinyal durumu bir Türkçe cümleye karşılık gelir. `sku_decisions` içindeki `reasons[]` bu listeden doldurulur:

| Sinyal | Durum | Cümle |
|--------|-------|-------|
| `price_status` | `missing` | `"Fiyat verisi yok; fiyat karşılaştırması yapılamıyor."` |
| `price_status` | `low` | `"Kategori medyanının altında fiyatlı; fiyat baskısı var."` |
| `price_status` | `high` | `"Kategori ortalamasının üzerinde; premium segment."` |
| `seller_status` | `missing` | `"Satıcı bilgisi yok; güvenilirlik doğrulanamıyor."` |
| `review_tier` | `low` | `"Düşük yorum sayısı; sosyal kanıt yetersiz."` |
| `review_tier` | `high` | `"Yüksek yorum sayısı; köklü listing."` |
| `rating_level` | `weak` | `"Puan 4.0 altında; yorum kalitesi sorunlu olabilir."` |
| `rating_level` | `missing` | `"Puan verisi yok."` |
| `keepa_status` | `missing` | `"Keepa fiyat geçmişi çekilmedi; fiyat istikrarı bilinmiyor."` |
| `keepa_status` | `no_asin` | `"ASIN çözümlenemedi; Keepa verisi eklenemiyor."` |
| `keepa_status` | `available` | `"Keepa fiyat geçmişi mevcut."` |

`reasons[]` sadece dikkat gerektiren durumları içerir. `AL` durumundaki temiz ürünler için reason listesi boş bırakılabilir veya yalnızca `"Veri kalitesi yeterli."` yazılır.

---

## 2. Data Quality Object

`data_quality` scan/keyword seviyesinde bir özettir. `AmazonRiskReport`'a eklenir.

### 2.1 Tip Tanımı

```typescript
type ConfidenceBlocker =
  | 'seller_coverage_low'       // seller_coverage < 0.5
  | 'low_price_coverage'        // price_coverage < 0.7
  | 'no_keepa_data'             // !has_keepa_snapshot
  | 'insufficient_data_points'; // data_points < threshold

type DataQuality = {
  data_points: number;          // filtrelerden geçen ürün sayısı
  price_coverage: number;       // 0-1, fiyat verisi olan ürün oranı
  seller_coverage: number;      // 0-1, gerçek seller_name olan ürün oranı
  keepa_coverage: number;       // 0-1, keepa snapshot olan ASIN oranı
  has_price_data: boolean;      // price_coverage > 0
  has_keepa_snapshot: boolean;  // keepa_coverage > 0
  confidence_blockers: ConfidenceBlocker[];
};
```

### 2.2 Hesaplama

`scoreAmazonCategory()` içinde, mevcut `buildInsufficientDataReason()` çağrısından sonra:

```typescript
function buildDataQuality(
  products: NormalizedProduct[],
  keepaAsinSet: Set<string>,  // keepa snapshot olan ASIN'ler
): DataQuality {
  const total = products.length;
  const withPrice = products.filter((p) => typeof p.price === 'number').length;
  const withSeller = products.filter((p) => Boolean(p.seller_name?.trim())).length;

  const asinList = products
    .map((p) => extractAsinFromUrl(p.product_url))
    .filter(Boolean) as string[];
  const withKeepa = asinList.filter((asin) => keepaAsinSet.has(asin)).length;
  const keepaCoverage = asinList.length > 0 ? withKeepa / asinList.length : 0;

  const priceCoverage = total > 0 ? withPrice / total : 0;
  const sellerCoverage = total > 0 ? withSeller / total : 0;

  const blockers: ConfidenceBlocker[] = [];
  if (sellerCoverage < 0.5) blockers.push('seller_coverage_low');
  if (priceCoverage < 0.7) blockers.push('low_price_coverage');
  if (keepaCoverage === 0) blockers.push('no_keepa_data');
  if (total < getConfidenceThresholds().LOW_MAX + 1) blockers.push('insufficient_data_points');

  return {
    data_points: total,
    price_coverage: Number(priceCoverage.toFixed(2)),
    seller_coverage: Number(sellerCoverage.toFixed(2)),
    keepa_coverage: Number(keepaCoverage.toFixed(2)),
    has_price_data: priceCoverage > 0,
    has_keepa_snapshot: keepaCoverage > 0,
    confidence_blockers: blockers,
  };
}
```

### 2.3 `calculateConfidence` Güncellemesi

Mevcut imza: `calculateConfidence(dataPoints: number): Confidence`
Yeni imza:

```typescript
type QualityFactors = {
  sellerCoverage: number;
  priceCoverage: number;
  hasKeepaData: boolean;
};

export function calculateConfidence(
  dataPoints: number,
  qualityFactors?: QualityFactors,
): Confidence {
  const T = getConfidenceThresholds();
  let base: Confidence;
  if (dataPoints <= T.INSUFFICIENT_DATA_MAX) return 'INSUFFICIENT_DATA';
  if (dataPoints <= T.LOW_MAX) base = 'LOW';
  else if (dataPoints <= T.MEDIUM_MAX) base = 'MEDIUM';
  else base = 'HIGH';

  if (!qualityFactors) return base;

  // Her kritik kalite faktörü bir kademe düşürür
  const penalties = [
    qualityFactors.sellerCoverage < 0.5,
    qualityFactors.priceCoverage < 0.7,
  ].filter(Boolean).length;

  return reduceConfidence(base, penalties);
}

function reduceConfidence(base: Confidence, steps: number): Confidence {
  const ladder: Confidence[] = ['INSUFFICIENT_DATA', 'LOW', 'MEDIUM', 'HIGH'];
  const idx = Math.max(0, ladder.indexOf(base) - steps);
  return ladder[idx]!;
}
```

`hasKeepaData` burada penalty olarak sayılmıyor çünkü Keepa opsiyonel bir enrichment; yokluğu `data_quality.confidence_blockers`'a eklenir ama confidence'ı düşürmez.

---

## 3. Güncellenmiş `AmazonRiskReport` Tipi

```typescript
// amazon.types.ts'e eklenecek yeni tipler

export type SkuAction = 'AL' | 'TAKIP_ET' | 'UZAK_DUR';

export type SkuDecision = {
  asin: string | null;
  title: string;
  action: SkuAction;
  confidence: Confidence;
  reasons: string[];
  signals: SkuSignals;  // ham sinyaller, debug için
};

export type SkuSignals = {
  price_status: 'missing' | 'low' | 'normal' | 'high';
  seller_status: 'real' | 'missing';
  review_tier: 'low' | 'mid' | 'high';
  rating_level: 'missing' | 'weak' | 'acceptable' | 'strong';
  keepa_status: 'available' | 'pending' | 'no_asin' | 'missing';
};

export type ConfidenceBlocker =
  | 'seller_coverage_low'
  | 'low_price_coverage'
  | 'no_keepa_data'
  | 'insufficient_data_points';

export type DataQuality = {
  data_points: number;
  price_coverage: number;
  seller_coverage: number;
  keepa_coverage: number;
  has_price_data: boolean;
  has_keepa_snapshot: boolean;
  confidence_blockers: ConfidenceBlocker[];
};

export type DecisionSurface = {
  primary_action: SkuAction;
  confidence: Confidence;
  confidence_blockers: ConfidenceBlocker[];
  top_reasons: string[];       // scan-level 5 scorer reason'larından en kritik 3
  operator_summary: string;    // tek cümle, Türkçe
};

// AmazonRiskReport'a eklenecek alanlar:
// + data_quality: DataQuality;
// + decision_surface: DecisionSurface;
// + sku_decisions: SkuDecision[];
```

---

## 4. Pipeline Akışı — Değişiklik Sırası

Bu sıra kritiktir. Codex görevleri bu sıraya göre uygulanmalı.

```
1. amazon.types.ts
   → SkuSignals, SkuDecision, DataQuality, DecisionSurface tiplerini ekle
   → AmazonRiskReport'a data_quality, decision_surface, sku_decisions ekle

2. scoring.config.ts
   → QualityFactors tipi / confidence penalty eşikleri (seller <0.5, price <0.7)

3. confidence.calculator.ts
   → calculateConfidence(dataPoints, qualityFactors?) imzasına geç
   → reduceConfidence() helper'ı ekle
   → Geriye dönük uyumlu: qualityFactors opsiyonel, mevcut çağrılar kırılmaz

4. amazon.scoring-engine.ts
   → buildDataQuality() fonksiyonunu ekle
   → buildSkuDecisions(products, keepaAsinSet, stats) fonksiyonunu ekle
   → buildDecisionSurface(scores, decision, dataQuality) fonksiyonunu ekle
   → scoreAmazonCategory() dönüş değerine 3 yeni alanı ekle
   → 5 scorer çağrısına qualityFactors geçilecek (sellerCoverage, priceCoverage)

5. amazon.job.ts
   → Keepa snapshot ASIN seti toplanır ve scoreAmazonCategory()'e geçilir
   → (Keepa job hâlihazırda ayrı bir POST tetikleyici; burada sadece mevcut snapshot'lar okunur)

6. 021_amazon_scoring_schema.sql
   → amazon_risk_scores tablosuna JSON kolonları ekle:
     ALTER TABLE yerine CREATE TABLE'ı güncelle ve fresh seed yap (CLAUDE.md kuralı)
   Eklenecek kolonlar:
     data_quality JSON NULL,
     decision_surface JSON NULL,
     sku_decisions JSON NULL

7. risk-report.service.ts
   → getLatestAmazonRiskReport() keepa ASIN setini sorgular (amazon_keepa_snapshots JOIN)
   → data_quality, decision_surface, sku_decisions DB'den okunur ve response'a eklenir

8. admin_panel/src/components/admin/types.ts
   → ScanDetail'e data_quality, decision_surface, sku_decisions eklenir
   → Product tipine SkuDecision karşılığı alanlar eklenir (isteğe bağlı join)

9. ProductsPanel.tsx
   → Ürün tablosu → karar kartı görünümü
   → Her kart: action badge + reasons + confidence + signals özeti
   → Uygulandı: Products ekranında scan-level Karar Yüzeyi, veri kalitesi oranları, confidence blocker'ları ve SKU bazlı kısa gerekçeler gösteriliyor.

10. ScansPanel.tsx
    → Scan listesi: AL / TAKİP ET / UZAK DUR gruplama
    → Her scan'in decision_surface.operator_summary'si gösterilir
    → Uygulandı: Scans ekranında karar dağılımı, scan satırında ana aksiyon, karar özeti ve veri kalitesi uyarıları gösteriliyor.
```

---

## 5. Örnek JSON Çıktı

```json
{
  "keyword": "thermal labels",
  "decision_surface": {
    "primary_action": "TAKIP_ET",
    "confidence": "MEDIUM",
    "confidence_blockers": ["seller_coverage_low"],
    "top_reasons": [
      "Fiyat düşüş oranı %38; fiyat savaşı riski yüksek.",
      "Satıcı verisi eksik ürün oranı %55; güven düşük.",
      "Kategori yoğunluğu 42 satıcı; orta rekabet."
    ],
    "operator_summary": "Fiyat baskısı var, satıcı verisi eksik; pozisyon almadan önce Keepa trendi tamamlanmalı."
  },
  "data_quality": {
    "data_points": 49,
    "price_coverage": 0.92,
    "seller_coverage": 0.45,
    "keepa_coverage": 0.0,
    "has_price_data": true,
    "has_keepa_snapshot": false,
    "confidence_blockers": ["seller_coverage_low", "no_keepa_data"]
  },
  "sku_decisions": [
    {
      "asin": "B07XJ8C8F5",
      "title": "Dymo LabelWriter 4XL Labels",
      "action": "AL",
      "confidence": "HIGH",
      "reasons": [],
      "signals": {
        "price_status": "normal",
        "seller_status": "real",
        "review_tier": "high",
        "rating_level": "strong",
        "keepa_status": "missing"
      }
    },
    {
      "asin": null,
      "title": "Generic Thermal Label 4x6",
      "action": "UZAK_DUR",
      "confidence": "LOW",
      "reasons": [
        "Satıcı bilgisi yok; güvenilirlik doğrulanamıyor.",
        "Fiyat verisi yok; fiyat karşılaştırması yapılamıyor.",
        "ASIN çözümlenemedi; Keepa verisi eklenemiyor."
      ],
      "signals": {
        "price_status": "missing",
        "seller_status": "missing",
        "review_tier": "mid",
        "rating_level": "acceptable",
        "keepa_status": "no_asin"
      }
    }
  ]
}
```

---

## 6. Codex'e Görev Teslimi — Sınırlar

### Uygulama Sırası (Codex geri bildirimi — büyük refactor değil, parçalı)

1. `data_quality` — önce bu; bağımsız, mevcut koda dokunmuyor
2. `sku_decisions` — data_quality tamamlandıktan sonra
3. `ProductsPanel` karar kartı görünümü — sku_decisions hazır olunca
4. JSON dokümantasyon güncellemesi — en son

### Codex yapacak
- Yukarıdaki tip tanımlarını `amazon.types.ts`'e eklemek
- `confidence.calculator.ts`'i yeni imzayla güncellemek (geriye dönük uyumlu)
- `amazon.scoring-engine.ts`'e `buildDataQuality`, `buildSkuDecisions`, `buildDecisionSurface` fonksiyonlarını eklemek
- `021_amazon_scoring_schema.sql`'e yeni kolonları eklemek (CREATE TABLE güncelleme)
- `risk-report.service.ts`'i yeni alanlarla güncellemek
- `admin_panel/types.ts` ve `ProductsPanel.tsx`'i güncellemek

### Codex yapmayacak
- `SkuAction` tanımını değiştirmek (`AL | TAKIP_ET | UZAK_DUR` sabittir)
- Confidence penalty eşiklerini (`0.5`, `0.7`) değiştirmek
- Scorer ağırlıklarını (`scoring.config.ts`) değiştirmek
- Reasoning cümlelerini İngilizceye çevirmek (Türkçe kalmalı)
- DB'de `ALTER TABLE` kullanmak (yasaklı, `CLAUDE.md`)

### Doğrulama kriterleri
1. `thermal labels` scan'i için `data_quality.seller_coverage` < 0.5 → `confidence_blockers` içinde `seller_coverage_low` görünmeli
2. `surge protector` (2 ürün) için `decision_surface.confidence` → `INSUFFICIENT_DATA` olmalı
3. Mevcut testler (`composite.scorer.test.ts`, `confidence.calculator.test.ts`) kırılmamalı
4. `calculateConfidence(15)` (eski imza, qualityFactors yok) → eskisiyle aynı sonucu vermeli

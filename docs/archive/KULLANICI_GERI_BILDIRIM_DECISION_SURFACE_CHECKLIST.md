# Amozon Kullanıcı Geri Bildirimi ve Decision Surface Checklist

**Hazırlama tarihi:** 11 Mayıs 2026
**Kaynak:** Canlı panel gözlemleri ve kullanıcı teknik değerlendirme notları
**Amaç:** Amozon ürününü klasik dashboard yerine hızlı karar aldıran, açıklanabilir ve düşük gürültülü bir karar yüzeyine dönüştürmek.
**Son güncelleme:** Claude Code mimari inceleme eklemeleri dahil edildi.

---

## Durum Anahtarı

- `[x]` Tamamlandı
- `[-]` Kısmi / çalışıyor ama iyileştirme gerekiyor
- `[ ]` Eksik / yapılacak
- `[n/a]` Bilinçli olarak kapsam dışı

---

## Mimari Notlar (Claude Code — Tarihsel Kayıt)

> Bu bölüm ilk incelemede tespit edilen yapısal kısıtları ve çözümlerini belgeler.
> Tüm kritik maddeler kapatıldı.

### A. ~~Mevcut Skorlama Tamamen Scan/Keyword Seviyesinde~~ ✅ Çözüldü

5 scorer hâlâ scan/keyword seviyesinde aggregat üzerine çalışıyor; bu mimari değişmedi.
Ancak **`sku_decisions[]`** katmanı eklendi: her ürün için kural tabanlı `price_status`, `seller_status`, `review_tier`, `keepa_status` sinyallerinden reasoning üretiliyor.
Per-product `action`, `confidence`, `reasons` artık mevcut — `ProductsPanel` bunları tüketiyor.

### B. `confidence.calculator.ts` Tek Boyutlu

`calculateConfidence(dataPoints)` sadece ürün sayısına bakar.
Eksik satıcı, eksik Keepa, eksik fiyat verisi confidence'ı düşürmez.
Bu, 30 ürünle yapılmış ama tümünün satıcısı olmadığı bir scan'in `LOW` değil neredeyse `MEDIUM` confidence almasına neden olur.

**Düzeltme:** `[x]` `calculateConfidence(dataPoints, qualityFactors?)` imzasına geçildi; `sellerCoverage` ve `priceCoverage` confidence seviyesini düşürebiliyor. `hasKeepaData` data quality blocker olarak tutuluyor, confidence penalty olarak kullanılmıyor.

### C. ~~`MIXED_SIGNAL` Tutarsızlığı~~ ✅ Çözüldü

`validateSignals()` başına `INSUFFICIENT_DATA` guard eklendi: `decision === 'INSUFFICIENT_DATA'` ise erken return, skor dağılımına bakılmıyor, `MIXED_SIGNAL`'a override edilmiyor.
`composite.scorer.ts` `MIXED_SIGNAL` döndürmez; `signal.validator.ts` override'ı artık sadece gerçek veri olan durumlarda tetikleniyor.

### D. `AmazonRiskReport` Tipinde Gerekli Alanlar Eksik

Mevcut tip artık `data_quality`, `sku_decisions` ve `decision_surface` içeriyor.
Bu alanlar backend tipine, DB schema'ya ve `risk-report.service.ts`'e eklendi.
Kalan görevler şu sırayı takip etmeli: **admin panel tipleri → karar kartı UI → dokümantasyon.**

### E. ~~`persuasion_points` UI'da Gösterilmiyor~~ ✅ Çözüldü

`ScansPanel.tsx` seçili araştırma risk özeti panelinde `persuasion_points` "Satış Argümanları" başlığıyla listeleniyor. Boşsa bölüm gösterilmiyor.

---

## 1. Canlı Panel Gözlemleri

### 1.1 Keepa Trend Boş Görünümü

- [x] Products sayfasında Keepa Trend alanı mevcut ve ayrıca görünür Keepa Enrichment Durumu kartı eklendi.
- [x] Canlı token ölçümü çalışıyor; Settings ekranında Keepa hesabı okunabiliyor.
- [x] Seçili araştırma için Keepa snapshot yoksa panel artık neden/veri/kuyruk/limit detaylarını gösteriyor.
- [x] Bu mesaj daha açıklayıcı hale getirildi: neden yok, kaç ASIN uygun, kaç snapshot var, kuyruk/hata ve yerel limit bilgisi gösteriliyor.
- [x] Products sayfasında Keepa çekme aksiyonu daha görünür hale getirildi; ayrı Keepa Enrichment Durumu kartına taşındı.
- [x] Keepa çekildikten sonra Products ekranı scan detayını ve Keepa status bilgisini otomatik yeniliyor.
- [x] Keepa snapshot yoksa operatöre şu ayrım gösteriliyor:
  - API anahtarı yok
  - token var ama bu scan için Keepa çekilmemiş
  - ASIN yok
  - yerel limit nedeniyle atlandı
  - Keepa API hata verdi
- [x] Keepa harcama sonucu scan detayında okunuyor: snapshot, kuyruk, hata, yerel token kullanımı ve kapsama oranı gösteriliyor.
- [x] **[Claude Code]** `GET /api/scans/[jobId]/keepa/status` endpoint'i eklendi; `amazon_products`, `amazon_keepa_snapshots`, `amazon_keepa_queue` ve yerel günlük limit aggregat olarak okunuyor.

**Değerlendirme:**
Bu alan teknik olarak mevcut ama karar yüzeyi açısından eksik. Kullanıcı "veri yok" mesajını gördüğünde sistemin bozuk mu, eksik mi, yoksa bilinçli olarak mı Keepa çekmediğini anlayamıyor. Bu yüzden kısa açıklama ve aksiyon önerisi şart.

### 1.2 Marka Tahmini / Satıcı Bilgisi

- [x] Amazon search datasında gerçek satıcı adı gelmediğinde panel artık `Marka tahmini` rozetini gerçek satıcıdan ayrı gösteriyor.
- [x] `Unknown seller` ifadesi kaldırıldı.
- [x] Bu yaklaşım sahte satıcı üretmiyor; UI notunda gerçek satıcı olmadığı açık yazıyor.
- [x] Products tablosunda `Marka tahmini` ayrı badge ve açıklama ile gösteriliyor.
- [x] Gerçek satıcı bilgisi için enrichment stratejisi dokümante edildi.
- [x] Seller enrichment opsiyonları karşılaştırıldı:
  - Oxylabs product/detail veya offer endpoint
  - Keepa seller/buy box bilgileri
  - Amazon product page parser
- [x] Enrichment token/maliyet etkisi Documentation içinde açıklandı.
- [x] Gerçek satıcı yokken seller coverage confidence blocker olarak düşüyor; SKU reason içinde satıcı bilgisinin doğrulanamadığı belirtiliyor.
- [x] **[Claude Code]** Satıcı verisi eksik olan ürün oranı (`sellerCoverage`) confidence blocker olarak `data_quality` nesnesine eklendi. Bu oran düşükse skor confidence'ları bir kademe düşebiliyor.

**Değerlendirme:**
Mevcut arama sonucu satıcıyı çoğu zaman vermiyor. Bu yüzden "marka tahmini" doğru bir güvenlik etiketi, fakat operatörün bunu gerçek seller sanmaması gerekiyor. Gerçek çözüm enrichment katmanı.

---

## 2. Kullanıcı Teknik Değerlendirme Notları

### 2.1 Reasoning Clarity

Kullanıcı beklentisi: Her SKU veya karar satırı sadece skor göstermemeli; kısa, ticari olarak anlamlı reasoning üretmeli.

Örnek beklenti:

```text
Price instability due to high seller volatility
```

Durum:

- [x] Backend 5 skor boyutu için `reason` üretiyor.
- [x] Risk JSON içinde reason alanları mevcut.
- [x] Reason açıklamaları artık scan seviyesi yanında SKU seviyesinde de var.
- [x] SKU bazlı kısa ticari reasoning alanı eklendi: `sku_decisions[].reasons`.
- [x] Products tablosunda her ürün için karar nedeni gösteriliyor.
- [x] Reason cümleleri operatör diliyle sadeleştirildi:
  - fiyat oynaklığı
  - satıcı/marka belirsizliği
  - düşük yorum güveni
  - yüksek rekabet
  - eksik fiyat verisi
  - Keepa trend yok
- [x] Reasoning metni JSON içinde stabil schema ile tutuluyor: `sku_decisions`.
- [x] **[Claude Code]** SKU reasoning kural tabanlı yapıldı (AI gerekmez, maliyetsiz, deterministik). Her Product için şu sinyal alanları hesaplanır; bunlardan cümle türetilir:
  - `price_status`: `missing | low | normal | high`
  - `seller_status`: `real | inferred | unknown`
  - `review_tier`: `low (<50) | mid (50-500) | high (>500)`
  - `keepa_status`: `available | missing | pending`

Önerilen JSON alanı:

```json
{
  "sku_decisions": [
    {
      "asin": "B0...",
      "action": "TAKIP_ET",
      "confidence": "LOW",
      "reasons": [
        "Satıcı bilgisi arama verisinde yok.",
        "Fiyat verisi var ancak Keepa trendi henüz çekilmedi."
      ]
    }
  ]
}
```

### 2.2 Confidence Realism

Kullanıcı beklentisi: Sistem her SKU'ya veya her scan'e yüksek güven vermemeli. Veri eksikse açıkça `LOW` veya `INSUFFICIENT_DATA` demeli.

Durum:

- [x] `HIGH`, `MEDIUM`, `LOW`, `INSUFFICIENT_DATA` confidence katmanı mevcut.
- [x] Yetersiz veri durumunda karar zorlanmıyor.
- [x] Yetersiz veri nedeni backend summary içinde üretilebiliyor.
- [x] UI'da confidence nedenleri data quality uyarıları ve SKU reason satırlarıyla görünür hale getirildi.
- [x] Her scan ve SKU için confidence gerekçeleri görünür: scan'de `confidence_blockers`, SKU'da `reasons`.
- [x] Eksik seller, eksik Keepa, düşük data_points gibi durumlar confidence/reason içinde açık yazılıyor.
- [x] Operatör yüksek güvenli olmayan kayıtları `Veri eksik` görünümüyle ayırabiliyor.
- [x] Düşük güvenli sonuçlar ana karar kuyruğu yerine veri eksik/tüm ürünler görünümünde tutuluyor.
- [x] **[Claude Code]** `calculateConfidence(dataPoints)` → `calculateConfidence(dataPoints, qualityFactors?)` imzasına geçildi. Eski imza korunuyor; seller/fiyat kapsaması zayıfsa confidence düşüyor.
- [x] **[Claude Code]** `MIXED_SIGNAL` tutarsızlığı giderildi: `validateSignals()` içine `INSUFFICIENT_DATA` guard eklendi — veri yetersizse artık hiçbir zaman `MIXED_SIGNAL`'a override edilmiyor.

### 2.3 Noise Reduction

Kullanıcı beklentisi: Operatör veriyle boğulmamalı; aksiyon alınabilir SKU'lar öne çıkmalı.

Durum:

- [x] Products sayfasında filtreler mevcut.
- [x] Scans sayfasında uyarı/karar özetleri mevcut.
- [x] Karar dili `Al / Takip Et / Uzak Dur` olarak çevrildi.
- [x] Ürün tablosu karar yüzeyiyle desteklendi: üstte karar kuyruğu var, tablo segmentlerle ayrıldı ve detay analizler ikinci seviyeye taşındı.
- [x] Aksiyon alınabilir kayıtlar üstte "Öncelikli Karar Listesi" olarak öne çıkarıldı.
- [x] Noisy/düşük değerli ürünler ayrı "Veri eksik" görünümüne alındı; tek tıkla açılabiliyor.
- [x] SKU priority sıralaması UI katmanında eklendi: `AL > TAKİP ET > UZAK DUR`, sonra yorum sayısı.
- [x] "Öncelikli Karar Listesi" bloğu eklendi.
- [x] Ürün tablosu karar kartlarıyla desteklendi; üstte karar kartları, altta detay tablo görünümü birlikte duruyor:
  - Aksiyon
  - kısa reason
  - confidence
  - fiyat/rating/review mini özet
  - eksik veri uyarısı
- [x] **[Claude Code]** "Aksiyon alınabilir" tanımı uygulandı: `review_count >= 50 AND price != null AND seller_status == real AND sku_decision var`; geri kalanlar "Veri Eksik" grubu.
- [x] **[Claude Code]** `persuasion_points` ScansPanel seçili araştırma risk özeti bölümüne eklendi — "Satış Argümanları" başlığıyla gösteriliyor.

### 2.4 JSON / Data Structure

Kullanıcı beklentisi: JSON sade, okunabilir ve ileride farklı UI/API katmanlarına bağlanabilir olmalı.

Durum:

- [x] Risk report JSON yapısı mevcut.
- [x] 5 boyutlu score/confidence/reason yapısı mevcut.
- [x] `brand_context`, `enrichment`, `persuasion_points`, `outreach_priority` alanları mevcut.
- [x] SKU bazlı decision/reasoning JSON netleşti: `sku_decisions`.
- [x] Yeni JSON kontratı dokümante edildi.
- [x] Scan-level, dimension-level ve SKU-level alanlar net ayrıldı.
- [x] UI için normalize edilmiş `decision_surface` alanı üretildi.
- [x] JSON alanları İngilizce teknik, UI etiketleri Türkçe olacak şekilde standartlaştırıldı.
- [x] **[Claude Code]** Tip değişikliği sırası tamamlandı:
  1. `amazon.types.ts` → `data_quality`, `decision_surface`, `sku_decisions` alanları eklenir
  2. `021_amazon_scoring_schema.sql` → gerekli kolonlar eklenir (fresh build ile)
  3. `risk-report.service.ts` → yeni alanlar DB'den okunur
  4. `amazon.scoring-engine.ts` → `scoreAmazonCategory()` yeni alanları üretir
  5. Admin panel `types.ts` → `ScanDetail` ve `Product` tipleri güncellenir
  6. UI bileşenleri → yeni alanları tüketir

Önerilen üst seviye yapı:

```json
{
  "scan": {},
  "decision_surface": {
    "primary_action": "TAKIP_ET",
    "confidence": "MEDIUM",
    "confidence_blockers": ["seller_coverage_low", "no_keepa_data"],
    "top_reasons": [],
    "operator_summary": ""
  },
  "scores": {},
  "sku_decisions": [],
  "data_quality": {
    "has_price_data": true,
    "seller_coverage": 0.45,
    "has_keepa_snapshot": false,
    "data_points": 18,
    "confidence_blockers": ["seller_coverage_low"]
  },
  "enrichment_status": {}
}
```

### 2.5 Decision Surface Yaklaşımı

Kullanıcı beklentisi: Ürün klasik dashboard değil, birkaç saniyede karar aldıran bir yüzey olmalı.

Durum:

- [x] Panel sade yönde ilerliyor.
- [x] Karar etiketleri ve aksiyon dili mevcut.
- [x] Tekrar eden Satıcı Kırılımı tablosu kaldırıldı (Marka Kırılımı yeterli; ikisi aynı veriyi gösteriyordu).
- [x] Products sayfasında grafik/tablo yoğunluğu azaltıldı; karar yüzeyi ve öncelikli karar kuyruğu öne alındı, grafik/marka kırılımı Detaylı Analiz içine taşındı.
- [x] Dashboard mantığından "karar kuyruğu" mantığına geçiş başladı.
- [x] İlk ekranda şu üç karar net görünüyor:
  - AL
  - TAKİP ET
  - UZAK DUR
- [x] Her öncelikli karar kartında kısa reason gösteriliyor.
- [x] Düşük değerli/noisy detaylar ikinci seviye "Veri eksik" ve "Tümü" görünümüne alındı.
- [x] Operatör için "neden bu karar?" alanı karar yüzeyinde en önemli nedenler ve veri uyarıları olarak gösteriliyor.
- [x] Düşük veri kalitesindeki kayıtlar ayrı "Veri eksik" görünümünde gösteriliyor.
- [x] **[Claude Code]** "Kategori Karşılaştırması" flat tablosu → AL / TAKİP ET / UZAK DUR gruplu kart görünümüne çevrildi. Her kart: keyword, marketplace, veri noktası, `operator_summary` (varsa), `confidence_blockers` badge'leri. Karta tıklanınca scan yükleniyor.
- [x] **[Tamamlandı]** `SellerBreakdown` kaldırıldı — `sellerDisplayName()` ile `inferredBrandName()` aynı veriden üretildiği için her iki tablo da aynı satırları gösteriyordu. `BrandBreakdown` yeterli.
- [x] **[Claude Code]** `BrandBreakdown` analiz amaçlı olduğu için "Detaylı Analiz" alanına taşındı.

---

## 3. İş Bölümü — Claude Code vs Codex

> Bu bölüm Codex'e iletilecek görevlerin sınırlarını belirler.
> Claude Code mimari kararları verir, Codex uygular.

### Claude Code Yapar (Tasarım / Mimari)

- [x] SKU-level signal alanları tanımla: `price_status`, `seller_status`, `review_tier`, `rating_level`, `keepa_status` — bkz. [`docs/sku-signal-model.md`](./docs/sku-signal-model.md)
- [x] `data_quality` ve `decision_surface` nesne yapısını belgele — bkz. `docs/sku-signal-model.md` §2-3
- [x] `calculateConfidence(dataPoints, qualityFactors?)` yeni imzasını belirle — bkz. `docs/sku-signal-model.md` §2.3
- [x] Tip değişikliği sırasını ve bağımlılık zincirini belgele — bkz. `docs/sku-signal-model.md` §4
- [x] Codex için kod görevlerini ve sınırları netleştir — bkz. `docs/sku-signal-model.md` §6

### Codex Yapar (Uygulama)

- [x] `amazon.types.ts` → `data_quality` tipleri eklendi
- [x] `scoring.config.ts` → veri kalitesi eşikleri eklendi
- [x] `confidence.calculator.ts` → `qualityFactors` desteği eklendi
- [x] `amazon.scoring-engine.ts` → `data_quality`, `sku_decisions` ve `decision_surface` üretimi eklendi
- [x] `risk-report.service.ts` → `data_quality`, `sku_decisions` ve `decision_surface` DB'den okunur
- [x] `admin_panel/types.ts` → `ScanDetail`, `Product` tip güncelleme
- [x] `ProductsPanel.tsx` → karar kartı görünümü
- [x] `ScansPanel.tsx` → AL/TAKİP ET/UZAK DUR gruplama

---

## 4. Yeni Önceliklendirilmiş Sprint Checklist

### P0 - Hemen Düzeltilmesi Gerekenler

- [x] Keepa Trend boş mesajını açıklayıcı hale getir.
- [x] Products sayfasında Keepa durumunu scan bazlı göster:
  - snapshot var/yok
  - queue pending
  - işlenen ASIN
  - atlanan ASIN
  - token limiti
- [x] `Marka tahmini` ifadesini gerçek satıcıdan görsel olarak ayır.
- [x] Satıcı verisi eksikse confidence/reason içinde belirt.
- [x] Products sayfasında aksiyon alınabilir kayıtları varsayılan öne çıkar.
- [x] **[Claude Code]** `GET /api/scans/[jobId]/keepa/status` endpoint'i: `amazon_keepa_snapshots` aggregat — işlenen/atlanan ASIN sayısı, son Keepa tarihi.

### P1 - Decision Surface Çekirdeği

- [x] **[Önce Claude Code]** SKU-level signal modeli ve `data_quality` nesne yapısını belgele → Codex'e ilet.
- [x] Backend'de scan-level `decision_surface` objesi üret.
- [x] Backend'de SKU-level `sku_decisions` objesi üret (kural tabanlı).
- [x] Her SKU için kısa reasoning üret (`price_status`, `seller_status`, `review_tier`, `keepa_status` sinyallerinden).
- [x] Reasoning kurallarını ticari cümlelere dönüştür.
- [x] `confidence.calculator.ts` → `qualityFactors` desteği ekle.
- [x] `data_quality` objesi üret ve JSON'a ekle.
- [x] UI'da karar kartı görünümü ekle:
  - karar
  - confidence
  - kısa reason
  - veri eksikleri
  - detay linki
- [x] `AL / TAKİP ET / UZAK DUR` aksiyonlarını ana görünüm yap.
- [x] `persuasion_points` scan detay sayfasında göster.
- [x] `MIXED_SIGNAL` tutarsızlığını gider.

### P2 - Enrichment ve Veri Kalitesi

- [x] Seller enrichment stratejisini seç.
- [x] Keepa enrichment sonuçlarını scan detayına bağla.
- [x] Product/detail scraping maliyetini token/istek bazında dokümante et.
- [x] `confidence_blockers` listesi `data_quality` objesine dahil et:
  - `has_price_data`
  - `seller_coverage` (oran)
  - `has_keepa_snapshot`
  - `data_points`
  - `confidence_blockers`
- [x] Yetersiz veri kararlarında reason listesi zorunlu hale getirildi; `insufficient_data_reason`, `confidence_blockers` ve `top_reasons` gösteriliyor.

### P3 - JSON ve Dokümantasyon

- [x] Yeni decision-surface JSON kontratı dokümante et.
- [x] Dokümantasyon sayfasına kullanıcı geri bildirimlerini ve mimari cevabı ekle.
- [x] Skor/reason/confidence örneklerini canlı keywordlerden üret.
- [x] API response örneklerini güncelle.
- [x] Yazılımcı notları bölümüne bu geri bildirim kayıt mantığı eklendi; kullanıcı notları DB'de saklanıyor.

---

## 5. Kabul Kriterleri

Bir sonraki sürüm aşağıdaki kriterleri karşılamalı:

- [x] Operatör Products sayfasına girdiğinde 5 saniye içinde ana kararı görebilmeli.
- [x] Her kararın kısa reason açıklaması olmalı.
- [x] Düşük confidence sonuçlar saklanmamalı; açıkça "veri eksik" olarak ayrılmalı.
- [x] Keepa yoksa sistem neden yok olduğunu söylemeli.
- [x] Gerçek satıcı yoksa "marka tahmini" gerçek seller gibi kullanılmamalı.
- [x] JSON çıktısı sade ve tekrar kullanılabilir olmalı.
- [x] UI düşük değerli/noisy kayıtları öne çıkarmamalı.
- [x] **[Claude Code]** Confidence, sadece ürün sayısına değil veri kalitesine (seller coverage, fiyat) göre hesaplanmalı.
- [x] **[Claude Code]** Her scan'in `data_quality` nesnesi mevcut ve UI'da okunabilir.
- [x] **[Claude Code]** `persuasion_points` UI'da görünür — ScansPanel seçili scan panelinde "Satış Argümanları" olarak listeleniyor.

---

## 6. Mimari Karar

Bu geri bildirimden sonra ürün yönü şu şekilde netleşti:

```text
Amozon = Amazon ürün verisini klasik dashboard gibi listeleyen panel değil,
operatöre hızlı ve açıklanabilir AL / TAKİP ET / UZAK DUR kararı verdiren
ticari risk karar yüzeyidir.
```

Bu nedenle sıradaki geliştirmeler grafik artırmak yerine:

- reasoning clarity,
- confidence realism (veri kalitesi bazlı),
- noise reduction,
- sade JSON kontratı (tip → schema → servis → UI sırasıyla),
- karar yüzeyi UX'i

üzerinden ilerlemelidir.

**Kritik sıra kısıtı (Claude Code eklemesi):**
Tip (`amazon.types.ts`) → Schema (`021_amazon_scoring_schema.sql`) → Servis (`risk-report.service.ts`) → Engine (`amazon.scoring-engine.ts`) → UI (`ProductsPanel.tsx`)
Bu sıraya uymayan Codex görevi risk üretir.

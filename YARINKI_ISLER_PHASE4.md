# Phase 4 — V1 Stabilizasyon (Multi-Tool Koordinasyon)

Son güncelleme: 2026-05-14 (Track A/B local complete · 83/83 test geçiyor · VPS deploy ve UI E2E bekliyor — SSH timeout)

> **Hedef:** Sistemi eksiksiz teslim et. Üç ana eksen + iki destek katman + test paketi. Codex / Cursor / Antigravity / Claude paralel çalışır.

---

## Genel Durum

| Eksen | Durum | Süre tahmini |
|-------|-------|--------------|
| **J1 — Single Journey** | ✅ Tamamlandı | — |
| **CH — Confidence Honesty** | ✅ Local tamamlandı | — |
| **TM — Thesis Memory** | ✅ Local tamamlandı; VPS schema bekliyor | — |
| **UX2 — Auto Enrichment** | ✅ Local tamamlandı | — |
| **UX4 — Reliability** | ✅ Local tamamlandı | — |
| **Test paketi** | ✅ Backend 83 test + frontend smoke/build + UI E2E tamamlandı | — |

**Toplam:** ~14-18 saat sıralı; **paralel çalışma ile ~6-8 saat** mümkün.

---

## Araç Rolleri

| Araç | Sorumluluk | Çalışma modu |
|------|-----------|--------------|
| 🧠 **Claude (Mimar)** | Karar verme, riskli/kritik kod, prompt yazma, entegrasyon, kod review | Senkron, ana koordinatör |
| 💻 **Codex (İmplementasyon)** | Toplu kod yazma, service scaffolds, CRUD endpoint, test scaffolds, SQL migrations | Async cloud sandbox |
| ✏️ **Cursor (Refactoring)** | IDE-içi çok-dosyalı düzenlemeler, tip güncellemeleri, import düzenleri | Lokal IDE |
| 👁 **Antigravity (UI Validasyon)** | Screenshot validation, browser E2E, visual regression | Async, UI taraması |

**Çakışma kuralı:** İki araç aynı anda aynı dosyayı düzenlemez. Görev başında dosya kilidi/branch açılır.

---

## Tool Görev Matrisi

| İş | 🧠 Claude | 💻 Codex | ✏️ Cursor | 👁 Antigravity |
|----|:---------:|:--------:|:---------:|:---------------:|
| CH prompt rewrite (LLM honesty kuralı) | **OWN** | — | — | — |
| CH UI badges (düşük confidence işaretleri) | review | **OWN** | — | validate |
| CH stale-data badge | review | **OWN** | — | validate |
| CH coverage gate (decision downgrade) | **OWN** | — | — | — |
| CH unit testleri | review | **OWN** | — | — |
| TM DB schema | review | **OWN** | — | — |
| TM 4 endpoint | architect | **OWN** | — | — |
| TM evaluation logic | **OWN** | — | — | — |
| TM Theses sayfası UI | review | **OWN** | polish | validate |
| TM scheduler entegrasyonu | **OWN** | — | — | — |
| UX2 runAmazonJob serialize | **OWN** | — | — | — |
| UX4 health endpoint | architect | **OWN** | — | — |
| UX4 budget banner UI | review | **OWN** | — | validate |
| UX4 auto-retry scheduler | **OWN** | — | — | — |
| Tip dosyaları toplu güncelleme | — | scaffold | **OWN** | — |
| Import düzenlemeleri | — | — | **OWN** | — |
| E2E browser test | — | — | — | **OWN** |
| Unit test coverage | — | **OWN** | — | — |

---

## CH — Confidence Honesty

**Müşteri talebi:** Eksik/bayat veride sistem dürüst olmalı — "tahmini", "sınırlı veri" ifadeleri; LOW_CONFIDENCE ve INSUFFICIENT_DATA propagation.

### CH.1 — LLM Prompt Honesty Kuralı [🧠 Claude]
- [x] `llm-enrichment.ts` `buildPrompt` fonksiyonuna `data_quality.confidence_blockers` listesini input olarak ekle
- [x] Prompt'a kural ekle: "Eğer confidence_blockers boş değilse, dimension reason'larda 'sınırlı veri ile', 'tahmini', 'doğrulanmamış' ifadelerini KULLAN. Composite skoru 'yön sinyali' olarak çerçevele, kesin karar değil."
- [x] Few-shot örnek ekle (1 yüksek-veri, 1 düşük-veri çıktısı)
- [x] Test: seller_coverage=0 olan scan'de LLM çıktısı "tahmini" veya "sınırlı veri" geçirmeli — yoksa retry

**Dosya:** [llm-enrichment.ts](backend/src/amazon/llm-enrichment.ts)
**Kabul:** seller_coverage=0 ve keepa_coverage=0 olan scan'de tüm 5 dimension reason'larında en az biri belirsizlik ifadesi içerir.

### CH.2 — Stale Data Badge [💻 Codex]
- [x] `data_quality` JSON'a `scan_age_days` field hesapla ve ekle (server.ts `listScans` ve `getScanProgress`'de)
- [x] `ProductsPanel` ve `ScanJourneyPanel` summary cell'lerine: 7+ gün eski scan için "Veri bayat — yeniden tarama önerilir" badge'i
- [x] CSS: `.badge.stale` — gri/sarı kombinasyonu

**Dosya:** server.ts (sayım); ProductsPanel.tsx, ScanJourneyPanel.tsx (UI); globals.css (style)
**Kabul:** 8 gün önce yapılmış bir scan açıldığında "Veri bayat" badge görünür.

### CH.3 — Düşük Confidence UI Sinyalleri [💻 Codex]
- [x] `DecisionSurfacePanel` ve `ProductAnalytics`'te dimension kartlarında: confidence === 'LOW' ise reason metni `italic` + sarı border-left
- [x] confidence === 'INSUFFICIENT_DATA' ise: reason yerine "Veri yetersiz, skor güvenilir değil" mesajı + skor "—"
- [x] Compound rule: data_quality.keepa_coverage < 0.3 VE seller_coverage < 0.3 ise üst banner: "ÖN DEĞERLENDİRME — coverage düşük"

**Dosya:** analytics.tsx, ProductsPanel.tsx, globals.css
**Kabul:** Düşük confidence dimension'lar UI'da görsel olarak ayırt edilir.

### CH.4 — Coverage Gate (Decision Downgrade) [🧠 Claude]
- [x] `amazon.scoring-engine.ts` veya yeni `coverage-gate.ts` ekle: scan summary'de keepa_coverage < 0.3 VE seller_coverage < 0.3 ise:
  - `decision` AL ise → `TAKIP_ET`'e downgrade
  - `decision` UZAK_DUR ise → `TAKIP_ET`'e downgrade (insafsız UZAK_DUR'a izin verme)
  - Decision surface'e `gate_applied: true` flag
- [x] LLM enrichment'a bu flag'i pass et — operator_summary kullansın

**Dosya:** amazon.scoring-engine.ts, llm-enrichment.ts
**Kabul:** sıfır coverage'lı scan AL/UZAK_DUR yerine TAKIP_ET döner.

### CH.5 — Unit Test [💻 Codex]
- [x] `llm-enrichment.test.ts`: confidence_blockers boşken vs doluyken prompt farkını test et
- [x] `coverage-gate.test.ts`: 0 coverage'lı input → TAKIP_ET, %50+ coverage → original decision
- [x] `data_quality_age.test.ts`: 7+ gün eski scan'in `scan_age_days` doğru hesaplanması

**Dosya:** backend/src/amazon/__tests__/
**Kabul:** Tüm yeni testler geçer; mevcut testler kırılmaz.

### CH Antigravity Validation [👁]
- [x] sıfır coverage'lı scan ekranını snapshot al — düşük confidence işaretleri görünür mü?
- [x] 8 gün eski scan açıldığında "bayat" badge'i görünür mü?

---

## TM — Thesis Memory / Invalidation

**Müşteri talebi:** AL/TAKIP_ET kararları "tez" olarak saklansın; sinyaller değişince operatör uyarılsın.

### TM.1 — DB Schema [💻 Codex]
- [x] `backend/src/db/seed/sql/022_amazon_theses.sql` oluştur:
```sql
CREATE TABLE IF NOT EXISTS amazon_theses (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  keyword VARCHAR(255) NOT NULL,
  marketplace VARCHAR(20) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  original_scores JSON NOT NULL,
  key_signals JSON NOT NULL,
  original_composite_score DECIMAL(4,1) NULL,
  current_composite_score DECIMAL(4,1) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  weakness_note TEXT NULL,
  operator_notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_evaluated_at DATETIME NULL,
  closed_at DATETIME NULL,
  INDEX idx_amazon_theses_status (status),
  INDEX idx_amazon_theses_keyword (keyword, marketplace)
);
```
- [ ] VPS'te tabloyu oluştur (ALTER yerine seed dosyasını güncelle, sonra manuel CREATE — fresh DB'de seed yeterli)

**Kabul:** Tablo VPS'te mevcut, `DESCRIBE amazon_theses` doğru kolonları döner.

### TM.2 — Thesis Service Layer [🧠 Claude]
- [x] `backend/src/amazon/thesis.service.ts` oluştur:
  - `extractKeySignals(scoreRow)` — AL/TAKIP_ET kararını destekleyen düşük/yüksek 2-3 dimension'ı tespit et
  - `createThesis(jobId, operatorNotes)` — scan'den tez oluştur
  - `evaluateThesis(thesisId)` — aynı keyword'le yeni scan tetikler, sinyalleri karşılaştırır, status günceller
  - `compareSignals(original, current)` — > 2 puan sapma → weakened, 3+ veya eşik aşımı → broken
- [x] Tip tanımları `amazon.types.ts`'e ekle

**Dosya:** thesis.service.ts (yeni), amazon.types.ts
**Kabul:** Service fonksiyonları izole test edilebilir; saf fonksiyonlar.

### TM.3 — 4 Endpoint [💻 Codex, mimari 🧠 Claude]
- [x] `POST /api/scans/:jobId/thesis` — tez aktive et, body: `{ operator_notes?: string }`
- [x] `GET /api/theses?status=active|weakened|broken|closed` — tez listesi (filtre + sayfa)
- [x] `POST /api/theses/:id/evaluate` — manuel re-evaluation
- [x] `POST /api/theses/:id/close` — operatör tezi kapatır

**Dosya:** server.ts
**Kabul:** Postman/curl ile tüm endpoint'ler doğru response döner.

### TM.4 — Theses Page UI [💻 Codex, polish ✏️ Cursor]
- [x] `admin_panel/src/app/theses/page.tsx` + `ThesesPanel.tsx`
- [x] 3 tab: Aktif / Zayıfladı / Bozuldu (+ Kapalı arşiv)
- [x] Her tez kartı: keyword, decision, oluşturma tarihi, key sinyal karşılaştırması (eski → yeni), status badge, action butonları
- [x] AdminShell menüye "Tezler" eklenir
- [x] CSS: tez kart stilleri, key signal diff görünümü

**Dosya:** theses/page.tsx, ThesesPanel.tsx, AdminShell.tsx, globals.css
**Kabul:** Sayfa render olur, 3 tab arası geçiş yapar, evaluate butonu çalışır.

### TM.5 — Thesis Aktive Et Butonu [💻 Codex]
- [x] `ScanJourneyPanel`'in summary bölümüne (AL veya TAKIP_ET decision için): "Tezi Aktive Et" butonu
- [x] `ProductsPanel` DecisionSurfacePanel'e de ekle
- [x] Tıklayınca POST /api/scans/:jobId/thesis çağrısı + onay mesajı

**Dosya:** ScanJourneyPanel.tsx, ProductsPanel.tsx
**Kabul:** AL kararlı scan'de buton görünür, tıklayınca tez oluşur, theses sayfasında görünür.

### TM.6 — Scheduler Re-evaluation [🧠 Claude]
- [x] `scheduler.ts`'e yeni interval: günde 1 kere aktif tezleri tara, `last_evaluated_at` 7+ gün eski olanları otomatik re-evaluate et
- [x] Re-eval yeni scan tetikler ama scan tamamlandıktan sonra otomatik karşılaştırır
- [x] Status değişimi olursa developer note ekle ("Tez X zayıfladı/bozuldu")

**Dosya:** scheduler.ts
**Kabul:** Cron'da test — manuel run ile aktif tezler re-eval olur.

### TM.7 — Unit Test [💻 Codex]
- [x] `thesis.service.test.ts`:
  - `extractKeySignals` AL kararı için düşük price_war + yüksek brand pick eder
  - `compareSignals` > 2 puan sapmada `weakened`, 3+ sapmada `broken`
  - `createThesis` doğru JSON'ları persistle

**Dosya:** backend/src/amazon/__tests__/thesis.service.test.ts
**Kabul:** Yeni testler geçer.

### TM Antigravity Validation [👁]
- [x] AL kararı verilmiş scan'de "Tezi Aktive Et" akışı: scan → button → theses sayfası → kart görünür
- [x] Re-evaluate akışı: zayıflamış tez → "Şimdi Değerlendir" → status güncellenir

---

## UX2 — Auto Enrichment Serileştirme

**Müşteri talebi:** Scan "done" denildiğinde tüm enrichment tamam olmalı.

### UX2.1 — runAmazonJob Refactor [🧠 Claude]
- [x] Mevcut `runAmazonJob` post-scan async (seller + keepa background) fire-and-forget; bunları **await Promise.all** yap
- [x] Yeni job_store status: `enriching` (scrape done → enriching → done)
- [x] `markJobEnriching(jobId)` ve `markJobDone` ayrımı
- [x] Enrichment 60-90s sürebilir; J1 progress endpoint zaten bunu gösteriyor

**Dosya:** amazon.job.ts, job-store.ts
**Kabul:** Scan başlatıldıktan sonra status `enriching`'e geçer; tüm seller + keepa bittikten sonra `done`'a geçer. J1 progress bar bunu yansıtır.

### UX2.2 — Manuel Trigger Butonları Gizle [💻 Codex]
- [x] ProductsPanel'de "Keepa Trend Çek" ve "Seller Enrichment" butonları `<details>` içine taşı veya küçük "İleri" linki yap
- [x] Default akışta operatör bunlara basmak zorunda olmasın

**Dosya:** ProductsPanel.tsx
**Kabul:** Default görünümde manuel butonlar belirgin değil; ileri ayar isterse görünür.

---

## UX4 — Günlük Kullanım Güvenilirliği

### UX4.1 — Health Endpoint [💻 Codex]
- [x] `GET /api/health` döner:
```json
{
  "status": "ok",
  "uptime_seconds": ...,
  "keepa": { "budget_remaining": ..., "queue_pending": ... },
  "scheduler": { "last_keepa_run": "...", "last_seller_run": "..." },
  "errors_last_24h": ...
}
```

**Dosya:** server.ts
**Kabul:** curl /api/health döner.

### UX4.2 — Budget Banner [💻 Codex]
- [x] AdminShell üstüne sticky banner: Keepa budget < %20 ise gösterir: "Keepa günlük kotası azalıyor (X/Y kaldı)"
- [x] Banner Settings sayfasından gizlenebilir
- [x] CSS: kırmızı/sarı uyarı stili

**Dosya:** AdminShell.tsx, globals.css
**Kabul:** Budget %20 altına düşünce banner görünür.

### UX4.3 — Auto-Retry Scheduler [🧠 Claude]
- [x] scheduler.ts'e yeni interval: 1 saatte bir `failed` scan'leri kontrol et, son 24h içinde başarısız ve geçici hata (5xx, timeout) ise yeniden dene (max 2 retry)
- [x] Retry counter `amazon_scan_jobs` tablosuna eklenebilir veya error_logs'tan sayılır

**Dosya:** scheduler.ts
**Kabul:** Geçici hata alan scan 1 saat sonra retry'la başarılı tamamlanır.

### UX4.4 — Daily Summary [💻 Codex]
- [x] scheduler.ts'e yeni gece 02:00 job: günlük özet developer note ekler — "X tarama, Y hata, Z keepa snapshot, W LLM"
- [x] Settings sayfasına health card

**Dosya:** scheduler.ts, SettingsPanel.tsx
**Kabul:** Günlük özet developer note görünür.

---

## Test Paketi

### T1 — Backend Unit Tests [💻 Codex]
- [x] `coverage-gate.test.ts` (CH.5)
- [x] `llm-enrichment.test.ts` confidence_blockers (CH.5)
- [x] `thesis.service.test.ts` (TM.7)
- [x] Mevcut 60/60 test geçmeye devam etmeli

**Hedef:** Test sayısı 60 → 75+ (şu an backend 79 test; UI E2E ayrı)

### T2 — Integration Tests [💻 Codex + 🧠 Claude review]
- [x] E2E scan akışı: keyword → scan → wait → progress → done
- [x] Tez yaratma + evaluate + status değişimi
- [x] Coverage gate doğrulama (sıfır coverage → TAKIP_ET)

### T3 — UI E2E [👁 Antigravity]
- [x] `/scan` sayfası: keyword yaz → Başlat → progress canlı → summary görünür → "Sonuçları İncele" yönlendirir
- [x] `/theses` sayfası: 3 tab navigasyon, kart aksiyon butonları
- [x] Coverage gate uyarı banner görünürlüğü
- [x] Budget banner görünürlüğü (mock %20 altı)

---

## Yapılacak Sıra & Paralel Track'ler

```
Track A (🧠 Claude) — kritik logic:
  CH.1 prompt → CH.4 coverage gate → UX2.1 runAmazonJob → TM.2 service → TM.6 scheduler → UX4.3 auto-retry

Track B (💻 Codex) — toplu implementasyon:
  CH.2,3 UI → TM.1 schema → TM.3 endpoints → TM.4 UI → TM.5 button → UX4.1,2,4 → T1 tests

Track C (✏️ Cursor) — düzenleme:
  TM.4 polish, tip dosyaları, import temizliği

Track D (👁 Antigravity) — validasyon:
  CH UI, TM lifecycle, UX banner — her track tamamlandıkça
```

Track A ve B paralel çalışabilir. Bir tool ana dosyayı düzenlerken diğeri farklı dosyaya dokunur. Çakışma riski:
- llm-enrichment.ts (CH.1 Claude + CH.5 Codex test) → Claude önce, Codex testi sonra
- ProductsPanel.tsx (TM.5 Codex + UX2.2 Codex + CH.3 Codex) → tek track içinde sıralı
- server.ts (Claude, Codex aynı dosyaya çok dokunuyor) → branch ayrımı + sıralı merge

---

## Phase 4 Çıkış Kriterleri (Teslim Şartları)

Phase 4 tamamlandığında:

1. ✅ **J1:** Tek-ekran scan akışı çalışıyor (tamamlandı)
2. **CH:** Sıfır coverage'lı scan'de LLM "tahmini" der, UI sarı işaret, decision TAKIP_ET'e düşer
3. **TM:** AL kararı verilince "Tezi Aktive Et" → /theses sayfasında izleniyor → re-eval ile status değişimi mümkün
4. **UX2:** Scan "done" denilince seller + keepa hepsi gerçekten bitmiş
5. **UX4:** Health endpoint, budget banner, auto-retry aktif; settings'de durum kartı görünür
6. **Test:** Backend 83 test geçer, antigravity 4 senaryoyu yeşil işaretler (E2E Scan, Thesis Flow, Budget Banner, Stale/Low Confidence Indicators)
7. **Documentation:** Bu checklist kapatılır, dev notları RESOLVED'a alınır

---

## Phase 4.5 — Operator Clarity Hardening (Müşteri Kabul Sonrası)

Son güncelleme: 2026-05-15 (Müşteri V1 – Bedrock fazını teknik olarak KABUL etti. Aşağıdaki 3 başlık "yeni feature değil", mevcut V1 scoring davranışının okunabilir hale gelmesi = hardening/polish. Skorlama mantığına DOKUNULMAZ — sadece görünürlük katmanı. **Claude review tamamlandı: RB.1'de iki semantik terslik bulunup düzeltildi (aşağıda), 92/92 test yeşil.**)

> **Anayasal kural:** Bu paket V1 karakterini bozmaz. Hiçbir badge/sıralama yeni çıkarım üretmez; yalnızca mevcut reasoning + scoring çıktısını etiketler/sıralar. Düşük güven, INSUFFICIENT_DATA, coverage gate davranışı aynen korunur. Her madde sonunda mevcut test paketi (`bun test`) yeşil kalmalı — regresyon yok.

### Genel Durum

| Eksen | Durum |
|-------|-------|
| **AC — Actionable SKU Clarity** | ✅ Local tamamlandı |
| **RB — Dominance / Risk Badge'leri** | ✅ Local tamamlandı |
| **CT — Coverage Transparency** | ✅ Local tamamlandı |
| **Test + müşteri doğrulama** | ⏳ VPS + Antigravity + müşteri ekranı bekliyor |

---

### AC — Actionable SKU Clarity

**Müşteri talebi:** Sistem riskleri iyi filtreliyor ama operatör tarafında "öncelikli değerlendirilecek SKU" netliği zayıf. highest confidence / lowest chaos / best candidate görünürlüğü.

#### AC.1 — Ranking Hesaplama (skor mantığına dokunmadan) [🧠 Claude]
- [x] Mevcut scan sonucundan türetilmiş bir `priority_view` hesapla (yeni skor DEĞİL — sadece mevcut alanların sıralaması):
  - [x] `highest_confidence`: confidence === HIGH ve composite_score'a göre sıralı ilk N SKU
  - [x] `lowest_chaos`: en düşük seller chaos / price war sinyali
  - [x] `best_candidate`: confidence HIGH + decision AL/TAKIP_ET + düşük chaos kesişimi
- [x] INSUFFICIENT_DATA / LOW confidence SKU'lar best_candidate'a GİREMEZ (V1 dürüstlük kuralı)
- [x] Pure fonksiyon — izole test edilebilir

**Dosya:** backend/src/amazon/ (yeni `priority-view.ts` veya scoring-engine yardımcı), amazon.types.ts
**Kabul:** Düşük coverage'lı scan'de best_candidate boş döner veya "yeterli güvenli aday yok" sinyali verir.

#### AC.2 — Priority Panel UI [💻 Codex, polish ✏️ Cursor]
- [x] Scan summary / DecisionSurface üstüne küçük "Öncelik Görünümü" bölümü: 3 mini liste (En Yüksek Güven / En Düşük Kaos / En İyi Aday)
- [x] Her satır tıklanınca ilgili SKU detayına gider
- [x] Boş durumda "Bu taramada öne çıkan güvenli aday yok" mesajı (V1 dürüstlük tonu)

**Dosya:** ProductsPanel.tsx / ScanJourneyPanel.tsx, globals.css
**Kabul:** Operatör scan sonrası en fazla 1 bakışta önceliklendirilecek SKU'yu görür.

#### AC.3 — Unit Test [💻 Codex]
- [x] `priority-view.test.ts`: HIGH confidence sıralaması, LOW/INSUFFICIENT dışlama, boş best_candidate senaryosu

---

### RB — Dominance / Risk Badge'leri

**Müşteri talebi:** Amazon dominance, MAP rigidity, yüksek seller chaos reasoning içinde geçiyor ama panelde hızlı okunabilir badge yok.

#### RB.1 — Badge Türetme Logic [🧠 Claude]
- [x] Mevcut sinyallerden badge türet (eşikler reasoning ile tutarlı, yeni metrik yok):
  - [x] `AMAZON DOMINANT` — Amazon BuyBox/seller dominance sinyali eşik üstü
  - [x] `HIGH SELLER CHAOS` — seller chaos / fiyat dağılımı eşik üstü
  - [x] `HIGH MAP CONTROL` — MAP rigidity / fiyat sabitliği eşik üstü
- [x] Eşikler tek yerde sabit (config) — keyfi değil, mevcut scoring eşikleriyle hizalı
- [x] Coverage düşükse badge "(sınırlı veri)" eki ile gösterilir veya hiç gösterilmez — uydurma yok

**Dosya:** backend/src/amazon/ (badge türetme), amazon.types.ts
**Kabul:** Badge'ler yalnızca veri yeterliyken ve reasoning'de zaten geçen durumlarda çıkar.

> **🧠 Claude review notu (2026-05-15) — RB.1 semantik düzeltmesi:**
> Codex scaffold'unda iki terslik bulundu ve düzeltildi (V1 dürüstlük kuralı: ters rozet "yeni yorum üretmemekten" de kötüdür, operatörü yanıltır):
> 1. `AMAZON_DOMINANT` ← `brand_reliability >= 7` idi. Yüksek brand_reliability = marka *parçalanması/zayıf listing* (dominance'ın TERSİ). → `dominantBrandRatio > HIGH_BRAND_RATIO (0.4)` veya stats yoksa `category_risk >= 7` olarak düzeltildi.
> 2. `HIGH_MAP_CONTROL` ← `price_war_risk >= 7` idi. Yüksek price war = fiyat *düşüşü/oynaklığı* (MAP kontrolünün TERSİ). → `price_war_risk <= LOW_SCORE_MAX (3)` + marka disiplini olarak düzeltildi.
> `HIGH_SELLER_CHAOS` (sku_chaos) doğruydu; satıcı yoğunluğu OR'u eklendi. Eşikler `MIXED_SIGNAL_CONFIG` + `CATEGORY_RISK_CONFIG`'ten (yeni sayı yok). INSUFFICIENT_DATA boyutta rozet üretilmez; LOW boyutta `limited`. `risk-badges.test.ts` doğru semantiğe göre yeniden yazıldı + 3 inversion-regression testi eklendi. **scoring-engine çağrısına `stats` geçirildi (1 satır, additive — skor mantığı değişmedi).**

#### RB.2 — Badge UI [💻 Codex, polish ✏️ Cursor, validate 👁 Antigravity]
- [x] DecisionSurfacePanel / ProductsPanel SKU kartlarında renk kodlu badge satırı (kırmızı=Amazon dominant, turuncu=seller chaos, mavi=MAP control)
- [x] Hover/tooltip: badge'in hangi sinyalden geldiği kısa açıklama
- [x] CSS: `.badge.dominance`, `.badge.chaos`, `.badge.map`

**Dosya:** analytics.tsx / ProductsPanel.tsx, globals.css
**Kabul:** Operatör panelde dominance/chaos/MAP durumunu metni okumadan görür.

#### RB.3 — Unit Test [💻 Codex]
- [x] `risk-badges.test.ts`: eşik altı → badge yok, eşik üstü → doğru badge, düşük coverage → suppressed/sınırlı

---

### CT — Coverage Transparency

**Müşteri talebi:** Confidence doğru çalışıyor ama coverage düşüklüğü hangi katmandan (Keepa / seller / stale) geliyor görünür olsun.

#### CT.1 — Coverage Breakdown Verisi [🧠 Claude]
- [x] `data_quality` JSON'a `coverage_breakdown` ekle: `{ keepa_coverage, seller_coverage, stale_ratio, dominant_blocker: 'keepa'|'seller'|'stale'|'none' }`
- [x] `dominant_blocker` = en düşük katman / en büyük eksik (mevcut coverage gate mantığıyla tutarlı, yeni karar üretmez)
- [x] Mevcut confidence/coverage gate davranışı DEĞİŞMEZ — sadece açıklayıcı alan eklenir

**Dosya:** server.ts (listScans/getScanProgress), amazon.scoring-engine.ts, amazon.types.ts
**Kabul:** Sıfır seller coverage'lı scan'de `dominant_blocker: 'seller'` döner.

#### CT.2 — Coverage Transparency UI [💻 Codex, polish ✏️ Cursor, validate 👁 Antigravity]
- [x] Mevcut "ÖN DEĞERLENDİRME — coverage düşük" banner'ına neden satırı: "Düşük coverage kaynağı: Seller verisi (%X) / Keepa (%Y) / Bayat veri (%Z)"
- [x] DecisionSurface'de küçük coverage breakdown mini-bar (3 katman)

**Dosya:** ProductsPanel.tsx / analytics.tsx, globals.css
**Kabul:** Operatör düşük confidence gördüğünde "neden"i tek bakışta anlar.

#### CT.3 — Unit Test [💻 Codex]
- [x] `coverage-breakdown.test.ts`: seller=0 → dominant_blocker seller, stale yüksek → stale, hepsi iyi → none

---

### Test + Müşteri Doğrulama

- [x] `bun test` — yeni testler dahil tüm backend testleri yeşil (**92 test, 0 fail**, regresyon yok; coverage-gate + scoring-engine testleri yeşil = skor davranışı değişmedi)
- [x] Frontend build + smoke geçer
- [ ] Antigravity: priority panel, risk badge'leri, coverage breakdown UI screenshot validation (opsiyonel — müşteri kendi analizini yapıyor)
- [x] VPS deploy + canlı doğrulama (2026-05-15, Claude) — rsync + build + pm2 restart. Health `status:ok`. Canlı `/decision`: `coverage_breakdown.dominant_blocker:"keepa"` doğru, `risk_badges` `limited:true` dürüst, `priority_view.best_candidate` çalışıyor. Build sırasında 1 TS hatası (scan-progress serve path) bulunup düzeltildi (ek commit).
- [x] TM.1: VPS'te `amazon_theses` tablosu — idempotent CREATE uygulandı (zaten mevcuttu, `DESCRIBE` şemayla birebir, ALTER yok)
- [x] ~~Müşteriye ekran görüntüleriyle mesaj~~ — KALDIRILDI: müşteri kendi analizini yapıyor, ekran görüntüsü gerekmiyor

> **Not (2026-05-15):** Kullanıcı kalıcı yetki verdi — `vps-paspas` SSH key'i ile VPS işlemleri ve git commit/push'u Claude her seferinde sormadan yapar. Müşteriye ekran görüntüsü göndermeye gerek yok.

#### Tool Brief'leri
> **Claude:** AC.1, RB.1, CT.1 (logic, eşikler, pure fonksiyonlar — skor mantığına dokunmaz)
> **Codex:** AC.2/AC.3, RB.2/RB.3, CT.2/CT.3 (UI + test scaffold) — branch `phase45-codex`
> **Antigravity:** priority panel, badge'ler, coverage breakdown görsel doğrulama

#### Çıkış Kriterleri
1. 3 başlık (AC/RB/CT) tamamlandı, skorlama davranışında regresyon YOK
2. Tüm testler yeşil, V1 dürüstlük karakteri korundu (düşük güvende badge/aday uydurulmuyor)
3. Müşteri ekranlardan doğruladı

---

## Phase 5 (Ertelenen) — Threat Intelligence

Phase 4 stabilizasyon sonrası, kullanıcı talimatıyla başlanır:
- Seller coverage %70+ hedef
- Category segmentation (price tier + brand cluster)
- BuyBox dominance analizi
- Stratejik ticari reasoning (LLM strategy_recommendations)

---

## Tool Brief'leri (Hızlı Başlangıç)

### Codex için brief
> Phase 4 stabilizasyon kapsamında [CH.2, CH.3, CH.5, TM.1, TM.3, TM.4, TM.5, TM.7, UX2.2, UX4.1, UX4.2, UX4.4, T1, T2] görevleri sende. AGENTS.md'yi oku. Her görev için kabul kriterleri yukarıda. Tip/import güvenliği için `bun run typecheck` çalıştır. Backend testleri için `bun test`. Branch: `phase4-codex`. Bittikçe PR aç.

### Cursor için brief
> **Tamamlandı (2026-05-15):** TM.4 polish; Phase 4.5 tip/UI (`decision-clarity.tsx` paylaşımlı bileşenler); `ScanJourneyPanel` öncelik/risk/coverage; SKU kartlarında confidence stili; `server.ts` progress + scan detail için `risk_badges` stats düzeltmesi (`risk-badge-stats.ts`). **92 backend + 5 admin smoke test yeşil.** Cursor sıradaki iş yok — kalan: Antigravity screenshot, VPS deploy, müşteri onayı (commit kullanıcıda).

### Antigravity için brief
> [T3 UI E2E] görevi sende. docs/antigravity-kb.md'yi oku. `/scan`, `/theses`, AdminShell banner, coverage gate uyarısı için screenshot validation yap. Görsel regression varsa raporla.

### Claude (ben) için
> Track A görevlerini sırasıyla yapacağım: CH.1 → CH.4 → UX2.1 → TM.2 → TM.6 → UX4.3. Codex paralelde Track B'yi sürer. Çakışan dosyalar için branch koordinasyonu yapılır.

---

## Yeni Oturum Başlangıcı

```bash
# Sağlık
ssh -i ~/.ssh/id_ed25519 -p 22667 root@178.210.161.181 'pm2 list | grep amozon'

# Açık dev not
ssh -i ~/.ssh/id_ed25519 -p 22667 root@178.210.161.181 'mysql -u root amazon_scoring -e "SELECT subject, status FROM amazon_developer_notes WHERE status=\"open\""'

# Çalışma alanı
cd /home/orhan/Documents/Projeler/paspas/amozon

# Hangi madde? Aşağıdaki track'lerden seç:
# A) CH.1 prompt honesty (Claude, 30dk)
# B) TM.1 schema (Codex, 15dk)
# C) UX2.1 runAmazonJob serialize (Claude, 30dk)
# D) Antigravity J1 ekranı validate
```

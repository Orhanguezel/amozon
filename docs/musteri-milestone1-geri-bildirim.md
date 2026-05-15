# Müşteri Geri Bildirimi — Milestone 1 Kapanış

**Tarih:** 2026-05-13  
**Kaynak:** Ürün müşterisi (panel.avrasyaotomotiv.net/amozon)  
**Durum:** Milestone 1 kapanmadı — 5 revizyon gerekiyor

---

## Olumlu Notlar

- Görsel kurgu, modüler yapı, dokümantasyon yaklaşımı uyumlu
- Ayarlar, operasyon rehberi, yazılımcı notları beğenildi
- Explainable scoring yaklaşımı SaaS mimarisine yakın bulundu

---

## Revizyon Gereksinimleri (Milestone 1 Blokeri)

### 1. Keepa Data Integrity
- Keepa temporal verisi (seller history, price volatility, buy box hareketi) skora etki etmiyor
- Risk motoru canlı Keepa verisiyle doğrulanmadan onaylanamaz
- **Beklenti:** Keepa verisi sisteme entegre, skorlamaya etkisi görünür olmalı

### 2. Reasoning Depth / Confidence Logic
- Mevcut reasoning alanları template/if-else seviyesinde
- **Beklenti:** 5 boyutun (kategori riski, SKU karmaşası, marka güveni, operasyon riski, fiyat baskısı) sentezlenmiş ticari yorumunu üreten karar motoru

### 3. Brand Verification
- Ürün başlığından marka tahmini yaklaşımı operasyonel risk oluşturuyor
- **Beklenti:** Doğrulanmış veri veya `confidence: unavailable` — tahmin marka olarak sunulmamalı

### 4. Noise Reduction / Actionable Filtering
- Verisi eksik ürünler operatör ekranına yoğun düşüyor
- **Beklenti:** Eksik analizli ürünler otomatik filtrelenmeli veya ayrı confidence katmanında değerlendirilmeli

### 5. Decision Layer Evolution
- Sistem "güçlü dashboard" ile "gerçek decision engine" arasında duruyor
- **Beklenti:** Volatility, historical behavior, brand discipline katmanları eklenmeli

---

## Genel Değerlendirme

> "Kaporta ve ürünleşme hissi güçlü. Şimdi aynı kaliteyi intelligence layer tarafında görmek istiyoruz."

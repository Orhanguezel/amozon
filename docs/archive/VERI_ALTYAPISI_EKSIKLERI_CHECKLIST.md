# Amozon Veri Altyapısı Eksik Kapatma Checklist

Tarih: 11.05.2026

Kaynak: Kullanıcının paylaştığı ilan metinleri ve Claude JSON değerlendirmesi.

## 1. JSON Karar Kontratı

- [x] `decision` ile `primary_action` karışıklığı giderilecek.
- [x] Dış JSON çıktısında eski motor kararı `legacy_decision`, operatör kararı `primary_action` olarak ayrılacak.
- [x] `GIRME -> UZAK_DUR`, `DIKKATLI_OL -> TAKIP_ET`, `GUVENLI -> AL` eşlemesi açık yazılacak.
- [x] `GET /amozon/api/scans/{jobId}/decision-json` AI/entegrasyon için sade, tutarlı ve okunabilir kontrat döndürecek.

## 2. Veri Kalitesi ve Yayına Alma Gate'i

- [x] `data_gate` alanı eklenecek.
- [x] `seller_coverage` düşükse sonuç `READY` gibi gösterilmeyecek; `ENRICHMENT_REQUIRED` olarak işaretlenecek.
- [x] Veri noktası yetersizse `INSUFFICIENT_DATA` gate'i üretilecek.
- [x] Fiyat kapsaması düşükse enrichment/retry önerisi üretilecek.
- [x] Gate mesajı Türkçe ve operatörün anlayacağı kısa açıklama olacak.

## 3. SKU Aksiyon Dağılımı

- [x] Scan bazında `AL / TAKIP_ET / UZAK_DUR` adetleri hesaplanacak.
- [x] Tüm SKU'lar aynı aksiyona düşerse `single_action_warning` üretilecek.
- [x] JSON çıktısında aksiyon dağılımı üst seviyede görünecek.
- [x] Products panelinde aksiyon dağılımı karar yüzeyinde gösterilecek.

## 4. Satıcı Verisi Eksikleri

- [x] Satıcı bilgisi olmayan SKU oranı hem `data_quality` hem `data_gate` içinde görünür olacak.
- [x] Satıcı kapsaması düşük olduğunda karar güveni ve operatör mesajı bu durumu açık söyleyecek.
- [x] Satıcı verisi eksik SKU'lar `sku_decisions[].reasons` içinde ticari gerekçeyle açıklanacak.
- [x] Gelecek faz için seller detail enrichment notu dokümantasyona eklenecek.

## 5. Keepa / Buy Box / Trend Eksikleri

- [x] Keepa trend alanı mevcut snapshotlardan 30g min, 90g ortalama, 30g max gösterimini sürdürecek.
- [x] Buy Box ve seller trend alanları boşsa bunun veri eksikliği olduğu JSON/dokümantasyonda açıklanacak.
- [x] Keepa kapsaması düşükse `data_gate` içinde enrichment önerisi görünecek.
- [x] Gerçek fiyat geçmişi/buy box/seller trend için Keepa ürün verisi genişletme işi gelecek faz notu olarak işaretlenecek.

## 6. Operatör Paneli

- [x] Decision surface kartında data gate durumu gösterilecek.
- [x] Decision surface kartında aksiyon dağılımı gösterilecek.
- [x] Ürün tablosu varsayılan olarak kaybolmayacak; filtreler kullanıcı seçimiyle uygulanacak.
- [x] Gürültüyü azaltmak için aksiyon alınabilir SKU listesi korunacak ama ana tablo `Tümü` davranışını sürdürecek.

## 7. Dokümantasyon

- [x] JSON kontratı, `legacy_decision` ve `primary_action` ayrımı dokümantasyona eklenecek.
- [x] Skor/karar/gate alanlarının anlamı Türkçe açıklanacak.
- [x] Veri altyapısı ilanındaki ağır maddeler için mevcut durum ve gelecek faz notu eklenecek.

## 8. Claude İkinci Değerlendirme Düzeltmeleri

- [x] Dış JSON çıktısında sayısal skorlar string yerine number/null olarak normalize edilecek.
- [x] `brand_reliability.confidence`, `seller_coverage=0` olduğunda `LOW` seviyesine düşürülecek.
- [x] `brand_reliability.reason`, satıcı verisi yoksa bunun başlık tokenı/listing tahmini olduğunu açık söyleyecek.
- [x] Marketplace para birimi karışmasın diye amazon.com Keepa fiyatları `com.tr` gibi pazarlarda `price_points` olarak gösterilmeyecek.
- [x] `insufficient_data_reason` boşsa `data_gate` ve `confidence_blockers` üzerinden açıklayıcı fallback üretilecek.
- [x] SKU aksiyon motoru uç fiyat + düşük yorum + zayıf rating gibi sinyallerde `UZAK_DUR` üretecek şekilde ayrıştırılacak.
- [x] REST uyumlu `/api/scans/{jobId}/decision` endpointi eklenecek; `/decision-json` geriye uyumluluk için korunacak.
- [ ] Gerçek marketplace uyumlu Keepa domain seçimi queue/fetch seviyesinde genişletilecek.
- [ ] Buy Box/seller trend gerçek zaman serisi Keepa product payloadından ayrıca modellenip DB'ye yazılacak.

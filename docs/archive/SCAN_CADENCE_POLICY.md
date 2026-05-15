# Amozon Scan Cadence ve Polling Politikası

**Amaç:** Kullanıcı mesajlarında istenen düşük gürültülü, token ekonomisine dikkat eden ve agresif realtime polling yapmayan çalışma ritmini netleştirmek.

## 1. Temel İlke

Amozon MVP yüksek frekanslı veri çekme sistemi değildir. Amaç saniyelik değişimleri yakalamak değil, kategori davranışı ve ticari risk pattern'lerini anlamaktır.

Bu nedenle:

- Gereksiz scan tekrarı yapılmaz.
- Keepa yalnızca belirsiz veya yüksek riskli durumlarda kullanılır.
- Panel polling'i kısa operasyon takibi için kullanılır, sürekli veri toplama yerine geçmez.
- Yetersiz veri durumunda sistem zorla karar üretmez.

## 2. Admin Panel Polling

Mevcut panel davranışı:

- `/scans` sayfası job durumunu 5 saniyede bir yeniler.
- Bu polling sadece job status takibi içindir.
- Amazon/Oxylabs scraping çağrısı polling ile tekrar tetiklenmez.
- Yeni scan yalnızca kullanıcı `Başlat` butonuna bastığında açılır.

## 3. Keyword Scan Cadence Önerisi

MVP için önerilen manuel ritim:

- Aynı keyword için kısa aralıklarla tekrar scan yapılmamalı.
- İlk analizden sonra tekrar scan için önerilen minimum bekleme: 12-24 saat.
- `INSUFFICIENT_DATA` sonuçlarında tekrar deneme yapılabilir, ancak Oxylabs 429 görülürse bekleme artırılmalı.
- Büyük keyword setlerinde batch tarama yapılacaksa küçük gruplar halinde ve aralıklı çalıştırılmalı.

## 4. Keepa Token Ekonomisi

Keepa kullanımı pahalı/veri sınırlı kabul edilir.

Mevcut davranış:

- Günlük token bütçesi `amazon_keepa_daily_budget` tablosunda tutulur.
- ASIN'ler önce `amazon_keepa_queue` tablosuna alınır.
- Bütçe yoksa işleme alınmaz.
- Keepa yalnızca `INSUFFICIENT_DATA` veya yüksek risk sinyali durumunda tetiklenir.

## 5. Noise Reduction

Operatör tarafında gürültüyü azaltmak için:

- `INSUFFICIENT_DATA` ayrı karar olarak gösterilir.
- `MIXED_SIGNAL` sert `GIRME` kararına dönüştürülmez.
- `Al / Takip Et / Uzak Dur` aksiyonu decision'dan türetilir.
- Failed job ve yetersiz veri durumları Scans panelindeki Operasyon Uyarıları içinde özetlenir.

## 6. Sonraki Faz İçin Öneri

İleride otomatik cadence gerekiyorsa ayrı bir scheduler eklenmelidir.

Önerilen scheduler alanları:

- Keyword bazlı minimum tekrar aralığı
- Marketplace bazlı limit
- Oxylabs rate limit backoff
- Keepa token budget backoff
- Son karar stabilitesi
- Son 3 scan trendi

Bu MVP'de otomatik cron/scheduler kapsam dışıdır.

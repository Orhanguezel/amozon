# Amazon Scoring Logic

Amozon karar motoru, satıcı odaklı tek puan yerine kategori ve ürün havuzu odaklı beş bağımsız risk boyutu üretir.

## Güven Katmanı

- `data_points < 10`: `INSUFFICIENT_DATA`, composite karar üretilmez.
- `10-30`: `LOW`, referans amaçlıdır.
- `31-45`: `MEDIUM`, karara dahil edilir.
- `46+`: `HIGH`, karara dahil edilir.

## Boyutlar

- `category_risk`: benzersiz satıcı sayısı, dominant marka oranı ve yüksek review yoğunluğu.
- `sku_chaos`: fiyat min/max aralığı, fiyat sigma değeri ve varyant baskısı.
- `price_war_risk`: sayfa 1 ve sayfa 3 fiyat farkı, düşük fiyat kümesi ve fiyat sigma oranı.
- `brand_reliability`: marka token parçalanması, zayıf listing oranı ve fiyat sapması.
- `operational_risk`: review analyzer problem skoru, kritik şikayet bayrakları ve düşük rating oranı.

## Composite

Varsayılan ağırlıklar:

- `category_risk`: 25%
- `price_war_risk`: 25%
- `sku_chaos`: 20%
- `brand_reliability`: 15%
- `operational_risk`: 15%

Sadece `HIGH` ve `MEDIUM` güvene sahip boyutlar composite skora girer.

## Karar

- `0-3`: `GUVENLI`
- `4-6`: `DIKKATLI_OL`
- `7-10`: `GIRME`
- Tek sinyal yüksek, diğerleri düşükse: `MIXED_SIGNAL`

## False Positive Kontrolü

- `review_count < 10` olan ürünler analiz dışı bırakılır.
- Fiyat verisi yoksa `price_war_risk` karar dışı kalır.
- Tek sayfa sonuçlarda kategori analizi referans kabul edilir.

## Keepa

Keepa pahalı veri kaynağı olduğu için sadece `INSUFFICIENT_DATA` veya yüksek risk (`score > 7`) durumlarında çağrılmalıdır.

### Keepa bütçe ve kuyruk politikası

- Aday ASIN'ler doğrudan API'ye gitmez, önce `amazon_keepa_queue` tablosuna alınır.
- Queue işleyici pending kayıtları FIFO sırada tüketir.
- Günlük token limiti `amazon_keepa_daily_budget` tablosunda izlenir (`token_budget`, `tokens_used`).
- Token kalmadığında kayıtlar queue'da pending kalır, sonraki gün işlenir.
- Başarılı çekimler `amazon_keepa_snapshots` tablosuna yazılır.

## Hata ve Retry İzleme

- Amazon scoring pipeline hataları `amazon_job_error_logs` tablosuna yazılır.
- Her hata kaydında `job_id`, `error_type`, `error_msg`, `retry_count` tutulur.
- `retry_count`, aynı job için biriken hata sayısına göre artar.

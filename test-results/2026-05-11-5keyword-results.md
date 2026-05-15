# 5 Keyword Gerçek Scan Sonuçları

**Tarih:** 11 Mayıs 2026  
**Marketplace:** `amazon.com`  
**Kaynak:** Canlı backend scan kayıtları (`GET /api/scans`)  
**Not:** İlk denemelerde bazı keyword'lerde Oxylabs 429 rate limit hatası alındı. Kısa aralıkla retry yapıldı ve 5 keyword için de sonuç kaydı üretildi.

## Özet Tablo

| Keyword | Son başarılı job id | Status | Data points | Composite | Decision | Not |
|---|---|---:|---:|---:|---|---|
| `thermal labels` | `6b74b04c-1bfa-4c2e-a9e0-eee7df3edb2a` | done | 49 | 5.0 | `DIKKATLI_OL` | Karara esas alınabilir veri üretildi. |
| `dash cam` | `31c177ce-d4b8-45d7-bd42-8094b62027a3` | done | 15 | - | `INSUFFICIENT_DATA` | Veri var ancak karar için yeterli güven oluşmadı. |
| `webcam lighting` | `dd92d977-2055-4804-b172-50a228427428` | done | 18 | - | `INSUFFICIENT_DATA` | Veri var ancak karar için yeterli güven oluşmadı. |
| `cable organizer` | `97d0390f-2830-45ed-badf-bca51211320c` | done | 7 | - | `INSUFFICIENT_DATA` | Yetersiz veri, sistem zorla skor üretmedi. |
| `surge protector` | `a96d0ba1-2238-4629-85d8-52660880879d` | done | 2 | - | `INSUFFICIENT_DATA` | Yetersiz veri, sistem zorla skor üretmedi. |

## Deneme Notları

İlk toplu scan denemesinde aşağıdaki geçici sorunlar görüldü:

- `cable organizer`: `OXYLABS_AMAZON_SEARCH_FAILED_429`
- `webcam lighting`: `OXYLABS_AMAZON_SEARCH_FAILED_429`
- `surge protector`: Keepa queue işleminde MySQL `LIMIT ?` prepared statement uyumsuzluğu

Yapılan düzeltme:

- `backend/src/amazon/keepa.client.ts` içinde `processKeepaQueue()` sorgusundaki `LIMIT ?` kullanımı güvenli sayısal `LIMIT ${safeLimit}` haline getirildi.
- Sonrasında `surge protector`, `cable organizer`, `webcam lighting` için retry çalıştırıldı.
- Retry sonrası bu 3 keyword de `done` durumuna geçti.

## Karar Yorumu

Bu test setinde sistemin önemli davranışı doğrulandı:

- Yeterli veri olduğunda composite skor ve karar üretiyor: `thermal labels`.
- Veri yetersiz olduğunda zorla karar üretmiyor: `dash cam`, `webcam lighting`, `cable organizer`, `surge protector`.
- `INSUFFICIENT_DATA` kararları bug değil; müşteri talebindeki "bilmiyorum diyebilen sistem" davranışıdır.

## Products Sayfası

Bu 5 başarılı scan artık `http://localhost:3096/products` içindeki scan dropdown listesinde seçilebilir.

Dropdown'da geçmiş failed denemeler gösterilmez; sadece `status = done` kayıtlar ürün analizinde kullanılır.

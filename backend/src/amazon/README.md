# Amazon Modülü

Bu klasör Amozon'un scraping ve scoring çekirdeğini taşır.

## Ana Dosyalar

- `amazon.scraper.ts`: Oxylabs Amazon search ve review çağrıları
- `amazon.job.ts`: job orkestrasyonu
- `amazon.scoring-engine.ts`: risk scoring pipeline
- `amazon.types.ts`: rapor ve ürün tipleri
- `keepa.client.ts`: opsiyonel Keepa queue/snapshot akışı
- `risk-report.service.ts`: son risk raporu ve ürün listesi sorguları
- `scorers/`: beş bağımsız risk boyutu
- `__tests__/`: scraper dışındaki scoring/job davranış testleri

## Job Beklentisi

`runAmazonJob(jobId)` doğrudan `amazon_scan_jobs` tablosunu kullanır. Job kaydı yoksa `JOB_NOT_FOUND` hatası verir.

Beklenen minimum kayıt:

```sql
INSERT INTO amazon_scan_jobs (id, keyword, marketplace, status)
VALUES ('job-id', 'thermal labels', 'com', 'pending');
```

Alternatif olarak public helper kullanılabilir:

```ts
import { createJob, runAmazonJob } from '../../index';

const job = await createJob('thermal labels', 'com');
await runAmazonJob(job.id);
```

## Test

```bash
bun test src/amazon/__tests__
bun test src/amazon/__tests__/amazon.job.e2e.test.ts
```

Testler gerçek ağ veya gerçek DB kullanmaz; DB pool ve dış servis çağrıları mocklanır.

import 'dotenv/config';

function parseEnvInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  DB: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseEnvInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? 'app',
    password: process.env.DB_PASSWORD ?? 'app',
    name: process.env.DB_NAME ?? 'amazon_scoring',
  },
  OXYLABS_USERNAME: process.env.OXYLABS_USERNAME || '',
  OXYLABS_PASSWORD: process.env.OXYLABS_PASSWORD || '',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  KEEPA_API_KEY: process.env.KEEPA_API_KEY || '',
  KEEPA_DAILY_TOKEN_BUDGET: parseEnvInt(process.env.KEEPA_DAILY_TOKEN_BUDGET, 1000),
  SCRAPER_SERVICE_URL: process.env.SCRAPER_SERVICE_URL || 'http://localhost:8200',
  SCRAPER_SERVICE_API_KEY: process.env.SCRAPER_SERVICE_API_KEY || '',
  SCRAPER_CALLBACK_SECRET: process.env.SCRAPER_CALLBACK_SECRET || '',
  PORT: parseEnvInt(process.env.PORT, 8186),
  API_SECRET: process.env.API_SECRET || '',
  // OH.1 — Seller enrichment depth/batching (Micro plan maliyeti için kontrollü,
  // tam configurable). Skorlama mantığını DEĞİŞTİRMEZ; sadece veri derinliği.
  SELLER_BATCH_SIZE: parseEnvInt(process.env.SELLER_BATCH_SIZE, 25),
  SELLER_POST_SCAN_BATCH: parseEnvInt(process.env.SELLER_POST_SCAN_BATCH, 25),
  SELLER_TARGET_COVERAGE: parseEnvFloat(process.env.SELLER_TARGET_COVERAGE, 0.5),
  SELLER_MAX_RETRIES: parseEnvInt(process.env.SELLER_MAX_RETRIES, 1),
  THESIS_STALE_DAYS: parseEnvInt(process.env.THESIS_STALE_DAYS, 7),
  // OH.7 — Aynı keyword/marketplace için bu süre içinde tamamlanmış scan varsa
  // yeniden tarama yapmadan cache reuse seçeneği sunulur (kota koruması).
  SCAN_CACHE_TTL_MIN: parseEnvInt(process.env.SCAN_CACHE_TTL_MIN, 360),
};

function parseEnvFloat(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

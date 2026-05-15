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
};

import { sql } from 'drizzle-orm';
import {
  char,
  datetime,
  decimal,
  int,
  json,
  mysqlTable,
  text,
  varchar,
} from 'drizzle-orm/mysql-core';

export const amazonScanJobs = mysqlTable('amazon_scan_jobs', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  keyword: varchar('keyword', { length: 255 }).notNull(),
  marketplace: varchar('marketplace', { length: 20 }).notNull().default('com'),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  data_points: int('data_points').notNull().default(0),
  error_msg: text('error_msg'),
  created_at: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  finished_at: datetime('finished_at'),
});

export const amazonProducts = mysqlTable('amazon_products', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  job_id: char('job_id', { length: 36 }).notNull(),
  title: text('title').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }),
  rating: decimal('rating', { precision: 3, scale: 2 }),
  review_count: int('review_count').notNull().default(0),
  seller_name: varchar('seller_name', { length: 255 }),
  seller_url: varchar('seller_url', { length: 1000 }),
  product_url: varchar('product_url', { length: 1000 }),
  asin: varchar('asin', { length: 20 }),
  created_at: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const amazonCategoryStats = mysqlTable('amazon_category_stats', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  keyword: varchar('keyword', { length: 255 }).notNull(),
  marketplace: varchar('marketplace', { length: 20 }).notNull().default('com'),
  product_count: int('product_count').notNull().default(0),
  price_min: decimal('price_min', { precision: 10, scale: 2 }),
  price_max: decimal('price_max', { precision: 10, scale: 2 }),
  price_median: decimal('price_median', { precision: 10, scale: 2 }),
  price_sigma: decimal('price_sigma', { precision: 10, scale: 2 }),
  seller_count: int('seller_count').notNull().default(0),
  dominant_brand_ratio: decimal('dominant_brand_ratio', { precision: 5, scale: 4 }).notNull().default('0.0000'),
  updated_at: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const amazonRiskScores = mysqlTable('amazon_risk_scores', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  job_id: char('job_id', { length: 36 }).notNull(),
  keyword: varchar('keyword', { length: 255 }).notNull(),
  category_risk_score: decimal('category_risk_score', { precision: 4, scale: 1 }),
  category_risk_confidence: varchar('category_risk_confidence', { length: 30 }),
  category_risk_reason: varchar('category_risk_reason', { length: 500 }),
  sku_chaos_score: decimal('sku_chaos_score', { precision: 4, scale: 1 }),
  sku_chaos_confidence: varchar('sku_chaos_confidence', { length: 30 }),
  sku_chaos_reason: varchar('sku_chaos_reason', { length: 500 }),
  price_war_score: decimal('price_war_score', { precision: 4, scale: 1 }),
  price_war_confidence: varchar('price_war_confidence', { length: 30 }),
  price_war_reason: varchar('price_war_reason', { length: 500 }),
  brand_reliability_score: decimal('brand_reliability_score', { precision: 4, scale: 1 }),
  brand_reliability_confidence: varchar('brand_reliability_confidence', { length: 30 }),
  brand_reliability_reason: varchar('brand_reliability_reason', { length: 500 }),
  operational_risk_score: decimal('operational_risk_score', { precision: 4, scale: 1 }),
  operational_risk_confidence: varchar('operational_risk_confidence', { length: 30 }),
  operational_risk_reason: varchar('operational_risk_reason', { length: 500 }),
  composite_score: decimal('composite_score', { precision: 4, scale: 1 }),
  decision: varchar('decision', { length: 30 }).notNull(),
  summary: text('summary'),
  data_points: int('data_points').notNull().default(0),
  data_quality: json('data_quality'),
  decision_surface: json('decision_surface'),
  sku_decisions: json('sku_decisions'),
  outreach_priority: decimal('outreach_priority', { precision: 3, scale: 1 }),
  persuasion_points: json('persuasion_points'),
  brand_id: varchar('brand_id', { length: 100 }),
  brand_name: varchar('brand_name', { length: 255 }),
  enrichment: json('enrichment'),
  created_at: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const amazonKeepaSnapshots = mysqlTable('amazon_keepa_snapshots', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  asin: varchar('asin', { length: 20 }).notNull(),
  marketplace: varchar('marketplace', { length: 20 }).notNull().default('com'),
  keepa_domain_id: int('keepa_domain_id').notNull().default(1),
  price_30d_min: decimal('price_30d_min', { precision: 10, scale: 2 }),
  price_30d_max: decimal('price_30d_max', { precision: 10, scale: 2 }),
  price_90d_avg: decimal('price_90d_avg', { precision: 10, scale: 2 }),
  buy_box_change_count: int('buy_box_change_count').notNull().default(0),
  seller_count_trend: varchar('seller_count_trend', { length: 30 }),
  stock_history_json: json('stock_history_json'),
  fetched_at: datetime('fetched_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const amazonJobErrorLogs = mysqlTable('amazon_job_error_logs', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  job_id: char('job_id', { length: 36 }).notNull(),
  error_type: varchar('error_type', { length: 100 }).notNull(),
  error_msg: text('error_msg').notNull(),
  retry_count: int('retry_count').notNull().default(1),
  created_at: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const amazonKeepaDailyBudget = mysqlTable('amazon_keepa_daily_budget', {
  budget_date: varchar('budget_date', { length: 10 }).primaryKey().notNull(),
  token_budget: int('token_budget').notNull().default(1000),
  tokens_used: int('tokens_used').notNull().default(0),
  updated_at: datetime('updated_at').notNull().default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

export const amazonKeepaQueue = mysqlTable('amazon_keepa_queue', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  job_id: char('job_id', { length: 36 }).notNull(),
  asin: varchar('asin', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  retry_count: int('retry_count').notNull().default(0),
  last_error: text('last_error'),
  created_at: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  processed_at: datetime('processed_at'),
});

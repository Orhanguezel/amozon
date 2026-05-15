CREATE TABLE IF NOT EXISTS amazon_scan_jobs (
  id CHAR(36) PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL,
  marketplace VARCHAR(20) NOT NULL DEFAULT 'com',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  data_points INT NOT NULL DEFAULT 0,
  error_msg TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  INDEX idx_amazon_scan_jobs_keyword (keyword),
  INDEX idx_amazon_scan_jobs_status (status)
);

CREATE TABLE IF NOT EXISTS amazon_products (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  title TEXT NOT NULL,
  price DECIMAL(10,2) NULL,
  rating DECIMAL(3,2) NULL,
  review_count INT NOT NULL DEFAULT 0,
  brand VARCHAR(255) NULL,
  seller_name VARCHAR(255) NULL,
  seller_url VARCHAR(1000) NULL,
  product_url VARCHAR(1000) NULL,
  asin VARCHAR(20) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_amazon_products_job_id (job_id),
  INDEX idx_amazon_products_asin (asin)
);

CREATE TABLE IF NOT EXISTS amazon_category_stats (
  id CHAR(36) PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL,
  marketplace VARCHAR(20) NOT NULL DEFAULT 'com',
  product_count INT NOT NULL DEFAULT 0,
  price_min DECIMAL(10,2) NULL,
  price_max DECIMAL(10,2) NULL,
  price_median DECIMAL(10,2) NULL,
  price_sigma DECIMAL(10,2) NULL,
  seller_count INT NOT NULL DEFAULT 0,
  dominant_brand_ratio DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_amazon_category_stats_keyword_marketplace (keyword, marketplace)
);

CREATE TABLE IF NOT EXISTS amazon_risk_scores (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  keyword VARCHAR(255) NOT NULL,
  category_risk_score DECIMAL(4,1) NULL,
  category_risk_confidence VARCHAR(30) NULL,
  category_risk_reason VARCHAR(500) NULL,
  sku_chaos_score DECIMAL(4,1) NULL,
  sku_chaos_confidence VARCHAR(30) NULL,
  sku_chaos_reason VARCHAR(500) NULL,
  price_war_score DECIMAL(4,1) NULL,
  price_war_confidence VARCHAR(30) NULL,
  price_war_reason VARCHAR(500) NULL,
  brand_reliability_score DECIMAL(4,1) NULL,
  brand_reliability_confidence VARCHAR(30) NULL,
  brand_reliability_reason VARCHAR(500) NULL,
  operational_risk_score DECIMAL(4,1) NULL,
  operational_risk_confidence VARCHAR(30) NULL,
  operational_risk_reason VARCHAR(500) NULL,
  composite_score DECIMAL(4,1) NULL,
  decision VARCHAR(30) NOT NULL,
  summary TEXT NULL,
  data_points INT NOT NULL DEFAULT 0,
  data_quality JSON NULL,
  decision_surface JSON NULL,
  sku_decisions JSON NULL,
  outreach_priority DECIMAL(3,1) NULL,
  persuasion_points JSON NULL,
  brand_id CHAR(36) NULL,
  brand_name VARCHAR(255) NULL,
  enrichment JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_amazon_risk_scores_job_id (job_id),
  INDEX idx_amazon_risk_scores_keyword_created_at (keyword, created_at)
);

CREATE TABLE IF NOT EXISTS amazon_keepa_snapshots (
  id CHAR(36) PRIMARY KEY,
  asin VARCHAR(20) NOT NULL,
  marketplace VARCHAR(20) NOT NULL DEFAULT 'com',
  keepa_domain_id INT NOT NULL DEFAULT 1,
  price_30d_min DECIMAL(10,2) NULL,
  price_30d_max DECIMAL(10,2) NULL,
  price_90d_avg DECIMAL(10,2) NULL,
  buy_box_change_count INT NOT NULL DEFAULT 0,
  seller_count_trend VARCHAR(30) NULL,
  price_volatility DECIMAL(6,4) NULL,
  offer_count_avg DECIMAL(6,1) NULL,
  offer_count_trend VARCHAR(10) NULL,
  stock_history_json JSON NULL,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_amazon_keepa_snapshots_asin (asin),
  INDEX idx_amazon_keepa_snapshots_asin_marketplace (asin, marketplace),
  INDEX idx_amazon_keepa_snapshots_fetched_at (fetched_at)
);

CREATE TABLE IF NOT EXISTS amazon_job_error_logs (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  error_type VARCHAR(100) NOT NULL,
  error_msg TEXT NOT NULL,
  retry_count INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_amazon_job_error_logs_job_id_created_at (job_id, created_at)
);

CREATE TABLE IF NOT EXISTS amazon_keepa_daily_budget (
  budget_date DATE PRIMARY KEY,
  token_budget INT NOT NULL DEFAULT 1000,
  tokens_used INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS amazon_keepa_queue (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  asin VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  INDEX idx_amazon_keepa_queue_status_created_at (status, created_at),
  INDEX idx_amazon_keepa_queue_job_id (job_id)
);

CREATE TABLE IF NOT EXISTS amazon_keywords (
  id CHAR(36) PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL,
  marketplace VARCHAR(20) NOT NULL DEFAULT 'com',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_amazon_keywords_keyword_marketplace (keyword, marketplace)
);

INSERT IGNORE INTO amazon_keywords (id, keyword, marketplace) VALUES
  (UUID(), 'thermal labels', 'com'),
  (UUID(), 'cable organizer', 'com'),
  (UUID(), 'surge protector', 'com'),
  (UUID(), 'dash cam', 'com'),
  (UUID(), 'webcam lighting', 'com');

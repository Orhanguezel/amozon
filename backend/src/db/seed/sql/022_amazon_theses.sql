CREATE TABLE IF NOT EXISTS amazon_theses (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  keyword VARCHAR(255) NOT NULL,
  marketplace VARCHAR(20) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  original_scores JSON NOT NULL,
  key_signals JSON NOT NULL,
  original_composite_score DECIMAL(4,1) NULL,
  current_composite_score DECIMAL(4,1) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  weakness_note TEXT NULL,
  operator_notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_evaluated_at DATETIME NULL,
  closed_at DATETIME NULL,
  INDEX idx_amazon_theses_status (status),
  INDEX idx_amazon_theses_keyword (keyword, marketplace)
);

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from './db/client';
import { env } from './core/env';

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const schemaDir = join(process.cwd(), 'src/db/seed/sql');
  const schemaFiles = (await readdir(schemaDir))
    .filter((fileName) => /^\d+_.*\.sql$/.test(fileName))
    .sort();
  let appliedStatements = 0;

  for (const fileName of schemaFiles) {
    const sql = await readFile(join(schemaDir, fileName), 'utf8');
    const statements = splitSqlStatements(sql);
    for (const statement of statements) {
      await pool.query(statement);
      appliedStatements += 1;
    }
  }

  await ensureColumn('amazon_risk_scores', 'outreach_priority', 'DECIMAL(3,1) NULL');
  await ensureColumn('amazon_risk_scores', 'persuasion_points', 'JSON NULL');
  await ensureColumn('amazon_risk_scores', 'brand_id', 'CHAR(36) NULL');
  await ensureColumn('amazon_risk_scores', 'brand_name', 'VARCHAR(255) NULL');
  await ensureColumn('amazon_risk_scores', 'enrichment', 'JSON NULL');
  await ensureColumn('amazon_risk_scores', 'data_quality', 'JSON NULL');
  await ensureColumn('amazon_risk_scores', 'decision_surface', 'JSON NULL');
  await ensureColumn('amazon_risk_scores', 'sku_decisions', 'JSON NULL');
  await ensureColumn('amazon_keepa_snapshots', 'marketplace', "VARCHAR(20) NOT NULL DEFAULT 'com'");
  await ensureColumn('amazon_keepa_snapshots', 'keepa_domain_id', 'INT NOT NULL DEFAULT 1');
  await ensureIndex('amazon_keepa_snapshots', 'idx_amazon_keepa_snapshots_asin_marketplace', 'CREATE INDEX idx_amazon_keepa_snapshots_asin_marketplace ON amazon_keepa_snapshots (asin, marketplace)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS amazon_developer_notes (
      id CHAR(36) PRIMARY KEY,
      subject VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      priority VARCHAR(30) NOT NULL DEFAULT 'normal',
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      page_path VARCHAR(500) NULL,
      attachment_url VARCHAR(1000) NULL,
      created_by VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_amazon_developer_notes_status (status),
      INDEX idx_amazon_developer_notes_priority (priority),
      INDEX idx_amazon_developer_notes_page_path (page_path),
      INDEX idx_amazon_developer_notes_created_at (created_at)
    )
  `);

  await pool.end();
  console.log(`Applied Amazon schema: ${appliedStatements} statements from ${schemaFiles.length} files`);
}

async function ensureColumn(tableName: string, columnName: string, definition: string): Promise<void> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [env.DB.name, tableName, columnName],
  );
  const exists = Number((rows as Array<{ count?: number | string }>)[0]?.count ?? 0) > 0;
  if (!exists) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function ensureIndex(tableName: string, indexName: string, createSql: string): Promise<void> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [env.DB.name, tableName, indexName],
  );
  const exists = Number((rows as Array<{ count?: number | string }>)[0]?.count ?? 0) > 0;
  if (!exists) await pool.query(createSql);
}

main().catch(async (error: unknown) => {
  await pool.end().catch(() => undefined);
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  console.error(`Schema apply failed: ${message}`);
  process.exit(1);
});

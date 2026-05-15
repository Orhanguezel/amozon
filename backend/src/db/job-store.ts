import { randomUUID } from 'node:crypto';
import { pool } from '@/db/client';

export interface AmazonJob {
  id: string;
  keyword: string;
  marketplace: string;
  status: string;
  error_msg?: string | null;
}

export async function createJob(keyword: string, marketplace = 'com'): Promise<AmazonJob> {
  const id = randomUUID();
  await pool.execute(
    `INSERT INTO amazon_scan_jobs (id, keyword, marketplace, status) VALUES (?, ?, ?, 'pending')`,
    [id, keyword, marketplace],
  );
  return { id, keyword, marketplace, status: 'pending' };
}

export async function getJob(jobId: string): Promise<AmazonJob | null> {
  const [rows] = await pool.execute(
    `SELECT id, keyword, marketplace, status, error_msg FROM amazon_scan_jobs WHERE id = ? LIMIT 1`,
    [jobId],
  );
  return (rows as AmazonJob[])[0] ?? null;
}

export async function markJobRunning(jobId: string): Promise<void> {
  await pool.execute(
    `UPDATE amazon_scan_jobs SET status = 'running', error_msg = NULL WHERE id = ?`,
    [jobId],
  );
}

export async function markJobEnriching(jobId: string, dataPoints: number): Promise<void> {
  await pool.execute(
    `UPDATE amazon_scan_jobs SET status = 'enriching', data_points = ?, error_msg = NULL WHERE id = ?`,
    [dataPoints, jobId],
  );
}

export async function markJobDone(jobId: string, dataPoints: number): Promise<void> {
  await pool.execute(
    `UPDATE amazon_scan_jobs SET status = 'done', data_points = ?, error_msg = NULL, finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [dataPoints, jobId],
  );
}

export async function markJobFailed(jobId: string, errorMsg: string): Promise<void> {
  await pool.execute(
    `UPDATE amazon_scan_jobs SET status = 'failed', error_msg = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [errorMsg, jobId],
  );
}

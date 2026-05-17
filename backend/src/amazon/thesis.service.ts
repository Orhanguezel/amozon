import { randomUUID } from 'node:crypto';
import { pool } from '@/db/client';
import { env } from '@/core/env';
import type { AmazonRiskReport, SkuAction } from './amazon.types';

export type ThesisStatus = 'active' | 'weakened' | 'broken' | 'closed';
export type ThesisSignal = {
  key: keyof AmazonRiskReport['scores'];
  label: string;
  score: number;
  confidence: string;
  reason: string;
};

export type DecoratedThesis = {
  id: string;
  job_id: string;
  keyword: string;
  marketplace: string;
  decision: string;
  original_scores: Record<string, unknown>;
  key_signals: ThesisSignal[];
  original_composite_score: number | null;
  current_composite_score: number | null;
  status: ThesisStatus;
  weakness_note: string | null;
  operator_notes: string | null;
  created_at: string | null;
  last_evaluated_at: string | null;
  closed_at: string | null;
  next_evaluation_at: string | null;
  evaluation_ready: boolean;
  days_until_evaluation: number | null;
};

const SCORE_LABELS: Record<keyof AmazonRiskReport['scores'], string> = {
  category_risk: 'Kategori Riski',
  sku_chaos: 'SKU Kaosu',
  price_war_risk: 'Fiyat Savaşı',
  brand_reliability: 'Marka Güveni',
  operational_risk: 'Operasyonel Risk',
};

export function extractKeySignals(scoreRow: Pick<AmazonRiskReport, 'scores' | 'decision_surface'>): ThesisSignal[] {
  const action = scoreRow.decision_surface.primary_action;
  const entries = Object.entries(scoreRow.scores) as Array<[keyof AmazonRiskReport['scores'], AmazonRiskReport['scores'][keyof AmazonRiskReport['scores']]]>;
  const sorted = entries
    .filter(([, score]) => score.confidence !== 'INSUFFICIENT_DATA')
    .sort(([, a], [, b]) => {
      if (action === 'AL') return a.score - b.score;
      if (action === 'UZAK_DUR') return b.score - a.score;
      return Math.abs(b.score - 5) - Math.abs(a.score - 5);
    })
    .slice(0, 3);

  return sorted.map(([key, score]) => ({
    key,
    label: SCORE_LABELS[key],
    score: Number(score.score.toFixed(1)),
    confidence: score.confidence,
    reason: score.reason,
  }));
}

export function compareSignals(original: ThesisSignal[], current: ThesisSignal[]) {
  const byKey = new Map(current.map((signal) => [signal.key, signal]));
  const diffs = original.map((signal) => {
    const next = byKey.get(signal.key);
    const delta = next ? Number((next.score - signal.score).toFixed(1)) : null;
    return { ...signal, current_score: next?.score ?? null, delta };
  });
  const maxAbsDelta = Math.max(0, ...diffs.map((diff) => Math.abs(diff.delta ?? 0)));
  const status: Exclude<ThesisStatus, 'closed'> = maxAbsDelta >= 3 ? 'broken' : maxAbsDelta > 2 ? 'weakened' : 'active';
  return { status, diffs, max_delta: maxAbsDelta };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function decisionAction(decision: unknown): SkuAction {
  switch (String(decision || '').toUpperCase()) {
    case 'GUVENLI': return 'AL';
    case 'GIRME': return 'UZAK_DUR';
    default: return 'TAKIP_ET';
  }
}

export async function createThesis(jobId: string, operatorNotes?: string) {
  const [rows] = await pool.execute(
    `SELECT
       asj.id AS job_id, asj.keyword, asj.marketplace,
       ars.decision, ars.composite_score, ars.decision_surface,
       ars.category_risk_score, ars.category_risk_confidence, ars.category_risk_reason,
       ars.sku_chaos_score, ars.sku_chaos_confidence, ars.sku_chaos_reason,
       ars.price_war_score, ars.price_war_confidence, ars.price_war_reason,
       ars.brand_reliability_score, ars.brand_reliability_confidence, ars.brand_reliability_reason,
       ars.operational_risk_score, ars.operational_risk_confidence, ars.operational_risk_reason
     FROM amazon_scan_jobs asj
     INNER JOIN amazon_risk_scores ars ON ars.job_id = asj.id
     WHERE asj.id = ?
     ORDER BY ars.created_at DESC
     LIMIT 1`,
    [jobId],
  );
  const row = (rows as Array<Record<string, unknown>>)[0];
  if (!row) return null;
  const action = decisionAction(row.decision);
  if (action === 'UZAK_DUR') throw new Error('THESIS_REQUIRES_AL_OR_TAKIP_ET');

  const report = rowToReport(row);
  const keySignals = extractKeySignals(report);
  const id = randomUUID();
  const compositeScore = row.composite_score !== null && row.composite_score !== undefined ? Number(row.composite_score) : null;
  await pool.execute(
    `INSERT INTO amazon_theses
       (id, job_id, keyword, marketplace, decision, original_scores, key_signals,
        original_composite_score, current_composite_score, operator_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      jobId,
      String(row.keyword ?? ''),
      String(row.marketplace ?? ''),
      action,
      JSON.stringify(report.scores),
      JSON.stringify(keySignals),
      compositeScore,
      compositeScore,
      operatorNotes?.trim() || null,
    ],
  );
  return getThesis(id);
}

export async function listTheses(options: { status?: string; limit?: number; offset?: number } = {}): Promise<DecoratedThesis[]> {
  const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
  const offset = Math.max(Number(options.offset || 0), 0);
  const status = String(options.status || '').trim();
  const sql = status
    ? `SELECT * FROM amazon_theses WHERE status = ? ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    : `SELECT * FROM amazon_theses ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const [rows] = status
    ? await pool.execute(sql, [status])
    : await pool.execute(sql);
  return (rows as Array<Record<string, unknown>>).map(decorateThesis);
}

export async function getThesis(id: string): Promise<DecoratedThesis | null> {
  const [rows] = await pool.execute(`SELECT * FROM amazon_theses WHERE id = ? LIMIT 1`, [id]);
  const row = (rows as Array<Record<string, unknown>>)[0];
  return row ? decorateThesis(row) : null;
}

export async function evaluateThesis(id: string) {
  const thesis = await getThesis(id);
  if (!thesis || thesis.status === 'closed') return thesis;
  const [rows] = await pool.execute(
    `SELECT
       ars.composite_score, ars.decision_surface,
       ars.category_risk_score, ars.category_risk_confidence, ars.category_risk_reason,
       ars.sku_chaos_score, ars.sku_chaos_confidence, ars.sku_chaos_reason,
       ars.price_war_score, ars.price_war_confidence, ars.price_war_reason,
       ars.brand_reliability_score, ars.brand_reliability_confidence, ars.brand_reliability_reason,
       ars.operational_risk_score, ars.operational_risk_confidence, ars.operational_risk_reason
     FROM amazon_risk_scores ars
     INNER JOIN amazon_scan_jobs asj ON asj.id = ars.job_id
     WHERE asj.keyword = ? AND asj.marketplace = ? AND asj.status = 'done'
     ORDER BY asj.created_at DESC, ars.created_at DESC
     LIMIT 1`,
    [thesis.keyword, thesis.marketplace],
  );
  const row = (rows as Array<Record<string, unknown>>)[0];
  if (!row) return thesis;
  const currentSignals = extractKeySignals(rowToReport(row));
  const comparison = compareSignals(thesis.key_signals, currentSignals);
  const currentComposite = row.composite_score !== null && row.composite_score !== undefined ? Number(row.composite_score) : null;
  await pool.execute(
    `UPDATE amazon_theses
     SET current_composite_score = ?, status = ?, weakness_note = ?, last_evaluated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      currentComposite,
      comparison.status,
      comparison.status === 'active' ? null : `En büyük sinyal sapması ${comparison.max_delta.toFixed(1)} puan.`,
      id,
    ],
  );
  return getThesis(id);
}

export async function closeThesis(id: string): Promise<DecoratedThesis | null> {
  await pool.execute(
    `UPDATE amazon_theses SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id],
  );
  return getThesis(id);
}

function rowToReport(row: Record<string, unknown>): Pick<AmazonRiskReport, 'scores' | 'decision_surface'> {
  return {
    scores: {
      category_risk: score(row, 'category_risk'),
      sku_chaos: score(row, 'sku_chaos'),
      price_war_risk: score(row, 'price_war'),
      brand_reliability: score(row, 'brand_reliability'),
      operational_risk: score(row, 'operational_risk'),
    },
    decision_surface: {
      primary_action: decisionAction(row.decision),
      ...parseJson<Record<string, unknown>>(row.decision_surface, {}),
    } as AmazonRiskReport['decision_surface'],
  };
}

function score(row: Record<string, unknown>, prefix: string) {
  return {
    score: Number(row[`${prefix}_score`] ?? 0),
    confidence: String(row[`${prefix}_confidence`] || 'LOW') as AmazonRiskReport['scores']['category_risk']['confidence'],
    reason: String(row[`${prefix}_reason`] || ''),
  };
}

function decorateThesis(row: Record<string, unknown>): DecoratedThesis {
  const createdAt = row.created_at === null || row.created_at === undefined ? null : String(row.created_at);
  const lastEvaluatedAt = row.last_evaluated_at === null || row.last_evaluated_at === undefined ? null : String(row.last_evaluated_at);
  const closedAt = row.closed_at === null || row.closed_at === undefined ? null : String(row.closed_at);
  const schedule = thesisEvaluationSchedule(lastEvaluatedAt || createdAt, closedAt !== null);
  return {
    id: String(row.id ?? ''),
    job_id: String(row.job_id ?? ''),
    keyword: String(row.keyword ?? ''),
    marketplace: String(row.marketplace ?? ''),
    decision: String(row.decision ?? ''),
    original_scores: parseJson(row.original_scores, {} as Record<string, unknown>),
    key_signals: parseJson(row.key_signals, [] as ThesisSignal[]),
    original_composite_score: row.original_composite_score === null || row.original_composite_score === undefined
      ? null
      : Number(row.original_composite_score),
    current_composite_score: row.current_composite_score === null || row.current_composite_score === undefined
      ? null
      : Number(row.current_composite_score),
    status: (String(row.status ?? 'active') as ThesisStatus),
    weakness_note: row.weakness_note === null || row.weakness_note === undefined ? null : String(row.weakness_note),
    operator_notes: row.operator_notes === null || row.operator_notes === undefined ? null : String(row.operator_notes),
    created_at: createdAt,
    last_evaluated_at: lastEvaluatedAt,
    closed_at: closedAt,
    next_evaluation_at: schedule.next_evaluation_at,
    evaluation_ready: schedule.evaluation_ready,
    days_until_evaluation: schedule.days_until_evaluation,
  };
}

function thesisEvaluationSchedule(anchor: string | null, closed: boolean) {
  if (!anchor || closed) {
    return { next_evaluation_at: null, evaluation_ready: false, days_until_evaluation: null };
  }
  const anchorDate = new Date(anchor);
  if (Number.isNaN(anchorDate.getTime())) {
    return { next_evaluation_at: null, evaluation_ready: false, days_until_evaluation: null };
  }
  const next = new Date(anchorDate.getTime() + env.THESIS_STALE_DAYS * 24 * 60 * 60 * 1000);
  const diffMs = next.getTime() - Date.now();
  return {
    next_evaluation_at: next.toISOString(),
    evaluation_ready: diffMs <= 0,
    days_until_evaluation: Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000))),
  };
}

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Play, CheckCircle2, AlertCircle, Loader2, MinusCircle, Clock } from 'lucide-react';
import { apiGet, apiPost } from '@/integrations/admin-api';
import { LowCoverageBanner, PriorityViewPanel, RiskBadgeRow, coverageBreakdownSummary } from './decision-clarity';
import { hasLowCoverageWarning } from './ProductsPanel';
import type { DataQuality, PriorityView, RiskBadge } from './types';

type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
type Stage = { status: StageStatus; progress: number; detail: string };
type ProgressResponse = {
  job_id: string;
  keyword: string;
  marketplace: string;
  status: 'pending' | 'running' | 'enriching' | 'done' | 'failed';
  stages: {
    scrape: Stage;
    keepa: Stage;
    seller: Stage;
    scoring: Stage;
    reasoning: Stage;
    lineage: Stage;
  };
  summary: null | {
    data_points: number;
    decision_ready_count: number;
    priority_count: number;
    missing_data_note: string | null;
    composite_score: number | null;
    decision: string | null;
    brand_coverage: number;
    seller_coverage: number;
    scan_age_days?: number | null;
    stale_data?: boolean;
    keepa_coverage?: number;
    data_quality?: DataQuality | null;
    priority_view?: PriorityView | null;
    risk_badges?: RiskBadge[];
  };
};

const MARKETPLACE_OPTIONS = ['com', 'co.uk', 'de', 'fr', 'es', 'it', 'com.tr'];

const ASIN_REGEX = /^(B0[A-Z0-9]{8}|[0-9]{10})$/;

function looksLikeAsin(value: string): boolean {
  return ASIN_REGEX.test(value.trim().toUpperCase());
}

const STAGE_LABELS: Record<keyof ProgressResponse['stages'], string> = {
  scrape: 'Tarama',
  keepa: 'Keepa Snapshot',
  seller: 'Satıcı Doğrulama',
  scoring: 'Skorlama',
  reasoning: 'Reasoning',
  lineage: 'Lineage',
};

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case 'done': return <CheckCircle2 size={18} className="stage-icon-done" />;
    case 'running': return <Loader2 size={18} className="stage-icon-running" />;
    case 'failed': return <AlertCircle size={18} className="stage-icon-failed" />;
    case 'skipped': return <MinusCircle size={18} className="stage-icon-skipped" />;
    default: return <Clock size={18} className="stage-icon-pending" />;
  }
}

function decisionBadgeClass(decision: string | null) {
  switch (decision) {
    case 'AL':
    case 'GUVENLI': return 'badge action-al';
    case 'UZAK_DUR':
    case 'GIRME': return 'badge action-uzak-dur';
    case 'DIKKATLI_OL':
    case 'MIXED_SIGNAL': return 'badge dikkatli_ol';
    default: return 'badge pending';
  }
}

export function ScanJourneyPanel() {
  const [keyword, setKeyword] = useState('');
  const [marketplace, setMarketplace] = useState('com');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thesisLoading, setThesisLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  async function startScan() {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setError('Anahtar kelime veya ASIN gerekli');
      return;
    }
    setStarting(true);
    setError(null);
    setProgress(null);
    try {
      const isAsinInput = looksLikeAsin(trimmed);
      const payload = isAsinInput
        ? { asin: trimmed.toUpperCase(), marketplace }
        : { keyword: trimmed, marketplace, auto_add: true };
      const result = await apiPost<{ jobId: string; keyword?: string; seed_asin?: string | null }>('/api/scans', payload);
      setJobId(result.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tarama başlatılamadı');
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function tick() {
      try {
        const data = await apiGet<ProgressResponse>(`/api/scans/${jobId}/progress`);
        if (cancelled) return;
        setProgress(data);
        if (data.status === 'done' || data.status === 'failed') {
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Durum alınamadı');
      }
    }

    tick();
    pollRef.current = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [jobId]);

  function resetForNew() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setJobId(null);
    setProgress(null);
    setError(null);
    setKeyword('');
  }

  async function activateThesis() {
    if (!jobId) return;
    setThesisLoading(true);
    setError(null);
    try {
      await apiPost(`/api/scans/${jobId}/thesis`, {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tez aktive edilemedi');
    } finally {
      setThesisLoading(false);
    }
  }

  const stages = progress?.stages;
  const summary = progress?.summary;
  const isComplete = progress?.status === 'done';
  const isFailed = progress?.status === 'failed';

  return (
    <section className="panel scan-journey">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Yeni Tarama</h2>
          <p className="muted">Kategori, anahtar kelime <b>veya ASIN</b> yaz; tek tıkla tüm akışı izle: tarama → Keepa → satıcı → skorlama → reasoning → lineage.</p>
        </div>
      </div>
      <div className="panel-body">
        {!jobId ? (
          <>
            <div className="scan-journey-form">
              <input
                className="input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Kategori (cable organizer) veya ASIN (B0XYZ12345)"
                onKeyDown={(e) => { if (e.key === 'Enter') startScan(); }}
                autoFocus
              />
              <select className="select" value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
                {MARKETPLACE_OPTIONS.map((mp) => <option key={mp} value={mp}>amazon.{mp}</option>)}
              </select>
              <button className="button" onClick={startScan} disabled={starting} type="button">
                <Play size={16} />
                {starting ? 'Başlatılıyor' : 'Başlat'}
              </button>
            </div>
            {looksLikeAsin(keyword) && (
              <p className="muted" style={{ marginTop: 8, fontSize: '0.85rem' }}>
                🔎 <b>ASIN modu:</b> Ürün başlığından kategori türetilecek ve normal kategori taraması yapılacak.
              </p>
            )}
          </>
        ) : (
          <div className="scan-journey-active">
            <div className="scan-journey-meta">
              <strong>{progress?.keyword || keyword}</strong>
              <span className="muted">amazon.{progress?.marketplace || marketplace}</span>
              {isComplete && <span className="badge done">Tamamlandı</span>}
              {isFailed && <span className="badge failed">Başarısız</span>}
              {progress?.status === 'running' && <span className="badge running">Çalışıyor</span>}
              {progress?.status === 'enriching' && <span className="badge running">Zenginleştiriliyor</span>}
            </div>

            <div className="scan-stages">
              {stages && (Object.keys(STAGE_LABELS) as Array<keyof ProgressResponse['stages']>).map((key) => {
                const stage = stages[key];
                return (
                  <div className={`scan-stage scan-stage-${stage.status}`} key={key}>
                    <div className="scan-stage-icon"><StageIcon status={stage.status} /></div>
                    <div className="scan-stage-content">
                      <div className="scan-stage-head">
                        <strong>{STAGE_LABELS[key]}</strong>
                        <span className="muted">{stage.progress}%</span>
                      </div>
                      <div className="scan-stage-bar"><span style={{ width: `${stage.progress}%` }} /></div>
                      <div className="scan-stage-detail muted">{stage.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {summary && (
              <div className="scan-summary">
                <div className="scan-summary-head">
                  <strong>Sonuç</strong>
                  {summary.decision && <span className={decisionBadgeClass(summary.decision)}>{summary.decision}</span>}
                </div>
                <div className="scan-summary-grid">
                  <div className="scan-summary-cell">
                    <div className="muted">Skor</div>
                    <div className="scan-summary-value">{summary.composite_score ?? '—'}<span className="muted">/10</span></div>
                  </div>
                  <div className="scan-summary-cell">
                    <div className="muted">Karar Hazır SKU</div>
                    <div className="scan-summary-value">{summary.decision_ready_count}</div>
                  </div>
                  <div className="scan-summary-cell">
                    <div className="muted">Öncelikli SKU</div>
                    <div className="scan-summary-value">{summary.priority_count}</div>
                  </div>
                  <div className="scan-summary-cell">
                    <div className="muted">Veri Noktası</div>
                    <div className="scan-summary-value">{summary.data_points}</div>
                  </div>
                  <div className="scan-summary-cell">
                    <div className="muted">Satıcı Kapsaması</div>
                    <div className="scan-summary-value">{Math.round(summary.seller_coverage * 100)}%</div>
                  </div>
                  <div className="scan-summary-cell">
                    <div className="muted">Marka Kapsaması</div>
                    <div className="scan-summary-value">{Math.round(summary.brand_coverage * 100)}%</div>
                  </div>
                </div>
                {summary.missing_data_note && (
                  <div className="scan-summary-warning">⚠ {summary.missing_data_note}</div>
                )}
                {summary.stale_data || Number(summary.scan_age_days ?? 0) >= 7 ? (
                  <div className="scan-summary-warning stale-warning">Veri bayat — yeniden tarama önerilir</div>
                ) : null}
                {hasLowCoverageWarning({
                  keepa_coverage: summary.data_quality?.keepa_coverage ?? summary.keepa_coverage,
                  seller_coverage: summary.seller_coverage,
                }) ? (
                  <LowCoverageBanner
                    breakdown={summary.data_quality?.coverage_breakdown}
                    coverageSummary={coverageBreakdownSummary(summary.data_quality?.coverage_breakdown)}
                  />
                ) : null}
                {summary.risk_badges?.length ? <RiskBadgeRow badges={summary.risk_badges} /> : null}
                {summary.priority_view ? <PriorityViewPanel compact priority={summary.priority_view} /> : null}
                <div className="scan-summary-actions">
                  <Link className="button" href={`/products?job=${jobId}`}>Sonuçları İncele</Link>
                  {summary.decision === 'GUVENLI' || summary.decision === 'DIKKATLI_OL' || summary.decision === 'MIXED_SIGNAL' ? (
                    <button className="button button-secondary" disabled={thesisLoading} onClick={activateThesis} type="button">
                      {thesisLoading ? 'Aktive ediliyor' : 'Tezi Aktive Et'}
                    </button>
                  ) : null}
                  <button className="button button-secondary" onClick={resetForNew} type="button">Yeni Tarama</button>
                </div>
              </div>
            )}

            {!summary && !isFailed && (
              <div className="muted scan-journey-hint">Akış devam ediyor — her aşama tamamlandıkça yukarıda görünecek.</div>
            )}
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}

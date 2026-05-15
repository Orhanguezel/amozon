'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, RefreshCw, XCircle } from 'lucide-react';
import { apiGet, apiPost } from '@/integrations/admin-api';
import {
  skuActionLabel,
  thesisStatusLabel,
  type AmazonThesis,
  type ThesisStatus,
  type ThesesListResponse,
} from './types';

const tabs = [
  { status: 'active' as const, label: 'Aktif' },
  { status: 'weakened' as const, label: 'Zayıfladı' },
  { status: 'broken' as const, label: 'Bozuldu' },
  { status: 'closed' as const, label: 'Kapalı Arşiv' },
] as const;

function formatCreatedAt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('tr-TR');
  } catch {
    return iso;
  }
}

export function ThesesPanel() {
  const [status, setStatus] = useState<ThesisStatus>('active');
  const [theses, setTheses] = useState<AmazonThesis[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async (nextStatus: ThesisStatus) => {
    setLoading(true);
    setFeedback(null);
    try {
      const result = await apiGet<ThesesListResponse>(`/api/theses?status=${encodeURIComponent(nextStatus)}`);
      setTheses(Array.isArray(result.theses) ? result.theses : []);
    } catch (error) {
      setFeedback({
        kind: 'err',
        text: error instanceof Error ? error.message : 'Tezler alınamadı',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [status, load]);

  async function evaluate(id: string) {
    setBusyId(id);
    setFeedback(null);
    try {
      await apiPost<unknown>(`/api/theses/${id}/evaluate`, {});
      setFeedback({ kind: 'ok', text: 'Değerlendirme tamamlandı.' });
      await load(status);
    } catch (error) {
      setFeedback({
        kind: 'err',
        text: error instanceof Error ? error.message : 'Değerlendirme başarısız.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function closeThesis(id: string) {
    if (!window.confirm('Bu tezi kapatmak istediğinize emin misiniz?')) return;
    setBusyId(id);
    setFeedback(null);
    try {
      await apiPost<unknown>(`/api/theses/${id}/close`, {});
      setFeedback({ kind: 'ok', text: 'Tez kapatıldı.' });
      await load(status);
    } catch (error) {
      setFeedback({
        kind: 'err',
        text: error instanceof Error ? error.message : 'Kapatma başarısız.',
      });
    } finally {
      setBusyId(null);
    }
  }

  const countText = useMemo(() => `${theses.length} tez`, [theses.length]);

  return (
    <div className="content">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Tezler</h2>
            <p className="muted">AL ve Takip Et kararlarının zaman içinde zayıflayıp zayıflamadığını izle.</p>
          </div>
          <button className="button" disabled={loading} onClick={() => void load(status)} type="button">
            <RefreshCw size={16} />
            Yenile
          </button>
        </div>
        <div className="panel-body">
          <div className="segmented theses-tabs">
            {tabs.map((tab) => (
              <button
                className={status === tab.status ? 'active' : ''}
                key={tab.status}
                onClick={() => setStatus(tab.status)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
          {feedback ? (
            <p className={feedback.kind === 'err' ? 'error' : 'message-success'}>{feedback.text}</p>
          ) : null}
          <p className="muted">{countText}</p>
        </div>
      </section>

      <div className="thesis-grid">
        {theses.map((thesis) => (
          <article className={`panel thesis-card thesis-${thesis.status}`} key={thesis.id}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{thesis.keyword}</h2>
                <p className="muted">
                  amazon.{thesis.marketplace} · {formatCreatedAt(thesis.created_at)}
                </p>
              </div>
              <span className={`badge thesis-status-${thesis.status}`}>{thesisStatusLabel(thesis.status)}</span>
            </div>
            <div className="panel-body">
              <div className="thesis-score-row">
                <span>
                  Karar <b>{skuActionLabel(thesis.decision)}</b>
                </span>
                <span>
                  İlk skor <b>{thesis.original_composite_score ?? '—'}</b>
                </span>
                <span>
                  Güncel <b>{thesis.current_composite_score ?? '—'}</b>
                </span>
              </div>
              {thesis.weakness_note ? <p className="thesis-warning">{thesis.weakness_note}</p> : null}
              <div className="signal-diff-list">
                {thesis.key_signals.map((signal) => (
                  <div className="signal-diff" key={signal.key}>
                    <strong>{signal.label}</strong>
                    <span>
                      {signal.score} → {signal.current_score ?? '—'}
                    </span>
                    <p>{signal.reason}</p>
                  </div>
                ))}
              </div>
              {thesis.operator_notes ? <p className="muted">Not: {thesis.operator_notes}</p> : null}
              <div className="thesis-actions">
                {thesis.status !== 'closed' ? (
                  <>
                    <button
                      className="button"
                      disabled={busyId === thesis.id}
                      onClick={() => void evaluate(thesis.id)}
                      type="button"
                    >
                      <RefreshCw size={15} />
                      Şimdi Değerlendir
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={busyId === thesis.id}
                      onClick={() => void closeThesis(thesis.id)}
                      type="button"
                    >
                      <XCircle size={15} />
                      Kapat
                    </button>
                  </>
                ) : (
                  <span className="muted">
                    <Archive size={15} /> Arşivde
                  </span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

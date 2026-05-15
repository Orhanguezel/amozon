'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Play, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { apiGet, apiPost } from '@/integrations/admin-api';
import {
  actionClass,
  blockerLabel,
  confidenceLabel,
  decisionLabel,
  errorLabel,
  formatNumber,
  operatorAction,
  scoreFields,
  skuActionLabel,
  statusClass,
  statusLabel,
  type DataQuality,
  type KeywordOption,
  type Scan,
  type ScanDetail,
} from './types';

function KeywordCombobox({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  options: KeywordOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    // If input matches one of the options exactly, show all (user just picked it)
    const exactMatch = options.some((opt) => opt.keyword.toLowerCase() === q);
    if (exactMatch) return options;
    return options.filter((opt) => opt.keyword.toLowerCase().includes(q));
  }, [value, options]);

  function pick(keyword: string) {
    onChange(keyword);
    setOpen(false);
  }

  return (
    <div className="keyword-combobox" ref={containerRef}>
      <div className="keyword-combobox-input">
        <input
          className="input"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="keyword-combobox-toggle"
          onClick={() => setOpen((current) => !current)}
          aria-label="Listeyi aç/kapat"
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {open && filtered.length > 0 && (
        <div className="keyword-combobox-menu">
          {filtered.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`keyword-combobox-item${opt.keyword === value ? ' selected' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(opt.keyword)}
            >
              <span>{opt.keyword}</span>
              <span className="muted">{opt.marketplace}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function scanAction(scan: Scan, detail: ScanDetail | null) {
  const surface = detail?.scan.id === scan.id ? detail.risk?.decision_surface : scan.decision_surface;
  return surface?.primary_action ? skuActionLabel(surface.primary_action) : operatorAction(scan.decision);
}

function scanActionBadgeClass(scan: Scan, detail: ScanDetail | null) {
  const surface = detail?.scan.id === scan.id ? detail.risk?.decision_surface : scan.decision_surface;
  if (surface?.primary_action) return actionClass(surface.primary_action);
  return `action-${operatorAction(scan.decision).toLowerCase().replaceAll(' ', '-')}`;
}

function scanSummary(scan: Scan, detail: ScanDetail | null) {
  const surface = detail?.scan.id === scan.id ? detail.risk?.decision_surface : scan.decision_surface;
  if (surface?.operator_summary) return surface.operator_summary;
  if (scan.status === 'failed') return errorLabel(scan.error_msg);
  return decisionLabel(scan.decision);
}

function scanQuality(scan: Scan, detail: ScanDetail | null): DataQuality | null {
  return (detail?.scan.id === scan.id ? detail.risk?.data_quality : scan.data_quality) ?? null;
}

function percent(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

export function ScansPanel() {
  const [keyword, setKeyword] = useState('');
  const [keywordSearch, setKeywordSearch] = useState('');
  const [marketplaces, setMarketplaces] = useState<string[]>(['com']);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [scansTotal, setScansTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const [keywords, setKeywords] = useState<KeywordOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScanDetail | null>(null);

  async function loadKeywords(q = keywordSearch) {
    const query = new URLSearchParams({ limit: '25' });
    if (q.trim()) query.set('q', q.trim());
    const response = await apiGet<{ keywords: KeywordOption[] }>(`/api/keywords?${query.toString()}`);
    setKeywords(response.keywords);
    setKeyword((current) => current || response.keywords[0]?.keyword || '');
    setMarketplaces((current) => current.length ? current : [response.keywords[0]?.marketplace || 'com']);
  }

  async function refresh(nextJobId = selectedJobId, nextPage = page) {
    const offset = nextPage * PAGE_SIZE;
    const response = await apiGet<{ scans: Scan[]; total?: number }>(
      `/api/scans?limit=${PAGE_SIZE}&offset=${offset}`,
    );
    setScans(response.scans);
    setScansTotal(Number(response.total ?? response.scans.length));
    const jobId = nextJobId || response.scans[0]?.id || null;
    setSelectedJobId(jobId);
    if (jobId) setDetail(await apiGet<ScanDetail>(`/api/scans/${jobId}`));
  }

  async function goToPage(nextPage: number) {
    const total = Math.max(1, Math.ceil(scansTotal / PAGE_SIZE));
    const clamped = Math.min(Math.max(0, nextPage), total - 1);
    if (clamped === page) return;
    setPage(clamped);
    await refresh(selectedJobId, clamped);
  }

  async function startScan(options: { autoAdd?: boolean } = {}) {
    if (!keyword.trim()) {
      setMessage('Anahtar kelime gerekli');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const jobs: Array<{ jobId: string }> = [];
      for (const marketplace of marketplaces.length ? marketplaces : ['com']) {
        jobs.push(await apiPost<{ jobId: string }>('/api/scans', {
          keyword: keyword.trim(),
          marketplace,
          auto_add: options.autoAdd ?? false,
        }));
      }
      setMessage(`${jobs.length} araştırma başlatıldı.`);
      await refresh(jobs.at(-1)?.jobId);
      if (options.autoAdd) await loadKeywords('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Araştırma başlatılamadı');
    } finally {
      setLoading(false);
    }
  }

  async function retryScan(scan: Scan) {
    setLoading(true);
    setMessage(null);
    try {
      const response = await apiPost<{ jobId: string }>(`/api/scans/${scan.id}/retry`, {});
      setMessage(`Yeniden deneme başlatıldı: ${response.jobId}`);
      await refresh(response.jobId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Yeniden deneme başlatılamadı');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([refresh(), loadKeywords('')]).catch((error) => setMessage(error instanceof Error ? error.message : 'Veri alınamadı'));
    const timer = window.setInterval(() => refresh().catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadKeywords(keywordSearch).catch((error) => setMessage(error instanceof Error ? error.message : 'Anahtar kelime listesi alınamadı'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [keywordSearch]);

  const metrics = useMemo(() => ({
    done: scans.filter((scan) => scan.status === 'done').length,
    running: scans.filter((scan) => ['pending', 'running'].includes(scan.status)).length,
    failed: scans.filter((scan) => scan.status === 'failed').length,
    total: scans.length,
  }), [scans]);

  const actionMetrics = useMemo(() => {
    const completed = scans.filter((scan) => scan.status === 'done');
    return [
      { key: 'al', label: 'Al', count: completed.filter((scan) => scanAction(scan, detail) === 'Al').length, className: 'action-al' },
      { key: 'takip', label: 'Takip Et', count: completed.filter((scan) => scanAction(scan, detail) === 'Takip Et').length, className: 'action-takip-et' },
      { key: 'uzak', label: 'Uzak Dur', count: completed.filter((scan) => scanAction(scan, detail) === 'Uzak Dur').length, className: 'action-uzak-dur' },
    ];
  }, [detail, scans]);

  const alerts = useMemo(() => {
    const failed = scans.filter((scan) => scan.status === 'failed');
    const blocked = scans.filter((scan) => scan.decision === 'GIRME');
    const insufficient = scans.filter((scan) => scan.decision === 'INSUFFICIENT_DATA');
    return [
      {
        key: 'failed',
        title: 'Hatalı Araştırma',
        value: failed.length,
        level: failed.length ? 'danger' : 'ok',
        detail: failed[0] ? `${failed[0].keyword}: ${errorLabel(failed[0].error_msg)}` : 'Aktif hata yok',
      },
      {
        key: 'blocked',
        title: 'Uzak Dur',
        value: blocked.length,
        level: blocked.length ? 'danger' : 'ok',
        detail: blocked[0] ? `${blocked[0].keyword}: Girme` : 'Yüksek risk alarmı yok',
      },
      {
        key: 'insufficient',
        title: 'Yetersiz Veri',
        value: insufficient.length,
        level: insufficient.length ? 'warning' : 'ok',
        detail: insufficient[0] ? `${insufficient[0].keyword}: tekrar/tuning gerekebilir` : 'Yetersiz veri alarmı yok',
      },
    ];
  }, [scans]);

  const stabilityRows = useMemo(() => {
    const groups = new Map<string, Scan[]>();
    for (const scan of scans.filter((item) => item.status === 'done')) {
      const key = `${scan.keyword}__${scan.marketplace}`;
      groups.set(key, [...(groups.get(key) ?? []), scan]);
    }
    return [...groups.values()].map((items) => {
      const [latest, previous] = items;
      const stable = previous ? latest.decision === previous.decision : null;
      return {
        key: `${latest.keyword}-${latest.marketplace}`,
        keyword: latest.keyword,
        marketplace: latest.marketplace,
        latest: latest.decision || null,
        previous: previous?.decision || null,
        label: stable === null ? 'Tek veri' : stable ? 'Stabil' : 'Değişken',
      };
    }).slice(0, 8);
  }, [scans]);

  const risk = detail?.risk;
  const marketplaceOptions = ['com', 'de', 'co.uk', 'com.tr'];

  function toggleMarketplace(value: string) {
    setMarketplaces((current) => {
      if (current.includes(value)) return current.length === 1 ? current : current.filter((item) => item !== value);
      return [...current, value];
    });
  }

  return (
    <div className="content">
      <section className="metrics">
        <div className="metric"><div className="metric-label">Toplam İş</div><div className="metric-value">{metrics.total}</div></div>
        <div className="metric"><div className="metric-label">Tamamlanan</div><div className="metric-value">{metrics.done}</div></div>
        <div className="metric"><div className="metric-label">Çalışan</div><div className="metric-value">{metrics.running}</div></div>
        <div className="metric"><div className="metric-label">Hatalı</div><div className="metric-value">{metrics.failed}</div></div>
      </section>

      <section className="panel decision-band">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Karar Dağılımı</h2>
            <p className="muted">Tamamlanan araştırmaların hızlı operasyon aksiyonu.</p>
          </div>
        </div>
        <div className="panel-body action-metrics">
          {actionMetrics.map((item) => (
            <div className="action-metric" key={item.key}>
              <span className={`badge ${item.className}`}>{item.label}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Operasyon Uyarıları</h2>
            <p className="muted">Araştırma sonuçlarından otomatik üretilen takip alarmları.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="alert-grid">
            {alerts.map((alert) => (
              <div className={`alert-card ${alert.level}`} key={alert.key}>
                <span>{alert.title}</span>
                <strong>{alert.value}</strong>
                <p>{alert.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Karar Stabilitesi</h2>
            <p className="muted">Gürültüyü azaltmak için anahtar kelime bazında son karar değişimi.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Anahtar Kelime</th><th>Pazar Yeri</th><th>Son Karar</th><th>Önceki</th><th>Trend</th></tr></thead>
            <tbody>
              {stabilityRows.map((row) => (
                <tr key={row.key}>
                  <td><strong>{row.keyword}</strong></td>
                  <td>{row.marketplace}</td>
                  <td><span className={`badge ${statusClass(row.latest)}`}>{decisionLabel(row.latest)}</span></td>
                  <td>{decisionLabel(row.previous)}</td>
                  <td><span className={`badge ${row.label === 'Stabil' ? 'done' : row.label === 'Değişken' ? 'failed' : 'pending'}`}>{row.label}</span></td>
                </tr>
              ))}
              {!stabilityRows.length ? <tr><td colSpan={5}>Tamamlanmış araştırma yok.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Yeni Amazon Araştırması</h2>
            <p className="muted">Kayıtlı kelimeden seç veya yeni kelime yaz ve "Yeni Kelime ile Başlat"a bas — havuza otomatik eklenir.</p>
          </div>
          <button className="button" onClick={() => refresh()} type="button"><RefreshCw size={16} />Yenile</button>
        </div>
        <div className="panel-body">
          <div className="keyword-search">
            <Search size={16} />
            <input
              className="input"
              value={keywordSearch}
              onChange={(event) => setKeywordSearch(event.target.value)}
              placeholder="Anahtar kelime ara"
            />
          </div>
          <div className="scan-form">
            <KeywordCombobox
              value={keyword}
              onChange={setKeyword}
              options={keywords}
              placeholder="Anahtar kelime (yeni veya kayıtlı)"
            />
            <div className="marketplace-grid">
              {marketplaceOptions.map((option) => (
                <label className="check" key={option}>
                  <input checked={marketplaces.includes(option)} onChange={() => toggleMarketplace(option)} type="checkbox" />
                  <span>amazon.{option}</span>
                </label>
              ))}
            </div>
            <button className="button" disabled={loading} onClick={() => startScan({ autoAdd: false })} type="button">
              <Play size={16} />
              {loading ? 'Başlatılıyor' : 'Başlat'}
            </button>
            <button className="button button-secondary" disabled={loading} onClick={() => startScan({ autoAdd: true })} type="button">
              <Play size={16} />
              Yeni Kelime ile Başlat
            </button>
          </div>
          {message ? <p className={message.startsWith('API_ERROR') ? 'error' : 'muted'}>{message}</p> : null}
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Araştırma İşleri</h2>
            {scansTotal > 0 && (
              <span className="muted">{scansTotal} kayıt · sayfa {page + 1}/{Math.max(1, Math.ceil(scansTotal / PAGE_SIZE))}</span>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Araştırma</th><th>Durum</th><th>Aksiyon</th><th>Karar Özeti</th><th>Veri Kalitesi</th><th>Hata</th></tr></thead>
              <tbody>
                {scans.map((scan) => {
                  const quality = scanQuality(scan, detail);
                  return (
                    <tr
                      className={selectedJobId === scan.id ? 'selected' : ''}
                      key={scan.id}
                      onClick={() => {
                        setSelectedJobId(scan.id);
                        apiGet<ScanDetail>(`/api/scans/${scan.id}`).then(setDetail).catch(() => undefined);
                      }}
                    >
                      <td>
                        <strong>{scan.keyword}</strong>
                        {Number(scan.data_quality?.scan_age_days ?? 0) >= 7 && (
                          <span className="badge stale" style={{ marginLeft: 6, fontSize: '0.7em', verticalAlign: 'middle' }}>Veri bayat</span>
                        )}
                        <div className="muted">{scan.marketplace} · {scan.data_points} ürün</div>
                      </td>
                      <td><span className={`badge ${statusClass(scan.status)}`}>{statusLabel(scan.status)}</span></td>
                      <td>
                        {scan.status === 'failed' ? (
                          <button
                            className="button secondary"
                            disabled={loading}
                            onClick={(event) => {
                              event.stopPropagation();
                              retryScan(scan).catch(() => undefined);
                            }}
                            type="button"
                          >
                            <RotateCcw size={14} />
                            Yeniden Dene
                          </button>
                        ) : (
                          <span className={`badge ${scanActionBadgeClass(scan, detail)}`}>{scanAction(scan, detail)}</span>
                        )}
                      </td>
                      <td className="scan-summary-cell">
                        <strong>{decisionLabel(scan.decision)}</strong>
                        <p>{scanSummary(scan, detail)}</p>
                      </td>
                      <td className="scan-quality-cell">
                        <span>Fiyat {percent(quality?.price_coverage)}</span>
                        <span>Satıcı {percent(quality?.seller_coverage)}</span>
                        {quality?.confidence_blockers?.length ? (
                          <small>{quality.confidence_blockers.map(blockerLabel).join(', ')}</small>
                        ) : <small>Belirgin uyarı yok</small>}
                      </td>
                      <td className="error">{errorLabel(scan.error_msg)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {scansTotal > PAGE_SIZE && (
            <div className="pagination">
              <button
                type="button"
                className="button button-secondary"
                disabled={page === 0}
                onClick={() => goToPage(page - 1)}
              >
                Önceki
              </button>
              <span className="muted">
                {page + 1} / {Math.max(1, Math.ceil(scansTotal / PAGE_SIZE))}
              </span>
              <button
                type="button"
                className="button button-secondary"
                disabled={(page + 1) * PAGE_SIZE >= scansTotal}
                onClick={() => goToPage(page + 1)}
              >
                Sonraki
              </button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Seçili Araştırma Risk Özeti</h2>
            <span className={`badge ${statusClass(detail?.scan.status)}`}>{statusLabel(detail?.scan.status)}</span>
          </div>
          <div className="panel-body">
            {risk ? (
              <>
                {risk.decision_surface ? (
                  <div className="selected-decision-surface">
                    <div>
                      <span className="metric-label">Ana Aksiyon</span>
                      <strong>{skuActionLabel(risk.decision_surface.primary_action)}</strong>
                      <p>{risk.decision_surface.operator_summary}</p>
                    </div>
                    <span className={`badge ${actionClass(risk.decision_surface.primary_action)}`}>{skuActionLabel(risk.decision_surface.primary_action)}</span>
                  </div>
                ) : null}
                {risk.data_quality ? (
                    <div className="quality-strip">
                      <span>Fiyat {percent(risk.data_quality.price_coverage)}</span>
                      <span>Satıcı {percent(risk.data_quality.seller_coverage)}</span>
                      <span>Keepa {percent(risk.data_quality.keepa_coverage)}</span>
                      {Number(risk.data_quality.scan_age_days ?? 0) >= 7 && <b className="stale-text">VERİ BAYAT</b>}
                      {risk.data_quality.confidence_blockers?.map((blocker, index) => <b key={`${blocker}-${index}`}>{blockerLabel(blocker)}</b>)}
                    </div>
                ) : null}
                {String(risk.insufficient_data_reason || '') ? (
                  <div className="insufficient-reason">
                    <strong>Yetersiz Veri Nedeni</strong>
                    <p>{String(risk.insufficient_data_reason)}</p>
                  </div>
                ) : null}
                <div className="metrics" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                  <div className="metric"><div className="metric-label">Bileşik Skor</div><div className="metric-value">{formatNumber(risk.composite_score)}</div></div>
                  <div className="metric"><div className="metric-label">Karar</div><div className="metric-value" style={{ fontSize: 20 }}>{decisionLabel(String(risk.decision || ''))}</div></div>
                  <div className="metric"><div className="metric-label">Aksiyon</div><div className="metric-value" style={{ fontSize: 20 }}>{operatorAction(String(risk.decision || ''))}</div></div>
                  <div className="metric"><div className="metric-label">Veri</div><div className="metric-value">{String(risk.data_points || '-')}</div></div>
                </div>
                <div className="score-grid" style={{ marginTop: 14 }}>
                  {scoreFields.map(([key, label]) => (
                    <div className="score-card" key={key}>
                      <strong>{label}</strong>
                      <div className="score-row"><span>Skor</span><b>{formatNumber(risk[`${key}_score`])}</b></div>
                      <div className="score-row"><span>Güven</span><b>{confidenceLabel(String(risk[`${key}_confidence`] || ''))}</b></div>
                    </div>
                  ))}
                </div>
                {Array.isArray(risk.persuasion_points) && (risk.persuasion_points as string[]).length ? (
                  <div className="persuasion-points" style={{ marginTop: 14 }}>
                    <strong>Satış Argümanları</strong>
                    <ul>
                      {(risk.persuasion_points as string[]).map((point, index) => (
                        <li key={`${point}-${index}`}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">Seçili araştırma için risk raporu henüz oluşmadı.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

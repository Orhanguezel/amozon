'use client';

import { useEffect, useMemo, useState } from 'react';
import { ListChecks, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { apiGet, apiPost } from '@/integrations/admin-api';
import { BrandBreakdown, ProductAnalytics } from './analytics';
import {
  LowCoverageBanner,
  PriorityViewPanel,
  RiskBadgeRow,
  coverageBreakdownSummary,
  percent,
} from './decision-clarity';
import {
  actionClass,
  blockerLabel,
  confidenceLabel,
  decisionLabel,
  isSellerMissing,
  numeric,
  operatorAction,
  productPrice,
  sellerInfo,
  skuActionLabel,
  statusClass,
  type PrioritySku,
  type Product,
  type KeepaScanStatus,
  type Scan,
  type ScanDetail,
  type SkuDecision,
} from './types';

export function isStaleScan(scan?: { data_quality?: { scan_age_days?: number | null } | null } | null) {
  return Number(scan?.data_quality?.scan_age_days ?? 0) >= 7;
}

export function hasLowCoverageWarning(quality?: { keepa_coverage?: number | null; seller_coverage?: number | null } | null) {
  return Number(quality?.keepa_coverage ?? 0) < 0.3 && Number(quality?.seller_coverage ?? 0) < 0.3;
}

type KeepaContribution = { signal: string; label: string; value: string; dimensions: string[]; description: string };
type KeepaSnapshotDetail = {
  asin: string;
  title: string;
  product_price: number | null;
  price_30d_min: number | null;
  price_30d_max: number | null;
  price_90d_avg: number | null;
  price_volatility: number | null;
  offer_count_avg: number | null;
  offer_count_trend: string | null;
  buy_box_change_count: number;
  seller_count_trend: string | null;
  fetched_at: string | null;
  contributions: KeepaContribution[];
};
type KeepaDetailResponse = { snapshots: KeepaSnapshotDetail[] };

function dimensionLabel(d: string) {
  switch (d) {
    case 'price_war_risk': return 'Fiyat Savaşı';
    case 'operational_risk': return 'Operasyonel Risk';
    case 'brand_reliability': return 'Marka Güveni';
    case 'category_risk': return 'Kategori Riski';
    case 'sku_chaos': return 'SKU Kaosu';
    default: return d;
  }
}

function KeepaLineagePanel({ detail }: { detail: KeepaDetailResponse | null }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!detail || !detail.snapshots.length) return null;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Keepa Lineage — Sinyal → Skor Etkisi</h2>
          <p className="muted">{detail.snapshots.length} ASIN snapshot. Her satır hangi sinyalin hangi skoru beslediğini gösterir.</p>
        </div>
      </div>
      <div className="panel-body">
        <div className="keepa-lineage-list">
          {detail.snapshots.map((s, index) => {
            const isOpen = expanded === s.asin;
            return (
              <div className={`keepa-lineage-item${isOpen ? ' open' : ''}`} key={`${s.asin}-${index}`}>
                <button className="keepa-lineage-head" onClick={() => setExpanded(isOpen ? null : s.asin)} type="button">
                  <span className="keepa-lineage-asin">{s.asin}</span>
                  <span className="keepa-lineage-title">{s.title.slice(0, 70)}</span>
                  <span className="keepa-lineage-stat">{s.contributions.length} sinyal</span>
                </button>
                {isOpen ? (
                  <div className="keepa-lineage-body">
                    <div className="keepa-lineage-raw">
                      <span>90 gün ort: <b>{s.price_90d_avg ?? '-'}</b></span>
                      <span>30 gün min: <b>{s.price_30d_min ?? '-'}</b></span>
                      <span>Volatilite σ/μ: <b>{s.price_volatility?.toFixed(3) ?? '-'}</b></span>
                      <span>Ort. teklif: <b>{s.offer_count_avg?.toFixed(1) ?? '-'}</b></span>
                      <span>Teklif trendi: <b>{s.offer_count_trend ?? '-'}</b></span>
                      <span>Buy Box değişim: <b>{s.buy_box_change_count}</b></span>
                    </div>
                    {s.contributions.length ? (
                      <table className="keepa-lineage-table">
                        <thead><tr><th>Sinyal</th><th>Değer</th><th>Etki ettiği skor</th><th>Açıklama</th></tr></thead>
                        <tbody>
                          {s.contributions.map((c, idx) => (
                            <tr key={`${c.signal}-${idx}`}>
                              <td>{c.label}</td>
                              <td><b>{c.value}</b></td>
                              <td>{c.dimensions.map(dimensionLabel).join(' · ')}</td>
                              <td className="muted">{c.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="muted">Bu snapshot için scoring'e etki eden sinyal yok.</p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function findSkuDecision(product: Product, decisions: SkuDecision[]) {
  if (product.asin) {
    const byAsin = decisions.find((decision) => decision.asin && decision.asin === product.asin);
    if (byAsin) return byAsin;
  }
  return decisions.find((decision) => decision.title === product.title || product.title.includes(decision.title) || decision.title.includes(product.title));
}

const ACTION_GROUPS = [
  { action: 'Al', label: 'AL', className: 'action-al' },
  { action: 'Takip Et', label: 'TAKİP ET', className: 'action-takip-et' },
  { action: 'Uzak Dur', label: 'UZAK DUR', className: 'action-uzak-dur' },
] as const;

function CategoryGroupedView({
  scans,
  selectedJobId,
  onSelect,
}: {
  scans: Scan[];
  selectedJobId: string | null;
  onSelect: (scan: Scan) => void;
}) {
  const groups = ACTION_GROUPS.map((group) => ({
    ...group,
    scans: scans.filter((scan) => operatorAction(scan.decision) === group.action),
  })).filter((group) => group.scans.length > 0);

  if (!groups.length) {
    return <p className="muted" style={{ padding: '12px 0' }}>Filtreye uygun tamamlanmış araştırma yok.</p>;
  }

  return (
    <div className="category-groups">
      {groups.map((group) => (
        <div className={`category-group ${group.className}`} key={group.action}>
          <div className="category-group-header">
            <div>
              <span className={`badge ${group.className}`}>{group.label}</span>
              <strong>{group.scans.length} araştırma</strong>
            </div>
            <span className="muted">Karar kartına tıklayınca detay yüklenir.</span>
          </div>
          <div className="category-cards">
            {group.scans.map((scan, index) => (
              <button
                className={`category-card ${group.className}${selectedJobId === scan.id ? ' selected' : ''}`}
                key={`${scan.id}-${index}`}
                onClick={() => onSelect(scan)}
                type="button"
              >
                <div className="category-card-head">
                  <div>
                    <strong>{scan.keyword}</strong>
                    <span>{scan.marketplace}</span>
                  </div>
                  <span className={`badge ${statusClass(scan.decision)}`}>{decisionLabel(scan.decision)}</span>
                </div>
                <div className="category-card-metrics">
                  <span>Ürün <b>{scan.data_points}</b></span>
                  <span>Skor <b>{scan.composite_score ?? '-'}</b></span>
                  <span>Güven <b>{confidenceLabel(scan.decision_surface?.confidence)}</b></span>
                </div>
                <p>{scan.decision_surface?.operator_summary || decisionLabel(scan.decision)}</p>
                {isStaleScan(scan) ? <span className="badge stale">Veri bayat — yeniden tarama önerilir</span> : null}
                {scan.data_quality?.confidence_blockers?.length ? (
                  <div className="blocker-list">
                    {scan.data_quality.confidence_blockers.map((blocker, index) => (
                      <span className="badge pending" key={`${blocker}-${index}`}>{blockerLabel(blocker)}</span>
                    ))}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SellerCell({ product }: { product: Product }) {
  const info = sellerInfo(product);
  return (
    <div className={`seller-cell seller-${info.kind}`}>
      <span className={`badge seller-badge-${info.kind}`}>{info.badge}</span>
      <strong>{info.label}</strong>
      <small>{info.note}</small>
    </div>
  );
}

function skuPriorityValue(decision?: SkuDecision | null) {
  switch (decision?.action) {
    case 'AL':
      return 3;
    case 'TAKIP_ET':
      return 2;
    case 'UZAK_DUR':
      return 1;
    default:
      return 0;
  }
}

function isActionableProduct(product: Product, decision?: SkuDecision | null) {
  if (!decision) return false;
  if (decision.decision_tier === 'PENDING_ENRICHMENT') return false;
  return Boolean(
    skuPriorityValue(decision) > 0
    && productPrice(product) !== null
    && Number(product.review_count || 0) >= 100,
  );
}

function tierLabel(tier?: SkuDecision['decision_tier']) {
  switch (tier) {
    case 'DECISION_READY': return 'Karar hazır';
    case 'PRIORITY_SIGNAL': return 'Öncelikli sinyal';
    case 'PENDING_ENRICHMENT': return 'Veri bekleniyor';
    default: return '';
  }
}

function tierClass(tier?: SkuDecision['decision_tier']) {
  switch (tier) {
    case 'DECISION_READY': return 'tier-ready';
    case 'PRIORITY_SIGNAL': return 'tier-signal';
    case 'PENDING_ENRICHMENT': return 'tier-pending';
    default: return '';
  }
}

function ProductDecisionQueue({ products, skuDecisions }: { products: Product[]; skuDecisions: SkuDecision[] }) {
  const rows = products
    .map((product) => ({ product, decision: findSkuDecision(product, skuDecisions) }))
    .filter((row) => isActionableProduct(row.product, row.decision))
    .sort((a, b) => skuPriorityValue(b.decision) - skuPriorityValue(a.decision) || Number(b.product.review_count || 0) - Number(a.product.review_count || 0))
    .slice(0, 6);

  if (!rows.length) return null;

  return (
    <section className="panel decision-queue">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Öncelikli Karar Listesi</h2>
          <p className="muted">Karar-hazır veya öncelikli sinyal sınıfında, fiyat ve yorum verisi tam olan SKU'lar. Veri bekleyenler gizlendi.</p>
        </div>
        <span className="muted">{rows.length} kayıt</span>
      </div>
      <div className="panel-body queue-grid">
        {rows.map(({ product, decision }, index) => (
          <article className="queue-card" key={`${product.id}-${index}`}>
            <div className="queue-card-head">
              <span className={`badge ${actionClass(decision?.action)}`}>{skuActionLabel(decision?.action)}</span>
              <span className={`badge ${tierClass(decision?.decision_tier)}`}>{tierLabel(decision?.decision_tier)}</span>
              <span className="muted">{confidenceLabel(decision?.confidence)}</span>
            </div>
            <strong>{product.product_url ? <a href={product.product_url} target="_blank">{product.title}</a> : product.title}</strong>
            <p>{decision?.reasons?.[0] || 'Veri kalitesi yeterli.'}</p>
            <div className="queue-card-metrics">
              <span>Fiyat <b>{product.price ?? '-'}</b></span>
              <span>Yorum <b>{product.review_count}</b></span>
              <span>Satıcı <b>{sellerInfo(product).label}</b></span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function KeepaActionPanel({
  keepaLoading,
  keepaStatus,
  onFetch,
}: {
  keepaLoading: boolean;
  keepaStatus: KeepaScanStatus | null;
  onFetch: () => void;
}) {
  if (!keepaStatus) return null;
  return (
    <section className="panel keepa-action-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Keepa Enrichment Durumu</h2>
          <p className="muted">Fiyat geçmişi ve Buy Box sinyali için bu araştırmadaki Keepa kapsamasını kontrol et.</p>
        </div>
        <button className="button" disabled={!keepaStatus.can_fetch || keepaLoading} onClick={onFetch} type="button">
          {keepaLoading ? 'Keepa Çekiliyor' : 'Keepa Trend Çek'}
        </button>
      </div>
      <div className="panel-body keepa-action-grid">
        <div><span>ASIN</span><b>{keepaStatus.asin_count}</b></div>
        <div><span>Snapshot</span><b>{keepaStatus.snapshot_asin_count}</b></div>
        <div><span>Kapsama</span><b>{percent(keepaStatus.coverage)}</b></div>
        <div><span>Kuyruk</span><b>{keepaStatus.queue.pending}</b></div>
        <div><span>Hatalı</span><b>{keepaStatus.queue.failed}</b></div>
        <div><span>Yerel Limit</span><b>{keepaStatus.local_budget ? `${keepaStatus.local_budget.tokens_used}/${keepaStatus.local_budget.token_budget}` : '-'}</b></div>
      </div>
    </section>
  );
}

function SellerEnrichmentPanel({
  loading,
  sellerCoverage,
  onFetch,
}: {
  loading: boolean;
  sellerCoverage?: number;
  onFetch: () => void;
}) {
  return (
    <section className="panel keepa-action-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Satıcı Enrichment Durumu</h2>
          <p className="muted">Satıcı ve Buy Box doğrulaması için eksik ürünlerde product detail enrichment çalıştır.</p>
        </div>
        <button className="button" disabled={loading} onClick={onFetch} type="button">
          {loading ? 'Satıcı Çekiliyor' : 'Satıcı Verisini Zenginleştir'}
        </button>
      </div>
      <div className="panel-body keepa-action-grid">
        <div><span>Satıcı Kapsaması</span><b>{percent(sellerCoverage)}</b></div>
        <div><span>Çalışma Limiti</span><b>10 ürün</b></div>
      </div>
    </section>
  );
}


function DecisionSurfacePanel({
  detail,
  thesisLoading,
  onActivateThesis,
  onSelectSku,
}: {
  detail: ScanDetail | null;
  thesisLoading: boolean;
  onActivateThesis: () => void;
  onSelectSku: (sku: PrioritySku) => void;
}) {
  const surface = detail?.risk?.decision_surface ?? null;
  const quality = detail?.risk?.data_quality ?? null;
  const skuDecisions = detail?.risk?.sku_decisions ?? [];
  const distribution = surface?.action_distribution;
  const dataGate = surface?.data_gate;
  const coverageSummary = coverageBreakdownSummary(quality?.coverage_breakdown);
  const riskBadges = surface?.risk_badges ?? [];
  const topSkuDecisions = skuDecisions.slice(0, 8);

  if (!surface && !quality && !skuDecisions.length) return null;

  return (
    <section className="panel decision-surface">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Karar Yüzeyi</h2>
          <p className="muted">Operatörün birkaç saniyede ana kararı, gerekçeyi ve veri eksiklerini görmesi için.</p>
        </div>
        {surface ? <span className={`badge ${actionClass(surface.primary_action)}`}>{skuActionLabel(surface.primary_action)}</span> : null}
      </div>
      <div className="panel-body decision-surface-body">
        {hasLowCoverageWarning(quality) ? (
          <LowCoverageBanner breakdown={quality?.coverage_breakdown} coverageSummary={coverageSummary} />
        ) : null}
        {surface?.gate_applied ? <div className="preliminary-banner">Coverage gate uygulandı; karar TAKİP ET'e düşürüldü.</div> : null}
        <div className="decision-hero">
          <div className="decision-hero-icon"><ShieldCheck size={22} /></div>
          <div>
            <span className="metric-label">Ana karar</span>
            <strong>{surface ? skuActionLabel(surface.primary_action) : '-'}</strong>
            <p>{surface?.operator_summary || 'Karar özeti henüz yok.'}</p>
            {surface && (surface.primary_action === 'AL' || surface.primary_action === 'TAKIP_ET') ? (
              <button className="button button-secondary thesis-activate-button" disabled={thesisLoading} onClick={onActivateThesis} type="button">
                {thesisLoading ? 'Aktive ediliyor' : 'Tezi Aktive Et'}
              </button>
            ) : null}
          </div>
        </div>
        <div className="decision-mini-grid">
          <div className="metric compact"><div className="metric-label">Güven</div><div className="metric-value">{confidenceLabel(surface?.confidence)}</div></div>
          <div className="metric compact"><div className="metric-label">Fiyat Kapsaması</div><div className="metric-value">{percent(quality?.price_coverage)}</div></div>
          <div className="metric compact"><div className="metric-label">Satıcı Kapsaması</div><div className="metric-value">{percent(quality?.seller_coverage)}</div></div>
          <div className="metric compact"><div className="metric-label">Keepa Kapsaması</div><div className="metric-value">{percent(quality?.keepa_coverage)}</div></div>
        </div>
        {surface?.priority_view ? <PriorityViewPanel onSelectSku={onSelectSku} priority={surface.priority_view} /> : null}
        <RiskBadgeRow badges={riskBadges} />
        <div className="decision-columns">
          <div className="decision-list">
            <h3>Veri Hazırlık Durumu</h3>
            <span className={`badge ${dataGate?.status === 'READY' ? 'done' : dataGate?.status === 'INSUFFICIENT_DATA' ? 'failed' : 'pending'}`}>
              {dataGate?.status === 'READY' ? 'Hazır' : dataGate?.status === 'INSUFFICIENT_DATA' ? 'Yetersiz Veri' : 'Enrichment Gerekli'}
            </span>
            <p>{dataGate?.message || 'Veri hazırlık durumu henüz hesaplanmadı.'}</p>
          </div>
          <div className="decision-list">
            <h3>Aksiyon Dağılımı</h3>
            <div className="action-distribution">
              <span><b>{distribution?.counts.AL ?? 0}</b> AL</span>
              <span><b>{distribution?.counts.TAKIP_ET ?? 0}</b> TAKİP ET</span>
              <span><b>{distribution?.counts.UZAK_DUR ?? 0}</b> UZAK DUR</span>
            </div>
            {distribution?.single_action_warning ? <p>{distribution.single_action_warning}</p> : null}
          </div>
        </div>
        <div className="decision-columns">
          <div className="decision-list">
            <h3><ListChecks size={15} />En önemli nedenler</h3>
            {(surface?.top_reasons?.length ? surface.top_reasons : ['Neden listesi henüz yok.']).map((reason, index) => (
              <p key={`${reason}-${index}`}>{reason}</p>
            ))}
          </div>
          <div className="decision-list">
            <h3>Veri uyarıları</h3>
            {surface?.confidence_blockers?.length ? surface.confidence_blockers.map((blocker, index) => (
              <span className="badge pending" key={`${blocker}-${index}`}>{blockerLabel(blocker)}</span>
            )) : <p>Belirgin veri uyarısı yok.</p>}
          </div>
        </div>
        {topSkuDecisions.length ? (
          <div className="sku-decision-grid">
            {topSkuDecisions.map((sku, index) => {
              const confidenceKey = String(sku.confidence || '').toLowerCase();
              const insufficient = confidenceKey === 'insufficient_data';
              return (
                <div className={`sku-card confidence-${confidenceKey}`} key={`${sku.asin || sku.title}-${index}`}>
                  <div className="sku-card-head">
                    <span className={`badge ${actionClass(sku.action)}`}>{skuActionLabel(sku.action)}</span>
                    <span className="muted">{confidenceLabel(sku.confidence)}</span>
                  </div>
                  <strong>{sku.title}</strong>
                  <p>{insufficient ? 'Veri yetersiz, skor güvenilir değil' : sku.reasons[0] || 'Veri kalitesi yeterli.'}</p>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ProductsPanel() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScanDetail | null>(null);
  const [keepaStatus, setKeepaStatus] = useState<KeepaScanStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scanSearch, setScanSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(0);
  const PRODUCT_PAGE_SIZE = 50;
  const [sellerFilter, setSellerFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minReviews, setMinReviews] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [productView, setProductView] = useState<'actionable' | 'missing' | 'all'>('actionable');
  const [minComposite, setMinComposite] = useState('');
  const [loading, setLoading] = useState(false);
  const [keepaLoading, setKeepaLoading] = useState(false);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [thesisLoading, setThesisLoading] = useState(false);
  const [keepaDetail, setKeepaDetail] = useState<KeepaDetailResponse | null>(null);

  async function loadScans(preferredJobId?: string | null) {
    const { scans } = await apiGet<{ scans: Scan[] }>('/api/scans');
    const doneScans = scans.filter((scan) => scan.status === 'done');
    setScans(doneScans);
    const queryJob = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('job');
    const nextJobId = preferredJobId || queryJob || selectedJobId || doneScans[0]?.id || null;
    setSelectedJobId(nextJobId);
    if (nextJobId) await loadDetail(nextJobId);
  }

  async function loadDetail(jobId = selectedJobId) {
    if (!jobId) {
      setDetail(null);
      setKeepaStatus(null);
      setKeepaDetail(null);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const [scanDetail, status, keepa] = await Promise.all([
        apiGet<ScanDetail>(`/api/scans/${jobId}`),
        apiGet<KeepaScanStatus>(`/api/scans/${jobId}/keepa/status`),
        apiGet<KeepaDetailResponse>(`/api/scans/${jobId}/keepa-detail`).catch(() => ({ snapshots: [] })),
      ]);
      setDetail(scanDetail);
      setKeepaStatus(status);
      setKeepaDetail(keepa);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Araştırma getirilemedi');
    } finally {
      setLoading(false);
    }
  }

  async function fetchKeepaTrend() {
    if (!selectedJobId) return;
    setKeepaLoading(true);
    setMessage(null);
    try {
      const result = await apiPost<{ ok: boolean; processed?: number; queued?: number; skippedByBudget?: number; error?: string }>(
        `/api/scans/${selectedJobId}/keepa`,
        {},
      );
      if (!result.ok) {
        setMessage(result.error || 'Keepa verisi alınamadı');
        return;
      }
      setMessage(`Keepa tamamlandı: ${result.processed ?? 0} snapshot işlendi, ${result.skippedByBudget ?? 0} yerel limit nedeniyle atlandı.`);
      await loadDetail(selectedJobId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Keepa verisi alınamadı');
    } finally {
      setKeepaLoading(false);
    }
  }

  async function fetchSellerEnrichment() {
    if (!selectedJobId) return;
    setSellerLoading(true);
    setMessage(null);
    try {
      const result = await apiPost<{ ok: boolean; attempted: number; updated: number; errors?: Array<{ error: string }>; note?: string }>(
        `/api/scans/${selectedJobId}/seller-enrichment`,
        { limit: 10 },
      );
      setMessage(`Satıcı enrichment: ${result.updated}/${result.attempted} ürün güncellendi. ${result.note ?? ''}`.trim());
      await loadDetail(selectedJobId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Satıcı enrichment çalışmadı');
    } finally {
      setSellerLoading(false);
    }
  }

  async function activateThesis() {
    if (!selectedJobId) return;
    setThesisLoading(true);
    setMessage(null);
    try {
      await apiPost(`/api/scans/${selectedJobId}/thesis`, {});
      setMessage('Tez aktive edildi; Tezler sayfasında görünecek.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tez aktive edilemedi');
    } finally {
      setThesisLoading(false);
    }
  }

  useEffect(() => {
    loadScans().catch((error) => setMessage(error instanceof Error ? error.message : 'Ürün verisi alınamadı'));
  }, []);

  const visibleScans = useMemo(() => {
    const query = scanSearch.trim().toLowerCase();
    return scans.filter((scan) => (
      (!query
        || scan.keyword.toLowerCase().includes(query)
        || scan.marketplace.toLowerCase().includes(query)
        || String(scan.decision || '').toLowerCase().includes(query))
      && (!decisionFilter || scan.decision === decisionFilter)
      && (!actionFilter || operatorAction(scan.decision) === actionFilter)
      && (minComposite === '' || (numeric(scan.composite_score) !== null && Number(numeric(scan.composite_score)) >= Number(minComposite)))
    ));
  }, [actionFilter, decisionFilter, minComposite, scanSearch, scans]);

  const products = detail?.products ?? [];
  const skuDecisions = detail?.risk?.sku_decisions ?? [];
  const selectedScan = detail?.scan || scans.find((scan) => scan.id === selectedJobId) || null;
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    const sellerQuery = sellerFilter.trim().toLowerCase();
    const min = Number(minPrice);
    const max = Number(maxPrice);
    const reviews = Number(minReviews);
    return products.filter((product) => {
      const skuDecision = findSkuDecision(product, skuDecisions);
      const price = productPrice(product);
      const title = product.title.toLowerCase();
      const seller = sellerInfo(product);
      const sellerName = `${seller.label} ${seller.badge}`.toLowerCase();
      const asin = String(product.asin || '').toLowerCase();
      const actionable = isActionableProduct(product, skuDecision);
      if (productView === 'actionable' && !actionable) return false;
      if (productView === 'missing' && actionable) return false;
      if (query && !title.includes(query) && !asin.includes(query)) return false;
      if (sellerQuery && !sellerName.includes(sellerQuery)) return false;
      if (Number.isFinite(min) && minPrice !== '' && (price === null || price < min)) return false;
      if (Number.isFinite(max) && maxPrice !== '' && (price === null || price > max)) return false;
      if (Number.isFinite(reviews) && minReviews !== '' && Number(product.review_count || 0) < reviews) return false;
      return true;
    }).sort((a, b) => {
      const aDecision = findSkuDecision(a, skuDecisions);
      const bDecision = findSkuDecision(b, skuDecisions);
      return skuPriorityValue(bDecision) - skuPriorityValue(aDecision) || Number(b.review_count || 0) - Number(a.review_count || 0);
    });
  }, [maxPrice, minPrice, minReviews, productSearch, productView, products, sellerFilter, skuDecisions]);

  const productViewCounts = useMemo(() => {
    const rows = products.map((product) => ({ product, decision: findSkuDecision(product, skuDecisions) }));
    return {
      actionable: rows.filter((row) => isActionableProduct(row.product, row.decision)).length,
      missing: rows.filter((row) => !isActionableProduct(row.product, row.decision)).length,
      all: products.length,
    };
  }, [products, skuDecisions]);

  const [actionableFiltered, missingFiltered] = useMemo(() => {
    if (productView !== 'all') return [filteredProducts, [] as typeof filteredProducts];
    const actionable: typeof filteredProducts = [];
    const missing: typeof filteredProducts = [];
    for (const p of filteredProducts) {
      if (isActionableProduct(p, findSkuDecision(p, skuDecisions))) actionable.push(p);
      else missing.push(p);
    }
    return [actionable, missing];
  }, [filteredProducts, productView, skuDecisions]);

  return (
    <div className="content">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Ürün ve Pazar Analizi</h2>
            <p className="muted">Tamamlanmış araştırma seç, ürün tablosunu ve grafik analizlerini incele.</p>
          </div>
          <button className="button" onClick={() => loadScans()} type="button"><RefreshCw size={16} />Yenile</button>
        </div>
        <div className="panel-body">
          <div className="keyword-search">
            <Search size={16} />
            <input
              className="input"
              onChange={(event) => setScanSearch(event.target.value)}
              placeholder="Araştırma ara"
              value={scanSearch}
            />
          </div>
          <div className="scan-picker">
            <select
              className="select"
              value={selectedJobId ?? ''}
              onChange={(event) => {
                setSelectedJobId(event.target.value);
              }}
            >
              {visibleScans.length ? visibleScans.map((scan) => (
                <option key={scan.id} value={scan.id}>
                  {scan.keyword} · {scan.marketplace} · {scan.data_points} ürün · {decisionLabel(scan.decision)}
                </option>
              )) : <option value="">Tamamlanmış araştırma bulunamadı</option>}
            </select>
            <button className="button" disabled={!selectedJobId || loading} onClick={() => loadDetail()} type="button">
              {loading ? 'Getiriliyor' : 'Getir'}
            </button>
            <span className={`badge ${statusClass(selectedScan?.decision)}`}>{decisionLabel(selectedScan?.decision)}</span>
          </div>
          {selectedScan ? (
            <div className="scan-selection-summary">
              <div><span>Anahtar Kelime</span><b>{selectedScan.keyword}</b></div>
              <div><span>Pazar Yeri</span><b>{selectedScan.marketplace}</b></div>
              <div><span>Veri</span><b>{selectedScan.data_points}</b></div>
              <div><span>Bileşik Skor</span><b>{selectedScan.composite_score ?? '-'}</b></div>
              <div><span>Aksiyon</span><b>{operatorAction(selectedScan.decision)}</b></div>
              {isStaleScan(selectedScan) ? <div><span>Veri Durumu</span><b><span className="badge stale">Veri bayat</span></b></div> : null}
            </div>
          ) : null}
          {message ? <p className="error">{message}</p> : null}
        </div>
      </section>

      <DecisionSurfacePanel
        detail={detail}
        onActivateThesis={activateThesis}
        onSelectSku={(sku) => {
          setProductSearch(sku.title.slice(0, 48));
          setProductPage(0);
        }}
        thesisLoading={thesisLoading}
      />

      <details className="advanced-actions">
        <summary>İleri enrichment araçları</summary>
        <KeepaActionPanel keepaLoading={keepaLoading} keepaStatus={keepaStatus} onFetch={fetchKeepaTrend} />
        <SellerEnrichmentPanel
          loading={sellerLoading}
          onFetch={fetchSellerEnrichment}
          sellerCoverage={detail?.risk?.data_quality?.seller_coverage}
        />
      </details>
      <KeepaLineagePanel detail={keepaDetail} />

      <ProductDecisionQueue products={products} skuDecisions={skuDecisions} />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Kategori Karşılaştırması</h2>
            <p className="muted">Araştırmaları aksiyona göre gruplu gör; detay için karta tıkla.</p>
          </div>
          <span className="muted">{visibleScans.length}/{scans.length} araştırma</span>
        </div>
        <div className="panel-body">
          <CategoryGroupedView
            scans={visibleScans}
            selectedJobId={selectedJobId}
            onSelect={(scan) => {
              setSelectedJobId(scan.id);
              loadDetail(scan.id).catch(() => undefined);
            }}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Ürün Filtreleri</h2>
            <p className="muted">Ürün tablosu, grafikler ve araştırma karşılaştırması bu filtrelere göre güncellenir.</p>
          </div>
          <span className="muted">{filteredProducts.length}/{products.length} ürün</span>
        </div>
          <div className="panel-body">
          <div className="product-filter-grid">
            <div className="segmented product-view-toggle">
              <button className={productView === 'all' ? 'active' : ''} onClick={() => setProductView('all')} type="button">Tümü ({productViewCounts.all})</button>
              <button className={productView === 'actionable' ? 'active' : ''} onClick={() => setProductView('actionable')} type="button">Aksiyon alınabilir ({productViewCounts.actionable})</button>
              <button className={productView === 'missing' ? 'active' : ''} onClick={() => setProductView('missing')} type="button">Veri eksik ({productViewCounts.missing})</button>
            </div>
            <input className="input" onChange={(event) => setProductSearch(event.target.value)} placeholder="Ürün veya ASIN ara" value={productSearch} />
            <input className="input" onChange={(event) => setSellerFilter(event.target.value)} placeholder="Satıcı ara" value={sellerFilter} />
            <input className="input" min="0" onChange={(event) => setMinPrice(event.target.value)} placeholder="Min fiyat" type="number" value={minPrice} />
            <input className="input" min="0" onChange={(event) => setMaxPrice(event.target.value)} placeholder="Max fiyat" type="number" value={maxPrice} />
            <input className="input" min="0" onChange={(event) => setMinReviews(event.target.value)} placeholder="Min yorum" type="number" value={minReviews} />
            <select className="select" onChange={(event) => setDecisionFilter(event.target.value)} value={decisionFilter}>
              <option value="">Tüm kararlar</option>
              <option value="GUVENLI">Güvenli</option>
              <option value="DIKKATLI_OL">Dikkatli Ol</option>
              <option value="MIXED_SIGNAL">Karışık Sinyal</option>
              <option value="INSUFFICIENT_DATA">Yetersiz Veri</option>
              <option value="GIRME">Girme</option>
            </select>
            <select className="select" onChange={(event) => setActionFilter(event.target.value)} value={actionFilter}>
              <option value="">Tüm aksiyonlar</option>
              <option value="Al">Al</option>
              <option value="Takip Et">Takip Et</option>
              <option value="Uzak Dur">Uzak Dur</option>
            </select>
            <input className="input" max="10" min="0" onChange={(event) => setMinComposite(event.target.value)} placeholder="Min bileşik skor" type="number" value={minComposite} />
          </div>
        </div>
      </section>

      <details className="detail-analysis">
        <summary>Detaylı Analiz</summary>
        <ProductAnalytics keepaStatus={keepaStatus} products={filteredProducts} risk={detail?.risk} />
        <BrandBreakdown products={filteredProducts} />
      </details>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Ürün Tablosu</h2>
          <span className="muted">{(productView === 'all' ? actionableFiltered : filteredProducts).length} ürün</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Ürün</th><th>Aksiyon</th><th>Gerekçe</th><th>Fiyat</th><th>Puan</th><th>Yorum</th><th>Satıcı</th><th>ASIN</th></tr>
            </thead>
            <tbody>
              {(() => {
                const list = productView === 'all' ? actionableFiltered : filteredProducts;
                const totalProducts = list.length;
                const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCT_PAGE_SIZE));
                const safePage = Math.min(productPage, totalPages - 1);
                const start = safePage * PRODUCT_PAGE_SIZE;
                return list.slice(start, start + PRODUCT_PAGE_SIZE).map((product) => {
                  const skuDecision = findSkuDecision(product, skuDecisions);
                  return (
                    <tr key={product.id}>
                      <td>{product.product_url ? <a href={product.product_url} target="_blank">{product.title}</a> : product.title}</td>
                      <td><span className={`badge ${actionClass(skuDecision?.action)}`}>{skuActionLabel(skuDecision?.action)}</span></td>
                      <td className="reason-cell">{skuDecision?.reasons?.[0] || '-'}</td>
                      <td>{product.price ?? '-'}</td>
                      <td>{product.rating ?? '-'}</td>
                      <td>{product.review_count}</td>
                      <td className={isSellerMissing(product) ? 'seller-missing-cell' : undefined}><SellerCell product={product} /></td>
                      <td>{product.asin || '-'}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
        {(() => {
          const list = productView === 'all' ? actionableFiltered : filteredProducts;
          if (list.length <= PRODUCT_PAGE_SIZE) return null;
          const totalPages = Math.max(1, Math.ceil(list.length / PRODUCT_PAGE_SIZE));
          const safePage = Math.min(productPage, totalPages - 1);
          return (
            <div className="pagination">
              <button type="button" className="button button-secondary" disabled={safePage === 0} onClick={() => setProductPage(safePage - 1)}>Önceki</button>
              <span className="muted">{safePage + 1} / {totalPages} · {list.length} ürün</span>
              <button type="button" className="button button-secondary" disabled={safePage + 1 >= totalPages} onClick={() => setProductPage(safePage + 1)}>Sonraki</button>
            </div>
          );
        })()}
      </section>

      {productView === 'all' && missingFiltered.length > 0 && (
        <details className="panel panel-missing">
          <summary className="panel-header panel-header-missing">
            <span className="panel-title">Veri Eksik / Noise</span>
            <span className="muted">{missingFiltered.length} ürün — varsayılan kapalı</span>
          </summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Ürün</th><th>Aksiyon</th><th>Gerekçe</th><th>Fiyat</th><th>Puan</th><th>Yorum</th><th>Satıcı</th><th>ASIN</th></tr>
              </thead>
              <tbody>
                {missingFiltered.map((product) => {
                  const skuDecision = findSkuDecision(product, skuDecisions);
                  return (
                    <tr key={product.id}>
                      <td>{product.product_url ? <a href={product.product_url} target="_blank">{product.title}</a> : product.title}</td>
                      <td><span className={`badge ${actionClass(skuDecision?.action)}`}>{skuActionLabel(skuDecision?.action)}</span></td>
                      <td className="reason-cell">{skuDecision?.reasons?.[0] || '-'}</td>
                      <td>{product.price ?? '-'}</td>
                      <td>{product.rating ?? '-'}</td>
                      <td>{product.review_count}</td>
                      <td className={isSellerMissing(product) ? 'seller-missing-cell' : undefined}><SellerCell product={product} /></td>
                      <td>{product.asin || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

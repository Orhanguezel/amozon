'use client';

import {
  coverageBreakdownSummary,
  skuActionLabel,
  type CoverageBreakdown,
  type PrioritySku,
  type PriorityView,
  type RiskBadge,
} from './types';

function percent(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

export function CoverageBreakdownBar({ breakdown }: { breakdown: CoverageBreakdown }) {
  const layers = [
    { key: 'seller' as const, label: 'Satıcı', value: breakdown.seller_coverage },
    { key: 'keepa' as const, label: 'Keepa', value: breakdown.keepa_coverage },
    { key: 'stale' as const, label: 'Bayat', value: breakdown.stale_ratio },
  ];

  return (
    <div className="coverage-breakdown-bar" aria-label="Coverage katmanları">
      {layers.map((layer) => (
        <div className="coverage-layer" key={layer.key}>
          <span>{layer.label}</span>
          <div className="coverage-layer-track">
            <i
              className={breakdown.dominant_blocker === layer.key ? 'dominant' : undefined}
              style={{ width: `${Math.round(Math.max(0, Math.min(1, layer.value)) * 100)}%` }}
            />
          </div>
          <b>{percent(layer.value)}</b>
        </div>
      ))}
    </div>
  );
}

export function RiskBadgeRow({ badges }: { badges: RiskBadge[] }) {
  if (!badges.length) return null;
  return (
    <div className="risk-badge-row">
      {badges.map((badge) => (
        <span className={`badge ${badge.tone}`} key={badge.type} title={badge.description}>
          {badge.label}
        </span>
      ))}
    </div>
  );
}

export function PriorityViewPanel({
  priority,
  onSelectSku,
  compact = false,
}: {
  priority: PriorityView;
  onSelectSku?: (sku: PrioritySku) => void;
  compact?: boolean;
}) {
  const columns = [
    { key: 'highest_confidence' as const, title: 'En Yüksek Güven', items: priority.highest_confidence },
    { key: 'lowest_chaos' as const, title: 'En Düşük Kaos', items: priority.lowest_chaos },
    { key: 'best_candidate' as const, title: 'En İyi Aday', items: priority.best_candidate },
  ];

  return (
    <div className={`priority-view-panel${compact ? ' priority-view-panel-compact' : ''}`}>
      <h3>Öncelik Görünümü</h3>
      <div className="priority-view-grid">
        {columns.map((column) => (
          <div className="priority-column" key={column.key}>
            <h4>{column.title}</h4>
            {column.items.length ? (
              <ul>
                {column.items.map((sku) => (
                  <li key={`${column.key}-${sku.asin || sku.title}`}>
                    {onSelectSku ? (
                      <button className="priority-sku-link" onClick={() => onSelectSku(sku)} type="button">
                        <strong>{skuActionLabel(sku.action)}</strong>
                        <span>{sku.title}</span>
                        {!compact ? <small>{sku.reason}</small> : null}
                      </button>
                    ) : (
                      <div className="priority-sku-static">
                        <strong>{skuActionLabel(sku.action)}</strong>
                        <span>{sku.title}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Liste boş</p>
            )}
          </div>
        ))}
      </div>
      {!priority.best_candidate.length && priority.empty_reason ? (
        <p className="priority-empty-note">{priority.empty_reason}</p>
      ) : null}
    </div>
  );
}

export function LowCoverageBanner({
  coverageSummary,
  breakdown,
}: {
  coverageSummary: string | null;
  breakdown?: CoverageBreakdown | null;
}) {
  return (
    <div className="preliminary-banner">
      <strong>ÖN DEĞERLENDİRME — coverage düşük</strong>
      {coverageSummary ? <p className="coverage-breakdown-note">{coverageSummary}</p> : null}
      {breakdown ? <CoverageBreakdownBar breakdown={breakdown} /> : null}
    </div>
  );
}

export { coverageBreakdownSummary, percent };

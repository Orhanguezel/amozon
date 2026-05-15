import { BarChart3, LineChart, Radar, Star, Tag, TrendingUp } from 'lucide-react';
import {
  confidenceLabel,
  isSellerMissing,
  keepaStatusReasonLabel,
  numeric,
  productPrice,
  productRating,
  scoreFields,
  type KeepaScanStatus,
  type Product,
} from './types';

const priceBuckets = [
  { label: '$0-15', min: 0, max: 15 },
  { label: '$15-30', min: 15, max: 30 },
  { label: '$30-60', min: 30, max: 60 },
  { label: '$60-100', min: 60, max: 100 },
  { label: '$100+', min: 100, max: Infinity },
];

const ratingBuckets = [
  { label: '4.5-5.0', min: 4.5, max: 5.01 },
  { label: '4.0-4.5', min: 4.0, max: 4.5 },
  { label: '3.5-4.0', min: 3.5, max: 4.0 },
  { label: '<3.5', min: 0, max: 3.5 },
];

function buildHistogram(products: Product[], buckets: Array<{ label: string; min: number; max: number }>, valueOf: (product: Product) => number | null) {
  return buckets.map((bucket) => ({
    label: bucket.label,
    count: products.filter((product) => {
      const value = valueOf(product);
      return value !== null && value >= bucket.min && value < bucket.max;
    }).length,
  }));
}

export function buildBrandRows(products: Product[]) {
  const sellers = new Map<string, { count: number; prices: number[]; reviews: number }>();
  let missingCount = 0;
  for (const product of products) {
    const seller = product.seller_name?.trim() || null;
    if (!seller) { missingCount++; continue; }
    const current = sellers.get(seller) ?? { count: 0, prices: [], reviews: 0 };
    current.count += 1;
    current.reviews += Number(product.review_count || 0);
    const price = productPrice(product);
    if (price !== null) current.prices.push(price);
    sellers.set(seller, current);
  }
  const rows: Array<{ name: string; count: number; avgPrice: number | null; reviews: number; verified: boolean }> =
    [...sellers.entries()]
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgPrice: data.prices.length ? data.prices.reduce((sum, price) => sum + price, 0) / data.prices.length : null,
        reviews: data.reviews,
        verified: true,
      }))
      .sort((a, b) => b.count - a.count || b.reviews - a.reviews)
      .slice(0, 8);
  if (missingCount > 0) {
    rows.push({ name: 'Satıcı verisi yok', count: missingCount, avgPrice: null, reviews: 0, verified: false });
  }
  return rows;
}

function priceSummary(products: Product[]) {
  const prices = products.map(productPrice).filter((price): price is number => price !== null).sort((a, b) => a - b);
  if (!prices.length) return null;
  const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  return {
    min: prices[0],
    max: prices[prices.length - 1],
    avg,
    median: prices[Math.floor(prices.length / 2)],
  };
}

function RadarChartMini({ risk }: { risk: Record<string, unknown> | null | undefined }) {
  const values = scoreFields.map(([key, label], index) => {
    const score = numeric(risk?.[`${key}_score`]) ?? 0;
    const angle = -90 + index * (360 / scoreFields.length);
    const radius = 18 + Math.max(0, Math.min(10, score)) * 5.2;
    const rad = (angle * Math.PI) / 180;
    return {
      label,
      x: 90 + Math.cos(rad) * radius,
      y: 90 + Math.sin(rad) * radius,
      labelX: 90 + Math.cos(rad) * 78,
      labelY: 90 + Math.sin(rad) * 78,
    };
  });
  const points = values.map((item) => `${item.x},${item.y}`).join(' ');

  return (
    <svg className="radar-chart" viewBox="0 0 180 180" role="img" aria-label="Risk radar chart">
      {[30, 50, 70].map((radius) => (
        <circle cx="90" cy="90" fill="none" key={radius} r={radius} stroke="#d9dee7" strokeWidth="1" />
      ))}
      {values.map((item) => (
        <g key={item.label}>
          <line stroke="#d9dee7" strokeWidth="1" x1="90" x2={item.labelX} y1="90" y2={item.labelY} />
          <text fill="#64748b" fontSize="8" textAnchor="middle" x={item.labelX} y={item.labelY}>
            {item.label.split(' ')[0]}
          </text>
        </g>
      ))}
      <polygon fill="rgba(15,118,110,0.28)" points={points} stroke="#0f766e" strokeWidth="2" />
      {values.map((item) => (
        <circle cx={item.x} cy={item.y} fill="#0f766e" key={`${item.label}-dot`} r="3" />
      ))}
    </svg>
  );
}

function Histogram({ title, data, icon: Icon }: { title: string; data: Array<{ label: string; count: number }>; icon: typeof BarChart3 }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <div className="analytics-card">
      <div className="analytics-title">
        <Icon size={16} />
        <span>{title}</span>
      </div>
      <div className="histogram">
        {data.map((item) => (
          <div className="histogram-row" key={item.label}>
            <span>{item.label}</span>
            <div className="histogram-track"><i style={{ width: `${(item.count / max) * 100}%` }} /></div>
            <b>{item.count}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function keepaTrendSummary(risk: Record<string, unknown> | null | undefined) {
  const trend = risk?.keepa_trend;
  if (!trend || Array.isArray(trend) || typeof trend !== 'object') return null;
  const data = trend as Record<string, unknown>;
  const pricePoints = Array.isArray(data.price_points) ? data.price_points as Array<Record<string, unknown>> : [];
  return {
    sampleCount: numeric(data.sample_count) ?? 0,
    pricePoints: pricePoints
      .map((point) => ({ label: String(point.label || '-'), price: numeric(point.price) }))
      .filter((point): point is { label: string; price: number } => point.price !== null),
    buyBoxChangeAvg: numeric(data.buy_box_change_avg),
    sellerCountTrendAvg: numeric(data.seller_count_trend_avg),
  };
}

function KeepaTrendCard({ keepaStatus, risk }: { keepaStatus?: KeepaScanStatus | null; risk: Record<string, unknown> | null | undefined }) {
  const trend = keepaTrendSummary(risk);
  return (
    <div className="analytics-card">
      <div className="analytics-title">
        <LineChart size={16} />
        <span>Keepa Trend</span>
      </div>
      {trend && trend.sampleCount ? (
        <div className="summary-grid">
          <div><span>Snapshot</span><b>{trend.sampleCount}</b></div>
          <div><span>Buy Box</span><b>{trend.buyBoxChangeAvg ?? '-'}</b></div>
          <div><span>Satıcı Trendi</span><b>{trend.sellerCountTrendAvg ?? '-'}</b></div>
          <div>
            <span>Fiyat</span>
            <b>{trend.pricePoints.length ? trend.pricePoints.map((point) => `$${point.price.toFixed(2)}`).join(' / ') : '-'}</b>
          </div>
        </div>
      ) : (
        <div className="keepa-empty-state">
          <p>{keepaStatusReasonLabel(keepaStatus?.reason)}</p>
          <div className="keepa-mini-grid">
            <span>ASIN: <b>{keepaStatus?.asin_count ?? '-'}</b></span>
            <span>Snapshot: <b>{keepaStatus?.snapshot_asin_count ?? '-'}</b></span>
            <span>Kuyruk: <b>{keepaStatus?.queue.pending ?? '-'}</b></span>
            <span>Hata: <b>{keepaStatus?.queue.failed ?? '-'}</b></span>
          </div>
          {keepaStatus?.local_budget ? (
            <small>Yerel limit: {keepaStatus.local_budget.tokens_used}/{keepaStatus.local_budget.token_budget} kullanıldı, {keepaStatus.local_budget.remaining} kaldı.</small>
          ) : null}
          {keepaStatus?.queue.last_error ? <small>Son Keepa hatası: {keepaStatus.queue.last_error}</small> : null}
        </div>
      )}
    </div>
  );
}

function DimensionConfidenceCards({ risk }: { risk: Record<string, unknown> | null | undefined }) {
  if (!risk) return null;
  return (
    <div className="dimension-confidence-grid">
      {scoreFields.map(([key, label]) => {
        const confidence = String(risk[`${key}_confidence`] || '').toUpperCase();
        const insufficient = confidence === 'INSUFFICIENT_DATA';
        return (
          <div className={`dimension-confidence-card confidence-${confidence.toLowerCase()}`} key={key}>
            <div>
              <strong>{label}</strong>
              <span className="muted">{confidenceLabel(confidence)}</span>
            </div>
            <b>{insufficient ? '—' : numeric(risk[`${key}_score`]) ?? '-'}</b>
            <p>{insufficient ? 'Veri yetersiz, skor güvenilir değil' : String(risk[`${key}_reason`] || '-')}</p>
          </div>
        );
      })}
    </div>
  );
}

export function ProductAnalytics({ keepaStatus, products, risk }: { keepaStatus?: KeepaScanStatus | null; products: Product[]; risk: Record<string, unknown> | null | undefined }) {
  const prices = priceSummary(products);
  const priceHistogram = buildHistogram(products, priceBuckets, productPrice);
  const ratingHistogram = buildHistogram(products, ratingBuckets, productRating);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Ürün ve Pazar Analizi</h2>
        <span className="muted">Fiyat, rating, satıcı ve risk dağılımı.</span>
      </div>
      <div className="panel-body">
        <div className="analytics-grid">
          <div className="analytics-card radar-card">
            <div className="analytics-title">
              <Radar size={16} />
              <span>5 Boyutlu Risk Radar</span>
            </div>
            <RadarChartMini risk={risk} />
          </div>
          <Histogram data={priceHistogram} icon={BarChart3} title="Fiyat Histogramı" />
          <Histogram data={ratingHistogram} icon={Star} title="Puan Dağılımı" />
          <div className="analytics-card">
            <div className="analytics-title">
              <TrendingUp size={16} />
              <span>Fiyat Özeti</span>
            </div>
            <div className="summary-grid">
              <div><span>Min</span><b>{prices ? `$${prices.min.toFixed(2)}` : '-'}</b></div>
              <div><span>Median</span><b>{prices ? `$${prices.median.toFixed(2)}` : '-'}</b></div>
              <div><span>Avg</span><b>{prices ? `$${prices.avg.toFixed(2)}` : '-'}</b></div>
              <div><span>Max</span><b>{prices ? `$${prices.max.toFixed(2)}` : '-'}</b></div>
            </div>
          </div>
          <KeepaTrendCard keepaStatus={keepaStatus} risk={risk} />
        </div>
        <DimensionConfidenceCards risk={risk} />
      </div>
    </section>
  );
}

export function BrandBreakdown({ products }: { products: Product[] }) {
  const brandRows = buildBrandRows(products);
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Satıcı Kırılımı</h2>
        <span className="muted">Yalnızca doğrulanmış satıcı verisi gösteriliyor. Başlık tahminleri kaldırıldı.</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Satıcı</th>
              <th>SKU</th>
              <th>Ort. Fiyat</th>
              <th>Yorum Toplamı</th>
            </tr>
          </thead>
          <tbody>
            {brandRows.map((brand) => (
              <tr key={brand.name} className={brand.verified ? undefined : 'row-muted'}>
                <td>
                  <span className="seller-name"><Tag size={14} />{brand.name}</span>
                </td>
                <td>{brand.count}</td>
                <td>{brand.avgPrice === null ? '-' : `$${brand.avgPrice.toFixed(2)}`}</td>
                <td>{brand.reviews || '-'}</td>
              </tr>
            ))}
            {!brandRows.length ? (
              <tr><td colSpan={4}>Doğrulanmış satıcı verisi yok.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

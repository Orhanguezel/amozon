import type { KeepaSnapshot } from './keepa.client';

export type SignalContribution = {
  signal: string;
  label: string;
  value: string;
  dimensions: string[];
  description: string;
};

export function computeKeepaContributions(snapshot: KeepaSnapshot): SignalContribution[] {
  const out: SignalContribution[] = [];

  if (
    typeof snapshot.price_30d_min === 'number'
    && typeof snapshot.price_90d_avg === 'number'
    && snapshot.price_90d_avg > 0
  ) {
    const drop = (snapshot.price_90d_avg - snapshot.price_30d_min) / snapshot.price_90d_avg;
    if (drop > 0.02) {
      out.push({
        signal: 'historical_price_drop',
        label: 'Geçmiş fiyat düşüşü',
        value: `%${(drop * 100).toFixed(0)}`,
        dimensions: ['price_war_risk'],
        description: `90 gün ort. ${snapshot.price_90d_avg.toFixed(2)} → 30 gün min. ${snapshot.price_30d_min.toFixed(2)}`,
      });
    }
  }

  if (typeof snapshot.price_volatility === 'number' && snapshot.price_volatility > 0) {
    out.push({
      signal: 'price_volatility',
      label: 'Fiyat volatilitesi',
      value: `σ/μ=${snapshot.price_volatility.toFixed(3)}`,
      dimensions: ['price_war_risk'],
      description: 'Zaman serisi standart sapma / ortalama oranı; yüksek değer fiyat istikrarsızlığını gösterir',
    });
  }

  if (typeof snapshot.buy_box_change_count === 'number' && snapshot.buy_box_change_count > 0) {
    out.push({
      signal: 'buy_box_changes',
      label: 'Buy Box değişim',
      value: String(snapshot.buy_box_change_count),
      dimensions: ['operational_risk'],
      description: 'Buy Box satıcı değişim sayısı; yüksek değer satıcı yarışmasının yoğunluğunu gösterir',
    });
  }

  if (typeof snapshot.offer_count_avg === 'number' && snapshot.offer_count_avg > 0) {
    out.push({
      signal: 'offer_count_avg',
      label: 'Ort. teklif sayısı',
      value: snapshot.offer_count_avg.toFixed(1),
      dimensions: ['operational_risk'],
      description: '90 günlük ortalama teklif sayısı (rakip yoğunluğu)',
    });
  }

  if (snapshot.offer_count_trend) {
    const trendLabel = snapshot.offer_count_trend === 'up' ? 'artış' : snapshot.offer_count_trend === 'down' ? 'azalış' : 'düz';
    out.push({
      signal: 'offer_count_trend',
      label: 'Teklif sayısı trendi',
      value: trendLabel,
      dimensions: ['operational_risk'],
      description: 'Son 90 günde tedarikçi sayısının yönü (artış = rakip baskısı yükseliyor)',
    });
  }

  if (snapshot.seller_count_trend) {
    const trendLabel = snapshot.seller_count_trend === 'up' ? 'artış' : snapshot.seller_count_trend === 'down' ? 'azalış' : 'düz';
    out.push({
      signal: 'seller_count_trend',
      label: 'Satıcı sayısı trendi',
      value: trendLabel,
      dimensions: ['operational_risk', 'brand_reliability'],
      description: 'Satıcı sayısının zaman trendi (artış = marka disiplini zayıflıyor)',
    });
  }

  return out;
}

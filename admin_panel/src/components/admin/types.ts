export type Scan = {
  id: string;
  keyword: string;
  marketplace: string;
  status: string;
  data_points: number;
  error_msg: string | null;
  created_at: string;
  finished_at: string | null;
  composite_score: number | string | null;
  decision: string | null;
  decision_surface?: DecisionSurface | null;
  data_quality?: DataQuality | null;
};

export type Product = {
  id: string;
  title: string;
  price: string | number | null;
  rating: string | number | null;
  review_count: number;
  seller_name: string | null;
  asin: string | null;
  product_url: string | null;
};

export type DataQuality = {
  data_points: number;
  price_coverage: number;
  seller_coverage: number;
  keepa_coverage: number;
  scan_age_days?: number | null;
  has_price_data: boolean;
  has_keepa_snapshot: boolean;
  confidence_blockers: string[];
};

export type DecisionSurface = {
  legacy_decision?: string;
  primary_action: 'AL' | 'TAKIP_ET' | 'UZAK_DUR';
  confidence: string;
  confidence_blockers: string[];
  gate_applied?: boolean;
  top_reasons: string[];
  operator_summary: string;
  data_gate?: {
    status: 'READY' | 'ENRICHMENT_REQUIRED' | 'INSUFFICIENT_DATA';
    reasons: string[];
    message: string;
  };
  action_distribution?: {
    total: number;
    counts: Record<'AL' | 'TAKIP_ET' | 'UZAK_DUR', number>;
    dominant_action: 'AL' | 'TAKIP_ET' | 'UZAK_DUR' | null;
    dominant_ratio: number;
    single_action_warning: string | null;
  };
};

export type SkuDecisionTier = 'DECISION_READY' | 'PRIORITY_SIGNAL' | 'PENDING_ENRICHMENT';

export type SkuDecision = {
  asin: string | null;
  title: string;
  action: 'AL' | 'TAKIP_ET' | 'UZAK_DUR';
  confidence: string;
  decision_tier?: SkuDecisionTier;
  reasons: string[];
  signals: {
    price_status: string;
    seller_status: string;
    review_tier: string;
    rating_level: string;
    keepa_status: string;
  };
};

export type RiskDetail = Record<string, unknown> & {
  decision_surface?: DecisionSurface | null;
  data_quality?: DataQuality | null;
  sku_decisions?: SkuDecision[] | null;
};

export type ScanDetail = {
  scan: Scan;
  risk: RiskDetail | null;
  products: Product[];
};

export type KeepaScanStatus = {
  configured: boolean;
  job_id: string;
  scan_status: string;
  reason: string;
  can_fetch: boolean;
  product_count: number;
  asin_count: number;
  snapshot_asin_count: number;
  coverage: number;
  last_snapshot_at: string | null;
  queue: {
    queued_asin_count: number;
    pending: number;
    done: number;
    failed: number;
    last_processed_at: string | null;
    last_error: string | null;
  };
  local_budget: {
    token_budget: number;
    tokens_used: number;
    remaining: number;
  } | null;
};

export type Settings = {
  dbName: string | null;
  oxylabsConfigured: boolean;
  keepaConfigured: boolean;
  keepaDailyBudget: number;
  groqConfigured: boolean;
  openaiConfigured: boolean;
};

export type KeywordOption = {
  id: string;
  keyword: string;
  marketplace: string;
  created_at?: string;
  updated_at?: string;
};

/** Matches `amazon_theses.status` (Phase 4 TM). */
export type ThesisStatus = 'active' | 'weakened' | 'broken' | 'closed';

/** Aligned with `DecoratedThesis` / `thesis.service` JSON. */
export type ThesisSignal = {
  key: string;
  label: string;
  score: number;
  current_score?: number | null;
  delta?: number | null;
  confidence: string;
  reason: string;
};

export type AmazonThesis = {
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
};

export type ThesesListResponse = {
  theses: AmazonThesis[];
  total?: number;
};

export const scoreFields = [
  ['category_risk', 'Kategori Riski'],
  ['sku_chaos', 'SKU Karmaşası'],
  ['price_war', 'Fiyat Savaşı'],
  ['brand_reliability', 'Marka Güveni'],
  ['operational_risk', 'Operasyon Riski'],
] as const;

export function statusClass(value?: string | null) {
  return (value || '').toLowerCase();
}

export function decisionLabel(decision?: string | null) {
  switch ((decision || '').toUpperCase()) {
    case 'GUVENLI':
      return 'Güvenli';
    case 'DIKKATLI_OL':
      return 'Dikkatli Ol';
    case 'GIRME':
      return 'Girme';
    case 'MIXED_SIGNAL':
      return 'Karışık Sinyal';
    case 'INSUFFICIENT_DATA':
      return 'Yetersiz Veri';
    default:
      return '-';
  }
}

export function statusLabel(status?: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'done':
      return 'Tamamlandı';
    case 'running':
      return 'Çalışıyor';
    case 'pending':
      return 'Bekliyor';
    case 'failed':
      return 'Hatalı';
    default:
      return status || '-';
  }
}

export function confidenceLabel(confidence?: string | null) {
  switch ((confidence || '').toUpperCase()) {
    case 'HIGH':
      return 'Yüksek';
    case 'MEDIUM':
      return 'Orta';
    case 'LOW':
      return 'Düşük';
    case 'INSUFFICIENT_DATA':
      return 'Yetersiz Veri';
    default:
      return confidence || '-';
  }
}

export function errorLabel(error?: string | null) {
  const value = String(error || '').trim();
  if (!value || value === '-') return '-';
  if (value.includes('OXYLABS_AMAZON_SEARCH_FAILED_429') || value.includes('429')) {
    return 'Oxylabs geçici limit hatası (429). Biraz bekleyip yeniden deneyin.';
  }
  if (value.includes('Unable to connect') || value.includes('ECONNRESET') || value.includes('ETIMEDOUT') || value.includes('ENOTFOUND')) {
    return 'Sunucu dış servise (Oxylabs/Keepa) bağlanamadı. Ağ problemi geçici olabilir; sistem 1 saat içinde otomatik tekrar deneyecek.';
  }
  if (value.includes('Incorrect arguments to mysqld_stmt_execute')) {
    return 'Eski veritabanı sorgu hatası. Backend güncellendi; yeniden deneyin.';
  }
  if (value.includes('OXYLABS_NOT_CONFIGURED')) {
    return 'Oxylabs API bilgileri eksik. Ayarlar sayfasından yapılandırın.';
  }
  if (value.includes('KEEPA_NOT_CONFIGURED')) {
    return 'Keepa API anahtarı eksik. Ayarlar sayfasından yapılandırın.';
  }
  if (value.includes('KEEPA_MARKETPLACE_NOT_SUPPORTED')) {
    return 'Bu marketplace için Keepa desteği yok.';
  }
  if (value.includes('KEEPA_FETCH_FAILED')) {
    return 'Keepa verisi çekilemedi. Token tükenmiş veya geçici sorun olabilir.';
  }
  if (value.includes('OXYLABS_AMAZON_PRODUCT_FAILED') || value.includes('OXYLABS_ASIN_RESOLVE_FAILED')) {
    return 'Oxylabs ürün detayı çekilemedi. ASIN geçersiz veya geçici hata olabilir.';
  }
  if (value.includes('LLM_TIMEOUT')) {
    return 'AI yorum üretimi zaman aşımı. Skor ve karar üretildi ama metin LLM yerine şablondan geldi.';
  }
  if (value.includes('INVALID_ASIN_FORMAT')) {
    return 'Geçersiz ASIN formatı. B0XYZ12345 veya 10 rakam olmalı.';
  }
  if (value.includes('OXYLABS_SCRAPE_FAILED') || value.includes('OXYLABS_AMAZON_SEARCH_FAILED')) {
    return 'Oxylabs Amazon arama hatası. Genellikle geçici; otomatik retry tetiklenir.';
  }
  if (value.length > 200) return value.slice(0, 200) + '…';
  return value;
}

export function operatorAction(decision?: string | null) {
  switch ((decision || '').toUpperCase()) {
    case 'GUVENLI':
      return 'Al';
    case 'GIRME':
      return 'Uzak Dur';
    case 'DIKKATLI_OL':
    case 'MIXED_SIGNAL':
    case 'INSUFFICIENT_DATA':
      return 'Takip Et';
    default:
      return '-';
  }
}

export function skuActionLabel(action?: string | null) {
  switch ((action || '').toUpperCase()) {
    case 'AL':
      return 'Al';
    case 'UZAK_DUR':
      return 'Uzak Dur';
    case 'TAKIP_ET':
      return 'Takip Et';
    default:
      return '-';
  }
}

export function thesisStatusLabel(status: ThesisStatus): string {
  switch (status) {
    case 'active':
      return 'Aktif';
    case 'weakened':
      return 'Zayıfladı';
    case 'broken':
      return 'Bozuldu';
    case 'closed':
      return 'Kapalı';
  }
}

/** Short text for thesis score / signal JSON blobs in list cards. */
export function thesisJsonSummary(data: Record<string, unknown>, maxKeys = 6): string {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '—';
  return entries
    .slice(0, maxKeys)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? '…' : String(v)}`)
    .join(' · ');
}

export function actionClass(action?: string | null) {
  return `action-${skuActionLabel(action).toLowerCase().replaceAll(' ', '-')}`;
}

export function blockerLabel(blocker?: string | null) {
  switch (blocker) {
    case 'seller_coverage_low':
      return 'Satıcı kapsaması düşük';
    case 'low_price_coverage':
      return 'Fiyat kapsaması düşük';
    case 'no_keepa_data':
      return 'Keepa verisi yok';
    case 'insufficient_data_points':
      return 'Veri noktası yetersiz';
    default:
      return blocker || '-';
  }
}

export function keepaStatusReasonLabel(reason?: string | null) {
  switch (reason) {
    case 'api_key_missing':
      return 'Keepa API anahtarı eksik.';
    case 'scan_not_done':
      return 'Araştırma tamamlanmadığı için Keepa çekilemez.';
    case 'no_asin':
      return 'Bu araştırmada Keepa için kullanılabilir ASIN yok.';
    case 'snapshot_available':
      return 'Bu araştırma için Keepa snapshot verisi mevcut.';
    case 'queued_or_local_budget_waiting':
      return 'ASINler Keepa kuyruğunda; yerel limit veya sıra nedeniyle bekliyor olabilir.';
    case 'keepa_failed':
      return 'Keepa çekimi hata aldı; son hata detayını kontrol edin.';
    case 'not_requested':
      return 'Bu araştırma için Keepa henüz tetiklenmedi.';
    default:
      return reason || 'Keepa durumu bilinmiyor.';
  }
}

export function numeric(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function productPrice(product: Product): number | null {
  return numeric(product.price);
}

export function productRating(product: Product): number | null {
  return numeric(product.rating);
}

export function inferredBrandName(product: Pick<Product, 'title'>) {
  const firstWord = product.title.split(/\s+/)[0]?.replace(/[^a-zA-Z0-9-]/g, '') || '';
  return firstWord.length > 1 ? firstWord : null;
}

export function sellerInfo(product: Product) {
  const seller = String(product.seller_name || '').trim();
  if (seller) {
    return {
      kind: 'real' as const,
      label: seller,
      badge: 'Gerçek satıcı',
      note: 'Amazon arama verisinden geldi.',
    };
  }
  return {
    kind: 'missing' as const,
    label: '—',
    badge: 'Satıcı verisi yok',
    note: 'Bu ürün için satıcı verisi çekilemedi. Enrichment ile doldurulabilir.',
  };
}

export function sellerDisplayName(product: Product) {
  return sellerInfo(product).label;
}

export function isSellerMissing(product: Product) {
  return !String(product.seller_name || '').trim();
}

export function formatNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : String(value);
}

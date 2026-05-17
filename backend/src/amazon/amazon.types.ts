import type { AmazonProduct } from './amazon.scraper';
import type { KeepaSnapshot } from './keepa.client';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
export type Decision = 'GUVENLI' | 'DIKKATLI_OL' | 'GIRME' | 'MIXED_SIGNAL';

export type SkuAction = 'AL' | 'TAKIP_ET' | 'UZAK_DUR';
export type DataGateStatus = 'READY' | 'ENRICHMENT_REQUIRED' | 'INSUFFICIENT_DATA';
export type DataGateReason =
  | 'seller_enrichment_required'
  | 'keepa_enrichment_recommended'
  | 'price_coverage_low'
  | 'price_data_required'
  | 'insufficient_data_points'
  | 'single_action_distribution';

export type SkuSignals = {
  price_status: 'missing' | 'low' | 'normal' | 'high';
  seller_status: 'real' | 'missing';
  review_tier: 'low' | 'mid' | 'high';
  rating_level: 'missing' | 'weak' | 'acceptable' | 'strong';
  keepa_status: 'available' | 'no_asin' | 'missing';
};

export type SkuDecisionTier = 'DECISION_READY' | 'PRIORITY_SIGNAL' | 'PENDING_ENRICHMENT';

export type SkuDecision = {
  asin: string | null;
  title: string;
  action: SkuAction;
  confidence: Confidence;
  decision_tier: SkuDecisionTier;
  reasons: string[];
  signals: SkuSignals;
};

export type ConfidenceBlocker =
  | 'seller_coverage_low'
  | 'low_price_coverage'
  | 'no_keepa_data'
  | 'insufficient_data_points';

export type DataQuality = {
  data_points: number;
  price_coverage: number;
  seller_coverage: number;
  keepa_coverage: number;
  scan_age_days?: number | null;
  coverage_breakdown?: CoverageBreakdown;
  has_price_data: boolean;
  has_keepa_snapshot: boolean;
  confidence_blockers: ConfidenceBlocker[];
};

export type CoverageBlocker = 'keepa' | 'seller' | 'stale' | 'none';

export type CoverageBreakdown = {
  keepa_coverage: number;
  seller_coverage: number;
  stale_ratio: number;
  dominant_blocker: CoverageBlocker;
};

export type DataGate = {
  status: DataGateStatus;
  reasons: DataGateReason[];
  message: string;
};

export type ActionDistribution = {
  total: number;
  counts: Record<SkuAction, number>;
  confirmed_counts: Record<SkuAction, number>;
  dominant_action: SkuAction | null;
  dominant_ratio: number;
  single_action_warning: string | null;
};

export type CoverageGate = {
  applied: boolean;
  original_action: SkuAction;
  downgraded_action: SkuAction;
  reason: string;
};

export type DecisionSurface = {
  legacy_decision: Decision | 'INSUFFICIENT_DATA';
  primary_action: SkuAction;
  confidence: Confidence;
  confidence_blockers: ConfidenceBlocker[];
  gate_applied?: boolean;
  priority_view?: PriorityView;
  risk_badges?: RiskBadge[];
  top_reasons: string[];
  operator_summary: string;
  data_gate: DataGate;
  action_distribution: ActionDistribution;
  coverage_gate?: CoverageGate;
};

export type QualityFactors = {
  sellerCoverage: number;
  priceCoverage: number;
  hasKeepaData: boolean;
};

export type DimensionScore = {
  score: number;
  confidence: Confidence;
  reason: string;
};

export type PrioritySku = {
  asin: string | null;
  title: string;
  action: SkuAction;
  confidence: Confidence;
  reason: string;
};

export type PriorityView = {
  highest_confidence: PrioritySku[];
  lowest_chaos: PrioritySku[];
  best_candidate: PrioritySku[];
  empty_reason: string | null;
};

export type RiskBadgeType =
  | 'AMAZON_DOMINANT'
  | 'HIGH_SELLER_CHAOS'
  | 'HIGH_MAP_CONTROL'
  | 'LOW_COVERAGE'
  | 'STALE_DATA';

export type RiskBadge = {
  type: RiskBadgeType;
  label: string;
  tone: 'dominance' | 'chaos' | 'map' | 'coverage' | 'stale';
  limited: boolean;
  source: string;
  description: string;
};

export type AmazonCategoryStats = {
  keyword: string;
  marketplace: string;
  productCount: number;
  priceMin: number;
  priceMax: number;
  priceMedian: number;
  priceSigma: number;
  sellerCount: number;
  dominantBrandRatio: number;
};

export type NormalizedProduct = AmazonProduct & {
  pricePercentile: number;
  reviewPercentile: number;
  ratingPercentile: number;
  normalizedPriceScore: number;
  normalizedReviewScore: number;
  normalizedRatingScore: number;
};

export type AmazonScoreInput = {
  keyword: string;
  marketplace: string;
  products: NormalizedProduct[];
  stats: AmazonCategoryStats;
  qualityFactors?: QualityFactors;
  keepaAsinSet?: Set<string>;
  keepaSnapshots?: KeepaSnapshot[];
  pageOneAveragePrice?: number | null;
  pageThreeAveragePrice?: number | null;
  reviewProblemScore?: number;
  reviewProblemFlags?: string[];
};

export type BrandContext = {
  brand_aggregated: boolean;
  brand_name: string | null;
  sku_count: number | null;
};

export type AmazonRiskReport = {
  keyword: string;
  scanned_at: string;
  data_points: number;
  scores: {
    category_risk: DimensionScore;
    sku_chaos: DimensionScore;
    price_war_risk: DimensionScore;
    brand_reliability: DimensionScore;
    operational_risk: DimensionScore;
  };
  composite_score: number | null;
  decision: Decision | 'INSUFFICIENT_DATA';
  summary: string;
  insufficient_data_reason?: string | null;
  data_quality: DataQuality;
  decision_surface: DecisionSurface;
  sku_decisions: SkuDecision[];
  outreach_priority: number;
  persuasion_points: string[];
  brand_context: BrandContext;
  enrichment: Record<string, unknown> | null;
};

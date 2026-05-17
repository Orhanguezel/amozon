import type { Confidence, DimensionScore, RiskBadge } from './amazon.types';
import { CATEGORY_RISK_CONFIG, MIXED_SIGNAL_CONFIG } from './scoring.config';

/**
 * RB.1 — Risk Badge türetme (Phase 4.5 Operator Clarity Hardening)
 *
 * ANAYASAL KURAL: Bu fonksiyon YENİ yorum/skor üretmez. Reasoning içinde zaten
 * geçen sinyalleri operatör paneli için etiketler. Eşikler mevcut scoring.config
 * sabitlerinden gelir (yeni keyfi sayı yok). Veri yetersizken rozet ya
 * "(sınırlı veri)" eki alır ya da hiç gösterilmez — uydurma yapılmaz.
 *
 * Semantik (Codex scaffold'undaki iki terslik review'da düzeltildi):
 *  - AMAZON_DOMINANT  → tek marka/satıcı listing payını domine ediyor
 *                       (dominantBrandRatio yüksek / category_risk yüksek).
 *                       brand_reliability DEĞİL — o skor marka *parçalanmasını*
 *                       ölçer, dominance'ın tersidir.
 *  - HIGH_SELLER_CHAOS → fiyat/SKU dağılımı kaotik (sku_chaos yüksek) veya
 *                       satıcı yoğunluğu çok yüksek.
 *  - HIGH_MAP_CONTROL → fiyat bandı KATI: price_war *düşük* (fiyatlar oynamıyor)
 *                       + marka disiplini var. Yüksek price_war'ın tersidir.
 *  - LOW_COVERAGE     → bilgi rozeti: kararın sınırlı seller/enrichment
 *                       verisiyle üretildiği uyarısı (data_quality'den türetilir).
 *  - STALE_DATA       → bilgi rozeti: scan 7+ gün eski (CH.2 stale kuralı).
 *
 * LOW_COVERAGE/STALE_DATA "sinyal" değil "şeffaflık" rozetidir; sinyal
 * rozetleri bastırılsa bile gösterilir — operatöre veri durumunu açıklar.
 */

const MIN_COVERAGE = 0.3;

type ScoreLike = Pick<DimensionScore, 'score'> & { confidence?: Confidence } & Record<string, unknown>;

export function deriveRiskBadges(
  scores: Record<'category_risk' | 'sku_chaos' | 'price_war_risk' | 'brand_reliability' | 'operational_risk', ScoreLike>,
  dataQuality: Record<string, unknown>,
  stats?: { dominantBrandRatio?: number; sellerCount?: number },
): RiskBadge[] {
  const sellerCoverage = Number(dataQuality.seller_coverage ?? 0);
  const keepaCoverage = Number(dataQuality.keepa_coverage ?? 0);
  const coverageLimited = sellerCoverage < MIN_COVERAGE || keepaCoverage < MIN_COVERAGE;

  // ── Şeffaflık rozetleri (sinyal değil; veri durumunu operatöre açıklar) ──
  // Sinyal rozetleri bastırılsa bile bunlar gösterilir.
  const infoBadges: RiskBadge[] = [];
  if (coverageLimited) {
    infoBadges.push({
      type: 'LOW_COVERAGE',
      label: 'LOW COVERAGE',
      tone: 'coverage',
      limited: true,
      source: 'data_quality.seller_coverage / keepa_coverage',
      description: 'Karar sınırlı seller/enrichment verisiyle üretildi.',
    });
  }
  const scanAgeDays = Number(dataQuality.scan_age_days ?? NaN);
  if (Number.isFinite(scanAgeDays) && scanAgeDays >= 7) {
    infoBadges.push({
      type: 'STALE_DATA',
      label: 'STALE DATA',
      tone: 'stale',
      limited: true,
      source: 'data_quality.scan_age_days',
      description: 'Veri güncel olmayabilir, eski snapshot kullanılıyor olabilir.',
    });
  }

  // Her iki katman da kritik düşükse SİNYAL rozeti üretme — V1 dürüstlük kuralı.
  // (Şeffaflık rozetleri yine de döner — operatöre durumu açıklar.)
  if (sellerCoverage < MIN_COVERAGE && keepaCoverage < MIN_COVERAGE) return infoBadges;
  const HIGH = MIXED_SIGNAL_CONFIG.HIGH_SCORE_MIN; // 7 — mevcut "yüksek boyut" eşiği
  const LOW = MIXED_SIGNAL_CONFIG.LOW_SCORE_MAX;   // 3 — mevcut "düşük boyut" eşiği
  const dominantRatio = Number(stats?.dominantBrandRatio ?? NaN);
  const sellerCount = Number(stats?.sellerCount ?? NaN);

  const badges: RiskBadge[] = [];

  const categoryScore = Number(scores.category_risk.score ?? 0);
  const skuChaosScore = Number(scores.sku_chaos.score ?? 0);
  const priceWarScore = Number(scores.price_war_risk.score ?? 0);

  // AMAZON DOMINANT — tek marka/satıcı listing payını domine ediyor.
  const dominantByRatio = Number.isFinite(dominantRatio) && dominantRatio > CATEGORY_RISK_CONFIG.HIGH_BRAND_RATIO;
  const dominantByCategory = !Number.isFinite(dominantRatio) && categoryScore >= HIGH;
  if (dominantByRatio || dominantByCategory) {
    pushBadge(badges, {
      type: 'AMAZON_DOMINANT',
      tone: 'dominance',
      labelBase: 'AMAZON DOMINANT',
      source: dominantByRatio ? 'category_stats.dominant_brand_ratio' : 'category_risk',
      description: 'Amazon seller presence yüksek, BuyBox/marj baskısı riski.',
      dimensionConfidence: confidenceOf(scores.category_risk),
      coverageLimited,
    });
  }

  // HIGH SELLER CHAOS — fiyat/SKU dağılımı kaotik veya satıcı yoğunluğu çok yüksek.
  const chaosBySpread = skuChaosScore >= HIGH;
  const chaosByDensity = Number.isFinite(sellerCount) && sellerCount > CATEGORY_RISK_CONFIG.HIGH_SELLER_COUNT;
  if (chaosBySpread || chaosByDensity) {
    pushBadge(badges, {
      type: 'HIGH_SELLER_CHAOS',
      tone: 'chaos',
      labelBase: 'HIGH SELLER CHAOS',
      source: chaosBySpread ? 'sku_chaos' : 'category_stats.seller_count',
      description: 'Seller volatilitesi ve fiyat savaşı riski yüksek.',
      dimensionConfidence: confidenceOf(scores.sku_chaos),
      coverageLimited,
    });
  }

  // HIGH MAP CONTROL — fiyat bandı katı: price_war DÜŞÜK + marka disiplini.
  const priceRigid = priceWarScore <= LOW;
  const brandDiscipline = Number.isFinite(dominantRatio)
    ? dominantRatio >= CATEGORY_RISK_CONFIG.MED_BRAND_RATIO
    : categoryScore >= HIGH;
  if (priceRigid && brandDiscipline) {
    pushBadge(badges, {
      type: 'HIGH_MAP_CONTROL',
      tone: 'map',
      labelBase: 'HIGH MAP CONTROL',
      source: 'price_war_risk (düşük) + marka payı',
      description: 'Marka fiyat disiplini yüksek, yetkisiz seller/IP riski olabilir.',
      dimensionConfidence: confidenceOf(scores.price_war_risk),
      coverageLimited,
    });
  }

  return [...infoBadges, ...badges];
}

function confidenceOf(score: ScoreLike): Confidence | undefined {
  const value = (score as { confidence?: unknown }).confidence;
  return typeof value === 'string' ? (value as Confidence) : undefined;
}

function pushBadge(
  badges: RiskBadge[],
  input: {
    type: RiskBadge['type'];
    tone: RiskBadge['tone'];
    labelBase: string;
    source: string;
    description: string;
    dimensionConfidence: Confidence | undefined;
    coverageLimited: boolean;
  },
) {
  // Türetildiği boyut INSUFFICIENT_DATA ise rozet üretme — uydurma yok.
  if (input.dimensionConfidence === 'INSUFFICIENT_DATA') return;
  const limited = input.coverageLimited || input.dimensionConfidence === 'LOW';
  badges.push({
    type: input.type,
    label: `${input.labelBase}${limited ? ' (sınırlı veri)' : ''}`,
    tone: input.tone,
    limited,
    source: input.source,
    description: input.description,
  });
}

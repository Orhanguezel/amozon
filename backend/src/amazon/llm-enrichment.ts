import { askBestAvailable } from '@/lib/ai.client';
import { env } from '@/core/env';
import type { AmazonRiskReport, SkuAction, SkuDecision, DimensionScore } from './amazon.types';

type DimensionKey = 'category_risk' | 'price_war_risk' | 'sku_chaos' | 'brand_reliability' | 'operational_risk';

type LLMInsights = {
  operator_summary: string;
  persuasion_points: string[];
  dimension_reasons?: Partial<Record<DimensionKey, string>>;
  sku_narratives?: Array<{ asin: string | null; narrative: string }>;
};

const DECISION_GUIDE: Record<SkuAction, string> = {
  AL: 'Olumlu boyutları öne çıkar, giriş fırsatını ve zamanlamayı vurgula',
  TAKIP_ET: 'İzleme gerekçesini belirt, hangi sinyal değişirse harekete geçilebileceğini göster',
  UZAK_DUR: 'Girişi engelleyen somut verileri ve riskleri öne çıkar',
};

function pickTopSkus(decisions: SkuDecision[], limit = 5): SkuDecision[] {
  const tierWeight: Record<string, number> = { DECISION_READY: 0, PRIORITY_SIGNAL: 1, PENDING_ENRICHMENT: 2 };
  const actionWeight: Record<SkuAction, number> = { AL: 0, UZAK_DUR: 1, TAKIP_ET: 2 };
  const ranked = [...decisions].sort((a, b) => {
    const t = tierWeight[a.decision_tier] - tierWeight[b.decision_tier];
    if (t !== 0) return t;
    return actionWeight[a.action] - actionWeight[b.action];
  });
  return ranked.filter((s) => s.asin).slice(0, limit);
}

function skuSignalLine(s: SkuDecision): string {
  const sig = s.signals;
  return [
    `fiyat=${sig.price_status}`,
    `satıcı=${sig.seller_status}`,
    `yorum=${sig.review_tier}`,
    `puan=${sig.rating_level}`,
    `keepa=${sig.keepa_status}`,
  ].join(', ');
}

const BLOCKER_LABEL: Record<string, string> = {
  seller_coverage_low: 'satıcı kapsaması düşük',
  low_price_coverage: 'fiyat verisi düşük',
  no_keepa_data: 'Keepa snapshot yok',
  insufficient_data_points: 'veri noktası yetersiz',
};

function buildHonestyDirective(blockers: string[], dq: { keepa_coverage?: number; seller_coverage?: number; price_coverage?: number } | null): string {
  if (!blockers.length) return '';
  const blockerLines = blockers.map((b) => `  - ${BLOCKER_LABEL[b] ?? b}`).join('\n');
  const coverageLines = dq ? [
    `  - keepa_coverage: ${Math.round((dq.keepa_coverage ?? 0) * 100)}%`,
    `  - seller_coverage: ${Math.round((dq.seller_coverage ?? 0) * 100)}%`,
    `  - price_coverage: ${Math.round((dq.price_coverage ?? 0) * 100)}%`,
  ].join('\n') : '';

  return `

⚠ VERİ KALİTESİ KISITI — KESİNLİKLE UY:
Bu tarama eksik/sınırlı veriyle yapıldı. Aktif kısıtlar:
${blockerLines}
${coverageLines ? coverageLines + '\n' : ''}
DÜRÜSTLÜK KURALLARI:
1. Her dimension reason'da en az biri: "tahmini", "sınırlı veri ile", "doğrulanmamış", "ön değerlendirme", "kesin değil" ifadelerinden geçmeli.
2. Etkilenen boyutu (örn. brand_reliability için satıcı eksikse) "doğrulanmamış" veya "tahmini" olarak çerçevele — kesin yorum yapma.
3. operator_summary'de hangi verinin eksik olduğunu kısaca belirt (örn. "satıcı kapsaması düşük olduğundan...").
4. Composite skoru "yön sinyali" / "ön değerlendirme" olarak nitele; "kesin karar" gibi ifade KULLANMA.

Örnek dürüst dimension reason (satıcı verisi yokken brand_reliability için):
"Marka güvenilirliği 5.1 olarak ölçüldü ancak satıcı doğrulaması olmadığından bu skor TAHMİNİ; sıralı taramalarla yeniden değerlendirilmeli."`;
}

export function buildPrompt(report: AmazonRiskReport): string {
  const { scores, keyword, data_points, composite_score, data_quality } = report;
  const action = report.decision_surface.primary_action;
  const guide = DECISION_GUIDE[action] ?? DECISION_GUIDE.TAKIP_ET;
  const topSkus = pickTopSkus(report.sku_decisions, 5);
  const blockers = Array.isArray(data_quality?.confidence_blockers) ? data_quality.confidence_blockers : [];
  const honestyDirective = buildHonestyDirective(blockers, data_quality ?? null);

  const skuList = topSkus.length
    ? topSkus.map((s, i) => `${i + 1}. [${s.asin}] ${s.action} | ${(s.title || '').slice(0, 70)} | ${skuSignalLine(s)}`).join('\n')
    : '(uygun SKU yok)';

  return `Amazon pazar analizi — kategori için ticari içgörü ve SKU bazlı sentez üret.
Kategori: ${keyword} · Karar: ${action} · Skor: ${composite_score ?? '?'}/10 · Analiz: ${data_points} ürün
confidence_blockers: ${blockers.length ? blockers.join(', ') : 'yok'}

5 boyut (skor · güven · mevcut açıklama):
• category_risk: ${scores.category_risk.score} · ${scores.category_risk.confidence} · ${scores.category_risk.reason}
• price_war_risk: ${scores.price_war_risk.score} · ${scores.price_war_risk.confidence} · ${scores.price_war_risk.reason}
• sku_chaos: ${scores.sku_chaos.score} · ${scores.sku_chaos.confidence} · ${scores.sku_chaos.reason}
• brand_reliability: ${scores.brand_reliability.score} · ${scores.brand_reliability.confidence} · ${scores.brand_reliability.reason}
• operational_risk: ${scores.operational_risk.score} · ${scores.operational_risk.confidence} · ${scores.operational_risk.reason}

Öncelikli SKU'lar:
${skuList}

Yön: ${guide}${honestyDirective}

Sadece geçerli JSON döndür (başka metin yok):
{
  "operator_summary": "tek cümle ticari karar özeti, max 180 karakter, veri referanslı",
  "persuasion_points": ["içgörü 1", "içgörü 2", "içgörü 3"],
  "dimension_reasons": {
    "category_risk": "boyutu diğer boyutlarla ilişkilendirip yorumlayan tek cümle, max 200 karakter",
    "price_war_risk": "...",
    "sku_chaos": "...",
    "brand_reliability": "...",
    "operational_risk": "..."
  },
  "sku_narratives": [
    {"asin": "ASIN_KODU", "narrative": "bu SKU için 1-2 cümle ticari yorum (max 200 char, sinyallere atıfla, eylem önerisi içersin)"}
  ]
}

Kurallar:
- Türkçe
- Genel ifade değil; sayı/sinyal referansı
- sku_narratives için yalnızca yukarıda listelenen ASIN'leri kullan
- Her boyutu komşu boyutlarla çapraz referansla yorumla (template tekrarı yapma)`;
}

function trim(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length < 10) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max - 1) + '…' : trimmed;
}

function parseInsights(raw: string): LLMInsights | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const summary = trim(parsed.operator_summary, 200);
    const points = Array.isArray(parsed.persuasion_points)
      ? (parsed.persuasion_points as unknown[]).filter((p): p is string => typeof p === 'string').slice(0, 4)
      : [];
    if (!summary || points.length === 0) return null;

    const dimRaw = parsed.dimension_reasons as Record<string, unknown> | undefined;
    const dimension_reasons: Partial<Record<DimensionKey, string>> | undefined = dimRaw && typeof dimRaw === 'object'
      ? {
          category_risk: trim(dimRaw.category_risk, 220),
          price_war_risk: trim(dimRaw.price_war_risk, 220),
          sku_chaos: trim(dimRaw.sku_chaos, 220),
          brand_reliability: trim(dimRaw.brand_reliability, 220),
          operational_risk: trim(dimRaw.operational_risk, 220),
        }
      : undefined;

    const sku_narratives = Array.isArray(parsed.sku_narratives)
      ? (parsed.sku_narratives as unknown[])
          .map((n) => {
            if (!n || typeof n !== 'object') return null;
            const obj = n as Record<string, unknown>;
            const narrative = trim(obj.narrative, 240);
            if (!narrative) return null;
            const asin = typeof obj.asin === 'string' && obj.asin.trim() ? obj.asin.trim() : null;
            return { asin, narrative };
          })
          .filter((n): n is { asin: string | null; narrative: string } => Boolean(n))
      : undefined;

    return { operator_summary: summary, persuasion_points: points, dimension_reasons, sku_narratives };
  } catch {
    return null;
  }
}

function applyDimensionReason(score: DimensionScore, llmReason: string | undefined): DimensionScore {
  if (!llmReason) return score;
  return { ...score, reason: llmReason };
}

function applySkuNarratives(decisions: SkuDecision[], narratives: LLMInsights['sku_narratives']): SkuDecision[] {
  if (!narratives || narratives.length === 0) return decisions;
  const byAsin = new Map<string, string>();
  for (const n of narratives) {
    if (n.asin) byAsin.set(n.asin, n.narrative);
  }
  if (byAsin.size === 0) return decisions;
  return decisions.map((d) => {
    if (!d.asin) return d;
    const narrative = byAsin.get(d.asin);
    if (!narrative) return d;
    return { ...d, reasons: [narrative, ...d.reasons] };
  });
}

export async function enrichReportWithLLM(report: AmazonRiskReport): Promise<AmazonRiskReport> {
  if (!env.GROQ_API_KEY && !env.OPENAI_API_KEY) return report;

  try {
    const raw = await Promise.race<string>([
      askBestAvailable(buildPrompt(report), { json: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM_TIMEOUT')), 15_000),
      ),
    ]);
    const insights = parseInsights(raw);
    if (!insights) {
      console.log(`[llm] parseInsights returned null for job=${report.keyword}`);
      return report;
    }
    console.log(`[llm] enriched job=${report.keyword.slice(0, 30)} dim=${Object.keys(insights.dimension_reasons || {}).length} sku=${insights.sku_narratives?.length || 0}`);
    return {
      ...report,
      scores: {
        category_risk: applyDimensionReason(report.scores.category_risk, insights.dimension_reasons?.category_risk),
        price_war_risk: applyDimensionReason(report.scores.price_war_risk, insights.dimension_reasons?.price_war_risk),
        sku_chaos: applyDimensionReason(report.scores.sku_chaos, insights.dimension_reasons?.sku_chaos),
        brand_reliability: applyDimensionReason(report.scores.brand_reliability, insights.dimension_reasons?.brand_reliability),
        operational_risk: applyDimensionReason(report.scores.operational_risk, insights.dimension_reasons?.operational_risk),
      },
      sku_decisions: applySkuNarratives(report.sku_decisions, insights.sku_narratives),
      persuasion_points: insights.persuasion_points,
      decision_surface: {
        ...report.decision_surface,
        operator_summary: insights.operator_summary,
      },
    };
  } catch (err) {
    console.log(`[llm] enrichment failed: ${err instanceof Error ? err.message : 'UNKNOWN'}`);
    return report;
  }
}

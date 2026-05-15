import type { AmazonRiskReport } from './amazon.types';
import type { SkuAction } from './amazon.types';

type PersuasionRule = {
  check: (scores: AmazonRiskReport['scores']) => boolean;
  point: string;
};

const RULES: PersuasionRule[] = [
  {
    check: (s) => s.category_risk.score >= 6,
    point: 'Yüksek satıcı yoğunluğu fiyat disiplinini bozuyor — yetkili bayi modeli olmadan sürdürülebilir konumlanmak güçleşiyor.',
  },
  {
    check: (s) => s.price_war_risk.score >= 6,
    point: 'Aktif fiyat savaşı mevcut — konumlanmak için pencere kapanmadan harekete geçmek kritik.',
  },
  {
    check: (s) => s.sku_chaos.score >= 6,
    point: 'Standart dışı fiyatlandırma ve yüksek varyant baskısı marka algısını zedeliyor.',
  },
  {
    check: (s) => s.brand_reliability.score <= 4,
    point: 'Yetkili kanal açılırsa listing kalitesi ve marka görünürlüğü direkt iyileşir.',
  },
  {
    check: (s) => s.operational_risk.score >= 6,
    point: 'Yüksek iade/şikayet oranı operasyonel risk oluşturuyor — çözüm fırsatı sizi kategoride öne çıkarır.',
  },
];

const FALLBACK = 'Kategori şu an istikrarlı görünüyor — erken giriş için uygun pencere.';

export function generatePersuasionPoints(scores: AmazonRiskReport['scores']): string[] {
  const points = RULES.filter((rule) => rule.check(scores)).map((rule) => rule.point);
  return points.length > 0 ? points.slice(0, 4) : [FALLBACK];
}

type DimKey = keyof AmazonRiskReport['scores'];

// Cross-dimension synthesis: top 2 risk drivers → single commercial sentence
const PAIR_SENTENCES: Partial<Record<string, string>> = {
  'category_risk+price_war_risk': 'Yoğun satıcı rekabeti aktif fiyat savaşıyla birleşti; sürdürülebilir marj penceresi daralıyor.',
  'category_risk+operational_risk': 'Doymuş kategori ve Buy Box baskısı birikmiş; farklılaşmadan girişin değeri sınırlı.',
  'category_risk+sku_chaos': 'Kalabalık pazar ve listing dağınıklığı birlikte alıcı güvenini zedeliyor.',
  'category_risk+brand_reliability': 'Yüksek rekabet ve marka parçalanması giriş engelini artırıyor; niş konumlanma fark yaratır.',
  'price_war_risk+sku_chaos': 'Fiyat baskısı ve SKU kaosu aynı anda görünüyor; kategori ancak güçlü marka desteğiyle tutulabilir.',
  'price_war_risk+operational_risk': 'Hem fiyat hem operasyon cephesi sıkışık; riski göze almak için uzun vadeli taahhüt şart.',
  'price_war_risk+brand_reliability': 'Fiyat savaşı zayıf marka kanalıyla çakışıyor; yetkili dağıtım hattı kurulursa mevcut rekabet avantaja dönebilir.',
  'sku_chaos+brand_reliability': 'SKU kaosu ve marka parçalanması aynı anda görünüyor; kaliteli ve tutarlı giriş ciddi fark yaratır.',
  'sku_chaos+operational_risk': 'Listing dağınıklığı ve operasyonel risk birlikte müşteri deneyimini zorluyor.',
  'brand_reliability+operational_risk': 'Zayıf marka kanalı ve yüksek operasyonel risk birlikte fırsata işaret ediyor; doğru giriş rakipleri geri sıkıştırabilir.',
};

function pairKey(a: DimKey, b: DimKey): string {
  return [a, b].sort().join('+');
}

export function synthesizeCommercialSummary(
  scores: AmazonRiskReport['scores'],
  action: SkuAction,
  compositeScore: number | null,
): string {
  const sorted = (Object.entries(scores) as [DimKey, { score: number }][])
    .sort((a, b) => b[1].score - a[1].score);

  const scoreStr = compositeScore !== null ? ` (bileşik skor: ${compositeScore})` : '';

  if (action === 'AL') {
    // For low-risk decisions, highlight the two lowest risk dimensions
    const low = sorted.slice(-2).map(([k]) => dimLabel(k));
    const topRisk = sorted[0];
    if (topRisk[1].score < 4) {
      return `Tüm boyutlar kontrollü seviyede — ${low[0]} ve ${low[1]} özellikle güçlü; giriş için uygun pencere${scoreStr}.`;
    }
    return `${dimLabel(sorted[0][0])} izlenmeli ancak ${low[0]} ve ${low[1]} sağlam; giriş fırsatı mevcut${scoreStr}.`;
  }

  // Find top 2 risk dimensions
  const [first, second] = sorted;
  const key = pairKey(first[0], second[0]);
  const pairSentence = PAIR_SENTENCES[key];

  if (action === 'UZAK_DUR') {
    const base = pairSentence
      ?? `${dimLabel(first[0])} ve ${dimLabel(second[0])} birlikte yüksek risk oluşturuyor.`;
    return `${base} Kaçınma kararı verildi${scoreStr}.`;
  }

  // TAKIP_ET
  const base = pairSentence
    ?? `${dimLabel(first[0])} öne çıkıyor; ${dimLabel(second[0])} de dikkat gerektiriyor.`;
  return `${base} Koşullar izlenmeli${scoreStr}.`;
}

function dimLabel(key: DimKey): string {
  const labels: Record<DimKey, string> = {
    category_risk: 'kategori rekabeti',
    price_war_risk: 'fiyat baskısı',
    sku_chaos: 'SKU kaosu',
    brand_reliability: 'marka güvenilirliği',
    operational_risk: 'operasyonel risk',
  };
  return labels[key];
}

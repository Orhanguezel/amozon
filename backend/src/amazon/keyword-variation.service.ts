import { env } from '@/core/env';
import { askBestAvailable } from '@/lib/ai.client';

const fallbackSuffixes = [
  'for small business',
  'bulk',
  'professional',
  'heavy duty',
  'best rated',
];

export async function generateKeywordVariations(keyword: string, count: number): Promise<string[]> {
  const safeCount = Math.min(Math.max(Number(count) || 0, 0), 10);
  if (safeCount === 0) return [];

  if (!env.GROQ_API_KEY && !env.OPENAI_API_KEY) return fallbackVariations(keyword, safeCount);

  try {
    const prompt = [
      'Generate Amazon search keyword variations for product research.',
      'Return only a JSON array of short English search phrases.',
      'Do not include explanations.',
      `Base keyword: ${keyword}`,
      `Count: ${safeCount}`,
      'Prefer commercially precise, high-result Amazon search terms.',
    ].join('\n');
    const text = await askBestAvailable(prompt);
    const parsed = JSON.parse(extractJsonArray(text)) as unknown;
    if (!Array.isArray(parsed)) return fallbackVariations(keyword, safeCount);
    return cleanVariations(keyword, parsed.map(String), safeCount);
  } catch {
    return fallbackVariations(keyword, safeCount);
  }
}

function extractJsonArray(text: string) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return '[]';
  return text.slice(start, end + 1);
}

function fallbackVariations(keyword: string, count: number) {
  return cleanVariations(keyword, fallbackSuffixes.map((suffix) => `${keyword} ${suffix}`), count);
}

function cleanVariations(keyword: string, variations: string[], count: number) {
  const seen = new Set([keyword.toLowerCase()]);
  const cleaned: string[] = [];
  for (const variation of variations) {
    const value = variation.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    cleaned.push(value);
    if (cleaned.length >= count) break;
  }
  return cleaned;
}

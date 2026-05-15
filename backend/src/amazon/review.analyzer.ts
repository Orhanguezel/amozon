import { askBestAvailable } from '@/lib/ai.client';
import { scrapeAmazonReviews } from './amazon.scraper';

const NEGATIVE_FLAGS = ['smell', 'fit', 'thin', 'quality', 'slippery', 'loose', 'cheap', 'broke', 'return', 'disappointed'];

export async function analyzeProductReviews(productUrl: string, marketplace?: string) {
  const reviews = await scrapeAmazonReviews(productUrl, marketplace);
  const text = reviews.map(r => `${r.title ?? ''} ${r.content ?? ''}`).join('\n').slice(0, 12000);
  const flags = NEGATIVE_FLAGS.filter(flag => text.toLowerCase().includes(flag));
  let aiSummary = '';
  let problemScore = Math.min(10, flags.length * 1.5);
  if (text) {
    try {
      aiSummary = await askBestAvailable(
        `Amazon yorumlarındaki ana ürün sorunlarını kısa listele ve 0-10 arası ciddiyet skoru ver.\n\n${text}`,
      );
      const score = aiSummary.match(/\b([0-9](?:\.[0-9])?|10)\b/);
      if (score) problemScore = Math.max(problemScore, Number(score[1]));
    } catch {
      aiSummary = flags.length ? `Detected recurring complaints: ${flags.join(', ')}` : '';
    }
  }
  return { problem_flags: flags, problem_score: Math.min(10, problemScore), ai_summary: aiSummary };
}

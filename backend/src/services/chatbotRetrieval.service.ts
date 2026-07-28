import { ChatbotFaq } from '../entities/ChatbotFaq';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'or', 'in', 'on',
  'for', 'with', 'how', 'do', 'i', 'my', 'me', 'can', 'what', 'where', 'when', 'why',
]);

export function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export function scoreFaq(query: string, faq: ChatbotFaq): number {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return 0;

  const hay = tokenize(`${faq.question} ${faq.answer} ${faq.keywords || ''} ${faq.category}`);
  if (hay.length === 0) return 0;

  let hits = 0;
  for (const t of hay) {
    if (qTokens.has(t)) hits += 1;
  }

  // Boost exact phrase / question similarity
  const qNorm = query.toLowerCase().trim();
  const faqQ = (faq.question || '').toLowerCase().trim();
  if (faqQ === qNorm) hits += 20;
  else if (faqQ.includes(qNorm) || qNorm.includes(faqQ)) hits += 8;

  return hits;
}

export function faqMatchesAudience(faq: ChatbotFaq, role: string | null | undefined): boolean {
  const audience = String(faq.audience || 'all')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (audience.includes('all')) return true;
  const r = String(role || 'public').toLowerCase();
  if (audience.includes(r)) return true;
  if (!role && audience.includes('public')) return true;
  // Map staff roles to admin-ish FAQ access
  if (['superadmin', 'director', 'headmaster', 'deputy_headmaster', 'accountant'].includes(r)) {
    return audience.includes('admin') || audience.includes('staff');
  }
  return false;
}

export function retrieveRelevantFaqs(
  faqs: ChatbotFaq[],
  query: string,
  role: string | null | undefined,
  limit = 6
): ChatbotFaq[] {
  const scored = faqs
    .filter((f) => f.isActive && faqMatchesAudience(f, role))
    .map((f) => ({ f, score: scoreFaq(query, f) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.f.sortOrder - b.f.sortOrder);

  if (scored.length === 0) {
    // Fallback: top general FAQs for audience
    return faqs
      .filter((f) => f.isActive && faqMatchesAudience(f, role))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, Math.min(4, limit));
  }

  return scored.slice(0, limit).map((x) => x.f);
}

export function formatFaqsForPrompt(faqs: ChatbotFaq[]): string {
  if (!faqs.length) return 'No matching FAQ entries found in the knowledge base.';
  return faqs
    .map((f, i) => `Q${i + 1}: ${f.question}\nA${i + 1}: ${f.answer}`)
    .join('\n\n');
}

/** Exact / near-exact FAQ match for caching (skip OpenAI). */
export function findExactFaqMatch(
  faqs: ChatbotFaq[],
  query: string,
  role: string | null | undefined
): ChatbotFaq | null {
  const qNorm = query.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!qNorm) return null;

  for (const f of faqs) {
    if (!f.isActive || !faqMatchesAudience(f, role)) continue;
    const fq = f.question.toLowerCase().trim().replace(/\s+/g, ' ');
    if (fq === qNorm) return f;
    // High overlap with short queries
    if (qNorm.length >= 12 && (fq.includes(qNorm) || qNorm.includes(fq)) && scoreFaq(query, f) >= 10) {
      return f;
    }
  }
  return null;
}

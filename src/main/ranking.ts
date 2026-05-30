import type { Paper, RankMode } from '../shared/types.js';

// Default weights for the (single) AI/ML innovations lane. Per-lane tuning
// arrives with M4.
//
// User preference: popularity and quality dominate; ideally within the last
// ~6 months but a high-impact older paper still belongs on screen. Hard
// cutoff at 18 months keeps all-time classics (e.g. 2017 Transformer paper
// with 100k citations) from permanently squatting at the top of a feed
// that's supposed to surface *current* research.
const W_RECENCY = 0.4;
const W_CITATIONS = 2.0;
const W_INFLUENTIAL = 3.0;
const TAU_DAYS = 90;
const MAX_AGE_DAYS = 18 * 30;

const MS_PER_DAY = 86_400_000;

export function scorePaper(p: Paper, mode: RankMode, now = Date.now()): number {
  const citations = p.citations ?? 0;
  const influential = p.influentialCitations ?? 0;

  if (mode === 'allTime') {
    // No age penalty, no cutoff — pure popularity / impact.
    return Math.log10(1 + citations) + 2 * Math.log10(1 + influential);
  }

  // Balanced (default): recency × τ=90d with an 18-month hard cutoff.
  const ageDays = Math.max(0, (now - new Date(p.publishedAt).getTime()) / MS_PER_DAY);
  if (ageDays > MAX_AGE_DAYS) return -Infinity;
  const recency = Math.exp(-ageDays / TAU_DAYS);
  return (
    W_RECENCY * recency +
    W_CITATIONS * Math.log10(1 + citations) +
    W_INFLUENTIAL * Math.log10(1 + influential)
  );
}

export function rank(papers: Paper[], limit: number, mode: RankMode = 'balanced'): Paper[] {
  const now = Date.now();
  return papers
    .map((p) => ({ p, s: scorePaper(p, mode, now) }))
    .filter(({ s }) => s > -Infinity)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ p }) => p);
}

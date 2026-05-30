import type { Paper, PaperMetrics } from '../../shared/types.js';

const ENDPOINT = 'https://api.semanticscholar.org/graph/v1';
const USER_AGENT = 'research-widget/0.0.1 (https://github.com/Evan-McCall/research-widget)';
const BATCH_LIMIT = 500;

const SEARCH_FIELDS = [
  'externalIds',
  'title',
  'abstract',
  'authors',
  'publicationDate',
  'citationCount',
  'influentialCitationCount',
  'fieldsOfStudy',
  'url',
].join(',');

type S2Paper = {
  paperId: string;
  externalIds?: { ArXiv?: string; DOI?: string };
  citationCount?: number;
  influentialCitationCount?: number;
};

type S2SearchPaper = S2Paper & {
  title: string;
  abstract?: string | null;
  authors?: { name: string }[];
  publicationDate?: string | null;
  fieldsOfStudy?: string[] | null;
  url?: string;
};

type S2SearchResponse = {
  total?: number;
  token?: string | null;
  data?: S2SearchPaper[];
};

/**
 * Look up a set of arXiv-sourced papers in Semantic Scholar and return
 * their citation metrics. Papers S2 doesn't know about are silently
 * skipped (returns nothing for them).
 *
 * Expects external IDs in our internal format ('arxiv:<id>'), and queries
 * S2 using its 'ARXIV:<id>' convention.
 */
export async function fetchS2Metrics(externalIds: string[]): Promise<PaperMetrics[]> {
  if (externalIds.length === 0) return [];

  const arxivOnly = externalIds.filter((id) => id.startsWith('arxiv:'));
  if (arxivOnly.length === 0) return [];

  const out: PaperMetrics[] = [];
  for (let i = 0; i < arxivOnly.length; i += BATCH_LIMIT) {
    const slice = arxivOnly.slice(i, i + BATCH_LIMIT);
    const batch = await fetchBatch(slice);
    out.push(...batch);
  }
  return out;
}

/**
 * Search Semantic Scholar by free-text query, ordered by citation count
 * (desc). Use this to surface high-impact papers in a topic regardless of
 * when they were published.
 */
export async function searchS2ByTopic(query: string, limit = 100): Promise<Paper[]> {
  const url = new URL(`${ENDPOINT}/paper/search/bulk`);
  url.searchParams.set('query', query);
  url.searchParams.set('sort', 'citationCount:desc');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('fields', SEARCH_FIELDS);

  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
  if (key) headers['x-api-key'] = key;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`S2 search ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as S2SearchResponse;
  const papers = body.data ?? [];
  // Bulk endpoint ignores `limit` for small values and returns up to 1000.
  // We only want the top N (by citationCount desc) per topic.
  return papers
    .slice(0, limit)
    .map(toPaper)
    .filter((p): p is Paper => p !== null);
}

function toPaper(p: S2SearchPaper): Paper | null {
  if (!p.title || !p.publicationDate) return null;
  const arxivId = p.externalIds?.ArXiv;
  const externalId = arxivId ? `arxiv:${arxivId}` : `s2:${p.paperId}`;
  const url = arxivId
    ? `https://arxiv.org/abs/${arxivId}`
    : (p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`);

  return {
    externalId,
    source: arxivId ? 'arxiv' : 'semanticscholar',
    title: p.title.trim(),
    url,
    abstract: p.abstract ?? undefined,
    authors: (p.authors ?? []).map((a) => a.name).filter(Boolean),
    categories: p.fieldsOfStudy ?? [],
    publishedAt: new Date(p.publicationDate).toISOString(),
    citations: p.citationCount,
    influentialCitations: p.influentialCitationCount,
  };
}

async function fetchBatch(externalIds: string[]): Promise<PaperMetrics[]> {
  const ids = externalIds.map((id) => `ARXIV:${id.replace(/^arxiv:/, '')}`);
  const url = `${ENDPOINT}/paper/batch?fields=externalIds,citationCount,influentialCitationCount`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };
  const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
  if (key) headers['x-api-key'] = key;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    throw new Error(`S2 batch ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as (S2Paper | null)[];

  const metrics: PaperMetrics[] = [];
  for (const p of data) {
    if (!p) continue;
    const arxivId = p.externalIds?.ArXiv;
    if (!arxivId) continue;
    metrics.push({
      externalId: `arxiv:${arxivId}`,
      citations: p.citationCount,
      influentialCitations: p.influentialCitationCount,
    });
  }
  return metrics;
}

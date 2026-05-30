import type { RefreshResult } from '../shared/types.js';
import { fetchArxiv } from './sources/arxiv.js';
import { fetchS2Metrics, searchS2ByTopic } from './sources/semanticscholar.js';
import { updateMetrics, upsertPapers } from './store/papers.js';

const ARXIV_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL'];

// Broad topic queries fed to Semantic Scholar's bulk search (sorted by
// citationCount desc) to surface high-impact papers in the user's areas
// of interest, regardless of when they were published.
const S2_TOPIC_QUERIES = [
  'large language model agent',
  'agentic AI tool use',
  'neural network architecture',
  'multimodal foundation model',
];

let inFlight: Promise<RefreshResult> | null = null;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function refreshAll(): Promise<RefreshResult> {
  if (inFlight) return inFlight;
  inFlight = doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(): Promise<RefreshResult> {
  const at = new Date().toISOString();
  try {
    console.log('[refresh] fetching arxiv…');
    const arxivPapers = await fetchArxiv({
      categories: ARXIV_CATEGORIES,
      maxResults: 150,
    });
    console.log(`[refresh] fetched ${arxivPapers.length} arxiv papers`);
    const arxivStats = upsertPapers(arxivPapers);
    console.log(
      `[refresh] arxiv upsert: inserted=${arxivStats.inserted} updated=${arxivStats.updated}`,
    );

    let enriched = 0;
    let s2Inserted = 0;

    // Pull popular/high-impact papers per topic (any age). Throttled to
    // honor S2's 1 req/sec limit; per-call try/catch so one 429 doesn't
    // poison the whole step.
    const all: typeof arxivPapers = [];
    for (let i = 0; i < S2_TOPIC_QUERIES.length; i += 1) {
      const q = S2_TOPIC_QUERIES[i];
      try {
        const found = await searchS2ByTopic(q, 60);
        console.log(`[refresh] s2 topic "${q}": ${found.length} papers`);
        all.push(...found);
      } catch (e) {
        console.error(`[refresh] s2 topic "${q}" failed`, e);
      }
      if (i < S2_TOPIC_QUERIES.length - 1) await sleep(2500);
    }

    if (all.length > 0) {
      const dedupedById = new Map(all.map((p) => [p.externalId, p]));
      const merged = [...dedupedById.values()];
      const stats = upsertPapers(merged);
      s2Inserted = stats.inserted;
      console.log(
        `[refresh] s2 topic search merged: ${merged.length} unique, inserted=${stats.inserted} updated=${stats.updated}`,
      );
    }

    await sleep(2500);
    try {
      const metrics = await fetchS2Metrics(arxivPapers.map((p) => p.externalId));
      enriched = updateMetrics(metrics);
      console.log(`[refresh] enriched ${enriched}/${metrics.length} via S2 batch`);
    } catch (e) {
      console.error('[refresh] S2 batch enrichment failed', e);
    }

    return {
      ok: true,
      fetched: arxivPapers.length + s2Inserted,
      inserted: arxivStats.inserted + s2Inserted,
      updated: arxivStats.updated,
      enriched,
      at,
    };
  } catch (err) {
    console.error('[refresh] FAILED', err);
    return {
      ok: false,
      fetched: 0,
      inserted: 0,
      updated: 0,
      enriched: 0,
      error: err instanceof Error ? err.message : String(err),
      at,
    };
  }
}

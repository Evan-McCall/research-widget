import type { RefreshResult } from '../shared/types.js';
import { fetchArxiv } from './sources/arxiv.js';
import { upsertPapers } from './store/papers.js';

const ARXIV_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL'];

let inFlight: Promise<RefreshResult> | null = null;

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
    const papers = await fetchArxiv({
      categories: ARXIV_CATEGORIES,
      maxResults: 30,
    });
    console.log(`[refresh] fetched ${papers.length} papers`);
    const { inserted, updated } = upsertPapers(papers);
    console.log(`[refresh] upserted: inserted=${inserted} updated=${updated}`);
    return { ok: true, fetched: papers.length, inserted, updated, at };
  } catch (err) {
    console.error('[refresh] FAILED', err);
    return {
      ok: false,
      fetched: 0,
      inserted: 0,
      updated: 0,
      error: err instanceof Error ? err.message : String(err),
      at,
    };
  }
}

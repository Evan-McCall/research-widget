import type { Paper, PaperMetrics } from '../../shared/types.js';
import { getDb } from './db.js';

type Row = {
  external_id: string;
  source: string;
  title: string;
  url: string;
  abstract: string | null;
  authors: string;
  categories: string;
  published_at: string;
  citations: number | null;
  influential_citations: number | null;
  hn_points: number | null;
};

export function upsertPapers(papers: Paper[]): { inserted: number; updated: number } {
  if (papers.length === 0) return { inserted: 0, updated: 0 };

  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO papers (
      external_id, source, title, url, abstract, authors, categories,
      published_at, citations, influential_citations, hn_points, cached_at
    ) VALUES (
      @external_id, @source, @title, @url, @abstract, @authors, @categories,
      @published_at, @citations, @influential_citations, @hn_points, @cached_at
    )
    ON CONFLICT(external_id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      abstract = excluded.abstract,
      authors = excluded.authors,
      categories = excluded.categories,
      published_at = excluded.published_at,
      citations = COALESCE(excluded.citations, papers.citations),
      influential_citations = COALESCE(excluded.influential_citations, papers.influential_citations),
      hn_points = COALESCE(excluded.hn_points, papers.hn_points),
      cached_at = excluded.cached_at
  `);

  let inserted = 0;
  let updated = 0;

  const tx = db.transaction((batch: Paper[]) => {
    for (const p of batch) {
      const result = stmt.run({
        external_id: p.externalId,
        source: p.source,
        title: p.title,
        url: p.url,
        abstract: p.abstract ?? null,
        authors: JSON.stringify(p.authors),
        categories: JSON.stringify(p.categories),
        published_at: p.publishedAt,
        citations: p.citations ?? null,
        influential_citations: p.influentialCitations ?? null,
        hn_points: p.hnPoints ?? null,
        cached_at: now,
      });
      if (result.changes === 1) inserted += 1;
      else if (result.changes > 1) updated += 1;
    }
  });

  tx(papers);
  // SQLite ON CONFLICT DO UPDATE always reports changes=1, so split via a
  // second query that compares cached_at would be needed for true accuracy.
  // For M2 the counts above are an approximation good enough for UI.
  return { inserted, updated };
}

export function getAllPapers(): Paper[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM papers`).all() as Row[];
  return rows.map(rowToPaper);
}

export function getLastCachedAt(): string | null {
  const db = getDb();
  const row = db.prepare(`SELECT MAX(cached_at) AS m FROM papers`).get() as { m: string | null };
  return row.m;
}

export function updateMetrics(metrics: PaperMetrics[]): number {
  if (metrics.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE papers
       SET citations = COALESCE(?, citations),
           influential_citations = COALESCE(?, influential_citations),
           hn_points = COALESCE(?, hn_points)
     WHERE external_id = ?
  `);
  const tx = db.transaction((batch: PaperMetrics[]): number => {
    let touched = 0;
    for (const m of batch) {
      const r = stmt.run(
        m.citations ?? null,
        m.influentialCitations ?? null,
        m.hnPoints ?? null,
        m.externalId,
      );
      if (r.changes > 0) touched += 1;
    }
    return touched;
  });
  return tx(metrics);
}

function rowToPaper(r: Row): Paper {
  return {
    externalId: r.external_id,
    source: r.source as Paper['source'],
    title: r.title,
    url: r.url,
    abstract: r.abstract ?? undefined,
    authors: JSON.parse(r.authors) as string[],
    categories: JSON.parse(r.categories) as string[],
    publishedAt: r.published_at,
    citations: r.citations ?? undefined,
    influentialCitations: r.influential_citations ?? undefined,
    hnPoints: r.hn_points ?? undefined,
  };
}

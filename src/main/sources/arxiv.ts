import { XMLParser } from 'fast-xml-parser';
import type { Paper } from '../../shared/types.js';

const FEED_URL = 'https://export.arxiv.org/api/query';
const USER_AGENT = 'research-widget/0.0.1 (https://github.com/Evan-McCall/research-widget)';
// arXiv asks for ≤1 request per 3 seconds. Self-throttle here so all callers
// (manual refresh button, auto-refresh, future scheduler) automatically obey.
const MIN_INTERVAL_MS = 3500;
let lastFetchAt = 0;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  trimValues: true,
});

type ArxivLink = { '@_href': string; '@_rel'?: string; '@_type'?: string };
type ArxivAuthor = { name: string };
type ArxivCategory = { '@_term': string };
type ArxivEntry = {
  id: string;
  title: string;
  summary?: string;
  published: string;
  updated?: string;
  author?: ArxivAuthor | ArxivAuthor[];
  category?: ArxivCategory | ArxivCategory[];
  link?: ArxivLink | ArxivLink[];
};

export type ArxivFetchOptions = {
  categories: string[]; // e.g. ['cs.AI', 'cs.LG']
  maxResults?: number;
};

export async function fetchArxiv(opts: ArxivFetchOptions): Promise<Paper[]> {
  await respectRateLimit();

  const query = opts.categories.map((c) => `cat:${c}`).join('+OR+');
  const url = new URL(FEED_URL);
  // arXiv chokes if search_query is URL-encoded, so build the query string by hand.
  const params = [
    `search_query=${query}`,
    `sortBy=submittedDate`,
    `sortOrder=descending`,
    `max_results=${opts.maxResults ?? 30}`,
  ].join('&');

  const res = await fetch(`${url}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/atom+xml' },
  });
  if (!res.ok) {
    throw new Error(`arXiv API ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const feed = parser.parse(xml) as { feed?: { entry?: ArxivEntry | ArxivEntry[] } };
  const entries = asArray(feed.feed?.entry);
  return entries.map(toPaper).filter((p): p is Paper => p !== null);
}

async function respectRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastFetchAt = Date.now();
}

function toPaper(e: ArxivEntry): Paper | null {
  const arxivId = extractArxivId(e.id);
  if (!arxivId) return null;

  const authors = asArray(e.author)
    .map((a) => a.name)
    .filter(Boolean);
  const categories = asArray(e.category).map((c) => c['@_term']);
  const htmlLink = asArray(e.link).find((l) => l['@_type'] === 'text/html');
  const url = htmlLink?.['@_href'] ?? e.id;

  return {
    externalId: `arxiv:${arxivId}`,
    source: 'arxiv',
    title: collapseWhitespace(e.title),
    url,
    abstract: e.summary ? collapseWhitespace(e.summary) : undefined,
    authors,
    categories,
    publishedAt: e.published,
  };
}

function extractArxivId(idUrl: string): string | null {
  // e.g. "http://arxiv.org/abs/2401.12345v1" -> "2401.12345"
  const m = idUrl.match(/abs\/(.+?)(?:v\d+)?$/);
  return m ? m[1] : null;
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

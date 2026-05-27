export type SourceId = 'arxiv' | 'semanticscholar' | 'hn' | 'rss';

export type Paper = {
  externalId: string; // e.g. 'arxiv:2401.12345'
  source: SourceId;
  title: string;
  url: string;
  abstract?: string;
  authors: string[];
  categories: string[];
  publishedAt: string; // ISO 8601
  citations?: number;
  influentialCitations?: number;
  hnPoints?: number;
};

export type RefreshResult = {
  ok: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  error?: string;
  at: string; // ISO
};

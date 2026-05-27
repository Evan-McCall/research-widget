import type { Paper, RankMode, RefreshResult } from '../shared/types.js';

type Api = {
  version: string;
  listPapers: (mode?: RankMode) => Promise<Paper[]>;
  refresh: () => Promise<RefreshResult>;
  openUrl: (url: string) => Promise<void>;
  onPapersChanged: (cb: () => void) => () => void;
};

declare global {
  interface Window {
    api: Api;
  }
}

const feedEl = document.getElementById('feed')!;
const refreshBtn = document.getElementById('refresh') as HTMLButtonElement;
const modeBtn = document.getElementById('mode-toggle') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const lastUpdatedEl = document.getElementById('last-updated')!;

const MODE_KEY = 'rankMode';
let rankMode: RankMode = (localStorage.getItem(MODE_KEY) as RankMode) ?? 'balanced';
let isRefreshing = false;

function applyModeButtonState(): void {
  modeBtn.classList.toggle('active', rankMode === 'allTime');
  modeBtn.title =
    rankMode === 'allTime'
      ? 'All-time most cited (click for balanced mix)'
      : 'Balanced: importance + recency (click for all-time top)';
}

async function loadFeed(): Promise<void> {
  try {
    const papers = await window.api.listPapers(rankMode);
    render(papers);
  } catch (err) {
    renderError(err);
  }
}

async function refresh(): Promise<void> {
  if (isRefreshing) return;
  isRefreshing = true;
  refreshBtn.classList.add('spinning');
  setStatus('Fetching…');
  try {
    const result = await window.api.refresh();
    if (!result.ok) {
      setStatus(`Error: ${result.error ?? 'unknown'}`, true);
    } else {
      setStatus(`v${window.api.version}`);
      setLastUpdated(new Date(result.at));
    }
    await loadFeed();
  } finally {
    isRefreshing = false;
    refreshBtn.classList.remove('spinning');
  }
}

function render(papers: Paper[]): void {
  if (papers.length === 0) {
    feedEl.replaceChildren(el('p', { class: 'placeholder' }, 'No papers yet.'));
    return;
  }
  feedEl.replaceChildren(
    ...papers.map((p) => {
      const item = el('a', {
        class: 'paper',
        href: p.url,
        title: p.abstract ?? p.title,
      });
      item.addEventListener('click', (ev) => {
        ev.preventDefault();
        window.api.openUrl(p.url);
      });
      item.append(
        el('div', { class: 'paper-title' }, p.title),
        el(
          'div',
          { class: 'paper-meta' },
          formatMeta(p),
        ),
      );
      return item;
    }),
  );
}

function renderError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  feedEl.replaceChildren(el('p', { class: 'placeholder error' }, msg));
}

function formatMeta(p: Paper): string {
  const source = p.source === 'arxiv' ? 'arXiv' : p.source;
  const cat = p.categories[0] ?? '';
  const age = relativeTime(new Date(p.publishedAt));
  const citations =
    p.citations !== undefined && p.citations > 0 ? `${formatCount(p.citations)}c` : '';
  return [source, cat, age, citations].filter(Boolean).join(' · ');
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString();
}

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function setLastUpdated(d: Date): void {
  lastUpdatedEl.textContent = `Updated ${d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function el(
  tag: string,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

refreshBtn.addEventListener('click', refresh);

modeBtn.addEventListener('click', () => {
  rankMode = rankMode === 'allTime' ? 'balanced' : 'allTime';
  localStorage.setItem(MODE_KEY, rankMode);
  applyModeButtonState();
  loadFeed();
});

document.getElementById('settings')?.addEventListener('click', () => {
  // M7: settings modal
  console.log('settings clicked');
});

window.api.onPapersChanged(loadFeed);
applyModeButtonState();
loadFeed().then(refresh);

export {};

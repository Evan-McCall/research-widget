# Research Widget — Implementation Plan

A frameless, translucent, always-on-top macOS desktop widget that surfaces
fresh and important AI/ML research from arXiv and Semantic Scholar, plus a
"startup signal" lane that mixes in industry posts.

This document is the source of truth for the design. It's meant to be edited
in PRs as decisions firm up — sections marked **OPEN** still need a call.

---

## 1. Goals & non-goals

**Goals**
- Always-visible glance-able feed of important new research in agentic AI,
  ML, and AI architecture
- Feels like the X/Twitter desktop widget in the reference screenshot:
  small, translucent, pinned, no chrome, hover-to-interact
- Clickable items open the paper / post in the default browser
- Refreshes automatically; manual refresh available
- Three topical "lanes" the user wants:
  1. **AI/ML innovations** — fresh arXiv + S2 in cs.AI / cs.LG / cs.CL
  2. **Agentic AI in industry** — applied/deployment-oriented papers + curated
     industry feed (HN, lab blogs)
  3. **Startup-idea fodder** — papers/posts hinting at productizable
     opportunities (new capabilities, eval gaps, new modalities)

**Non-goals (v1)**
- No paper full-text fetching/summarization on-device (just metadata)
- No multi-user / sync / cloud — single-user local app
- No notifications system (can come later)
- Not cross-platform; macOS-only behavior

---

## 2. Tech stack & rationale

### 2.1 Shell: Electron (not Tauri, not native Swift)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Electron** | Mature frameless/transparent/vibrancy/alwaysOnTop story on macOS; large ecosystem; trivial dev loop | ~150 MB bundle; Chromium overhead | ✅ Pick this |
| Tauri | ~10 MB bundle, Rust backend | Transparent + always-on-top + vibrancy on macOS is less polished as of 2026; Rust learning curve adds friction for a personal project | Skip for v1 |
| Swift + WidgetKit | Truly native, lowest power use | Widgets are extremely restricted (no live network on a schedule shorter than ~hourly, no real interactivity); you wanted a panel, not a Notification Center tile | Skip |

The look-and-feel target is the X widget in the screenshot, which is itself
a frameless always-on-top window. Electron nails that.

### 2.2 Renderer: vanilla TS + lit-html

A research widget is a list with three tabs. React/Next is overkill and
balloons the bundle. **Vanilla TypeScript + [lit-html](https://lit.dev/docs/libraries/standalone-templates/)**
gives JSX-like ergonomics in ~5 KB with no build complexity beyond `tsc` +
`vite`.

If we later want richer UI (settings page, drag-to-reorder), we can swap in
Preact (3 KB React-compatible) without restructuring.

### 2.3 Storage

- **`electron-store`** — settings (window pos, refresh interval, topic
  weights, API keys)
- **`better-sqlite3`** — paper cache (so we can dedupe, rank, mark "seen",
  survive restarts without re-hitting the APIs)

SQLite buys us efficient rank-by-score queries and easy schema migrations.
Plain JSON would be fine on day one but breaks down at ~thousands of cached
items.

### 2.4 Build/packaging

- **Vite** for the renderer
- **electron-vite** to drive both main + renderer with one config
- **electron-builder** for the eventual `.dmg`
- **TypeScript strict** across both processes

### 2.5 Dependencies (target list)

```jsonc
{
  "dependencies": {
    "electron-store": "^10",
    "better-sqlite3": "^11",
    "lit-html": "^3",
    "fast-xml-parser": "^4",   // arXiv returns Atom XML
    "p-queue": "^8"            // rate-limit S2 fetches
  },
  "devDependencies": {
    "electron": "^33",
    "electron-vite": "^2",
    "electron-builder": "^25",
    "typescript": "^5.6",
    "vite": "^6"
  }
}
```

(Versions to be pinned at install time — these are the floors.)

---

## 3. Window behavior (the "feels like the X widget" part)

**Target look:** matches a native macOS desktop widget (2x2 large tile, à la
the X widget). Fixed size, square-ish, big rounded corners, sits **at
desktop level** (visible against the wallpaper, hidden by app windows when
they overlap). Never on top of browser tabs or other windows.

A single `BrowserWindow` configured:

```ts
new BrowserWindow({
  width: 360,                       // matches macOS "large" 2x2 widget tile
  height: 360,
  x: <restored from store>,
  y: <restored from store>,
  frame: false,
  transparent: true,
  vibrancy: 'under-window',         // macOS blur
  visualEffectState: 'active',
  hasShadow: true,
  resizable: false,                 // fixed-size like a real widget
  movable: true,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  skipTaskbar: false,
  roundedCorners: true,             // macOS-native corner rounding
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    preload: '<preload.js>',
  },
});

// No setAlwaysOnTop call — see "Why no always-on-top" below.
```

Plus macOS-specific calls:

- `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })` —
  the widget follows you between Spaces
- `app.dock.hide()` — no dock icon, just a menubar tray
- Drag region via CSS `-webkit-app-region: drag` on the header
- CSS `border-radius: 22px` on `body` to match macOS widget corner radius
  (22 pt for a large widget tile, 18 pt for medium)

### Why no always-on-top

Original M1 used `alwaysOnTop: true, 'floating'` for simplicity, which made
the widget hover over every other window (incl. browser tabs). Locked
decision: the widget should feel like a wallpaper companion, not a chrome
panel.

Electron's typed window levels for `setAlwaysOnTop` don't include the
macOS-private `'desktop'` level, so we can't pin to the wallpaper layer
without unsafe casts. The clean compromise: **don't call `setAlwaysOnTop`
at all.** The window sits in normal z-order — clicking another app brings
that app forward, leaving the widget behind. Clicking the widget brings it
forward. That's close enough to the X-widget feel for v1.

### Tray (menu bar)

- Icon in menu bar (rounded square book glyph)
- Menu: Show/Hide, Refresh now, Settings…, Quit
- No pin-mode toggle in v1 — see "Why not always on top" above

---

## 4. Data sources

### 4.1 arXiv

- Endpoint: `http://export.arxiv.org/api/query`
- Format: Atom XML — parse with `fast-xml-parser`
- Query for "fresh papers in N categories sorted by submission date":
  ```
  search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL
  &sortBy=submittedDate&sortOrder=descending
  &max_results=50
  ```
- Rate limit: arXiv asks for ≤1 req/3s — we'll cap at 1 req/5s with
  `p-queue`
- Categories used for the three lanes:
  - **AI/ML innovations**: cs.AI, cs.LG, cs.CL, cs.CV, stat.ML
  - **Agentic AI in industry**: cs.AI + abstract keyword match
    (`agent`, `tool`, `production`, `deployment`, `eval`, `pipeline`)
  - **Startup-idea fodder**: cs.HC, cs.IR, cs.SE + keyword match
    (`benchmark`, `new task`, `application`, `case study`)

### 4.2 Semantic Scholar Graph API

- Endpoint: `https://api.semanticscholar.org/graph/v1`
- Two calls used:
  - `paper/search?query=<topic>&limit=20&fields=title,abstract,authors,year,citationCount,influentialCitationCount,externalIds,url,publicationDate`
  - `paper/<arxivId>?fields=…` — to enrich an arXiv hit with citation
    counts (for ranking)
- API key: **provided (1 req/s tier).** Loaded from `.env.local` in dev
  (gitignored), and from `electron-store` in production; user can rotate
  via Settings. Never committed.
- Topical queries for the three lanes:
  - **AI/ML innovations**: `large language model`, `mixture of experts`,
    `reinforcement learning from human feedback`, `model architecture`
  - **Agentic AI in industry**: `LLM agent deployment`, `tool use`,
    `production LLM systems`, `LLM evaluation in the wild`
  - **Startup-idea fodder**: `LLM application`, `new benchmark`, `human-AI
    interaction`, `AI for <vertical>` (rotates: legal, finance, education,
    health, robotics)

### 4.3 OPEN: industry / startup signal source

Pure arXiv + S2 won't surface "companies/startups doing X with agents" —
that's blog/news content. Candidates:

- Hacker News (Algolia API — free, no key) filtered to AI keywords + min
  points. Cheap to add.
- Lab blog RSS: OpenAI, Anthropic, DeepMind, Meta AI, Mistral, Cohere.
  Manageable list, low volume, very high signal.
- /r/MachineLearning top posts (Reddit JSON API, no key).

**Decision (locked):** v1 ships with HN (top-story filter) + curated
lab-blog RSS. Skip Reddit. Sufficient for the Industry and Idea lanes.

---

## 5. Source abstraction

```ts
interface Source {
  id: string;                 // 'arxiv' | 'semanticscholar' | 'hn' | 'rss:<url>'
  label: string;
  fetch(opts: FetchOpts): Promise<RawItem[]>;
}

interface RawItem {
  externalId: string;         // arxiv:2401.12345, s2:abc, hn:12345
  url: string;
  title: string;
  abstract?: string;
  authors?: string[];
  publishedAt: string;        // ISO
  source: string;
  metrics?: {
    citations?: number;
    influentialCitations?: number;
    hnPoints?: number;
  };
  categories?: string[];      // arxiv cats, hn tags, etc
}
```

New sources are just another file in `src/main/sources/`.

---

## 6. Ranking & dedupe

### Dedupe

- Primary key on `papers`: `external_id` (e.g. `arxiv:2401.12345`).
- Cross-source merge: when S2 returns a paper with `externalIds.ArXiv`,
  upsert under the canonical `arxiv:<id>` row and merge in S2 metrics. This
  is why the cache is SQLite — the merge is a single `INSERT … ON CONFLICT
  DO UPDATE SET metrics = json_patch(...)`.

### Score (per lane)

```
score = w_recency * recency(t)
      + w_citations * log10(1 + citationCount)
      + w_influential * log10(1 + influentialCitationCount)
      + w_keyword * keywordMatch(title + abstract, laneKeywords)
      + w_source * sourceBoost(source)
```

- `recency(t) = exp(-Δdays / τ)`, τ=7 days
- Weights stored in settings, defaults:
  - AI/ML lane: heavy recency + citation
  - Industry lane: heavy keyword + HN points
  - Startup lane: heavy keyword + recency

The weights live in `electron-store` so the user can tune them per lane
later via Settings.

### Display ordering

Top N (default 15) per lane, scored, with a small diversity penalty so the
list isn't all from the same author or category.

---

## 7. UI

```
┌────────────────────────────┐
│ 🔬 Research          ⟳ ⚙  │   ← drag region; refresh + settings
├────────────────────────────┤
│ [Innovations] Industry Idea│   ← tab strip
├────────────────────────────┤
│ ▸ Scaling MoE Agents       │
│   arXiv · cs.AI · 2h · 17↑ │
│                            │
│ ▸ Tool-Use Reward Models   │
│   Sem. Scholar · 5h · 142c │
│                            │
│ ▸ A Survey of Agent Memory │
│   arXiv · cs.LG · 1d       │
├────────────────────────────┤
│ Updated 7:17 PM        ●●● │
└────────────────────────────┘
```

- Translucent black-tinted vibrancy, ~12 px corner radius
- Title row drag region; everything else is `-webkit-app-region: no-drag`
- Clicking an item: `shell.openExternal(item.url)` → opens in default browser
- Hover reveals abstract preview tooltip after 400 ms
- Tabs switch lane (state in renderer; data fetched once and filtered)
- Footer dot indicator shows refresh status (idle / fetching / error)
- Right-click item: "Mark as seen", "Hide forever", "Copy link"

---

## 8. Refresh loop

- Background interval (default 30 min) in main process using `setInterval`
  — but **only fires when laptop is awake** (listen for
  `powerMonitor.on('suspend' | 'resume')`)
- Manual refresh from header button or tray
- Per-source error backoff: if a source fails, retry at 2× the next
  interval, capped at 4 h
- All cached papers persisted to SQLite → cold start renders instantly from
  cache and only then refreshes

---

## 9. Project layout

```
research-widget/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # app lifecycle, window, tray
│   │   ├── window.ts
│   │   ├── tray.ts
│   │   ├── refresh.ts         # scheduler
│   │   ├── sources/
│   │   │   ├── arxiv.ts
│   │   │   ├── semanticscholar.ts
│   │   │   ├── hn.ts
│   │   │   └── rss.ts
│   │   ├── store/
│   │   │   ├── db.ts          # better-sqlite3 + migrations
│   │   │   ├── papers.ts      # upsert, dedupe, score query
│   │   │   └── settings.ts    # electron-store wrapper
│   │   └── ranking.ts
│   ├── preload/
│   │   └── index.ts           # contextBridge API surface
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── styles.css
│   │   └── views/
│   │       ├── header.ts
│   │       ├── feed.ts
│   │       └── settings.ts
│   └── shared/
│       └── types.ts           # RawItem, Lane, Settings
├── resources/
│   ├── tray-icon@2x.png
│   └── icon.icns
├── LICENSE
├── README.md
└── PLAN.md
```

---

## 10. Milestones

> Each milestone is a PR. We do NOT batch them — small reviewable diffs.

### M1 — Hello, frameless window (½ day)
- `npm init`, install Electron + electron-vite + TS
- Empty frameless transparent vibrancy window, drag region, "Hello"
- Tray icon with Quit
- App auto-restores window position
- **Acceptance:** `npm run dev` produces a translucent floating panel on
  desktop, draggable, survives quit/relaunch with same position

### M2 — arXiv feed in the panel (1 day)
- arXiv source module + Atom parser
- SQLite cache with `papers` table + upsert
- Renderer: list view, hardcoded "AI/ML" lane only
- Click-through opens browser
- Manual refresh button
- **Acceptance:** ten newest cs.AI/cs.LG papers visible, refreshable,
  clickable

### M3 — Semantic Scholar + dedupe (1 day)
- S2 source module, API key in `electron-store`
- Enrich existing arXiv rows with S2 metrics (citations, influential)
- Cross-source dedupe via `externalIds.ArXiv`
- Score-based ranking (recency + citations)
- **Acceptance:** S2-enriched citation counts visible in the UI; no
  duplicates when same paper appears in both feeds

### M4 — Three lanes + keyword matching (1 day)
- Tab strip in UI; persist active lane
- Lane configs (categories, queries, keywords) defined in code
- Per-lane weighted scoring
- **Acceptance:** all three tabs populated with distinct, sensible items

### M5 — Industry signal source (½ day)
- HN source via Algolia API (`hn.algolia.com/api/v1/search_by_date`)
- Lab blog RSS subscriber list
- Both merged into Industry + Idea lanes
- **Acceptance:** Industry tab includes recent HN AI threads and lab posts

### M6 — Auto-refresh + power-aware scheduler (½ day)
- `setInterval` in main with `powerMonitor` integration
- Per-source error backoff
- Status indicator (idle/fetching/error) in footer
- **Acceptance:** widget self-refreshes overnight without piling up errors
  after a long sleep

### M7 — Settings panel (1 day)
- Modal in renderer (or separate `BrowserWindow`)
- Editable: API key, refresh interval, lane weights, blocked authors
- Persists via `electron-store`
- **Acceptance:** all knobs above editable in-app, no restart needed

### M8 — Packaging (½ day)
- `electron-builder` config, code-signing OFF for personal use
- Build a notarization-free `.app` for the user's Mac
- "Launch at login" toggle
- **Acceptance:** `npm run build` produces a `.app` that runs on the user's
  machine without a Terminal session

Total: ~5 working days end-to-end if no rabbit holes.

---

## 11. Decisions log

| # | Question | Decision | Date |
|---|---|---|---|
| 1 | S2 API key | Provided, 1 req/s tier. `.env.local` in dev, `electron-store` in prod. | 2026-05-26 |
| 2 | Industry lane source mix | HN Algolia + curated lab-blog RSS. No Reddit, no X. | 2026-05-26 |
| 3 | LLM-scored ranking | **No LLM in v1.** Keyword-only across all three lanes. Re-evaluate post-M8. | 2026-05-26 |
| 4 | Auto-launch at login | **On by default**, toggleable in Settings. | 2026-05-26 |
| 5 | Always-on-top | **No.** Don't call `setAlwaysOnTop` — normal z-order, ducks behind other windows when they're focused. Electron's `'desktop'` level isn't in the typed API. | 2026-05-27 |
| 6 | Window size & shape | **Fixed 330×330**, non-resizable. Inner body border-radius = 12 px to match the native macOS frameless-window rounding (~10 pt). | 2026-05-27 |
| 7 | Outer corner radius | **Accept native ~10 pt.** macOS controls the outer rounding when vibrancy is on; the only way to get bigger outer corners is to drop vibrancy (and lose wallpaper blur). Wallpaper blur > big corners. | 2026-05-27 |

### Still open

— none —

### Applied in M1.1

- `alwaysOnTop` removed, `resizable: false`, fixed 330×330
- Vibrancy switched to `'fullscreen-ui'` (lighter than `'under-window'`)
- Inner body `border-radius: 12px` (matches native window rounding)
- Header / footer dividers removed; title bumped to 15px
- Store key changed `windowBounds` → `windowPosition` (only x/y now)
- `'resized'` listener dropped

---

## 12. Out of scope (parked)

- Full-text PDF summarization on-device
- Multi-machine sync
- Notifications / sound alerts
- Themes beyond dark/light
- Authoring notes on papers
- Windows / Linux ports

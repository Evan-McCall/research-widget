<div align="center">

```
   ▆▃▇▂▅▆▃█▁▄▇▂▆▃▅▇▁▄▆▃█▂▅▇▃▆▁▄▇▂▅▆▃█▁▄▇▂▆▃▅▇▁
   ╦═╗ ╔═╗ ╔═╗ ╔═╗ ╔═╗ ╦═╗ ╔═╗ ╦ ╦
   ╠╦╝ ║╣  ╚═╗ ║╣  ╠═╣ ╠╦╝ ║   ╠═╣
   ╩╚═ ╚═╝ ╚═╝ ╚═╝ ╩ ╩ ╩╚═ ╚═╝ ╩ ╩
                       a desktop widget
   ▆▃▇▂▅▆▃█▁▄▇▂▆▃▅▇▁▄▆▃█▂▅▇▃▆▁▄▇▂▅▆▃█▁▄▇▂▆▃▅▇▁
```

**A glance-able feed of important AI/ML research, pinned to your Mac desktop.**

[![macOS](https://img.shields.io/badge/macOS-12+-000000.svg?logo=apple)](https://www.apple.com/macos/)
[![Electron 33](https://img.shields.io/badge/electron-33-47848F.svg?logo=electron)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.6-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

A frameless, translucent panel that lives on your macOS desktop and surfaces fresh, high-impact research in agentic AI, ML, and AI architecture. Sources mix arXiv (latest submissions) with Semantic Scholar (high-citation papers, regardless of age), deduped and ranked into a single 15-item feed. Built to feel like a native macOS desktop widget — no chrome, no dock icon, no fuss.

> The goal: stay current on important AI research without opening a single tab.

---

## Contents

- [Look and feel](#look-and-feel)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Ranking modes](#ranking-modes)
- [Project layout](#project-layout)
- [Configuration](#configuration)
- [Design notes](#design-notes)
- [Roadmap](#roadmap)
- [License](#license)

---

## Look and feel

A 330×330 translucent tile that ducks behind other windows when they're focused (i.e. it does **not** sit on top of your browser tabs), follows you between Spaces, and shows up to 15 ranked papers. Each row is `title · arXiv · category · age · citations`, single-click opens the paper in your default browser.

The header has two controls:

- **★** — toggles ranking between *balanced* (importance + recency, 18-month window) and *all-time* (pure citation impact, no age cutoff)
- **⟳** — manual refresh

The footer shows the last refresh time. A 🔬 icon lives in the macOS menu bar with `Show / Hide`, `Launch at login`, and `Quit`.

---

## Quick start

Requires **Node 18+** and **npm**. Tested on macOS 15 (Apple Silicon).

```bash
git clone git@github.com:Evan-McCall/research-widget.git
cd "research-widget"
npm install        # installs deps + rebuilds better-sqlite3 against Electron's Node ABI
cp .env.example .env.local
# edit .env.local — paste your Semantic Scholar API key
npm run dev        # runs the widget against the dev server
```

To build a real `.app` you can drag into `/Applications`:

```bash
npm run pack       # produces release/mac-arm64/Research Widget.app
```

If you want a `.dmg` instead, `npm run dist`. Both targets are **unsigned** by default (`identity: null` in `package.json`'s `build` block) — on first launch macOS Gatekeeper will warn; right-click the app → Open to bypass once and it's trusted from then on.

### Where the S2 key lives

- **Dev (`npm run dev`)** — `.env.local` at the repo root
- **Packaged `.app`** — `~/Library/Application Support/Research Widget/.env`

The same loader checks both; the packaged build won't find `.env.local` because it isn't shipped. Get a free key (1 req/s tier) from [the Semantic Scholar API docs](https://www.semanticscholar.org/product/api#api-key).

---

## How it works

```
  ┌──────────────────────────────────────────┐
  │       Research Widget (Electron app)     │
  └──────────────────────────────────────────┘
                      │
                      │ on launch, manual refresh,
                      │ or every 30 min (auto)
                      ▼
       ┌─────────────────┐  ┌─────────────────┐
       │     arXiv       │  │ Semantic Scholar│
       │ Atom feed       │  │ batch + bulk    │
       │ cs.AI, cs.LG,   │  │ search by topic │
       │ cs.CL           │  │ keywords        │
       └────────┬────────┘  └────────┬────────┘
                │                    │
                └─────────┬──────────┘
                          ▼
                ┌──────────────────┐
                │   SQLite cache   │  ← dedup on external_id PK
                │   (papers table) │     (arxiv:<id> shared between
                └────────┬─────────┘      arXiv and S2 lookups)
                         ▼
                ┌──────────────────┐
                │     Ranking      │  balanced (recency × impact)
                │                  │  or all-time (pure impact)
                └────────┬─────────┘
                         ▼
                ┌──────────────────┐
                │   UI list (15)   │  → shell.openExternal on click
                └──────────────────┘
```

**Scheduler.** A `setInterval` in the main process fires the refresh every 30 min. It pauses on `powerMonitor.suspend` and runs immediately on `resume` so a laptop that slept overnight doesn't sit on stale data. Failures back off exponentially (×2 each consecutive failure) capped at 4 hours.

**Rate limits.** Each source self-throttles inside its module — arXiv at 1 req per 3.5s, S2 bulk search at one call per 2.5s — so callers don't have to remember.

---

## Ranking modes

| Mode | Formula | Hard cutoff | When to use |
|---|---|---|---|
| **Balanced** (default) | `0.4 · exp(-age/90d) + 2 · log₁₀(1 + cites) + 3 · log₁₀(1 + influential)` | 18 months | Day-to-day; what's important *and* current |
| **All-time** | `log₁₀(1 + cites) + 2 · log₁₀(1 + influential)` | none | Reading classics; foundational papers in a field |

Weights live in `src/main/ranking.ts`. Toggle via the ★ button in the header; the selection persists across restarts.

---

## Project layout

```
research-widget/
├── electron.vite.config.ts
├── package.json                # incl. electron-builder `build` config
├── tsconfig.json
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.ts            # app lifecycle, window, tray, IPC
│   │   ├── env.ts              # .env loader (dev + packaged paths)
│   │   ├── refresh.ts          # orchestrates a full refresh pass
│   │   ├── scheduler.ts        # auto-refresh + power-aware + backoff
│   │   ├── ranking.ts          # balanced / all-time scoring
│   │   ├── sources/
│   │   │   ├── arxiv.ts        # Atom feed fetch + parse
│   │   │   └── semanticscholar.ts  # batch metric + bulk topic search
│   │   └── store/
│   │       ├── db.ts           # better-sqlite3 init + migrations
│   │       └── papers.ts       # upsert, fetch, metric merge
│   ├── preload/
│   │   └── index.ts            # contextBridge surface (IPC only)
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.ts             # list rendering, refresh button, mode toggle
│   │   └── styles.css          # transparent vibrancy panel
│   └── shared/
│       └── types.ts            # Paper, RankMode, RefreshResult
└── .github/workflows/          # CI + Claude @mention action
```

---

## Configuration

Most knobs live in code (one file, one constant). Listed here so you know where to look.

| What | Where |
|---|---|
| Window size + corner radius | `src/main/index.ts` (`WIDGET_WIDTH`, CSS `border-radius`) |
| Refresh interval, backoff cap | `src/main/scheduler.ts` |
| arXiv categories, S2 topic queries | `src/main/refresh.ts` |
| Ranking weights, τ, age cutoff | `src/main/ranking.ts` |
| List length (default 15) | `src/main/index.ts` (`rank(..., 15, mode)`) |
| Semantic Scholar API key | `.env.local` (dev) / `<userData>/.env` (packaged) |

A proper Settings UI is on the roadmap; until then, edit the constants and rebuild.

---

## Design notes

- **No always-on-top.** The widget sits in normal z-order so other apps can come in front. macOS's typed window levels don't include the private `'desktop'` level, so this is the cleanest "wallpaper companion" you can get from pure Electron without unsafe casts.
- **Vibrancy over CSS blur.** macOS `NSVisualEffectMaterialFullScreenUI` is what gives the panel its wallpaper-blur look. CSS `backdrop-filter` would only blur page content (which isn't there); we genuinely want the desktop wallpaper.
- **Two-source dedup via primary key.** Both the arXiv Atom parser and the S2 bulk search normalize papers to the same `arxiv:<id>` `external_id` when an arXiv ID is present. SQLite's `INSERT … ON CONFLICT DO UPDATE` merges the rows, preserving arXiv's category metadata and S2's citation counts.
- **No LLM in the loop.** Ranking is keyword-matched and citation-weighted, not LLM-scored. Faster, cheaper, and doesn't require another API key. Could change if a *productizability* score becomes interesting.
- **Cached-first render.** The renderer asks for the cached list on init and shows it instantly, then triggers a refresh in the background. Cold starts feel as fast as warm ones.

---

## Roadmap

- **App icon.** Currently default Electron diamond. A `.icns` would replace it.
- **Settings UI (M7).** API key entry, refresh interval, lane weights, blocked authors — all currently constants in code.
- **Lanes (M4).** Three tabs: *Innovations* (academic), *Industry* (HN + lab blogs), *Idea* (startup-signal). Each with its own queries / weights.
- **HN + lab-blog RSS source (M5).** Industry / idea lanes need non-paper inputs to be meaningful.
- **Notarized signed build.** So `/Applications` install doesn't need the right-click → Open dance.
- **Linux / Windows ports.** Out of scope for v1; Electron makes it cheap if there's interest.

---

## License

MIT — see [LICENSE](LICENSE).

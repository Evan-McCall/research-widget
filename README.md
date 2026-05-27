# Research Widget

A frameless, always-on-top macOS desktop widget that surfaces fresh and
important research from **arXiv** and **Semantic Scholar** across agentic AI,
ML, and AI architecture — with extra lanes for *agentic AI in industry* and
*startup-idea fodder*.

Designed to feel like the Twitter/X desktop widget: small, translucent,
pinned to the desktop, auto-refreshing, with clickable links straight to the
paper or post.

> Status: scaffolding only. See [PLAN.md](./PLAN.md) for the full design and
> milestone breakdown.

## Stack (planned)

- **Electron** (frameless + transparent + `vibrancy` + `alwaysOnTop` window)
- **Vanilla TS + lit-html** in the renderer (no React; keeps the bundle small)
- **electron-store** for settings, **better-sqlite3** for the paper cache
- Data sources: arXiv Atom API, Semantic Scholar Graph API (+ optional HN for
  the industry lane)

## License

MIT — see [LICENSE](./LICENSE).

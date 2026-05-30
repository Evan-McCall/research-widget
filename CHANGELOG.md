# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html); this project
hasn't cut a 1.0 yet, so the pre-1.0 minor bumps may include behavior
changes.

## [Unreleased]

- `.env.example`, `CHANGELOG.md`, `.editorconfig`, `.nvmrc`
- ESLint (typescript-eslint) + Prettier with `npm run lint` / `format`
- GitHub Actions: CI (typecheck + lint + build) and Claude @mention review
- README rewritten with quick-start, architecture diagram, configuration
  table, and design notes

## [0.0.1] — 2026-05-29 — M8: packaging

- `electron-builder` config produces an unsigned `release/mac-arm64/Research Widget.app`
  via `npm run pack` (`npm run dist` for a `.dmg`).
- Tray menu: `Launch at login` checkbox (default on, persisted).
- `env.ts` now also loads `<userData>/.env` so packaged builds can pick up
  the Semantic Scholar key without a Settings UI.

## M6: auto-refresh scheduler

- Background refresh every 30 min, exponential backoff on failure capped
  at 4 h, paused on `powerMonitor.suspend`, immediate refresh on `resume`.
- arXiv source self-throttles at 1 req per 3.5 s.
- Settings ⚙ button removed (was a no-op stub).
- Footer trimmed to just `Updated h:mm`, pulled from `MAX(cached_at)` so
  it survives restart and isn't blanked by a single failed refresh.

## M3: Semantic Scholar + ranking

- Two S2 endpoints: batch metric lookup (citation enrichment of existing
  arXiv rows) and bulk topic search (high-citation papers regardless of
  age).
- Dedup via shared `external_id` PK between arXiv and S2 lookups.
- Balanced ranking (recency × impact, 18-month cutoff) and all-time mode
  (pure citation impact). ★ toggle in the header, persisted in
  `localStorage`.
- Citation counts shown in the meta row when present.

## M2: arXiv feed

- `better-sqlite3` cache at `<userData>/papers.sqlite` with a single
  `papers` table keyed by `external_id`.
- arXiv Atom source for cs.AI / cs.LG / cs.CL.
- Renderer: scrollable list, two-line title clamp, click-through via
  `shell.openExternal`, manual refresh button.

## M1: frameless window

- Electron 33 + electron-vite + TypeScript strict.
- Frameless, transparent, `fullscreen-ui` vibrancy, fixed 330×330, normal
  z-order (no `setAlwaysOnTop`).
- Persisted window position via `electron-store`.
- 🔬 tray icon with Show / Hide and Quit.

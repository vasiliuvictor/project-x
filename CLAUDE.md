# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run the app (node index.js)
node index.js      # Direct entry point
```

No build, lint, or test commands exist — this is a zero-dependency pure Node.js project.

## Architecture

**Project X** is a Node.js web scraper and news aggregator with a built-in HTTP server and scheduler. It has no external npm dependencies — only Node.js built-in modules (`http`, `https`, `fs`, `zlib`, `url`, `os`). Uses ES modules (`"type": "module"`).

### Layers

```
index.js                  → startup, wires all subsystems, graceful shutdown
src/scheduler.js          → periodic scraper runs (timeout-based, not setInterval)
src/scrapers/
  base-scraper.js         → HTTP client (rate-limit per domain, gzip, redirects, timeout)
  real-estate.js          → JSON API + HTML scraping
  jobs.js                 → multi-source job aggregator (Arbetsförmedlingen API + Indeed HTML)
  news-rss.js             → RSS/Atom feed parser with keyword filtering
src/parser/
  html-parser.js          → state-machine HTML tokenizer → DOM-like tree
  xml-parser.js           → minimal XML parser for feeds
  selectors.js            → CSS selector engine (tag, .class, #id, [attr], descendant/child)
src/server/
  router.js               → HTTP router + all API endpoints
  templates/              → server-side HTML rendering (dashboard, layout, styles)
src/storage.js            → JSON file persistence, deduplication, FIFO with item cap
src/logger.js             → console + file logging (data/app.log)
config.json               → all scraper sources, selectors, schedules, and settings
data/                     → runtime JSON files (gitignored)
```

### Data Flow

1. Startup: `index.js` loads `config.json`, initializes logger/storage/scheduler, starts HTTP server
2. Scrape trigger: `POST /api/scrape` or scheduler fires → all 3 scrapers run in parallel → results stored via `storage.append(type, items)`
3. Dashboard: `GET /` serves HTML; inline JS polls `/api/status` and fetches `/api/results/:type`

### API Endpoints

- `GET /` — dashboard SPA
- `GET /health` — keep-alive for deployment
- `GET /api/status` — scraper counts, running state
- `GET /api/results/:type` — items by type (`real-estate`, `jobs`, `news`, `run-log`)
- `POST /api/scrape` — trigger immediate scrape (responds 202, runs async)
- `GET /api/config` — sanitized config (no secrets)

### Key Conventions

- **Configuration-driven sources**: All scraper targets (URLs, selectors, field mappings) live in `config.json`. Add a new source without touching scraper code.
- **Dot-path field mapping**: JSON scraper config uses strings like `"pageProps.searchResult.result"` to navigate nested API responses.
- **Deduplication key**: `item.url` if present, otherwise `"${item.title}__${item.company}"`.
- **Batch fetching**: Jobs scraper uses `Promise.allSettled` with batches of 25 for parallel detail fetches.
- **Graceful degradation**: One scraper failure doesn't block the others; errors logged and stored in run-log.

### Deployment

Deployed on Render.io — see `render.yaml`. Start command is `node index.js`. Port from `config.json` (`server.port`), defaulting to `process.env.PORT`.
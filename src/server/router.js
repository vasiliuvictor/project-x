import { URL } from 'node:url';
import { dashboardPage } from './templates/dashboard.js';
import { read } from '../storage.js';
import { getStatus, runAll } from '../scheduler.js';

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function html(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

export function handleRequest(req, res, config) {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const path = parsed.pathname;
  const method = req.method;

  // CORS for API calls from same page
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Health check (keep-alive ping)
  if (method === 'GET' && path === '/health') {
    return json(res, { ok: true });
  }

  // Dashboard
  if (method === 'GET' && path === '/') {
    return html(res, dashboardPage());
  }

  // Status API
  if (method === 'GET' && path === '/api/status') {
    const status = getStatus();
    const counts = {
      news: read('news').length,
      realEstate: read('real-estate').length,
      jobs: read('jobs').length,
    };
    return json(res, { ...status, counts });
  }

  // Results API
  const resultsMatch = path.match(/^\/api\/results\/([\w-]+)$/);
  if (method === 'GET' && resultsMatch) {
    const type = resultsMatch[1];
    const allowed = ['real-estate', 'jobs', 'news', 'run-log'];
    if (!allowed.includes(type)) {
      return json(res, { error: 'Unknown type' }, 404);
    }
    return json(res, read(type));
  }

  // Trigger scrape
  if (method === 'POST' && path === '/api/scrape') {
    // Run async, respond immediately
    runAll(config);
    return json(res, { status: 'started' }, 202);
  }

  // Config API (read-only, sanitized)
  if (method === 'GET' && path === '/api/config') {
    return json(res, {
      schedule: config.schedule,
      scrapers: {
        realEstate: { enabled: config.scrapers.realEstate.enabled, sourceCount: config.scrapers.realEstate.sources.length },
        jobs: {
          enabled: config.scrapers.jobs.enabled,
          sourceCount: config.scrapers.jobs.sources.length,
          filters: [...new Set(config.scrapers.jobs.sources.flatMap(s => {
            if (!s.keywords) return s.technology ? [s.technology] : [];
            return s.keywords.map(kw =>
              typeof kw === 'object' ? (kw.description || kw.titleKey || '') : kw
            ).filter(Boolean);
          }))],
        },
        news: { enabled: config.scrapers.news.enabled, feedCount: config.scrapers.news.feeds.length, keywords: config.scrapers.news.keywords },
      },
    });
  }

  // 404
  json(res, { error: 'Not found' }, 404);
}

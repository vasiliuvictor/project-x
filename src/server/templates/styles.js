export const css = `
:root {
  --bg: #0f1117;
  --surface: #1a1d27;
  --surface2: #242836;
  --border: #2e3347;
  --text: #e4e6f0;
  --text-dim: #8b8fa3;
  --accent: #6c63ff;
  --accent-hover: #7b73ff;
  --green: #4ade80;
  --amber: #fbbf24;
  --red: #f87171;
  --blue: #60a5fa;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  min-height: 100vh;
}

.container { max-width: 1200px; margin: 0 auto; padding: 16px; }

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

header h1 { font-size: 1.4rem; font-weight: 600; }

.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 0.85rem;
}

.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 4px;
}

.status-dot.idle { background: var(--green); }
.status-dot.running { background: var(--amber); animation: pulse 1s infinite; }
.status-dot.error { background: var(--red); }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.btn {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.15s;
}

.btn-primary {
  background: var(--accent);
  color: white;
}

.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--border);
  margin-bottom: 20px;
  overflow-x: auto;
}

.tab {
  padding: 10px 20px;
  cursor: pointer;
  border: none;
  background: none;
  color: var(--text-dim);
  font-size: 0.95rem;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  white-space: nowrap;
  transition: all 0.15s;
}

.tab:hover { color: var(--text); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }

.tab-badge {
  background: var(--surface2);
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  margin-left: 6px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  transition: border-color 0.15s;
}

.card:hover { border-color: var(--accent); }

.card.viewed {
  opacity: 0.45;
  border-left: 3px solid var(--green);
  background: var(--bg);
}

.card.viewed:hover {
  opacity: 0.7;
  border-color: var(--green);
}

.card.viewed .card-title a {
  color: var(--text-dim);
}

.viewed-badge {
  margin-top: 8px;
  font-size: 0.7rem;
  color: var(--green);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-title a {
  color: var(--text);
  text-decoration: none;
}

.card-title a:hover { color: var(--accent); }

.card-meta {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.card-desc {
  font-size: 0.85rem;
  color: var(--text-dim);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-tags { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }

.tag {
  background: var(--surface2);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--blue);
}

.job-group {
  margin-bottom: 32px;
}

.job-group-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--accent);
}

.job-group-label {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.job-group-count {
  font-size: 0.8rem;
  color: var(--text-dim);
  background: var(--surface2);
  padding: 2px 10px;
  border-radius: 10px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-dim);
  transition: color 0.15s;
}

.filter-checkbox:hover { color: var(--text); }

.filter-checkbox input[type="checkbox"] {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-dim);
}

.empty h3 { margin-bottom: 8px; }

.run-log {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-entry {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 16px;
  font-size: 0.85rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.log-time { color: var(--text-dim); }
.log-stats { display: flex; gap: 12px; }
.log-stat { color: var(--green); }
.log-error { color: var(--red); }

.spinner {
  display: inline-block;
  width: 16px; height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .container { padding: 12px; }
  header h1 { font-size: 1.2rem; }
  .cards { grid-template-columns: 1fr; }
  .status-bar { font-size: 0.8rem; }
}
`;

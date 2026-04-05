import { layout } from './layout.js';

export function dashboardPage() {
  return layout(`
    <header>
      <h1>Project X</h1>
      <div class="status-bar">
        <span id="status"><span class="status-dot idle"></span> Idle</span>
        <span id="last-run" class="log-time"></span>
        <span id="next-run" class="log-time"></span>
        <button class="btn btn-primary" id="run-btn" onclick="triggerScrape()">Run Now</button>
      </div>
    </header>

    <div class="tabs">
      <button class="tab active" data-tab="news" onclick="switchTab('news')">
        News <span class="tab-badge" id="count-news">0</span>
      </button>
      <button class="tab" data-tab="real-estate" onclick="switchTab('real-estate')">
        Real Estate <span class="tab-badge" id="count-real-estate">0</span>
      </button>
      <button class="tab" data-tab="jobs" onclick="switchTab('jobs')">
        Jobs <span class="tab-badge" id="count-jobs">0</span>
      </button>
      <button class="tab" data-tab="log" onclick="switchTab('log')">
        Run Log
      </button>
    </div>

    <div id="content">
      <div class="empty"><h3>Loading...</h3></div>
    </div>

    <script>
      let currentTab = 'news';
      let statusInterval;
      let jobFilters = [];
      let activeJobFilters = new Set();
      let cachedJobs = [];
      let viewedJobs = new Set(JSON.parse(localStorage.getItem('viewedJobs') || '[]'));

      document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (!link) return;
        const card = link.closest('.job-card');
        if (!card) return;
        const url = card.dataset.url;
        if (!url) return;
        viewedJobs.add(url);
        localStorage.setItem('viewedJobs', JSON.stringify([...viewedJobs]));
        card.classList.add('viewed');
      });

      async function fetchJson(url) {
        const res = await fetch(url);
        return res.json();
      }

      function timeAgo(dateStr) {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        return Math.floor(hrs / 24) + 'd ago';
      }

      function escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      async function updateStatus() {
        try {
          const s = await fetchJson('/api/status');
          const dot = document.querySelector('.status-dot');
          const statusEl = document.getElementById('status');
          const lastEl = document.getElementById('last-run');
          const nextEl = document.getElementById('next-run');
          const btn = document.getElementById('run-btn');

          if (s.running) {
            dot.className = 'status-dot running';
            statusEl.innerHTML = '<span class="status-dot running"></span> Running...';
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span>Running';
          } else {
            dot.className = 'status-dot idle';
            statusEl.innerHTML = '<span class="status-dot idle"></span> Idle';
            btn.disabled = false;
            btn.textContent = 'Run Now';
          }

          lastEl.textContent = s.lastRun ? 'Last: ' + timeAgo(s.lastRun) : '';
          nextEl.textContent = s.nextRun ? 'Next: ' + timeAgo(s.nextRun) : '';

          if (s.counts) {
            document.getElementById('count-news').textContent = s.counts.news || 0;
            document.getElementById('count-real-estate').textContent = s.counts.realEstate || 0;
            document.getElementById('count-jobs').textContent = s.counts.jobs || 0;
          }
        } catch {}
      }

      async function triggerScrape() {
        const btn = document.getElementById('run-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>Starting...';
        try {
          await fetch('/api/scrape', { method: 'POST' });
          // Poll status until done
          const poll = setInterval(async () => {
            await updateStatus();
            const s = await fetchJson('/api/status');
            if (!s.running) {
              clearInterval(poll);
              loadTab(currentTab);
            }
          }, 2000);
        } catch (e) {
          btn.textContent = 'Error';
          setTimeout(() => { btn.disabled = false; btn.textContent = 'Run Now'; }, 3000);
        }
      }

      function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.tab').forEach(t => {
          t.classList.toggle('active', t.dataset.tab === tab);
        });
        loadTab(tab);
      }

      async function loadTab(tab) {
        const content = document.getElementById('content');

        if (tab === 'log') {
          const logs = await fetchJson('/api/results/run-log');
          if (!logs.length) {
            content.innerHTML = '<div class="empty"><h3>No runs yet</h3><p>Click "Run Now" to start your first scrape</p></div>';
            return;
          }
          content.innerHTML = '<div class="run-log">' + logs.map(l => {
            const stats = Object.entries(l.results || {}).map(([k, v]) =>
              '<span class="log-stat">+' + (v.added || 0) + ' ' + k + '</span>'
            ).join('');
            const errors = (l.errors || []).map(e =>
              '<span class="log-error">' + escHtml(e.scraper) + ': ' + escHtml(e.error) + '</span>'
            ).join('');
            return '<div class="log-entry"><span class="log-time">' + new Date(l.startedAt).toLocaleString()
              + ' (' + (l.durationMs || 0) + 'ms)</span><div class="log-stats">' + stats + errors + '</div></div>';
          }).join('') + '</div>';
          return;
        }

        const items = await fetchJson('/api/results/' + tab);
        if (!items.length) {
          const labels = { news: 'news articles', 'real-estate': 'real estate listings', jobs: 'job listings' };
          content.innerHTML = '<div class="empty"><h3>No ' + (labels[tab] || 'results') + ' yet</h3>'
            + '<p>Add sources to config.json and run a scrape</p></div>';
          return;
        }

        if (tab === 'news') {
          content.innerHTML = '<div class="cards">' + items.map(a =>
            '<div class="card">'
            + '<div class="card-title"><a href="' + escHtml(a.url) + '" target="_blank">' + escHtml(a.title) + '</a></div>'
            + '<div class="card-meta">' + escHtml(a.source) + (a.pubDate ? ' &middot; ' + escHtml(a.pubDate) : '') + '</div>'
            + '<div class="card-desc">' + escHtml(a.description) + '</div>'
            + (a.matchedKeywords && a.matchedKeywords.length ? '<div class="card-tags">' + a.matchedKeywords.map(k =>
              '<span class="tag">' + escHtml(k) + '</span>').join('') + '</div>' : '')
            + '</div>'
          ).join('') + '</div>';
        } else if (tab === 'real-estate') {
          content.innerHTML = '<div class="cards">' + items.map(l =>
            '<div class="card">'
            + '<div class="card-title"><a href="' + escHtml(l.url) + '" target="_blank">' + escHtml(l.title || 'Listing') + '</a></div>'
            + '<div class="card-meta">' + [l.price, l.address, l.bedrooms ? l.bedrooms + ' bed' : '', l.bathrooms ? l.bathrooms + ' bath' : '', l.sqft].filter(Boolean).map(escHtml).join(' &middot; ') + '</div>'
            + '<div class="card-meta">' + escHtml(l.source) + '</div>'
            + '</div>'
          ).join('') + '</div>';
        } else if (tab === 'jobs') {
          cachedJobs = items;
          await loadJobFilters();
          content.innerHTML = renderJobFilters() + '<div class="cards" id="job-cards"></div>';
          renderFilteredJobs();
        }
      }

      async function loadJobFilters() {
        try {
          const cfg = await fetchJson('/api/config');
          jobFilters = cfg.scrapers.jobs.filters || [];
          activeJobFilters = new Set(jobFilters);
        } catch {}
      }

      function renderJobFilters() {
        if (!jobFilters.length) return '';
        return '<div class="filter-bar">'
          + jobFilters.map(name => {
            const checked = activeJobFilters.has(name) ? 'checked' : '';
            const id = 'filter-' + name.replace(/[^a-zA-Z0-9]/g, '-');
            return '<label class="filter-checkbox" for="' + id + '">'
              + '<input type="checkbox" id="' + id + '" value="' + escHtml(name) + '" ' + checked + ' onchange="toggleJobFilter()">'
              + '<span>' + escHtml(name) + '</span></label>';
          }).join('')
          + '</div>';
      }

      function toggleJobFilter() {
        activeJobFilters = new Set(
          Array.from(document.querySelectorAll('.filter-bar input[type="checkbox"]:checked'))
            .map(cb => cb.value)
        );
        renderFilteredJobs();
      }

      function jobTech(j) {
        return j.technology || (j.source && j.source.split(' - ')[1]) || '';
      }

      function renderFilteredJobs() {
        const container = document.getElementById('job-cards');
        const grouped = {};
        for (const j of cachedJobs) {
          const tech = jobTech(j);
          if (!activeJobFilters.has(tech)) continue;
          if (!grouped[tech]) grouped[tech] = [];
          grouped[tech].push(j);
        }

        const techs = Object.keys(grouped);
        if (!techs.length) {
          container.innerHTML = '<div class="empty"><h3>No jobs match the selected filters</h3></div>';
          return;
        }

        container.innerHTML = techs.map(tech =>
          '<div class="job-group">'
          + '<div class="job-group-header">'
          + '<span class="job-group-label">' + escHtml(tech) + '</span>'
          + '<span class="job-group-count">' + grouped[tech].length + ' jobs</span>'
          + '</div>'
          + '<div class="cards">'
          + grouped[tech].map(j => {
            const viewed = viewedJobs.has(j.url);
            return '<div class="card job-card' + (viewed ? ' viewed' : '') + '" data-url="' + escHtml(j.url) + '">'
            + '<div class="card-title"><a href="' + escHtml(j.url) + '" target="_blank">' + escHtml(j.title || 'Job') + '</a></div>'
            + '<div class="card-meta">' + [j.company, j.location, j.salary].filter(Boolean).map(escHtml).join(' &middot; ') + '</div>'
            + (j.sourceLinkLabel ? '<div class="card-meta">Via: ' + escHtml(j.sourceLinkLabel) + '</div>' : '')
            + (j.description ? '<div class="card-desc">' + escHtml(j.description) + '</div>' : '')
            + (j.postedDate ? '<div class="card-meta">Posted: ' + escHtml(j.postedDate) + '</div>' : '')
            + (viewed ? '<div class="viewed-badge">Viewed</div>' : '')
            + '</div>';
          }).join('')
          + '</div>'
          + '</div>'
        ).join('');
      }

      // Init
      updateStatus();
      loadTab(currentTab);
      statusInterval = setInterval(updateStatus, 10000);
    </script>
  `);
}

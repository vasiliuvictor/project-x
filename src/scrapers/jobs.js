import { fetch } from './base-scraper.js';
import { parse, textContent, getAttr } from '../parser/html-parser.js';
import { query } from '../parser/selectors.js';
import { logger } from '../logger.js';

export async function scrapeJobs(config) {
  const { sources } = config.scrapers.jobs;
  const allJobs = [];

  for (const source of sources) {
    try {
      logger.info(`Scraping jobs: ${source.name} (${source.url})`);

      if (source.method === 'post' && source.searchBody && source.pagination) {
        const keywords = source.keywords || [null];
        for (const keyword of keywords) {
          const derived = {
            ...source,
            technology: keyword || source.technology || '',
            searchBody: {
              ...source.searchBody,
              ...(keyword ? { filters: [{ type: 'freetext', value: keyword }] } : {}),
            },
          };
          const jobs = await scrapeWithPagination(derived, config);
          logger.info(`${source.name}${keyword ? ` [${keyword}]` : ''}: found ${jobs.length} job listings`);
          allJobs.push(...jobs);
        }
        continue;
      }

      const response = await fetch(source.url, {
        userAgent: config.userAgent,
        timeoutMs: config.requestTimeoutMs,
        maxRedirects: config.maxRedirects,
        delayMs: config.requestDelayMs,
      });

      if (response.statusCode !== 200) {
        logger.warn(`${source.name} returned status ${response.statusCode}`);
        continue;
      }

      const jobs = source.type === 'json'
        ? extractJobsFromJson(response.body, source)
        : extractJobs(response.body, source);
      logger.info(`${source.name}: found ${jobs.length} job listings`);
      allJobs.push(...jobs);
    } catch (err) {
      logger.error(`Failed to scrape ${source.name}:`, err.message);
    }
  }

  return allJobs;
}

async function scrapeWithPagination(source, config) {
  const { pagination, searchBody } = source;
  const fetchOpts = {
    userAgent: config.userAgent,
    timeoutMs: config.requestTimeoutMs,
    maxRedirects: config.maxRedirects,
    delayMs: config.requestDelayMs,
    method: 'POST',
    contentType: 'application/json',
  };

  // Step 1: Initial request to get total count
  const countBody = JSON.stringify({
    ...searchBody,
    maxRecords: 1,
    startIndex: 0,
    toDate: new Date().toISOString(),
  });

  const countResponse = await fetch(source.url, { ...fetchOpts, body: countBody });
  if (countResponse.statusCode !== 200) {
    logger.warn(`${source.name} count request returned status ${countResponse.statusCode}`);
    return [];
  }

  let countData;
  try {
    countData = JSON.parse(countResponse.body);
  } catch (err) {
    logger.error(`Failed to parse count response from ${source.name}:`, err.message);
    return [];
  }

  const totalAds = countData[pagination.countField];
  if (typeof totalAds !== 'number' || totalAds <= 0) {
    logger.info(`${source.name}: no ads found (${pagination.countField}=${totalAds})`);
    return [];
  }

  const totalPages = Math.ceil(totalAds / pagination.pageSize);
  logger.info(`${source.name}: ${totalAds} total ads, fetching ${totalPages} page(s)`);

  // Step 2: Fetch all pages
  const allJobs = [];
  for (let page = 0; page < totalPages; page++) {
    const pageBody = JSON.stringify({
      ...searchBody,
      maxRecords: pagination.pageSize,
      startIndex: page * pagination.pageSize,
      toDate: new Date().toISOString(),
      source: pagination.dataSource,
    });

    try {
      const response = await fetch(source.url, { ...fetchOpts, body: pageBody });
      if (response.statusCode !== 200) {
        logger.warn(`${source.name} page ${page} returned status ${response.statusCode}`);
        continue;
      }

      let jobs;
      if (source.url.includes('platsbanken-api.arbetsformedlingen.se')) {
        let pageData;
        try { pageData = JSON.parse(response.body); } catch { pageData = {}; }
        const ads = pageData.ads || [];
        jobs = await fetchPlatsbankenJobDetails(ads, source, config);
      } else {
        jobs = extractJobsFromJson(response.body, source);
      }
      allJobs.push(...jobs);
      logger.debug(`${source.name}: page ${page} returned ${jobs.length} jobs`);
    } catch (err) {
      logger.error(`${source.name} page ${page} failed:`, err.message);
    }
  }

  return allJobs;
}

async function fetchPlatsbankenJobDetails(ads, source, config) {
  const BATCH_SIZE = 25;
  const fetchOpts = {
    userAgent: config.userAgent,
    timeoutMs: config.requestTimeoutMs,
    maxRedirects: config.maxRedirects,
    delayMs: 0,
  };

  async function fetchOne(id) {
    const response = await fetch(
      `https://platsbanken-api.arbetsformedlingen.se/jobs/v1/job/${id}`,
      fetchOpts,
    );
    if (response.statusCode !== 200) {
      logger.warn(`${source.name}: job detail ${id} returned status ${response.statusCode}`);
      return null;
    }
    const detail = JSON.parse(response.body);
    return {
      source: source.name,
      technology: source.technology || '',
      scrapedAt: new Date().toISOString(),
      title: detail.title || '',
      company: detail.workplace?.name || '',
      location: detail.workplace?.city || '',
      postedDate: detail.publishedDate || '',
      url: detail.application?.webAddress ||
        `https://arbetsformedlingen.se/platsbanken/annonser/${id}`,
    };
  }

  const validAds = ads.filter(ad => ad.id);
  const jobs = [];

  for (let i = 0; i < validAds.length; i += BATCH_SIZE) {
    const batch = validAds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(ad => fetchOne(ad.id)));
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        jobs.push(result.value);
      } else if (result.status === 'rejected') {
        logger.error(`${source.name}: job detail fetch failed:`, result.reason?.message);
      }
    }
    logger.debug(`${source.name}: fetched details batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validAds.length / BATCH_SIZE)}`);
  }

  return jobs;
}

function extractJobsFromJson(body, source) {
  const mappings = source.mappings;
  if (!mappings) {
    logger.warn(`No mappings configured for JSON source ${source.name}`);
    return [];
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch (err) {
    logger.error(`Failed to parse JSON from ${source.name}:`, err.message);
    return [];
  }

  // Navigate to the list using dot-path (e.g., "matchningslista.matchningdata")
  let items = data;
  if (mappings.list) {
    for (const key of mappings.list.split('.')) {
      items = items?.[key];
    }
  }

  if (!Array.isArray(items)) {
    logger.warn(`No job array found at path "${mappings.list}" for ${source.name}`);
    return [];
  }

  return items.map(item => {
    const job = {
      source: source.name,
      technology: source.technology || '',
      scrapedAt: new Date().toISOString(),
    };
    if (mappings.title) job.title = item[mappings.title] || '';
    if (mappings.company) job.company = item[mappings.company] || '';
    if (mappings.location) job.location = item[mappings.location] || '';
    if (mappings.salary) job.salary = item[mappings.salary] || '';
    if (mappings.description) job.description = (item[mappings.description] || '').substring(0, 500);
    if (mappings.postedDate) job.postedDate = item[mappings.postedDate] || '';
    // Extract sourceLinks (array with label + url)
    if (mappings.sourceLink) {
      const links = item[mappings.sourceLink];
      if (Array.isArray(links) && links.length > 0) {
        job.sourceLinkLabel = links[0].label || '';
        job.url = links[0].url || '';
      }
    }
    // Build URL from template + id, or use direct url mapping
    if (!job.url && source.urlTemplate && mappings.id) {
      const id = item[mappings.id] || '';
      job.url = source.urlTemplate.replace('{id}', id);
    } else if (!job.url && mappings.url) {
      job.url = item[mappings.url] || '';
    }
    return job;
  }).filter(j => j.title || j.company);
}

function extractJobs(html, source) {
  const tree = parse(html);
  const sel = source.selectors;

  if (!sel || !sel.container) {
    logger.warn(`No selectors configured for ${source.name}`);
    return [];
  }

  const containers = query(tree, sel.container);
  const jobs = [];

  for (const container of containers) {
    const job = {
      source: source.name,
      technology: source.technology || '',
      scrapedAt: new Date().toISOString(),
    };

    if (sel.title) {
      const node = queryFirst(container, sel.title);
      if (node) job.title = textContent(node);
    }

    if (sel.company) {
      const node = queryFirst(container, sel.company);
      if (node) job.company = textContent(node);
    }

    if (sel.location) {
      const node = queryFirst(container, sel.location);
      if (node) job.location = textContent(node);
    }

    if (sel.salary) {
      const node = queryFirst(container, sel.salary);
      if (node) job.salary = textContent(node);
    }

    if (sel.description) {
      const node = queryFirst(container, sel.description);
      if (node) job.description = textContent(node).substring(0, 500);
    }

    if (sel.postedDate) {
      const node = queryFirst(container, sel.postedDate);
      if (node) job.postedDate = textContent(node);
    }

    if (sel.link) {
      const node = queryFirst(container, sel.link);
      if (node) {
        const href = getAttr(node, 'href');
        job.url = href ? resolveUrl(href, source.url) : '';
      }
    }

    if (job.title || job.company) {
      if (!job.url) job.url = source.url;
      jobs.push(job);
    }
  }

  return jobs;
}

function queryFirst(root, selector) {
  const results = query(root, selector);
  return results.length > 0 ? results[0] : null;
}

function resolveUrl(href, baseUrl) {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

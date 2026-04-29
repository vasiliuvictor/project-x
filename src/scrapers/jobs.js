import { fetch } from './base-scraper.js';
import { parse, textContent, getAttr } from '../parser/html-parser.js';
import { query } from '../parser/selectors.js';
import { parseXml, findAll, getText } from '../parser/xml-parser.js';
import { logger } from '../logger.js';

export async function scrapeJobs(config) {
  const { sources } = config.scrapers.jobs;
  const allJobs = [];

  for (const source of sources) {
    try {
      logger.info(`Scraping jobs: ${source.name} (${source.url})`);
      let jobs;
      switch (source.impl) {
        case 'eures':
          jobs = await scrapeEuresSource(source, config);
          break;
        case 'arbets':
          jobs = await scrapeArbetsSource(source, config);
          break;
        default:
          jobs = await scrapeSimpleSource(source, config);
      }
      logger.info(`${source.name}: found ${jobs.length} total job listings`);
      allJobs.push(...jobs);
    } catch (err) {
      logger.error(`Failed to scrape ${source.name}:`, err.message);
    }
  }

  const seen = new Set();
  const deduped = allJobs.filter(job => {
    if (!job.url || seen.has(job.url)) return false;
    seen.add(job.url);
    return true;
  });
  if (deduped.length < allJobs.length) {
    logger.info(`Deduplication removed ${allJobs.length - deduped.length} duplicate job(s)`);
  }
  return deduped;
}

async function scrapeEuresSource(source, config) {
  const keywords = source.keywords || [null];
  const allJobs = [];
  for (const keyword of keywords) {
    const keywordOverride = keyword ? { keywords: buildEuresKeywords(keyword) } : {};
    const technologyLabel = keyword && typeof keyword === 'object'
      ? (keyword.description || keyword.titleKey || '')
      : (keyword || '');
    const derived = {
      ...source,
      technology: technologyLabel || source.technology || '',
      searchBody: { ...source.searchBody, ...keywordOverride },
    };
    const jobs = await scrapeEures(derived, config);
    logger.info(`${source.name}${technologyLabel ? ` [${technologyLabel}]` : ''}: found ${jobs.length} job listings`);
    allJobs.push(...jobs);
  }
  return allJobs;
}

async function scrapeArbetsSource(source, config) {
  const keywords = source.keywords || [null];
  const allJobs = [];
  for (const keyword of keywords) {
    const keywordOverride = keyword ? { filters: [{ type: 'freetext', value: keyword }] } : {};
    const derived = {
      ...source,
      technology: keyword || source.technology || '',
      searchBody: { ...source.searchBody, ...keywordOverride },
    };
    const jobs = await scrapeArbets(derived, config);
    logger.info(`${source.name}${keyword ? ` [${keyword}]` : ''}: found ${jobs.length} job listings`);
    allJobs.push(...jobs);
  }
  return allJobs;
}

async function scrapeSimpleSource(source, config) {
  const response = await fetch(source.url, {
    userAgent: config.userAgent,
    timeoutMs: config.requestTimeoutMs,
    maxRedirects: config.maxRedirects,
    delayMs: config.requestDelayMs,
  });
  if (response.statusCode !== 200) {
    logger.warn(`${source.name} returned status ${response.statusCode}`);
    return [];
  }
  return source.type === 'json'
    ? extractJobsFromJson(response.body, source)
    : source.type === 'rss'
      ? extractJobsFromRss(response.body, source)
      : extractJobs(response.body, source);
}

function buildEuresKeywords(kw) {
  const result = [];
  if (kw.description) result.push({ keyword: kw.description, specificSearchCode: 'EVERYWHERE' });
  if (kw.titleKey) result.push({ keyword: kw.titleKey, specificSearchCode: 'TITLE' });
  return result;
}

async function scrapeArbets(source, config) {
  const { pagination, searchBody } = source;
  const fetchOpts = {
    userAgent: config.userAgent,
    timeoutMs: config.requestTimeoutMs,
    maxRedirects: config.maxRedirects,
    delayMs: config.requestDelayMs,
    method: 'POST',
    contentType: 'application/json',
  };

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

      let pageData;
      try { pageData = JSON.parse(response.body); } catch { pageData = {}; }
      const ads = pageData.ads || [];
      const jobs = await fetchPlatsbankenJobDetails(ads, source, config);
      allJobs.push(...jobs);
      logger.debug(`${source.name}: page ${page} returned ${jobs.length} jobs`);
    } catch (err) {
      logger.error(`${source.name} page ${page} failed:`, err.message);
    }
  }

  return allJobs;
}

async function scrapeEures(source, config) {
  const { pagination, searchBody } = source;
  const fetchOpts = {
    userAgent: config.userAgent,
    timeoutMs: config.requestTimeoutMs,
    maxRedirects: config.maxRedirects,
    delayMs: config.requestDelayMs,
    method: 'POST',
    contentType: 'application/json',
  };

  function buildBody(page) {
    return JSON.stringify({
      resultsPerPage: pagination.pageSize,
      page,
      sortSearch: 'BEST_MATCH',
      keywords: searchBody.keywords || [],
      locationCodes: searchBody.locationCodes || [],
    });
  }

  const firstResponse = await fetch(source.url, { ...fetchOpts, body: buildBody(1) });
  if (firstResponse.statusCode !== 200) {
    logger.warn(`${source.name} returned status ${firstResponse.statusCode}`);
    return [];
  }

  let firstData;
  try {
    firstData = JSON.parse(firstResponse.body);
  } catch (err) {
    logger.error(`Failed to parse response from ${source.name}:`, err.message);
    return [];
  }

  const totalRecords = firstData[pagination.countField];
  if (typeof totalRecords !== 'number' || totalRecords <= 0) {
    logger.info(`${source.name}: no records found (${pagination.countField}=${totalRecords})`);
    return [];
  }

  const totalPages = Math.ceil(totalRecords / pagination.pageSize);
  logger.info(`${source.name}: ${totalRecords} total records, fetching ${totalPages} page(s)`);

  const allIds = (firstData.jvs || []).filter(j => j.id).map(j => j.id);
  logger.debug(`${source.name}: page 1 collected ${allIds.length} ids`);

  for (let page = 2; page <= totalPages; page++) {
    try {
      const response = await fetch(source.url, { ...fetchOpts, body: buildBody(page) });
      if (response.statusCode !== 200) {
        logger.warn(`${source.name} page ${page} returned status ${response.statusCode}`);
        continue;
      }
      let pageData;
      try { pageData = JSON.parse(response.body); } catch { pageData = {}; }
      const ids = (pageData.jvs || []).filter(j => j.id).map(j => j.id);
      allIds.push(...ids);
      logger.debug(`${source.name}: page ${page} collected ${ids.length} ids`);
    } catch (err) {
      logger.error(`${source.name} page ${page} failed:`, err.message);
    }
  }

  logger.info(`${source.name}: fetching details for ${allIds.length} jobs`);
  return fetchEuresJobDetails(allIds, source, config);
}

const ARBETS_RE = /arbetsformedlingen\.se\/platsbanken\/annonser\/(\d+)/;

async function fetchEuresJobDetails(ids, source, config) {
  const BATCH_SIZE = 25;
  const detailFetchOpts = {
    userAgent: config.userAgent,
    timeoutMs: config.requestTimeoutMs,
    maxRedirects: config.maxRedirects,
    delayMs: 0,
  };

  async function fetchOne(id) {
    const response = await fetch(
      `https://europa.eu/eures/api/jv-searchengine/public/jv/id/${id}?requestLang=en&preferredLang=en`,
      detailFetchOpts,
    );
    if (response.statusCode !== 200) {
      logger.warn(`${source.name}: detail ${id} returned status ${response.statusCode}`);
      return null;
    }

    let detail;
    try { detail = JSON.parse(response.body); } catch { return null; }

    const lang = detail.preferredLanguage || 'en';
    const profile = detail.jvProfiles?.[lang] || detail.jvProfiles?.en || {};
    const location = profile.locations?.[0];

    for (const instr of (profile.applicationInstructions || [])) {
      const match = ARBETS_RE.exec(instr);
      if (match) {
        return fetchPlatsbankenDetail(match[1], source, detailFetchOpts);
      }
    }

    return {
      source: source.name,
      technology: source.technology || '',
      scrapedAt: new Date().toISOString(),
      title: profile.title || '',
      company: profile.employer?.name || '',
      location: location?.cityName || '',
      url: `https://eures.europa.eu/en/job-vacancies/jv-details/${id}`,
    };
  }

  const jobs = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(fetchOne));
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        jobs.push(result.value);
      } else if (result.status === 'rejected') {
        logger.error(`${source.name}: detail fetch failed:`, result.reason?.message);
      }
    }
    logger.debug(`${source.name} - ${source.technology}: fetched details batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(ids.length / BATCH_SIZE)}`);
  }

  return jobs;
}

async function fetchPlatsbankenDetail(id, source, fetchOpts) {
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

async function fetchPlatsbankenJobDetails(ads, source, config) {
  const BATCH_SIZE = 25;
  const fetchOpts = {
    userAgent: config.userAgent,
    timeoutMs: config.requestTimeoutMs,
    maxRedirects: config.maxRedirects,
    delayMs: 0,
  };

  const validAds = ads.filter(ad => ad.id);
  const jobs = [];

  for (let i = 0; i < validAds.length; i += BATCH_SIZE) {
    const batch = validAds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(ad => fetchPlatsbankenDetail(ad.id, source, fetchOpts)));
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

function getNestedValue(obj, path) {
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
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
    if (mappings.title) job.title = String(getNestedValue(item, mappings.title) ?? '');
    if (mappings.company) job.company = String(getNestedValue(item, mappings.company) ?? '');
    if (mappings.location) job.location = String(getNestedValue(item, mappings.location) ?? '');
    if (mappings.salary) job.salary = String(getNestedValue(item, mappings.salary) ?? '');
    if (mappings.description) {
      const raw = getNestedValue(item, mappings.description);
      job.description = String(raw ?? '').substring(0, 500);
    }
    if (mappings.postedDate) {
      const raw = getNestedValue(item, mappings.postedDate);
      job.postedDate = typeof raw === 'number' ? new Date(raw).toISOString() : String(raw ?? '');
    }
    // Extract sourceLinks (array with label + url)
    if (mappings.sourceLink) {
      const links = getNestedValue(item, mappings.sourceLink);
      if (Array.isArray(links) && links.length > 0) {
        job.sourceLinkLabel = links[0].label || '';
        job.url = links[0].url || '';
      }
    }
    // Build URL from template + id, or use direct url mapping
    if (!job.url && source.urlTemplate && mappings.id) {
      const id = getNestedValue(item, mappings.id) || '';
      job.url = source.urlTemplate.replace('{id}', id);
    } else if (!job.url && mappings.url) {
      job.url = String(getNestedValue(item, mappings.url) ?? '');
    }
    return job;
  }).filter(j => j.title || j.company);
}

function extractJobsFromRss(xml, source) {
  let nodes;
  try {
    nodes = parseXml(xml);
  } catch (err) {
    logger.error(`Failed to parse RSS from ${source.name}:`, err.message);
    return [];
  }

  const items = findAll(nodes, 'item');
  return items.map(item => {
    const title   = getText(item, 'title');
    const url     = getText(item, 'link');
    const company = getText(item, source.rssFields?.company || 'source') ||
                    getText(item, 'author') || '';
    const location = getText(item, source.rssFields?.location || 'location') || '';
    const description = getText(item, 'description')
      .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      .substring(0, 500);
    const postedDate = getText(item, 'pubDate');

    return {
      source: source.name,
      technology: source.technology || '',
      scrapedAt: new Date().toISOString(),
      title,
      company,
      location,
      description,
      postedDate,
      url,
    };
  }).filter(j => j.title && j.url);
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

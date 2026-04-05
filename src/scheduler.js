import { scrapeRealEstate } from './scrapers/real-estate.js';
import { scrapeJobs } from './scrapers/jobs.js';
import { scrapeNews } from './scrapers/news-rss.js';
import { append, addRunLog } from './storage.js';
import { logger } from './logger.js';

let running = false;
let lastRun = null;
let nextRun = null;
let timer = null;

export function getStatus() {
  return {
    running,
    lastRun,
    nextRun: nextRun ? nextRun.toISOString() : null,
  };
}

export async function runAll(config) {
  if (running) {
    logger.warn('Scrape already in progress, skipping');
    return { status: 'already-running' };
  }

  running = true;
  const startTime = Date.now();
  const runEntry = { startedAt: new Date().toISOString(), results: {}, errors: [] };

  logger.info('=== Starting scrape run ===');

  try {
    // Real estate
    if (config.scrapers.realEstate.enabled && config.scrapers.realEstate.sources.length > 0) {
      try {
        const listings = await scrapeRealEstate(config);
        const result = append('real-estate', listings);
        runEntry.results.realEstate = result;
        logger.info(`Real estate: +${result.added} new (${result.total} total)`);
      } catch (err) {
        logger.error('Real estate scraper failed:', err.message);
        runEntry.errors.push({ scraper: 'realEstate', error: err.message });
      }
    }

    // Jobs
    if (config.scrapers.jobs.enabled && config.scrapers.jobs.sources.length > 0) {
      try {
        const jobs = await scrapeJobs(config);
        const result = append('jobs', jobs);
        runEntry.results.jobs = result;
        logger.info(`Jobs: +${result.added} new (${result.total} total)`);
      } catch (err) {
        logger.error('Jobs scraper failed:', err.message);
        runEntry.errors.push({ scraper: 'jobs', error: err.message });
      }
    }

    // News
    if (config.scrapers.news.enabled && config.scrapers.news.feeds.length > 0) {
      try {
        const articles = await scrapeNews(config);
        const result = append('news', articles);
        runEntry.results.news = result;
        logger.info(`News: +${result.added} new (${result.total} total)`);
      } catch (err) {
        logger.error('News scraper failed:', err.message);
        runEntry.errors.push({ scraper: 'news', error: err.message });
      }
    }
  } finally {
    running = false;
    lastRun = new Date();
    runEntry.completedAt = lastRun.toISOString();
    runEntry.durationMs = Date.now() - startTime;
    addRunLog(runEntry);
    logger.info(`=== Scrape run completed in ${runEntry.durationMs}ms ===`);
  }

  return runEntry;
}

export function startScheduler(config) {
  if (!config.schedule.enabled) {
    logger.info('Scheduler is disabled');
    return;
  }

  const intervalMs = config.schedule.intervalMinutes * 60 * 1000;
  logger.info(`Scheduler started: running every ${config.schedule.intervalMinutes} minutes`);

  function scheduleNext() {
    nextRun = new Date(Date.now() + intervalMs);
    timer = setTimeout(async () => {
      await runAll(config);
      scheduleNext();
    }, intervalMs);
  }

  scheduleNext();
}

export function stopScheduler() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    nextRun = null;
    logger.info('Scheduler stopped');
  }
}

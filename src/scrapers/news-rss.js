import { fetch } from './base-scraper.js';
import { parseXml, findAll, getText, getAttr } from '../parser/xml-parser.js';
import { logger } from '../logger.js';

export async function scrapeNews(config) {
  const { feeds, keywords } = config.scrapers.news;
  const allArticles = [];

  for (const feed of feeds) {
    try {
      logger.info(`Fetching RSS feed: ${feed.name} (${feed.url})`);
      const response = await fetch(feed.url, {
        userAgent: config.userAgent,
        timeoutMs: config.requestTimeoutMs,
        maxRedirects: config.maxRedirects,
        delayMs: config.requestDelayMs,
      });

      if (response.statusCode !== 200) {
        logger.warn(`Feed ${feed.name} returned status ${response.statusCode}`);
        continue;
      }

      const articles = parseFeed(response.body, feed.name, keywords);
      logger.info(`${feed.name}: found ${articles.length} matching articles`);
      allArticles.push(...articles);
    } catch (err) {
      logger.error(`Failed to fetch feed ${feed.name}:`, err.message);
    }
  }

  return allArticles;
}

function parseFeed(xml, sourceName, keywords) {
  const nodes = parseXml(xml);
  const articles = [];

  // Try RSS format first (<item> elements)
  let items = findAll(nodes, 'item');

  if (items.length > 0) {
    for (const item of items) {
      const title = getText(item, 'title');
      const link = getText(item, 'link');
      const description = stripHtml(getText(item, 'description'));
      const pubDate = getText(item, 'pubDate');

      const matched = matchKeywords(title, description, keywords);
      if (matched.length > 0 || keywords.length === 0) {
        articles.push({
          title,
          url: link,
          description: description.substring(0, 500),
          pubDate,
          source: sourceName,
          matchedKeywords: matched,
          scrapedAt: new Date().toISOString(),
        });
      }
    }
    return articles;
  }

  // Try Atom format (<entry> elements)
  items = findAll(nodes, 'entry');
  for (const item of items) {
    const title = getText(item, 'title');
    const link = getAttr(item, 'link', 'href') || getText(item, 'link');
    const description = stripHtml(getText(item, 'summary') || getText(item, 'content'));
    const pubDate = getText(item, 'published') || getText(item, 'updated');

    const matched = matchKeywords(title, description, keywords);
    if (matched.length > 0 || keywords.length === 0) {
      articles.push({
        title,
        url: link,
        description: description.substring(0, 500),
        pubDate,
        source: sourceName,
        matchedKeywords: matched,
        scrapedAt: new Date().toISOString(),
      });
    }
  }

  return articles;
}

function matchKeywords(title, description, keywords) {
  if (!keywords || keywords.length === 0) return [];
  const text = `${title} ${description}`.toLowerCase();
  return keywords.filter(kw => text.includes(kw.toLowerCase()));
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

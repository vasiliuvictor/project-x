import { fetch } from './base-scraper.js';
import { parse, textContent, getAttr } from '../parser/html-parser.js';
import { query } from '../parser/selectors.js';
import { logger } from '../logger.js';

export async function scrapeRealEstate(config) {
  const { sources } = config.scrapers.realEstate;
  const allListings = [];

  for (const source of sources) {
    try {
      logger.info(`Scraping real estate: ${source.name} (${source.url})`);
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

      const listings = source.type === 'json'
        ? extractListingsFromJson(response.body, source)
        : extractListings(response.body, source);
      logger.info(`${source.name}: found ${listings.length} listings`);
      allListings.push(...listings);
    } catch (err) {
      logger.error(`Failed to scrape ${source.name}:`, err.message);
    }
  }

  return allListings;
}

function getNestedValue(obj, path) {
  if (!path) return undefined;
  const keys = path.split('.');
  let val = obj;
  for (const key of keys) {
    val = val?.[key];
  }
  return val;
}

function extractListingsFromJson(body, source) {
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

  // Navigate to the list using dot-path
  let items = data;
  if (mappings.list) {
    items = getNestedValue(data, mappings.list);
  }

  if (!Array.isArray(items)) {
    logger.warn(`No listings array found at path "${mappings.list}" for ${source.name}`);
    return [];
  }

  return items.map(item => {
    const listing = {
      source: source.name,
      scrapedAt: new Date().toISOString(),
    };
    if (mappings.title) listing.title = String(getNestedValue(item, mappings.title) || '');
    if (mappings.price) listing.price = String(getNestedValue(item, mappings.price) || '');
    if (mappings.address) listing.address = String(getNestedValue(item, mappings.address) || '');
    if (mappings.bedrooms) listing.bedrooms = String(getNestedValue(item, mappings.bedrooms) || '');
    if (mappings.bathrooms) listing.bathrooms = String(getNestedValue(item, mappings.bathrooms) || '');
    if (mappings.sqft) listing.sqft = String(getNestedValue(item, mappings.sqft) || '');
    if (mappings.image) listing.imageUrl = String(getNestedValue(item, mappings.image) || '');

    // Build URL from template + id, or use direct url mapping
    if (source.urlTemplate && mappings.id) {
      const id = getNestedValue(item, mappings.id) || '';
      listing.url = source.urlTemplate.replace('{id}', id);
    } else if (mappings.url) {
      listing.url = String(getNestedValue(item, mappings.url) || '');
    }

    return listing;
  }).filter(l => l.title || l.price);
}

function extractListings(html, source) {
  const tree = parse(html);
  const sel = source.selectors;

  if (!sel || !sel.container) {
    logger.warn(`No selectors configured for ${source.name}`);
    return [];
  }

  const containers = query(tree, sel.container);
  const listings = [];

  for (const container of containers) {
    const listing = {
      source: source.name,
      scrapedAt: new Date().toISOString(),
    };

    // Extract each configured field
    if (sel.title) {
      const node = queryFirst(container, sel.title);
      if (node) listing.title = textContent(node);
    }

    if (sel.price) {
      const node = queryFirst(container, sel.price);
      if (node) listing.price = textContent(node);
    }

    if (sel.address) {
      const node = queryFirst(container, sel.address);
      if (node) listing.address = textContent(node);
    }

    if (sel.bedrooms) {
      const node = queryFirst(container, sel.bedrooms);
      if (node) listing.bedrooms = textContent(node);
    }

    if (sel.bathrooms) {
      const node = queryFirst(container, sel.bathrooms);
      if (node) listing.bathrooms = textContent(node);
    }

    if (sel.sqft) {
      const node = queryFirst(container, sel.sqft);
      if (node) listing.sqft = textContent(node);
    }

    if (sel.link) {
      const node = queryFirst(container, sel.link);
      if (node) {
        const href = getAttr(node, 'href');
        listing.url = href ? resolveUrl(href, source.url) : '';
      }
    }

    if (sel.image) {
      const node = queryFirst(container, sel.image);
      if (node) {
        listing.imageUrl = getAttr(node, 'src') || getAttr(node, 'data-src');
      }
    }

    // Only include if we got at least a title or price
    if (listing.title || listing.price) {
      if (!listing.url) listing.url = source.url;
      listings.push(listing);
    }
  }

  return listings;
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

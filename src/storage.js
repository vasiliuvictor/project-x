import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger.js';

let dataDir = './data';
let maxItems = 500;

export function initStorage(config) {
  dataDir = config.storage.dataDir;
  maxItems = config.storage.maxItemsPerType;
  mkdirSync(dataDir, { recursive: true });
}

function filePath(type) {
  return join(dataDir, `${type}.json`);
}

export function read(type) {
  const fp = filePath(type);
  if (!existsSync(fp)) return [];
  try {
    const parsed = JSON.parse(readFileSync(fp, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.error(`Failed to read ${fp}:`, err.message);
    return [];
  }
}

export function write(type, data) {
  const fp = filePath(type);
  try {
    writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`Failed to write ${fp}:`, err.message);
  }
}

function itemKey(item) {
  return item.url || `${item.title}__${item.company}`;
}

export function append(type, newItems) {
  const existing = read(type);
  const existingKeys = new Set(existing.map(itemKey));
  const unique = newItems.filter(item => {
    const key = itemKey(item);
    return key && !existingKeys.has(key);
  });
  const combined = [...unique, ...existing].slice(0, maxItems);
  write(type, combined);
  return { added: unique.length, total: combined.length };
}

export function getRunLog() {
  return read('run-log');
}

export function addRunLog(entry) {
  const log = getRunLog();
  log.unshift(entry);
  write('run-log', log.slice(0, 100));
}

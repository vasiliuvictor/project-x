import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
let logFile = null;

export function initLogger(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  logFile = join(dataDir, 'app.log');
}

function log(level, ...args) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');

  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`${prefix} ${msg}`);

  if (logFile) {
    try { appendFileSync(logFile, `${prefix} ${msg}\n`); } catch {}
  }
}

export const logger = {
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
  debug: (...args) => log('debug', ...args),
};

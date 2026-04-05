import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import zlib from 'node:zlib';
import { logger } from '../logger.js';

const domainTimestamps = new Map();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitWait(hostname, delayMs) {
  const last = domainTimestamps.get(hostname) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < delayMs) {
    await delay(delayMs - elapsed);
  }
  domainTimestamps.set(hostname, Date.now());
}

export async function fetch(url, options = {}) {
  const {
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    timeoutMs = 15000,
    maxRedirects = 5,
    delayMs = 2000,
    redirectCount = 0,
    method = 'GET',
    body = null,
    contentType = null,
  } = options;

  const parsed = new URL(url);
  const client = parsed.protocol === 'https:' ? https : http;

  await rateLimitWait(parsed.hostname, delayMs);

  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    if (body && contentType) {
      headers['Content-Type'] = contentType;
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const reqOptions = {
      method: method.toUpperCase(),
      headers,
    };

    const req = client.request(url, reqOptions, (res) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (redirectCount >= maxRedirects) {
          reject(new Error(`Too many redirects (${maxRedirects})`));
          return;
        }
        const redirectUrl = new URL(res.headers.location, url).href;
        logger.debug(`Redirect ${res.statusCode}: ${url} → ${redirectUrl}`);
        resolve(fetch(redirectUrl, { ...options, redirectCount: redirectCount + 1 }));
        return;
      }

      // Handle gzip
      let stream = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }

      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          url,
        });
      });
      stream.on('error', reject);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeoutMs}ms: ${url}`));
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

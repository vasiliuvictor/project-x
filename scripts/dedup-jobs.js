import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const path = join(dirname(fileURLToPath(import.meta.url)), '../data/jobs.json');

const jobs = JSON.parse(readFileSync(path, 'utf8'));
const seen = new Set();
const deduped = jobs.filter(job => {
  if (!job.url || seen.has(job.url)) return false;
  seen.add(job.url);
  return true;
});

writeFileSync(path, JSON.stringify(deduped, null, 2));
console.log(`Removed ${jobs.length - deduped.length} duplicates. ${deduped.length} jobs remaining.`);
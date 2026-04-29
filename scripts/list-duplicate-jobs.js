import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const filePath = join(dirname(fileURLToPath(import.meta.url)), '../data/jobs (1).json');
const jobs = JSON.parse(readFileSync(filePath, 'utf8'));

const urlMap = new Map();
for (const job of jobs) {
  if (!job.url) continue;
  if (!urlMap.has(job.url)) urlMap.set(job.url, []);
  urlMap.get(job.url).push(job);
}

const duplicates = [...urlMap.entries()].filter(([, group]) => group.length > 1);

if (duplicates.length === 0) {
  console.log('No duplicates found.');
} else {
  console.log(`Found ${duplicates.length} URLs with duplicates:\n`);
  for (const [url, group] of duplicates) {
    console.log(`  [${group.length}x] ${url}`);
    for (const job of group) {
      console.log(`       source: ${job.source}  title: ${job.title}`);
    }
  }
}
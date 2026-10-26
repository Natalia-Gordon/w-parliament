#!/usr/bin/env node
/**
 * Downloads every media file referenced by the WordPress export into
 * public/wp-content/uploads, preserving the original paths.
 * Run once after `npm run content:import`; existing files are skipped.
 *
 *   MEDIA_SOURCE   Origin to download from (default: the site URL found in the export)
 *   CONCURRENCY    Parallel downloads (default: 6)
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = join(ROOT, 'scripts', '.generated', 'media-manifest.json');
if (!existsSync(manifestFile)) {
  console.error('Media manifest not found. Run "npm run content:import" first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const source = (process.env.MEDIA_SOURCE || manifest.source).replace(/\/+$/, '');
const concurrency = Number(process.env.CONCURRENCY) || 6;
const pending = manifest.files.filter((file) => !existsSync(join(ROOT, 'public', file)));

console.log(`${manifest.files.length} media files, ${pending.length} to download from ${source}`);

const failed = [];
let done = 0;

async function download(file) {
  const target = join(ROOT, 'public', file);
  const url = `${source}/${encodeURI(file)}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (response.status === 404) throw Object.assign(new Error('404 Not Found'), { fatal: true });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(`${target}.part`, Buffer.from(await response.arrayBuffer()));
      renameSync(`${target}.part`, target);
      return;
    } catch (error) {
      if (error.fatal || attempt === 3) {
        failed.push(`${file} (${error.message})`);
        return;
      }
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

const queue = [...pending];
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      await download(queue.shift());
      if (++done % 25 === 0) console.log(`  ${done}/${pending.length}`);
    }
  }),
);

console.log(`Downloaded ${pending.length - failed.length}/${pending.length}`);
if (failed.length) {
  console.log(`Failed (${failed.length}):`);
  for (const f of failed) console.log(`  - ${f}`);
  process.exitCode = 1;
}

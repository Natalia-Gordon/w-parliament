import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ContentReader } from './content-reader';

const contentRoot = [join(process.cwd(), 'public', 'content'), join(import.meta.dirname ?? '', '..', 'browser', 'content')].find(
  (dir) => existsSync(join(dir, 'site.json')),
);

const cache = new Map<string, Promise<unknown>>();

/** Server/prerender implementation: reads the generated JSON straight from disk. */
export const readContentFromDisk: ContentReader = <T>(path: string) => {
  if (!contentRoot) {
    return Promise.reject(new Error('Generated content not found. Run "npm run content:import" first.'));
  }
  let pending = cache.get(path);
  if (!pending) {
    pending = readFile(join(contentRoot, path), 'utf8').then((text) => JSON.parse(text));
    cache.set(path, pending);
  }
  return pending as Promise<T>;
};

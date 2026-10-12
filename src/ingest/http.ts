// Polite fetching for the ingest: one request at a time, a pause between requests, retries, and a disk cache
// so re-running the ingest the same day does not hit the sources again.
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const USER_AGENT = 'lectures-bot/0.1 (student course reviews; https://github.com/oguneg/lectures)';
const CACHE_DIR = path.resolve('.cache/http');
const CACHE_TTL_MS = 20 * 60 * 60 * 1000;
const PAUSE_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function cached(url: string): Promise<string | null> {
  const file = path.join(CACHE_DIR, createHash('sha1').update(url).digest('hex'));
  try {
    if (Date.now() - (await stat(file)).mtimeMs < CACHE_TTL_MS) return await readFile(file, 'utf8');
  } catch {
    // Not cached yet.
  }
  return null;
}

async function store(url: string, body: string) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, createHash('sha1').update(url).digest('hex')), body);
}

/** The body of `url`, or null for a 404/403 or a non-matching content type. Throws after three failed tries. */
async function fetchText(url: string, accept: RegExp): Promise<string | null> {
  const hit = await cached(url);
  if (hit !== null) return hit || null;
  for (let attempt = 1; ; attempt++) {
    await sleep(PAUSE_MS);
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
      if (res.status === 404 || res.status === 403 || !accept.test(res.headers.get('content-type') ?? '')) {
        await store(url, '');
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      await store(url, body);
      return body;
    } catch (error) {
      if (attempt >= 3) throw new Error(`GET ${url} failed: ${(error as Error).message}`);
      await sleep(1000 * attempt);
    }
  }
}

export const fetchHtml = (url: string) => fetchText(url, /text\/html/);

export async function fetchJson(url: string): Promise<unknown> {
  const body = await fetchText(url, /json/);
  if (body === null) throw new Error(`GET ${url}: not found`);
  return JSON.parse(body);
}

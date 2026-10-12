import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth';
import { connectPglite, type Database } from '../db/client';
import { course, lecturer, teaching } from '../db/schema';
import { loadEnv } from '../env';
import { saveUniversity } from '../ingest/store';
import { UNIVERSITIES } from '../ingest/universities';
import { createApp } from './app';
import { recentSemesters } from './queries';

const ORIGIN = 'http://localhost:8787';
let database: Database;
let app: ReturnType<typeof createApp>;
let lecturerId: number;

beforeAll(async () => {
  database = await connectPglite();
  await database.migrate();
  const { db } = database;
  await saveUniversity(db, UNIVERSITIES[0]!);
  const [c] = await db
    .insert(course)
    .values({ universityId: 'uu', code: '1DL210', titleSv: 'Algoritmer och datastrukturer I', titleEn: 'Algorithms and Data Structures I', credits: 5, level: 'grund' })
    .returning();
  const [l] = await db.insert(lecturer).values({ universityId: 'uu', name: 'Pontus Ekberg', nameKey: 'pontus ekberg' }).returning();
  lecturerId = l!.id;
  await db.insert(teaching).values({ courseId: c!.id, lecturerId, semester: 'HT2026', role: 'teacher', sourceUrl: 'https://example.test' });
  const env = loadEnv({ APP_ENV: 'test', PUBLIC_URL: ORIGIN });
  app = createApp({ db, auth: createAuth(env, db), now: () => new Date('2026-10-13') });
});

afterAll(() => database.close());

const post = (path: string, fields: Record<string, string>, cookie = '') =>
  app.request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, cookie },
    body: new URLSearchParams(fields).toString(),
  });

describe('pages', () => {
  it('redirects / to the preferred language', async () => {
    const res = await app.request('/', { headers: { 'accept-language': 'en-GB,en;q=0.9' } });
    expect(res.headers.get('location')).toBe('/en');
  });

  it('finds courses by name and jumps straight to an exact code', async () => {
    const search = await app.request('/en/search?q=algorithms');
    expect(await search.text()).toContain('1DL210');
    const exact = await app.request('/sv/search?q=1dl210');
    expect(exact.headers.get('location')).toBe('/sv/uu/1DL210');
  });

  it('shows the course with its lecturer in both languages', async () => {
    const sv = await (await app.request('/sv/uu/1DL210')).text();
    expect(sv).toContain('Algoritmer och datastrukturer I');
    expect(sv).toContain('Pontus Ekberg');
    expect(sv).toContain('Hösten 2026');
    const en = await (await app.request('/en/uu/1DL210')).text();
    expect(en).toContain('Algorithms and Data Structures I');
  });

  it('404s for unknown courses', async () => {
    expect((await app.request('/en/uu/9XX999')).status).toBe(404);
  });
});

describe('reviews', () => {
  it('lets a new account review a course and rate its lecturer', async () => {
    const signUp = await post('/en/sign-up', { name: 'Test Student', email: 'student@example.com', password: 'correct-horse-battery', next: '/en/uu/1DL210' });
    expect(signUp.status).toBe(303);
    expect(signUp.headers.get('location')).toBe('/en/uu/1DL210');
    const cookie = signUp.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

    const saved = await post(
      '/en/uu/1DL210/reviews',
      {
        semester: 'HT2026',
        overall: '4',
        difficulty: '3',
        workload: '5',
        body: 'Hard but fair. Do the weekly exercises.',
        [`lecturer_${lecturerId}`]: '5',
        [`lecturer_${lecturerId}_comment`]: 'Clear lectures',
      },
      cookie,
    );
    expect(saved.headers.get('location')).toBe('/en/uu/1DL210?saved=1');

    const page = await (await app.request('/en/uu/1DL210', { headers: { cookie } })).text();
    expect(page).toContain('Hard but fair.');
    expect(page).toContain('Anonymous student');
    expect(page).toContain('Clear lectures');
    expect(page).toContain('based on 1 review');

    const lecturerPage = await (await app.request(`/en/uu/l/${lecturerId}`)).text();
    expect(lecturerPage).toContain('Clear lectures');
  });

  it('rejects reviews without ratings or from signed-out visitors', async () => {
    const anonymous = await post('/en/uu/1DL210/reviews', { semester: 'HT2026', overall: '4', difficulty: '3', workload: '5' });
    expect(anonymous.headers.get('location')).toMatch(/^\/en\/sign-in/);

    const signIn = await post('/en/sign-in', { email: 'student@example.com', password: 'correct-horse-battery', next: '/en' });
    const cookie = signIn.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const invalid = await post('/en/uu/1DL210/reviews', { semester: 'HT2026', overall: '9', difficulty: '3', workload: '5' }, cookie);
    expect(invalid.headers.get('location')).toContain('invalid=1');
  });

  it('refuses cross-site form posts', async () => {
    const res = await app.request('/en/uu/1DL210/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.test' },
      body: 'semester=HT2026',
    });
    expect(res.status).toBe(403);
  });
});

describe('recentSemesters', () => {
  it('lists the current semester and earlier ones', () => {
    expect(recentSemesters(new Date('2026-10-13'), 4)).toEqual(['HT2026', 'VT2026', 'HT2025', 'VT2025']);
    expect(recentSemesters(new Date('2027-02-01'), 3)).toEqual(['VT2027', 'HT2026', 'VT2026']);
  });
});

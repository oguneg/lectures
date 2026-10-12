import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import type { Child } from 'hono/jsx';
import { csrf } from 'hono/csrf';
import type { Auth } from '../auth';
import type { Db } from '../db/client';
import { isLang, preferredLang, strings, type Lang } from './i18n';
import { getCourse, getLecturer, PAGE_SIZE, parseReviewForm, recentReviews, recentSemesters, saveReview, searchCourses, stats } from './queries';
import { AuthPage, CoursePage, courseTitle, HomePage, Layout, LecturerPage, NotFoundPage, SearchPage, type Viewer } from './views';

const COURSE_CODE = '[0-9][A-Za-z]{2}[0-9]{3}';
const STATIC_DIR = path.resolve('public');

/** Only same-site paths, so `next` cannot send people elsewhere after signing in. */
function safeNext(next: unknown, lang: Lang): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : `/${lang}`;
}

/** Copies the session cookies Better Auth set on `from` onto a redirect. */
function redirectWithCookies(c: Context, from: Response, location: string) {
  const res = c.redirect(location, 303);
  for (const cookie of from.headers.getSetCookie()) res.headers.append('set-cookie', cookie);
  return res;
}

export function createApp({ db, auth, now = () => new Date() }: { db: Db; auth: Auth; now?: () => Date }) {
  const app = new Hono();

  app.use(csrf());
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  app.get('/static/:file{[a-z0-9.-]+}', async (c) => {
    const file = c.req.param('file');
    try {
      const body = await readFile(path.join(STATIC_DIR, file));
      const type = file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/octet-stream';
      return c.body(body, 200, { 'content-type': type, 'cache-control': 'public, max-age=300' });
    } catch {
      return c.notFound();
    }
  });

  app.get('/', (c) => c.redirect(`/${preferredLang(c.req.header('accept-language'))}`));

  const viewerOf = async (c: Context): Promise<(Viewer & { id: string }) | null> => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return session ? { id: session.user.id, name: session.user.name } : null;
  };

  const page = (c: Context, lang: Lang, viewer: Viewer | null, title: string, body: Child, status: 200 | 404 = 200, description?: string) => {
    // The path without the language prefix, for the language switch and sign-in return links.
    const url = new URL(c.req.url);
    const rest = url.pathname.replace(/^\/(sv|en)/, '') + url.search;
    return c.html(
      <Layout lang={lang} title={title} path={rest} viewer={viewer} description={description}>
        {body}
      </Layout>,
      status,
    );
  };

  const lang = new Hono<{ Variables: { lang: Lang } }>();
  lang.use(async (c, next) => {
    const value = c.req.param('lang' as never) as string | undefined;
    if (!isLang(value)) return c.notFound();
    c.set('lang', value);
    await next();
  });

  lang.get('/', async (c) => {
    const l = c.get('lang');
    const [viewer, counts, recent] = await Promise.all([viewerOf(c), stats(db), recentReviews(db)]);
    return page(c, l, viewer, `lectures.se – ${strings[l].tagline}`, <HomePage lang={l} counts={counts} recent={recent} />);
  });

  lang.get('/search', async (c) => {
    const l = c.get('lang');
    const q = c.req.query('q') ?? '';
    const level = c.req.query('level') || undefined;
    const p = Math.max(0, Number(c.req.query('page')) || 0);
    const [viewer, result] = await Promise.all([viewerOf(c), searchCourses(db, { q, level, page: p })]);
    // A search for an exact course code goes straight to the course.
    const exact = result.rows.find((r) => r.code === q.trim().toUpperCase());
    if (exact && p === 0 && result.total === 1) return c.redirect(`/${l}/${exact.universityId}/${exact.code}`);
    return page(c, l, viewer, `${q || strings[l].search} – lectures.se`, <SearchPage lang={l} q={q} level={level} page={p} pageSize={PAGE_SIZE} result={result} />);
  });

  lang.get(`/:uni/:code{${COURSE_CODE}}`, async (c) => {
    const l = c.get('lang');
    const { uni, code } = c.req.param();
    if (code !== code.toUpperCase()) return c.redirect(`/${l}/${uni}/${code.toUpperCase()}`, 301);
    const viewer = await viewerOf(c);
    const data = await getCourse(db, uni, code, viewer?.id);
    if (!data) return page(c, l, viewer, strings[l].notFound, <NotFoundPage t={strings[l]} />, 404);
    const t = strings[l];
    const flash = c.req.query('saved') ? t.reviewSaved : c.req.query('invalid') ? t.reviewInvalid : undefined;
    const title = `${code} ${courseTitle(l, data.course)} – ${l === 'en' ? data.university.nameEn : data.university.nameSv} – lectures.se`;
    return page(
      c,
      l,
      viewer,
      title,
      <CoursePage lang={l} data={data} viewer={viewer} semesters={recentSemesters(now())} flash={flash} path={`/${uni}/${code}`} />,
      200,
      `${t.reviews}: ${code} ${courseTitle(l, data.course)}`,
    );
  });

  lang.post(`/:uni/:code{${COURSE_CODE}}/reviews`, async (c) => {
    const l = c.get('lang');
    const { uni, code } = c.req.param();
    const back = `/${l}/${uni}/${code}`;
    const viewer = await viewerOf(c);
    if (!viewer) return c.redirect(`/${l}/sign-in?next=${encodeURIComponent(back)}`, 303);
    const data = await getCourse(db, uni, code);
    if (!data) return c.notFound();
    const parsed = parseReviewForm(await c.req.parseBody());
    if (!parsed.success || !recentSemesters(now()).includes(parsed.data.semester)) return c.redirect(`${back}?invalid=1#review`, 303);
    await saveReview(db, viewer.id, data.course.id, parsed.data);
    return c.redirect(`${back}?saved=1`, 303);
  });

  lang.get('/:uni/l/:id{[0-9]+}', async (c) => {
    const l = c.get('lang');
    const { uni, id } = c.req.param();
    const [viewer, data] = await Promise.all([viewerOf(c), getLecturer(db, uni, Number(id))]);
    if (!data) return page(c, l, viewer, strings[l].notFound, <NotFoundPage t={strings[l]} />, 404);
    return page(c, l, viewer, `${data.lecturer.name} – lectures.se`, <LecturerPage lang={l} universityId={uni} data={data} />);
  });

  for (const mode of ['sign-in', 'sign-up'] as const) {
    lang.get(`/${mode}`, async (c) => {
      const l = c.get('lang');
      const viewer = await viewerOf(c);
      const next = safeNext(c.req.query('next'), l);
      if (viewer) return c.redirect(next);
      return page(c, l, null, `${mode === 'sign-up' ? strings[l].signUp : strings[l].signIn} – lectures.se`, <AuthPage lang={l} mode={mode} next={next} />);
    });

    lang.post(`/${mode}`, async (c) => {
      const l = c.get('lang');
      const form = await c.req.parseBody();
      const next = safeNext(form.next, l);
      const email = String(form.email ?? '').trim();
      const password = String(form.password ?? '');
      const headers = c.req.raw.headers;
      try {
        const res =
          mode === 'sign-up'
            ? await auth.api.signUpEmail({ body: { email, password, name: String(form.name ?? '').trim() || email.split('@')[0]! }, headers, asResponse: true })
            : await auth.api.signInEmail({ body: { email, password }, headers, asResponse: true });
        if (res.ok) return redirectWithCookies(c, res, next);
      } catch {
        // Wrong password, taken email, too-short password: the form says so below.
      }
      const t = strings[l];
      return page(c, l, null, t.signIn, <AuthPage lang={l} mode={mode} next={next} email={email} error={mode === 'sign-up' ? t.signUpFailed : t.authFailed} />);
    });
  }

  lang.post('/sign-out', async (c) => {
    const l = c.get('lang');
    const res = await auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
    return redirectWithCookies(c, res, `/${l}`);
  });

  app.route('/:lang', lang);

  app.notFound((c) => {
    const l = preferredLang(c.req.header('accept-language'));
    return page(c, l, null, strings[l].notFound, <NotFoundPage t={strings[l]} />, 404);
  });

  return app;
}

import type { FC, PropsWithChildren } from 'hono/jsx';
import { strings, type Lang, type Strings } from './i18n';
import type { getCourse, getLecturer, recentReviews, searchCourses } from './queries';

type CourseDetail = NonNullable<Awaited<ReturnType<typeof getCourse>>>;
type LecturerDetail = NonNullable<Awaited<ReturnType<typeof getLecturer>>>;
type Titled = { code: string; titleSv: string | null; titleEn: string | null };

export interface Viewer {
  name: string;
}

export function courseTitle(lang: Lang, c: Titled): string {
  return (lang === 'en' ? (c.titleEn ?? c.titleSv) : (c.titleSv ?? c.titleEn)) ?? c.code;
}

const fmt = (n: number | null) => (n === null ? '–' : n.toFixed(1));
const date = (lang: Lang, d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const Stars: FC<{ value: number | null; label?: string }> = ({ value, label }) => (
  <span class="stars" title={label} aria-label={label ?? (value === null ? '' : `${value.toFixed(1)} / 5`)}>
    <span class="stars-fill" style={`width:${value === null ? 0 : (value / 5) * 100}%`}>★★★★★</span>
    <span class="stars-empty">★★★★★</span>
  </span>
);

export const Layout: FC<PropsWithChildren<{ lang: Lang; title: string; path: string; viewer: Viewer | null; description?: string }>> = ({
  lang,
  title,
  path,
  viewer,
  description,
  children,
}) => {
  const t = strings[lang];
  const other: Lang = lang === 'sv' ? 'en' : 'sv';
  return (
    <html lang={lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        <link rel="alternate" hreflang={other} href={`/${other}${path}`} />
        <link rel="stylesheet" href="/static/style.css" />
      </head>
      <body>
        <header class="site-header">
          <a class="brand" href={`/${lang}`}>
            lectures<span>.se</span>
          </a>
          <form class="header-search" action={`/${lang}/search`} method="get" role="search">
            <input type="search" name="q" placeholder={t.search} aria-label={t.search} />
          </form>
          <nav class="header-nav">
            <a href={`/${other}${path}`} hreflang={other}>
              {t.otherLang}
            </a>
            {viewer ? (
              <form action={`/${lang}/sign-out`} method="post">
                <button class="link" type="submit">
                  {t.signOut}
                </button>
              </form>
            ) : (
              <a href={`/${lang}/sign-in?next=${encodeURIComponent(`/${lang}${path}`)}`}>{t.signIn}</a>
            )}
          </nav>
        </header>
        <main>{children}</main>
        <footer class="site-footer">{t.dataNote}</footer>
      </body>
    </html>
  );
};

export const HomePage: FC<{ lang: Lang; counts: { courses: number; reviews: number; lecturers: number }; recent: Awaited<ReturnType<typeof recentReviews>> }> = ({
  lang,
  counts,
  recent,
}) => {
  const t = strings[lang];
  return (
    <>
      <section class="hero">
        <h1>{t.tagline}</h1>
        <form action={`/${lang}/search`} method="get" role="search" class="big-search">
          <input type="search" name="q" placeholder={t.searchPlaceholder} aria-label={t.search} autofocus />
          <button type="submit">{t.search}</button>
        </form>
        <p class="counts">
          {counts.courses.toLocaleString(lang)} {t.courses} · {counts.lecturers.toLocaleString(lang)} {t.lecturers} ·{' '}
          {counts.reviews.toLocaleString(lang)} {t.reviews}
        </p>
      </section>
      <section>
        <h2>{t.recentReviews}</h2>
        {recent.length === 0 ? (
          <p class="muted">{t.noReviewsYet}</p>
        ) : (
          <ul class="card-list">
            {recent.map((r) => (
              <li class="card">
                <a href={`/${lang}/${r.universityId}/${r.code}`}>
                  <span class="code">{r.code}</span> {courseTitle(lang, r)}
                </a>
                <div class="meta">
                  <Stars value={r.overall} /> {t.semesterName(r.semester)}
                </div>
                {r.body && <p class="excerpt">{r.body.length > 220 ? `${r.body.slice(0, 220)}…` : r.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
};

export const SearchPage: FC<{
  lang: Lang;
  q: string;
  level: string | undefined;
  page: number;
  pageSize: number;
  result: Awaited<ReturnType<typeof searchCourses>>;
}> = ({ lang, q, level, page, pageSize, result }) => {
  const t = strings[lang];
  const link = (p: number) => `/${lang}/search?${new URLSearchParams({ q, ...(level ? { level } : {}), page: String(p) })}`;
  return (
    <>
      <form action={`/${lang}/search`} method="get" role="search" class="big-search">
        <input type="search" name="q" value={q} placeholder={t.searchPlaceholder} aria-label={t.search} />
        <select name="level" aria-label={t.allLevels}>
          <option value="">{t.allLevels}</option>
          {Object.entries(t.level).map(([value, label]) => (
            <option value={value} selected={value === level}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit">{t.search}</button>
      </form>
      <p class="muted">{t.results(result.total)}</p>
      {result.rows.length === 0 ? (
        <p>{t.noResults}</p>
      ) : (
        <ul class="result-list">
          {result.rows.map((c) => (
            <li>
              <a href={`/${lang}/${c.universityId}/${c.code}`}>
                <span class="code">{c.code}</span>
                <span class="title">{courseTitle(lang, c)}</span>
              </a>
              <span class="meta">
                {c.credits !== null && `${c.credits} ${t.credits}`}
                {c.level && ` · ${t.level[c.level] ?? c.level}`}
                {c.reviewCount > 0 && (
                  <>
                    {' · '}
                    <Stars value={c.avgOverall} /> ({c.reviewCount})
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <nav class="pager">
        {page > 0 && <a href={link(page - 1)}>← {t.previous}</a>}
        {(page + 1) * pageSize < result.total && <a href={link(page + 1)}>{t.next} →</a>}
      </nav>
    </>
  );
};

const RatingInput: FC<{ name: string; label: string; hint?: string; value?: number | undefined; required?: boolean }> = ({
  name,
  label,
  hint,
  value,
  required = true,
}) => (
  <fieldset class="rating-input">
    <legend>
      {label} {hint && <small>{hint}</small>}
    </legend>
    {[1, 2, 3, 4, 5].map((n) => (
      <label>
        <input type="radio" name={name} value={String(n)} checked={value === n} required={required} />
        <span>{n}</span>
      </label>
    ))}
  </fieldset>
);

function groupTeachings(teachings: CourseDetail['teachings']) {
  const bySemester = new Map<string, CourseDetail['teachings']>();
  for (const x of teachings) bySemester.set(x.semester, [...(bySemester.get(x.semester) ?? []), x]);
  return [...bySemester.entries()];
}

export const CoursePage: FC<{
  lang: Lang;
  data: CourseDetail;
  viewer: Viewer | null;
  semesters: string[];
  flash?: string | undefined;
  path: string;
}> = ({ lang, data, viewer, semesters, flash, path }) => {
  const t = strings[lang];
  const { course: c, aggregate, occasions, teachings, reviews } = data;
  const description = lang === 'en' ? (c.descriptionEn ?? c.descriptionSv) : (c.descriptionSv ?? c.descriptionEn);
  const eligibility = lang === 'en' ? (c.eligibilityEn ?? c.eligibilitySv) : (c.eligibilitySv ?? c.eligibilityEn);
  const officialUrl = lang === 'en' ? (c.urlEn ?? c.urlSv) : (c.urlSv ?? c.urlEn);
  const mine = reviews.find((r) => r.mine);
  const lecturers = [...new Map(teachings.map((x) => [x.lecturerId, x.name])).entries()];
  const mineRating = (id: number) => mine?.lecturerRatings.find((r) => r.lecturerId === id);

  return (
    <article class="course">
      <p class="crumbs">
        {lang === 'en' ? data.university.nameEn : data.university.nameSv} · <span class="code">{c.code}</span>
        {c.credits !== null && ` · ${c.credits} ${t.credits}`}
        {c.level && ` · ${t.level[c.level] ?? c.level}`}
      </p>
      <h1>{courseTitle(lang, c)}</h1>
      {flash && <p class="flash">{flash}</p>}

      <section class="summary">
        <div class="big-rating">
          <span class="number">{fmt(aggregate.overall)}</span>
          <Stars value={aggregate.overall} />
          <small>{t.basedOn(aggregate.count)}</small>
        </div>
        <dl class="bars">
          <Bar label={t.difficulty} hint={t.scaleHint.difficulty} value={aggregate.difficulty} />
          <Bar label={t.workload} hint={t.scaleHint.workload} value={aggregate.workload} />
        </dl>
      </section>

      <div class="columns">
        <div>
          <section>
            <h2>{t.reviews}</h2>
            {reviews.length === 0 && <p class="muted">{t.noReviewsYet}</p>}
            <ul class="reviews">
              {reviews.map((r) => (
                <li class="card">
                  <div class="meta">
                    <Stars value={r.overall} /> <strong>{r.author ?? t.anonymous}</strong> · {t.semesterName(r.semester)} ·{' '}
                    {date(lang, r.createdAt)}
                  </div>
                  <div class="meta small">
                    {t.difficulty} {r.difficulty}/5 · {t.workload} {r.workload}/5
                  </div>
                  {r.body && <p class="body">{r.body}</p>}
                  {r.lecturerRatings.map((l) => (
                    <p class="lecturer-rating">
                      <a href={`/${lang}/${c.universityId}/l/${l.lecturerId}`}>{l.name}</a> <Stars value={l.rating} />
                      {l.comment && <span> — {l.comment}</span>}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </section>

          <section id="review">
            <h2>{mine ? t.editReview : t.writeReview}</h2>
            {viewer ? (
              <form method="post" action={`/${lang}/${c.universityId}/${c.code}/reviews`} class="review-form">
                <label>
                  {t.semester}
                  <select name="semester" required>
                    {semesters.map((s) => (
                      <option value={s} selected={mine?.semester === s}>
                        {t.semesterName(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <RatingInput name="overall" label={t.overall} hint={t.scaleHint.overall} value={mine?.overall} />
                <RatingInput name="difficulty" label={t.difficulty} hint={t.scaleHint.difficulty} value={mine?.difficulty} />
                <RatingInput name="workload" label={t.workload} hint={t.scaleHint.workload} value={mine?.workload} />
                <label>
                  {t.yourReview}
                  <textarea name="body" rows={6} maxlength={5000} placeholder={t.reviewBodyPlaceholder}>
                    {mine?.body ?? ''}
                  </textarea>
                </label>
                {lecturers.length > 0 && (
                  <fieldset class="lecturer-inputs">
                    <legend>{t.rateLecturers}</legend>
                    {lecturers.map(([id, name]) => (
                      <div class="lecturer-input">
                        <RatingInput name={`lecturer_${id}`} label={name} value={mineRating(id)?.rating} required={false} />
                        <input
                          type="text"
                          name={`lecturer_${id}_comment`}
                          maxlength={1000}
                          placeholder={t.lecturerComment}
                          value={mineRating(id)?.comment ?? ''}
                        />
                      </div>
                    ))}
                  </fieldset>
                )}
                <label class="check">
                  <input type="checkbox" name="showName" checked={mine?.showName ?? false} /> {t.showName} ({viewer.name})
                </label>
                <button type="submit">{t.submit}</button>
              </form>
            ) : (
              <p>
                <a class="button" href={`/${lang}/sign-in?next=${encodeURIComponent(`/${lang}${path}#review`)}`}>
                  {t.signInToReview}
                </a>
              </p>
            )}
          </section>
        </div>

        <aside>
          <section>
            <h2>{t.taughtBy}</h2>
            {teachings.length === 0 ? (
              <p class="muted">{t.noLecturers}</p>
            ) : (
              groupTeachings(teachings).map(([semester, list]) => (
                <div class="teaching">
                  <h3>{t.semesterName(semester)}</h3>
                  <ul>
                    {list.map((x) => (
                      <li>
                        <a href={`/${lang}/${c.universityId}/l/${x.lecturerId}`}>{x.name}</a>{' '}
                        <small class="muted">
                          {t.role[x.role] ?? x.role} · <a href={x.sourceUrl}>{t.source}</a>
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          {occasions.length > 0 && (
            <section>
              <h2>{t.occasions}</h2>
              <ul class="occasions">
                {occasions.map((o) => (
                  <li>
                    <strong>{t.semesterName(o.semester)}</strong>
                    {o.cancelled && <span class="tag">{t.cancelled}</span>}
                    <br />
                    <small>
                      {[
                        o.distance ? t.distance : (o.location ?? t.campus),
                        o.pacePercent !== null ? `${o.pacePercent}% ${t.pace}` : null,
                        o.languages.map((l) => t.languages[l] ?? l).join(', ') || null,
                        o.onlyInProgramme ? t.onlyInProgramme : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      <br />
                      {date(lang, o.startDate)} – {date(lang, o.endDate)}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {description && (
            <section>
              <h2>{t.aboutCourse}</h2>
              <p class="prose">{description}</p>
            </section>
          )}
          {eligibility && (
            <section>
              <h2>{t.eligibility}</h2>
              <p class="prose">{eligibility}</p>
            </section>
          )}
          {officialUrl && (
            <p>
              <a href={officialUrl}>{t.officialPage} ↗</a>
            </p>
          )}
        </aside>
      </div>
    </article>
  );
};

const Bar: FC<{ label: string; hint: string; value: number | null }> = ({ label, hint, value }) => (
  <>
    <dt>
      {label} <small>{hint}</small>
    </dt>
    <dd>
      <span class="bar">
        <span style={`width:${value === null ? 0 : (value / 5) * 100}%`} />
      </span>
      {fmt(value)}
    </dd>
  </>
);

export const LecturerPage: FC<{ lang: Lang; universityId: string; data: LecturerDetail }> = ({ lang, universityId, data }) => {
  const t = strings[lang];
  return (
    <article>
      <h1>{data.lecturer.name}</h1>
      <section class="summary">
        <div class="big-rating">
          <span class="number">{fmt(data.aggregate.rating)}</span>
          <Stars value={data.aggregate.rating} />
          <small>
            {t.lecturerRating} · {t.basedOn(data.aggregate.count)}
          </small>
        </div>
      </section>
      <div class="columns">
        <section>
          <h2>{t.reviews}</h2>
          {data.comments.length === 0 && <p class="muted">{t.noReviewsYet}</p>}
          <ul class="reviews">
            {data.comments.map((r) => (
              <li class="card">
                <div class="meta">
                  <Stars value={r.rating} /> <a href={`/${lang}/${universityId}/${r.code}`}>{r.code}</a> · {t.semesterName(r.semester)}
                </div>
                {r.comment && <p class="body">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </section>
        <aside>
          <h2>{t.lecturerCourses}</h2>
          <ul class="plain">
            {data.courses.map((c) => (
              <li>
                <a href={`/${lang}/${universityId}/${c.code}`}>
                  <span class="code">{c.code}</span> {courseTitle(lang, c)}
                </a>
                <br />
                <small class="muted">
                  {t.semesterName(c.semester)} · {t.role[c.role] ?? c.role}
                </small>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </article>
  );
};

export const AuthPage: FC<{ lang: Lang; mode: 'sign-in' | 'sign-up'; next: string; error?: string | undefined; email?: string }> = ({
  lang,
  mode,
  next,
  error,
  email,
}) => {
  const t = strings[lang];
  const signUp = mode === 'sign-up';
  const other = `/${lang}/${signUp ? 'sign-in' : 'sign-up'}?next=${encodeURIComponent(next)}`;
  return (
    <section class="auth">
      <h1>{signUp ? t.signUp : t.signIn}</h1>
      {error && <p class="flash error">{error}</p>}
      <form method="post" action={`/${lang}/${mode}`}>
        <input type="hidden" name="next" value={next} />
        {signUp && (
          <label>
            {t.name}
            <input name="name" required maxlength={80} autocomplete="name" />
          </label>
        )}
        <label>
          {t.email}
          <input type="email" name="email" required autocomplete="email" value={email ?? ''} />
        </label>
        <label>
          {t.password}
          <input type="password" name="password" required minlength={8} autocomplete={signUp ? 'new-password' : 'current-password'} />
        </label>
        <button type="submit">{signUp ? t.signUp : t.signIn}</button>
      </form>
      <p>
        {signUp ? t.haveAccount : t.noAccount} <a href={other}>{signUp ? t.signIn : t.signUp}</a>
      </p>
    </section>
  );
};

export const NotFoundPage: FC<{ t: Strings }> = ({ t }) => <p class="not-found">{t.notFound}</p>;


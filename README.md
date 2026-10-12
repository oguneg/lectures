# lectures

Glassdoor for academia: students rate and review courses and lecturers at Swedish universities.
Starting with Uppsala University. Swedish and English.

## Run it

```bash
npm install
npm run ingest   # pulls UU courses and lecturers into a local database (a few minutes the first time)
npm run dev      # http://localhost:8787
```

No database to install: locally the app uses PGlite (Postgres compiled to WASM) in `.data/pglite`.
Set `DATABASE_URL` to use a real Postgres instead.

`npm test` runs the tests, `npm run typecheck` the type checker.
After changing `src/db/schema.ts`, run `npm run db:generate` and commit the new migration in `drizzle/`.

## Where the data comes from

**Courses and course occasions: Skolverket's Susa-navet API** (`api.skolverket.se/susa-navet/emil3`).
It is the national database behind antagning.se and studera.nu: every Swedish university, open (CC0), JSON, updated
daily. One integration covers all universities, so no per-university course scraper is needed. Each course has its
code, Swedish and English titles and descriptions, credits, level, entry requirements and a link to the university's
own course page (`uu.se/utbildning/kurs?query=1DL210`). Occasions carry semester, dates, pace, place, language and
application code. It only lists current and upcoming occasions; courses seen once stay in the database so they can
still be reviewed later.

**Lecturers: department web pages.** No official source lists who teaches which course: not uu.se's course pages,
not the syllabi, not Susa-navet. Inside UU the course→teacher link lives in Studium (Canvas) and TimeEdit, both behind
login. Some departments publish a semester course list with a teacher column; `src/ingest/teachers.ts` crawls every
department's student pages (Swedish and English) and keeps tables that pair course codes with names, taking the
semester from the page or table heading.

As of October 2026 only the Department of Information Technology publishes such lists, so lecturer coverage is
partial. See "Open questions".

## Layout

```
src/
  ingest/      npm run ingest: Susa-navet catalogue + department crawl → database
    susa.ts       API records → course and occasion rows
    teachers.ts   course-list tables → (course code, semester, lecturer, role)
    http.ts       polite fetching (one at a time, pauses, retries, 20 h disk cache in .cache/)
    store.ts      upserts
  web/         Hono app, server-rendered JSX
    app.tsx       routes: /sv|en, /search, /:uni/:code, /:uni/l/:lecturerId, sign-in/up
    queries.ts    reads and writes
    views.tsx     pages
    i18n.ts       Swedish and English strings
  db/          Drizzle schema and connection (Postgres, or PGlite locally)
  auth.ts      Better Auth, email and password
public/style.css
```

## Open questions

- **Lecturer coverage.** Department pages give teachers for about 90 IT courses per semester. To cover the rest:
  let reviewers name the lecturer when the source has none (moderated, merged with scraped names), or ask
  universities/departments for the data.
- **Legal.** Rating named lecturers is processing personal data under GDPR. Swedish review sites usually rely on a
  *utgivningsbevis* (publishing certificate) to come under the freedom-of-expression laws. Decide before launch, together
  with moderation and takedown handling.
- **Accounts.** Any email can sign up and there is no verification yet, so reviews are easy to fake.

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { course, lecturer, occasion, teaching, university } from '../db/schema';
import type { CourseRow, OccasionRow } from './susa';
import { nameKey, type Teaching } from './teachers';
import type { UniversitySource } from './universities';

const CHUNK = 500;
function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** `excluded.<column>` for every column, so an upsert overwrites with the new values. */
function excluded(columns: string[]) {
  return Object.fromEntries(columns.map((c) => [c, sql.raw(`excluded.${c}`)]));
}

export async function saveUniversity(db: Db, uni: UniversitySource) {
  const values = { id: uni.id, providerId: uni.providerId, nameSv: uni.nameSv, nameEn: uni.nameEn, url: uni.url };
  await db.insert(university).values(values).onConflictDoUpdate({ target: university.id, set: values });
}

/** Upserts courses and occasions. Courses missing from this run are kept: they may still be reviewed. */
export async function saveCatalogue(db: Db, universityId: string, courses: CourseRow[], occasions: OccasionRow[]) {
  for (const batch of chunks(courses)) {
    await db
      .insert(course)
      .values(batch.map((c) => ({ ...c, universityId })))
      .onConflictDoUpdate({
        target: [course.universityId, course.code],
        set: {
          ...excluded([
            'title_sv',
            'title_en',
            'description_sv',
            'description_en',
            'eligibility_sv',
            'eligibility_en',
            'credits',
            'level',
            'url_sv',
            'url_en',
            'source_edited_at',
          ]),
          updatedAt: new Date(),
        },
      });
  }
  const ids = await courseIds(db, universityId);
  const rows = occasions.flatMap(({ code, ...o }) => {
    const courseId = ids.get(code);
    return courseId ? [{ ...o, courseId }] : [];
  });
  for (const batch of chunks(rows)) {
    await db
      .insert(occasion)
      .values(batch)
      .onConflictDoUpdate({
        target: occasion.id,
        set: excluded([
          'course_id',
          'semester',
          'start_date',
          'end_date',
          'pace_percent',
          'location',
          'languages',
          'distance',
          'application_code',
          'only_in_programme',
          'cancelled',
        ]),
      });
  }
  return { courses: courses.length, occasions: rows.length };
}

async function courseIds(db: Db, universityId: string) {
  const rows = await db.select({ id: course.id, code: course.code }).from(course).where(eq(course.universityId, universityId));
  return new Map(rows.map((r) => [r.code, r.id]));
}

/**
 * Replaces the teachings read from the crawled pages. Teachings whose course code is not in the catalogue are
 * returned as unmatched (often courses another department gives, or codes no longer offered).
 */
export async function saveTeachings(db: Db, universityId: string, teachings: Teaching[]) {
  const ids = await courseIds(db, universityId);
  const matched = teachings.filter((t) => ids.has(t.code));
  const unmatched = teachings.filter((t) => !ids.has(t.code));

  const names = new Map<string, string>();
  for (const t of matched) if (!names.has(nameKey(t.name))) names.set(nameKey(t.name), t.name);
  for (const batch of chunks([...names])) {
    await db
      .insert(lecturer)
      .values(batch.map(([key, name]) => ({ universityId, name, nameKey: key })))
      .onConflictDoNothing();
  }
  const lecturers = new Map<string, number>();
  for (const batch of chunks([...names.keys()])) {
    const rows = await db
      .select({ id: lecturer.id, nameKey: lecturer.nameKey })
      .from(lecturer)
      .where(and(eq(lecturer.universityId, universityId), inArray(lecturer.nameKey, batch)));
    for (const r of rows) lecturers.set(r.nameKey, r.id);
  }

  // The same teaching is often listed twice (the Swedish and English page); one upsert may not touch a row twice.
  const unique = new Map<string, { courseId: number; lecturerId: number; semester: string; role: string; sourceUrl: string }>();
  for (const t of matched) {
    const row = { courseId: ids.get(t.code)!, lecturerId: lecturers.get(nameKey(t.name))!, semester: t.semester, role: t.role, sourceUrl: t.sourceUrl };
    const key = `${row.courseId}|${row.lecturerId}|${row.semester}|${row.role}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  const rows = [...unique.values()];
  for (const batch of chunks(rows)) {
    await db
      .insert(teaching)
      .values(batch)
      .onConflictDoUpdate({
        target: [teaching.courseId, teaching.lecturerId, teaching.semester, teaching.role],
        set: { sourceUrl: sql.raw('excluded.source_url'), updatedAt: new Date() },
      });
  }
  return { matched: rows.length, unmatched, lecturers: lecturers.size };
}

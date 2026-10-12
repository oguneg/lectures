import { and, asc, avg, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { course, lecturer, lecturerRating, occasion, review, teaching, university, user } from '../db/schema';

export const PAGE_SIZE = 25;

/** The semester a date falls in: July onwards is autumn ("HT"), before is spring ("VT"). */
export function semesterOf(date: Date): string {
  return `${date.getMonth() >= 6 ? 'HT' : 'VT'}${date.getFullYear()}`;
}

/** The current semester and the `count - 1` before it, newest first: reviews are about courses already taken. */
export function recentSemesters(now: Date, count = 8): string[] {
  let year = now.getFullYear();
  let autumn = now.getMonth() >= 6;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${autumn ? 'HT' : 'VT'}${year}`);
    if (!autumn) year--;
    autumn = !autumn;
  }
  return out;
}

/** Sorts "VT2026" before "HT2026" before "VT2027". */
export function semesterOrder(semester: string): number {
  return Number(semester.slice(2)) * 2 + (semester.startsWith('HT') ? 1 : 0);
}

export async function stats(db: Db) {
  const [[courses], [reviews], [lecturers]] = await Promise.all([
    db.select({ n: count() }).from(course),
    db.select({ n: count() }).from(review),
    db.select({ n: count() }).from(lecturer),
  ]);
  return { courses: courses?.n ?? 0, reviews: reviews?.n ?? 0, lecturers: lecturers?.n ?? 0 };
}

const reviewStats = {
  reviewCount: sql<number>`(select count(*) from ${review} where ${review.courseId} = ${course.id})`.mapWith(Number),
  avgOverall: sql<number | null>`(select avg(${review.overall}) from ${review} where ${review.courseId} = ${course.id})`.mapWith(
    (v) => (v === null ? null : Number(v)),
  ),
};

export async function searchCourses(db: Db, { q, level, page }: { q: string; level?: string | undefined; page: number }) {
  const term = q.trim();
  const filters = [
    term
      ? or(ilike(course.code, `${term}%`), ilike(course.titleSv, `%${term}%`), ilike(course.titleEn, `%${term}%`))
      : undefined,
    level ? eq(course.level, level) : undefined,
  ].filter(Boolean);
  const where = filters.length ? and(...filters) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        universityId: course.universityId,
        code: course.code,
        titleSv: course.titleSv,
        titleEn: course.titleEn,
        credits: course.credits,
        level: course.level,
        ...reviewStats,
      })
      .from(course)
      .where(where)
      // Exact code first, then the most reviewed, then by code.
      .orderBy(desc(sql`${course.code} = ${term.toUpperCase()}`), desc(reviewStats.reviewCount), asc(course.code))
      .limit(PAGE_SIZE)
      .offset(page * PAGE_SIZE),
    db.select({ n: count() }).from(course).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function recentReviews(db: Db, limit = 8) {
  return db
    .select({
      universityId: course.universityId,
      code: course.code,
      titleSv: course.titleSv,
      titleEn: course.titleEn,
      overall: review.overall,
      body: review.body,
      semester: review.semester,
      createdAt: review.createdAt,
    })
    .from(review)
    .innerJoin(course, eq(course.id, review.courseId))
    .orderBy(desc(review.createdAt))
    .limit(limit);
}

export async function getCourse(db: Db, universityId: string, code: string, userId?: string) {
  const [row] = await db
    .select({ course, university })
    .from(course)
    .innerJoin(university, eq(university.id, course.universityId))
    .where(and(eq(course.universityId, universityId), eq(course.code, code.toUpperCase())));
  if (!row) return null;
  const courseId = row.course.id;

  const [occasions, teachings, [aggregate], reviews] = await Promise.all([
    db.select().from(occasion).where(eq(occasion.courseId, courseId)).orderBy(desc(occasion.startDate)),
    db
      .select({ lecturerId: lecturer.id, name: lecturer.name, semester: teaching.semester, role: teaching.role, sourceUrl: teaching.sourceUrl })
      .from(teaching)
      .innerJoin(lecturer, eq(lecturer.id, teaching.lecturerId))
      .where(eq(teaching.courseId, courseId)),
    db
      .select({ n: count(), overall: avg(review.overall), difficulty: avg(review.difficulty), workload: avg(review.workload) })
      .from(review)
      .where(eq(review.courseId, courseId)),
    db
      .select({ review, authorName: user.name })
      .from(review)
      .innerJoin(user, eq(user.id, review.userId))
      .where(eq(review.courseId, courseId))
      .orderBy(desc(review.createdAt)),
  ]);

  const reviewIds = reviews.map((r) => r.review.id);
  const ratings = reviewIds.length
    ? await db
        .select({ reviewId: lecturerRating.reviewId, lecturerId: lecturer.id, name: lecturer.name, rating: lecturerRating.rating, comment: lecturerRating.comment })
        .from(lecturerRating)
        .innerJoin(lecturer, eq(lecturer.id, lecturerRating.lecturerId))
        .where(inArray(lecturerRating.reviewId, reviewIds))
    : [];

  teachings.sort((a, b) => semesterOrder(b.semester) - semesterOrder(a.semester) || a.name.localeCompare(b.name));
  const num = (v: string | null | undefined) => (v == null ? null : Number(v));
  return {
    course: row.course,
    university: row.university,
    occasions,
    teachings,
    aggregate: {
      count: aggregate?.n ?? 0,
      overall: num(aggregate?.overall),
      difficulty: num(aggregate?.difficulty),
      workload: num(aggregate?.workload),
    },
    reviews: reviews.map((r) => ({
      ...r.review,
      author: r.review.showName ? r.authorName : null,
      lecturerRatings: ratings.filter((x) => x.reviewId === r.review.id),
      mine: r.review.userId === userId,
    })),
  };
}

const rating = z.coerce.number().int().min(1).max(5);
export const reviewInput = z.object({
  semester: z.string().regex(/^(HT|VT)20\d\d$/),
  overall: rating,
  difficulty: rating,
  workload: rating,
  body: z.string().trim().max(5000).default(''),
  showName: z.preprocess((v) => v === 'on' || v === true, z.boolean()),
  lecturers: z
    .array(z.object({ lecturerId: z.coerce.number().int(), rating, comment: z.string().trim().max(1000).default('') }))
    .default([]),
});
export type ReviewInput = z.infer<typeof reviewInput>;

/** Form fields → review input. Lecturer ratings arrive as `lecturer_<id>` and `lecturer_<id>_comment`. */
export function parseReviewForm(form: Record<string, string | File | (string | File)[]>) {
  const field = (key: string) => (typeof form[key] === 'string' ? (form[key] as string) : undefined);
  const lecturers = Object.keys(form)
    .map((key) => /^lecturer_(\d+)$/.exec(key)?.[1])
    .filter((id): id is string => Boolean(id) && Boolean(field(`lecturer_${id}`)))
    .map((id) => ({ lecturerId: id, rating: field(`lecturer_${id}`), comment: field(`lecturer_${id}_comment`) ?? '' }));
  return reviewInput.safeParse({
    semester: field('semester'),
    overall: field('overall'),
    difficulty: field('difficulty'),
    workload: field('workload'),
    body: field('body') ?? '',
    showName: field('showName'),
    lecturers,
  });
}

/** Creates or replaces the user's review of this course and semester, and its lecturer ratings. */
export async function saveReview(db: Db, userId: string, courseId: number, input: ReviewInput) {
  const allowed = new Set(
    (await db.selectDistinct({ id: teaching.lecturerId }).from(teaching).where(eq(teaching.courseId, courseId))).map((r) => r.id),
  );
  const values = {
    userId,
    courseId,
    semester: input.semester,
    overall: input.overall,
    difficulty: input.difficulty,
    workload: input.workload,
    body: input.body,
    showName: input.showName,
  };
  await db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(review)
      .values(values)
      .onConflictDoUpdate({ target: [review.userId, review.courseId, review.semester], set: { ...values, updatedAt: new Date() } })
      .returning({ id: review.id });
    await tx.delete(lecturerRating).where(eq(lecturerRating.reviewId, saved!.id));
    const ratings = input.lecturers.filter((l) => allowed.has(l.lecturerId));
    if (ratings.length) await tx.insert(lecturerRating).values(ratings.map((l) => ({ reviewId: saved!.id, ...l })));
  });
}

export async function getLecturer(db: Db, universityId: string, id: number) {
  const [row] = await db
    .select()
    .from(lecturer)
    .where(and(eq(lecturer.id, id), eq(lecturer.universityId, universityId)));
  if (!row) return null;
  const [courses, [aggregate], comments] = await Promise.all([
    db
      .select({ code: course.code, titleSv: course.titleSv, titleEn: course.titleEn, semester: teaching.semester, role: teaching.role })
      .from(teaching)
      .innerJoin(course, eq(course.id, teaching.courseId))
      .where(eq(teaching.lecturerId, id)),
    db.select({ n: count(), rating: avg(lecturerRating.rating) }).from(lecturerRating).where(eq(lecturerRating.lecturerId, id)),
    db
      .select({ rating: lecturerRating.rating, comment: lecturerRating.comment, code: course.code, semester: review.semester, createdAt: review.createdAt })
      .from(lecturerRating)
      .innerJoin(review, eq(review.id, lecturerRating.reviewId))
      .innerJoin(course, eq(course.id, review.courseId))
      .where(eq(lecturerRating.lecturerId, id))
      .orderBy(desc(review.createdAt)),
  ]);
  courses.sort((a, b) => semesterOrder(b.semester) - semesterOrder(a.semester) || a.code.localeCompare(b.code));
  return {
    lecturer: row,
    courses,
    aggregate: { count: aggregate?.n ?? 0, rating: aggregate?.rating == null ? null : Number(aggregate.rating) },
    comments,
  };
}

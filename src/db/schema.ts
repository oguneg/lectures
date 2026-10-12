// Drizzle schema. After changing it, run `npm run db:generate` and commit the new migration.
import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Accounts: the tables Better Auth expects (property names are its field names).
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  /** Display name; reviews show it only if the reviewer chooses to. */
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...timestamps,
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

/** A way to sign in: provider "credential" holds the password hash. */
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_provider_account_uidx').on(table.providerId, table.accountId),
  ],
);

/** Short-lived tokens: email confirmation, password reset. */
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

// Catalogue. Courses and occasions come from Skolverket's Susa-navet API; teachings from university web pages.

export const university = pgTable('university', {
  /** Short slug used in URLs: "uu". */
  id: text('id').primaryKey(),
  /** Susa-navet provider id: "p.uoh.uu". */
  providerId: text('provider_id').notNull().unique(),
  nameSv: text('name_sv').notNull(),
  nameEn: text('name_en').notNull(),
  url: text('url'),
});

export const course = pgTable(
  'course',
  {
    id: serial('id').primaryKey(),
    universityId: text('university_id')
      .notNull()
      .references(() => university.id),
    /** The university's course code, upper case: "1TS346". */
    code: text('code').notNull(),
    titleSv: text('title_sv'),
    titleEn: text('title_en'),
    descriptionSv: text('description_sv'),
    descriptionEn: text('description_en'),
    eligibilitySv: text('eligibility_sv'),
    eligibilityEn: text('eligibility_en'),
    credits: real('credits'),
    /** "grund" (first cycle), "avancerad" (second cycle) or "forskar" (third cycle). */
    level: text('level'),
    urlSv: text('url_sv'),
    urlEn: text('url_en'),
    /** When the source last changed this course (Susa-navet lastEdited). */
    sourceEditedAt: timestamp('source_edited_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('course_university_code_uidx').on(table.universityId, table.code)],
);

/** One run of a course: a semester, a place, a pace. Many per course and semester (campus, distance, exchange...). */
export const occasion = pgTable(
  'occasion',
  {
    /** Susa-navet event id: "e.uoh.uu.1dl210.11032.20262". */
    id: text('id').primaryKey(),
    courseId: integer('course_id')
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    /** "HT2026" (autumn) or "VT2027" (spring). */
    semester: text('semester').notNull(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    pacePercent: integer('pace_percent'),
    location: text('location'),
    /** ISO 639-2 codes of the teaching languages: "swe", "eng". */
    languages: text('languages').array().notNull().default(sql`'{}'::text[]`),
    distance: boolean('distance').notNull().default(false),
    applicationCode: text('application_code'),
    onlyInProgramme: boolean('only_in_programme').notNull().default(false),
    cancelled: boolean('cancelled').notNull().default(false),
  },
  (table) => [index('occasion_course_idx').on(table.courseId, table.semester)],
);

export const lecturer = pgTable(
  'lecturer',
  {
    id: serial('id').primaryKey(),
    universityId: text('university_id')
      .notNull()
      .references(() => university.id),
    name: text('name').notNull(),
    /** Lower-cased, accent-stripped name used to merge the same person across pages. */
    nameKey: text('name_key').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('lecturer_university_name_uidx').on(table.universityId, table.nameKey)],
);

/** Who taught a course in a semester, and where we read it. */
export const teaching = pgTable(
  'teaching',
  {
    courseId: integer('course_id')
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    lecturerId: integer('lecturer_id')
      .notNull()
      .references(() => lecturer.id, { onDelete: 'cascade' }),
    semester: text('semester').notNull(),
    /** As the source words it: "teacher", "coordinator", "examiner". */
    role: text('role').notNull(),
    sourceUrl: text('source_url').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.courseId, table.lecturerId, table.semester, table.role] }),
    index('teaching_lecturer_idx').on(table.lecturerId),
  ],
);

// Reviews. One per user, course and semester; lecturer ratings hang off it.

export const review = pgTable(
  'review',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    courseId: integer('course_id')
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    semester: text('semester').notNull(),
    /** 1–5: how good the course was overall. */
    overall: integer('overall').notNull(),
    /** 1–5: 1 very easy, 5 very hard. */
    difficulty: integer('difficulty').notNull(),
    /** 1–5: 1 very light, 5 very heavy. */
    workload: integer('workload').notNull(),
    body: text('body').notNull().default(''),
    /** Show the reviewer's display name instead of "Anonymous student". */
    showName: boolean('show_name').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('review_user_course_semester_uidx').on(table.userId, table.courseId, table.semester),
    index('review_course_idx').on(table.courseId),
    check('review_overall_range', sql`${table.overall} between 1 and 5`),
    check('review_difficulty_range', sql`${table.difficulty} between 1 and 5`),
    check('review_workload_range', sql`${table.workload} between 1 and 5`),
  ],
);

export const lecturerRating = pgTable(
  'lecturer_rating',
  {
    reviewId: integer('review_id')
      .notNull()
      .references(() => review.id, { onDelete: 'cascade' }),
    lecturerId: integer('lecturer_id')
      .notNull()
      .references(() => lecturer.id, { onDelete: 'cascade' }),
    /** 1–5. */
    rating: integer('rating').notNull(),
    comment: text('comment').notNull().default(''),
  },
  (table) => [
    primaryKey({ columns: [table.reviewId, table.lecturerId] }),
    index('lecturer_rating_lecturer_idx').on(table.lecturerId),
    check('lecturer_rating_range', sql`${table.rating} between 1 and 5`),
  ],
);

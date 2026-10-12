// Courses and course occasions from Skolverket's Susa-navet API (CC0, updated daily):
// https://api.skolverket.se/susa-navet/swagger-ui/index.html
// An "education info" is a course as offered in one admission round; an "education event" is one occasion of it.
// Several infos share a course code, so courses are grouped by code and the most recently edited one wins.

export const SUSA_BASE = 'https://api.skolverket.se/susa-navet/emil3';

type Lang = 'swe' | 'eng';
interface LangStrings {
  strings?: { lang: string; value: string }[];
}
interface Coded {
  code: string;
}

export interface SusaInfo {
  id: string;
  status?: string;
  content: {
    code?: string;
    title?: LangStrings;
    description?: LangStrings;
    eligibility?: LangStrings;
    credits?: { credits?: number };
    educationLevels?: Coded[];
    configuration?: Coded;
    url?: { urls?: { lang: string; value: string }[] };
    lastEdited?: string;
  };
}

export interface SusaEvent {
  id: string;
  status?: string;
  content: {
    education: string;
    url?: { urls?: { lang: string; value: string }[] };
    execution?: { start?: string; end?: string };
    locations?: { studyLocation?: LangStrings }[];
    paceOfStudy?: { percentage?: number };
    languageOfInstructions?: string[];
    isCancelled?: boolean;
    application?: { code?: string };
    extensions?: {
      type?: string;
      itdistance?: boolean;
      startPeriod?: { period?: { year?: string; semester?: string } };
      applicationDetails?: { onlyAsPartOfProgram?: boolean };
    }[];
  };
}

export interface CourseRow {
  code: string;
  titleSv: string | null;
  titleEn: string | null;
  descriptionSv: string | null;
  descriptionEn: string | null;
  eligibilitySv: string | null;
  eligibilityEn: string | null;
  credits: number | null;
  level: string | null;
  urlSv: string | null;
  urlEn: string | null;
  sourceEditedAt: Date | null;
}

export interface OccasionRow {
  id: string;
  code: string;
  semester: string;
  startDate: string | null;
  endDate: string | null;
  pacePercent: number | null;
  location: string | null;
  languages: string[];
  distance: boolean;
  applicationCode: string | null;
  onlyInProgramme: boolean;
  cancelled: boolean;
}

function text(node: LangStrings | undefined, lang: Lang): string | null {
  const value = node?.strings?.find((s) => s.lang === lang)?.value?.trim();
  return value ? value : null;
}

function link(node: { urls?: { lang: string; value: string }[] } | undefined, lang: Lang): string | null {
  return node?.urls?.find((u) => u.lang === lang)?.value ?? null;
}

/** "HT2026" / "VT2027". Uses the admission period when present, else the start date (July on is autumn). */
export function semesterOf(event: SusaEvent): string | null {
  const period = event.content.extensions?.find((e) => e.startPeriod)?.startPeriod?.period;
  if (period?.year && (period.semester === 'HT' || period.semester === 'VT')) return `${period.semester}${period.year}`;
  const start = event.content.execution?.start;
  if (!start) return null;
  const [year, month] = start.split('-').map(Number);
  if (!year || !month) return null;
  return `${month >= 7 ? 'HT' : 'VT'}${year}`;
}

export function toCourseRows(infos: SusaInfo[]): CourseRow[] {
  const latest = new Map<string, SusaInfo>();
  for (const info of infos) {
    const code = info.content.code?.trim().toUpperCase();
    if (!code || info.content.configuration?.code !== 'kurs') continue;
    const current = latest.get(code);
    if (!current || (info.content.lastEdited ?? '') > (current.content.lastEdited ?? '')) latest.set(code, info);
  }
  return [...latest.entries()].map(([code, { content: c }]) => ({
    code,
    titleSv: text(c.title, 'swe'),
    titleEn: text(c.title, 'eng'),
    descriptionSv: text(c.description, 'swe'),
    descriptionEn: text(c.description, 'eng'),
    eligibilitySv: text(c.eligibility, 'swe'),
    eligibilityEn: text(c.eligibility, 'eng'),
    credits: c.credits?.credits ?? null,
    level: c.educationLevels?.[0]?.code ?? null,
    urlSv: link(c.url, 'swe'),
    urlEn: link(c.url, 'eng'),
    sourceEditedAt: c.lastEdited ? new Date(c.lastEdited) : null,
  }));
}

/** Occasions of the given infos; events whose info is not a course (programmes) are dropped. */
export function toOccasionRows(events: SusaEvent[], infos: SusaInfo[]): OccasionRow[] {
  const codeOf = new Map<string, string>();
  for (const info of infos) {
    if (info.content.code && info.content.configuration?.code === 'kurs') codeOf.set(info.id, info.content.code.trim().toUpperCase());
  }
  const rows: OccasionRow[] = [];
  for (const event of events) {
    const c = event.content;
    const code = codeOf.get(c.education);
    const semester = semesterOf(event);
    if (!code || !semester) continue;
    const ext = c.extensions?.find((e) => e.type === 'UHEventExtension');
    rows.push({
      id: event.id,
      code,
      semester,
      startDate: c.execution?.start ?? null,
      endDate: c.execution?.end ?? null,
      pacePercent: c.paceOfStudy?.percentage ?? null,
      location: text(c.locations?.[0]?.studyLocation, 'swe'),
      languages: c.languageOfInstructions ?? [],
      distance: ext?.itdistance ?? false,
      applicationCode: c.application?.code ?? null,
      onlyInProgramme: ext?.applicationDetails?.onlyAsPartOfProgram ?? false,
      cancelled: c.isCancelled ?? false,
    });
  }
  return rows;
}

export type FetchJson = (url: string) => Promise<unknown>;

async function allPages<T>(fetchJson: FetchJson, url: string, key: string, log: (msg: string) => void): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page++) {
    const data = (await fetchJson(`${url}&page=${page}&size=2000`)) as { page: { totalPages: number } } & Record<string, unknown>;
    out.push(...((data[key] as T[] | undefined) ?? []));
    log(`  ${key}: page ${page + 1}/${data.page.totalPages}`);
    if (page + 1 >= data.page.totalPages) return out;
  }
}

/** All active courses and occasions of one provider (e.g. "p.uoh.uu"). */
export async function fetchProvider(fetchJson: FetchJson, providerId: string, log: (msg: string) => void = () => {}) {
  const events = await allPages<SusaEvent>(fetchJson, `${SUSA_BASE}/educationEvents?providerId=${providerId}`, 'educationEvents', log);
  // educationInfos cannot be filtered by provider, so page through all higher education and keep this provider's.
  const wanted = new Set(events.map((e) => e.content.education));
  const all = await allPages<SusaInfo>(fetchJson, `${SUSA_BASE}/educationInfos?schoolType=HS`, 'educationInfos', log);
  const infos = all.filter((i) => wanted.has(i.id));
  return { courses: toCourseRows(infos), occasions: toOccasionRows(events, infos) };
}

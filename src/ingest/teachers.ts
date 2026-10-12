// Who teaches what, read from university web pages. No official source lists teachers per course, but some
// departments publish semester course lists with a teacher column (e.g. UU's Department of Information Technology).
// The crawler walks each department's student pages and keeps tables that pair course codes with names.
import { parse, type HTMLElement } from 'node-html-parser';

const COURSE_CODE = /\b\d[A-Z]{2}\d{3}\b/;
const ROLE_HEADERS: [RegExp, string][] = [
  [/kursansvarig|course (coordinator|director|leader|responsible)/i, 'coordinator'],
  [/examinator|examiner/i, 'examiner'],
  [/lärare|teacher|instructor|lecturer/i, 'teacher'],
];
/** Cell text that is not a person. */
const NOT_A_NAME = /^(tba|tbd|n\/a|-+|–|ej klart|meddelas senare|to be announced)$/i;

export interface Teaching {
  code: string;
  semester: string;
  name: string;
  role: string;
  sourceUrl: string;
}

/** "Course list for autumn 2026" → "HT2026"; "Kurser våren 2027", "VT27" → "VT2027". */
export function semesterFromHeading(heading: string): string | null {
  const s = heading.toLowerCase();
  const long = /(höst|hösten|autumn|fall|vår|våren|spring)\D{0,12}(20\d\d)/.exec(s);
  if (long) return `${/vår|spring/.test(long[1]!) ? 'VT' : 'HT'}${long[2]}`;
  const short = /\b(ht|vt)[\s-]?(20)?(\d\d)\b/.exec(s);
  if (short) return `${short[1]!.toUpperCase()}20${short[3]}`;
  return null;
}

/** Splits a teacher cell into person names: "A and B", "A, B", "A / B", "Contact A" → ["A", "B"]. */
export function splitNames(cell: string): string[] {
  return cell
    .replace(/\S+@\S+/g, ' ')
    .replace(/\((?:[^)]*)\)/g, ' ')
    .split(/,|;|\/|\s+(?:and|och|&)\s+|\n/i)
    .map((part) =>
      part
        .replace(/^\s*(contact|kontakt(person)?|kursansvarig|examinator|teacher|lärare)\s*:?\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((name) => name.length >= 4 && /\s/.test(name) && !NOT_A_NAME.test(name) && !/\d/.test(name));
}

/** Lower case, no accents, single spaces: the key that merges "José Mairton" and "Jose  Mairton". */
export function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cellText(cell: HTMLElement): string {
  return cell.structuredText.replace(/ /g, ' ').trim();
}

/** Teachings from one page. Tables need a header row with a teacher-like column and course codes in the rows. */
export function extractTeachings(html: string, sourceUrl: string): Teaching[] {
  const root = parse(html);
  const title = root.querySelector('h1')?.text ?? root.querySelector('title')?.text ?? '';
  const pageSemester = semesterFromHeading(title);
  const out: Teaching[] = [];
  for (const table of root.querySelectorAll('table')) {
    const rows = table.querySelectorAll('tr').map((tr) => tr.querySelectorAll('th,td').map(cellText));
    const header = rows[0];
    if (!header) continue;
    const roles = header.map((h) => ROLE_HEADERS.find(([re]) => re.test(h))?.[1]);
    if (!roles.some(Boolean)) continue;
    // A caption or the nearest heading above the table may name the semester when the page title does not.
    const semester = semesterFromHeading(table.querySelector('caption')?.text ?? '') ?? pageSemester ?? nearestHeadingSemester(table);
    if (!semester) continue;
    for (const row of rows.slice(1)) {
      const code = row.map((c) => COURSE_CODE.exec(c)?.[0]).find(Boolean);
      if (!code) continue;
      row.forEach((cell, i) => {
        const role = roles[i];
        if (!role) return;
        for (const name of splitNames(cell)) out.push({ code, semester, name, role, sourceUrl });
      });
    }
  }
  return out;
}

function nearestHeadingSemester(el: HTMLElement): string | null {
  let node: HTMLElement | null = el;
  while (node) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (/^H[1-4]$/.test(sibling.tagName)) {
        const semester = semesterFromHeading(sibling.text);
        if (semester) return semester;
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentNode as HTMLElement | null;
    if (node?.tagName === undefined || node.tagName === 'BODY') break;
  }
  return null;
}

/** Same-site links under `prefix`, without fragments or queries. */
export function linksUnder(html: string, pageUrl: string, prefix: string): string[] {
  const links = new Set<string>();
  for (const a of parse(html).querySelectorAll('a[href]')) {
    try {
      const url = new URL(a.getAttribute('href')!, pageUrl);
      url.hash = '';
      url.search = '';
      if (url.href.startsWith(prefix)) links.add(url.href.replace(/\/$/, ''));
    } catch {
      // Malformed href: skip it.
    }
  }
  return [...links];
}

export type FetchHtml = (url: string) => Promise<string | null>;

/** Breadth-first crawl of every page under each root, up to `maxPages` per root. */
export async function crawlTeachings(
  fetchHtml: FetchHtml,
  roots: string[],
  { maxPages = 80, log = (_: string) => {} }: { maxPages?: number; log?: (msg: string) => void } = {},
): Promise<Teaching[]> {
  const found: Teaching[] = [];
  for (const root of roots) {
    const seen = new Set<string>();
    const queue = [root];
    let count = 0;
    while (queue.length && seen.size < maxPages) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      const html = await fetchHtml(url);
      if (!html) continue;
      const teachings = extractTeachings(html, url);
      count += teachings.length;
      found.push(...teachings);
      for (const link of linksUnder(html, url, root)) if (!seen.has(link)) queue.push(link);
    }
    log(`  ${root}: ${seen.size} pages, ${count} teachings`);
  }
  return found;
}

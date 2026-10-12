import { describe, expect, it } from 'vitest';
import { extractTeachings, linksUnder, nameKey, semesterFromHeading, splitNames } from './teachers';

describe('semesterFromHeading', () => {
  it.each([
    ['Course list for autumn 2026', 'HT2026'],
    ['Aktuell kurslista för höst 2026', 'HT2026'],
    ['Kurser våren 2027', 'VT2027'],
    ['Course list for spring 2027', 'VT2027'],
    ['Schema VT27', 'VT2027'],
    ['HT-26 kurser', 'HT2026'],
    ['Programmes and courses', null],
  ])('%s → %s', (heading, expected) => {
    expect(semesterFromHeading(heading)).toBe(expected);
  });
});

describe('splitNames', () => {
  it('splits lists and drops placeholders', () => {
    expect(splitNames('Anna Persson, Per Mattsson and Lars-Henrik Eriksson')).toEqual(['Anna Persson', 'Per Mattsson', 'Lars-Henrik Eriksson']);
    expect(splitNames('Contact Karl Marklund')).toEqual(['Karl Marklund']);
    expect(splitNames('Kursansvarig: Eva Ek (eva.ek@uu.se)')).toEqual(['Eva Ek']);
    expect(splitNames('TBA')).toEqual([]);
    expect(splitNames('Sofia')).toEqual([]);
  });
});

describe('nameKey', () => {
  it('ignores accents, case and spacing', () => {
    expect(nameKey('José  Mairton Barros Da Silva Júnior')).toBe(nameKey('jose mairton barros da silva junior'));
  });
});

describe('extractTeachings', () => {
  const page = `
    <html><head><title>Course list for autumn 2026</title></head><body>
    <h1>Course list for autumn 2026</h1>
    <h2>Period 1</h2>
    <table>
      <tr><th>Course</th><th>Application code</th><th>Course code</th><th>Teacher</th><th>Period</th></tr>
      <tr><td>Algorithms and Data Structures I</td><td>UU-11032</td><td>1DL210</td><td>Pontus Ekberg</td><td>1</td></tr>
      <tr><td>Human-Computer Interaction</td><td>UU-11602</td><td>1MD016</td><td>Contact Karl Marklund</td><td>1</td></tr>
      <tr><td>Something</td><td>-</td><td>-</td><td>Nobody Here</td><td>1</td></tr>
    </table>
    <table><tr><th>Room</th><th>Code</th></tr><tr><td>A</td><td>1DL210</td></tr></table>
    </body></html>`;

  it('reads course code, teacher and semester from course list tables', () => {
    expect(extractTeachings(page, 'https://example.test/list')).toEqual([
      { code: '1DL210', semester: 'HT2026', name: 'Pontus Ekberg', role: 'teacher', sourceUrl: 'https://example.test/list' },
      { code: '1MD016', semester: 'HT2026', name: 'Karl Marklund', role: 'teacher', sourceUrl: 'https://example.test/list' },
    ]);
  });

  it('takes the semester from a heading above the table when the page title has none', () => {
    const html = `<h1>Kurser</h1><h2>Våren 2027</h2><table><tr><th>Kurskod</th><th>Kursansvarig</th></tr><tr><td>1TS346</td><td>Eva Ek</td></tr></table>`;
    expect(extractTeachings(html, 'u')).toEqual([{ code: '1TS346', semester: 'VT2027', name: 'Eva Ek', role: 'coordinator', sourceUrl: 'u' }]);
  });

  it('skips tables without a known semester', () => {
    const html = `<h1>Kurser</h1><table><tr><th>Kurskod</th><th>Lärare</th></tr><tr><td>1TS346</td><td>Eva Ek</td></tr></table>`;
    expect(extractTeachings(html, 'u')).toEqual([]);
  });
});

describe('linksUnder', () => {
  it('keeps same-section links without fragments or queries', () => {
    const html = `<a href="/student/institution/it/kurser#x">a</a><a href="https://other.test/">b</a><a href="/student/institution/it/?q=1">c</a>`;
    expect(linksUnder(html, 'https://www.uu.se/student/institution/it', 'https://www.uu.se/student/institution/it')).toEqual([
      'https://www.uu.se/student/institution/it/kurser',
      'https://www.uu.se/student/institution/it',
    ]);
  });
});

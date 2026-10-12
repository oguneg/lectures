import { describe, expect, it } from 'vitest';
import { semesterOf, toCourseRows, toOccasionRows, type SusaEvent, type SusaInfo } from './susa';

const info = (id: string, code: string, lastEdited: string, title = 'Algoritmer och datastrukturer I'): SusaInfo => ({
  id,
  content: {
    code,
    title: { strings: [{ lang: 'swe', value: title }, { lang: 'eng', value: 'Algorithms and Data Structures I' }] },
    credits: { credits: 5 },
    educationLevels: [{ code: 'grund' }],
    configuration: { code: 'kurs' },
    url: { urls: [{ lang: 'swe', value: `https://www.uu.se/utbildning/kurs?query=${code}` }] },
    lastEdited,
  },
});

const event: SusaEvent = {
  id: 'e.uoh.uu.1dl210.11032.20262',
  content: {
    education: 'i.uoh.uu.1dl210.11032.20262',
    execution: { start: '2026-08-31', end: '2026-11-01' },
    locations: [{ studyLocation: { strings: [{ lang: 'swe', value: 'Uppsala' }] } }],
    paceOfStudy: { percentage: 33 },
    languageOfInstructions: ['eng'],
    application: { code: '11032' },
    extensions: [
      {
        type: 'UHEventExtension',
        itdistance: false,
        startPeriod: { period: { year: '2026', semester: 'HT' } },
        applicationDetails: { onlyAsPartOfProgram: true },
      },
    ],
  },
};

describe('toCourseRows', () => {
  it('groups infos by course code and keeps the most recently edited', () => {
    const rows = toCourseRows([
      info('i.uoh.uu.1dl210.1.20261', '1dl210', '2025-01-01T00:00:00', 'Gammal titel'),
      info('i.uoh.uu.1dl210.11032.20262', '1DL210', '2026-03-09T12:14:16'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: '1DL210', titleSv: 'Algoritmer och datastrukturer I', titleEn: 'Algorithms and Data Structures I', credits: 5, level: 'grund' });
  });

  it('drops programmes', () => {
    const programme = info('i.uoh.uu.tkt2y.1.20262', 'TKT2Y', '2026-01-01T00:00:00');
    programme.content.configuration = { code: 'program' };
    expect(toCourseRows([programme])).toEqual([]);
  });
});

describe('toOccasionRows', () => {
  it('maps an event to its course code and semester', () => {
    const [row] = toOccasionRows([event], [info('i.uoh.uu.1dl210.11032.20262', '1DL210', '2026-03-09T12:14:16')]);
    expect(row).toEqual({
      id: 'e.uoh.uu.1dl210.11032.20262',
      code: '1DL210',
      semester: 'HT2026',
      startDate: '2026-08-31',
      endDate: '2026-11-01',
      pacePercent: 33,
      location: 'Uppsala',
      languages: ['eng'],
      distance: false,
      applicationCode: '11032',
      onlyInProgramme: true,
      cancelled: false,
    });
  });
});

describe('semesterOf', () => {
  it('falls back to the start date', () => {
    expect(semesterOf({ id: 'x', content: { education: 'y', execution: { start: '2027-01-18' } } })).toBe('VT2027');
    expect(semesterOf({ id: 'x', content: { education: 'y' } })).toBeNull();
  });
});

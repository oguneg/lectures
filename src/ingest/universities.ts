export interface UniversitySource {
  id: string;
  providerId: string;
  nameSv: string;
  nameEn: string;
  url: string;
  /** Pages listing the departments; each linked department section is crawled for teacher tables. */
  departmentIndexes: string[];
}

export const UNIVERSITIES: UniversitySource[] = [
  {
    id: 'uu',
    providerId: 'p.uoh.uu',
    nameSv: 'Uppsala universitet',
    nameEn: 'Uppsala University',
    url: 'https://www.uu.se',
    departmentIndexes: ['https://www.uu.se/student/institution', 'https://www.uu.se/en/students/department'],
  },
];

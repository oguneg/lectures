// npm run ingest                       courses and teachers for every university
// npm run ingest -- --only=courses     just the Susa-navet catalogue
// npm run ingest -- --only=teachers    just the department crawl
// npm run ingest -- --uni=uu
import { parseArgs } from 'node:util';
import { connect } from '../db/client';
import { loadEnv } from '../env';
import { fetchHtml, fetchJson } from './http';
import { saveCatalogue, saveTeachings, saveUniversity } from './store';
import { fetchProvider } from './susa';
import { crawlTeachings, linksUnder } from './teachers';
import { UNIVERSITIES } from './universities';

const { values: args } = parseArgs({ options: { only: { type: 'string' }, uni: { type: 'string' } } });
const log = (msg: string) => console.log(msg);

const env = loadEnv();
const database = await connect(env);
await database.migrate();
const { db } = database;

try {
  for (const uni of UNIVERSITIES.filter((u) => !args.uni || u.id === args.uni)) {
    log(`${uni.nameEn}`);
    await saveUniversity(db, uni);

    if (args.only !== 'teachers') {
      log('Courses from Susa-navet');
      const { courses, occasions } = await fetchProvider(fetchJson, uni.providerId, log);
      const saved = await saveCatalogue(db, uni.id, courses, occasions);
      log(`  saved ${saved.courses} courses, ${saved.occasions} occasions`);
    }

    if (args.only !== 'courses') {
      log('Teachers from department pages');
      const roots = new Set<string>();
      for (const index of uni.departmentIndexes) {
        const html = await fetchHtml(index);
        if (html) for (const link of linksUnder(html, index, `${index}/`)) roots.add(link);
      }
      log(`  ${roots.size} department sections`);
      const teachings = await crawlTeachings(fetchHtml, [...roots], { log: (m) => m.includes(' 0 teachings') || log(m) });
      const saved = await saveTeachings(db, uni.id, teachings);
      log(`  saved ${saved.matched} teachings of ${saved.lecturers} lecturers; ${saved.unmatched.length} rows had unknown course codes`);
      const unknown = [...new Set(saved.unmatched.map((t) => t.code))];
      if (unknown.length) log(`  unknown codes: ${unknown.slice(0, 30).join(' ')}${unknown.length > 30 ? ' …' : ''}`);
    }
  }
} finally {
  await database.close();
}

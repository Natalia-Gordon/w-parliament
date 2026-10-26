import { EntryCard, SearchRecord } from '../../core/content.models';
import { SearchEngine, normalizeHebrew } from './search-engine';

const card = (id: number, title: string): EntryCard => ({
  id,
  type: 'post',
  slug: `slug-${id}`,
  path: `/slug-${id}`,
  title,
  speaker: null,
  date: null,
  excerpt: '',
  image: null,
  tags: [],
  categories: [],
  views: 0,
  sessionTerm: null,
});

const records: SearchRecord[] = [
  { i: 1, t: 'חזקת הגיל הרך וטובת הילד', s: 'ד"ר רונה שוז', g: 'מושב 37 · חזקת הגיל הרך', x: 'ביטול חזקת הגיל הרך עלול לפגוע בטובת הילד' },
  { i: 2, t: 'תקציב המדינה', s: 'ד"ר לינדה עפרוני', g: 'מושבי תש"ס (1999-2000)', x: 'דיון על תקציב המדינה וחזקת הגיל הרך' },
  { i: 3, t: 'זנות וסחר בנשים', s: 'אסתר עילם', g: 'פורנוגרפיה זנות וסחר בנשים', x: 'על הפער בין החוק לצדק' },
];

describe('normalizeHebrew', () => {
  it('removes niqqud, gershayim and punctuation', () => {
    expect(normalizeHebrew('תש"ס')).toBe('תשס');
    expect(normalizeHebrew('תשס״ו')).toBe('תשסו');
    expect(normalizeHebrew('שָׁלוֹם')).toBe('שלום');
    expect(normalizeHebrew('אוקי מרושק-קלארמן')).toBe('אוקי מרושק קלארמן');
  });
});

describe('SearchEngine', () => {
  const engine = new SearchEngine(records, new Map(records.map((r) => [r.i, card(r.i, r.t)])));

  it('requires every term to match', () => {
    expect(engine.search('זנות עילם').map((h) => h.card.id)).toEqual([3]);
    expect(engine.search('זנות תקציב')).toEqual([]);
  });

  it('ranks title matches above body matches', () => {
    expect(engine.search('חזקת הגיל הרך').map((h) => h.card.id)).toEqual([1, 2]);
  });

  it('matches regardless of quote marks', () => {
    expect(engine.search('תשס').map((h) => h.card.id)).toEqual([2]);
  });

  it('highlights the matched phrase in the snippet', () => {
    const [hit] = engine.search('הגיל הרך');
    expect(hit.snippet.find((part) => part.mark)?.text).toBe('הגיל הרך');
  });

  it('ignores empty queries', () => {
    expect(engine.search('  ')).toEqual([]);
  });
});

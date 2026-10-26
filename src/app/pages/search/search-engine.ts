import { EntryCard, SearchRecord } from '../../core/content.models';

export interface SearchHit {
  card: EntryCard;
  score: number;
  snippet: { text: string; mark: boolean }[];
}

interface PreparedRecord {
  record: SearchRecord;
  title: string;
  speaker: string;
  tags: string;
  text: string;
}

/** Removes niqqud, quotes (גרש/גרשיים) and dashes so "תש"ס" matches "תשס". */
export function normalizeHebrew(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/["'`׳״“”‘’]/g, '')
    .replace(/[-–—־_/|.,:;!?()[\]]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export class SearchEngine {
  private readonly prepared: PreparedRecord[];

  constructor(
    records: SearchRecord[],
    private readonly cards: Map<number, EntryCard>,
  ) {
    this.prepared = records
      .filter((r) => cards.has(r.i))
      .map((record) => ({
        record,
        title: normalizeHebrew(record.t),
        speaker: normalizeHebrew(record.s),
        tags: normalizeHebrew(record.g),
        text: normalizeHebrew(record.x),
      }));
  }

  search(query: string, limit = 200): SearchHit[] {
    const terms = [...new Set(normalizeHebrew(query).split(' '))].filter((t) => t.length > 1 || /\d/.test(t));
    if (!terms.length) return [];

    const hits: SearchHit[] = [];
    for (const item of this.prepared) {
      let score = 0;
      let matchesAll = true;
      for (const term of terms) {
        const termScore =
          (item.title.includes(term) ? 8 : 0) +
          (item.speaker.includes(term) ? 6 : 0) +
          (item.tags.includes(term) ? 4 : 0) +
          (item.text.includes(term) ? 1 + Math.min(countOccurrences(item.text, term), 5) * 0.2 : 0);
        if (!termScore) {
          matchesAll = false;
          break;
        }
        score += termScore;
      }
      if (!matchesAll) continue;
      const phrase = terms.join(' ');
      if (item.title === phrase) score += 20;
      else if (terms.length > 1 && item.title.includes(phrase)) score += 10;
      hits.push({ card: this.cards.get(item.record.i)!, score, snippet: snippet(item.record.x, terms.length > 1 ? [phrase, ...terms] : terms) });
    }
    return hits.sort((a, b) => b.score - a.score || a.card.id - b.card.id).slice(0, limit);
  }
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  for (let i = text.indexOf(term); i >= 0; i = text.indexOf(term, i + term.length)) count++;
  return count;
}

function snippet(text: string, terms: string[], radius = 110): { text: string; mark: boolean }[] {
  const lower = text.toLowerCase();
  let index = -1;
  let matched = '';
  for (const term of terms) {
    index = lower.indexOf(term);
    if (index >= 0) {
      matched = term;
      break;
    }
  }
  if (index < 0) return [{ text: text.slice(0, radius * 2) + (text.length > radius * 2 ? '…' : ''), mark: false }];

  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, index - radius)));
  const end = Math.min(text.length, index + matched.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return [
    { text: prefix + text.slice(start, index).trimStart(), mark: false },
    { text: text.slice(index, index + matched.length), mark: true },
    { text: text.slice(index + matched.length, end) + suffix, mark: false },
  ];
}

import { Injectable, PLATFORM_ID, TransferState, inject, makeStateKey, signal } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { CONTENT_READER } from './content-reader';
import {
  ContentIndex,
  Entry,
  EntryCard,
  EntrySummary,
  EntryView,
  HomeView,
  ListingView,
  SearchRecord,
  SiteInfo,
  TagsView,
  Term,
} from './content.models';

export const PAGE_SIZE = 12;

export type ListingKind = 'all' | 'tag' | 'category';

interface IndexLookup {
  index: ContentIndex;
  bySlug: Map<string, EntrySummary>;
  byId: Map<number, EntrySummary>;
  terms: Map<number, Term>;
  termBySlug: Map<string, Term>;
}

const collator = new Intl.Collator('he');

/**
 * Loads the static content generated from the WordPress export.
 * Views computed during prerendering are stored in TransferState so the
 * browser hydrates without downloading the (much larger) source files again.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly read = inject(CONTENT_READER);
  private readonly transferState = inject(TransferState);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
  private readonly files = new Map<string, Promise<unknown>>();
  private lookupPromise: Promise<IndexLookup> | null = null;

  readonly site = signal<SiteInfo | null>(null);

  async loadSite(): Promise<SiteInfo> {
    const site = await this.transfer('site', () => this.file<SiteInfo>('site.json'));
    this.site.set(site);
    return site;
  }

  entry(slug: string): Promise<EntryView | null> {
    return this.transfer(`entry:${slug}`, async () => {
      const lookup = await this.lookup();
      const summary = lookup.bySlug.get(slug);
      return summary ? this.entryView(summary.id, lookup) : null;
    });
  }

  home(): Promise<HomeView> {
    return this.transfer('home', async () => {
      const lookup = await this.lookup();
      const site = this.site() ?? (await this.file<SiteInfo>('site.json'));
      const terms = lookup.index.terms;
      const posts = lookup.index.entries.filter((e) => e.type === 'post');
      return {
        page: site.homeId ? (await this.entryView(site.homeId, lookup))?.entry ?? null : null,
        popular: [...posts]
          .sort((a, b) => b.views - a.views)
          .slice(0, 6)
          .map((e) => this.card(e, lookup)),
        seasons: terms.filter((t) => t.kind === 'season').sort((a, b) => (b.order ?? 0) - (a.order ?? 0)),
        sessions: terms.filter((t) => t.kind === 'session').sort((a, b) => (b.order ?? 0) - (a.order ?? 0)).slice(0, 8),
        topics: terms
          .filter((t) => t.kind === 'topic')
          .sort((a, b) => b.count - a.count)
          .slice(0, 18),
        stats: {
          posts: posts.length,
          sessions: terms.filter((t) => t.kind === 'session').length,
          speakers: terms.filter((t) => t.kind === 'person').length,
        },
      };
    });
  }

  listing(kind: ListingKind, slug: string | null, page: number): Promise<ListingView | null> {
    return this.transfer(`listing:${kind}:${slug ?? ''}:${page}`, async () => {
      const lookup = await this.lookup();
      const term = kind === 'all' ? null : (lookup.termBySlug.get(`${kind === 'tag' ? 'post_tag' : 'category'}:${slug}`) ?? null);
      if (kind !== 'all' && !term) return null;

      const items = this.entriesFor(term, lookup);
      const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
      if (!Number.isInteger(page) || page < 1 || page > totalPages) return null;

      return {
        title: term?.name ?? 'כל ההרצאות והמאמרים',
        description: term ? describeTerm(term) : 'ארכיון ההרצאות, התקצירים והמאמרים שהוצגו במושבי פרלמנט נשים',
        term,
        basePath: term ? `/${kind}/${encodeURIComponent(term.slug)}` : '/posts',
        page,
        totalPages,
        total: items.length,
        items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((e) => this.card(e, lookup)),
      };
    });
  }

  tags(): Promise<TagsView> {
    return this.transfer('tags', async () => {
      const { index } = await this.lookup();
      const byKind = (kind: Term['kind']) => index.terms.filter((t) => t.kind === kind);
      return {
        seasons: byKind('season').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        sessions: byKind('session').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        topics: byKind('topic').sort((a, b) => collator.compare(a.name, b.name)),
        people: byKind('person').sort((a, b) => collator.compare(a.name, b.name)),
        categories: byKind('category'),
      };
    });
  }

  /** Browser-only: the full-text search index is loaded on demand. */
  async searchData(): Promise<{ records: SearchRecord[]; cards: Map<number, EntryCard> }> {
    const [records, lookup] = await Promise.all([this.file<SearchRecord[]>('search.json'), this.lookup()]);
    const cards = new Map(lookup.index.entries.map((e) => [e.id, this.card(e, lookup)]));
    return { records, cards };
  }

  /** Number of listing pages for a term, used to generate prerender routes. */
  async pageCount(kind: ListingKind, slug: string | null): Promise<number> {
    const lookup = await this.lookup();
    const term = kind === 'all' ? null : (lookup.termBySlug.get(`${kind === 'tag' ? 'post_tag' : 'category'}:${slug}`) ?? null);
    return Math.max(1, Math.ceil(this.entriesFor(term, lookup).length / PAGE_SIZE));
  }

  async allEntries(): Promise<EntrySummary[]> {
    return (await this.lookup()).index.entries;
  }

  async allTerms(): Promise<Term[]> {
    return (await this.lookup()).index.terms;
  }

  private entriesFor(term: Term | null, lookup: IndexLookup): EntrySummary[] {
    const posts = lookup.index.entries.filter(
      (e) => e.type === 'post' && (!term || (term.taxonomy === 'category' ? e.categories : e.tags).includes(term.id)),
    );
    if (term?.kind === 'session') return posts.sort((a, b) => a.id - b.id);
    const sessionOrder = (e: EntrySummary) =>
      Math.max(0, ...e.tags.map((id) => lookup.terms.get(id)).filter((t) => t?.kind === 'session').map((t) => t!.order ?? 0));
    return posts.sort((a, b) => sessionOrder(b) - sessionOrder(a) || a.id - b.id);
  }

  private async entryView(id: number, lookup: IndexLookup): Promise<EntryView | null> {
    try {
      const entry = await this.file<Entry>(`entries/${id}.json`);
      const terms = [...entry.tags, ...entry.categories].map((t) => lookup.terms.get(t)).filter((t): t is Term => !!t);
      return { entry, terms };
    } catch {
      return null;
    }
  }

  private card(entry: EntrySummary, lookup: IndexLookup): EntryCard {
    const sessionTerm = entry.tags.map((id) => lookup.terms.get(id)).find((t) => t?.kind === 'session') ?? null;
    return { ...entry, sessionTerm };
  }

  private lookup(): Promise<IndexLookup> {
    this.lookupPromise ??= this.file<ContentIndex>('index.json').then((index) => ({
      index,
      bySlug: new Map(index.entries.map((e) => [e.slug, e])),
      byId: new Map(index.entries.map((e) => [e.id, e])),
      terms: new Map(index.terms.map((t) => [t.id, t])),
      termBySlug: new Map(index.terms.map((t) => [`${t.taxonomy}:${t.slug}`, t])),
    }));
    return this.lookupPromise;
  }

  private file<T>(path: string): Promise<T> {
    let pending = this.files.get(path);
    if (!pending) {
      pending = this.read<T>(path);
      this.files.set(path, pending);
      pending.catch(() => this.files.delete(path));
    }
    return pending as Promise<T>;
  }

  private async transfer<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const stateKey = makeStateKey<T>(key);
    if (this.transferState.hasKey(stateKey)) {
      const value = this.transferState.get(stateKey, null as T);
      if (!this.isServer) this.transferState.remove(stateKey);
      return value;
    }
    const value = await compute();
    if (this.isServer) this.transferState.set(stateKey, value);
    return value;
  }
}

export function describeTerm(term: Term): string {
  switch (term.kind) {
    case 'session':
      return `ההרצאות והתקצירים שהוצגו ב${term.name} של פרלמנט נשים`;
    case 'season':
      return `כל ההרצאות מ${term.name.replace(/^מושבי\s*/, 'מושבי ')}`;
    case 'person':
      return `הרצאות ומאמרים של ${term.name} במושבי פרלמנט נשים`;
    case 'category':
      return `תכנים בקטגוריה ${term.name}`;
    default:
      return `הרצאות ומאמרים בנושא ${term.name}`;
  }
}

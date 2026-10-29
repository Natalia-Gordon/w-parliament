export interface ImageRef {
  src: string;
  width: number | null;
  height: number | null;
}

export interface MenuItem {
  title: string;
  path: string;
  external?: boolean;
  children?: MenuItem[];
}

export interface SiteInfo {
  name: string;
  tagline: string;
  description: string;
  url: string;
  locale: string;
  logo: ImageRef | null;
  headerImage: ImageRef | null;
  icon: string | null;
  homeId: number | null;
  contactFormEndpoint: string;
  generatedAt: string;
  year: number;
  menus: { main: MenuItem[]; footer: MenuItem[] };
  maintainer: Maintainer | null;
}

/** Person who designed, built and maintains the site (scripts/site-credits.json). */
export interface Maintainer {
  name: string;
  alternateName: string;
  jobTitle: string;
  jobTitleEn: string;
  description: string;
  role: string;
  contactTopics: string;
  email: string;
  knowsAbout: string[];
  sameAs: string[];
}

export type TermKind = 'session' | 'season' | 'person' | 'topic' | 'category';
export type Taxonomy = 'post_tag' | 'category';

export interface Term {
  id: number;
  taxonomy: Taxonomy;
  slug: string;
  name: string;
  count: number;
  kind: TermKind;
  order?: number;
}

export interface EntrySummary {
  id: number;
  type: 'post' | 'page';
  slug: string;
  path: string;
  title: string;
  speaker: string | null;
  date: string | null;
  excerpt: string;
  image: ImageRef | null;
  tags: number[];
  categories: number[];
  views: number;
}

export interface Entry extends EntrySummary {
  modified: string | null;
  html: string;
  hasContactForm: boolean;
  isEmpty: boolean;
  sessionTagId: number | null;
  related: EntrySummary[];
}

export interface ContentIndex {
  entries: EntrySummary[];
  terms: Term[];
}

export interface SearchRecord {
  /** id */
  i: number;
  /** title */
  t: string;
  /** speaker */
  s: string;
  /** tag names */
  g: string;
  /** plain text */
  x: string;
}

/** An entry card together with the terms needed to label it. */
export interface EntryCard extends EntrySummary {
  sessionTerm: Term | null;
}

export interface EntryView {
  entry: Entry;
  terms: Term[];
}

export interface ListingView {
  title: string;
  description: string;
  term: Term | null;
  basePath: string;
  page: number;
  totalPages: number;
  total: number;
  items: EntryCard[];
}

export interface HomeView {
  page: Entry | null;
  popular: EntryCard[];
  sessions: Term[];
  seasons: Term[];
  topics: Term[];
  stats: { posts: number; sessions: number; speakers: number };
}

export interface TagsView {
  seasons: Term[];
  sessions: Term[];
  topics: Term[];
  people: Term[];
  categories: Term[];
}

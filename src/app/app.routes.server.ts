import { inject } from '@angular/core';
import { RenderMode, ServerRoute } from '@angular/ssr';
import { ContentService, ListingKind } from './core/content.service';

async function termParams(taxonomy: 'post_tag' | 'category') {
  const terms = await inject(ContentService).allTerms();
  return terms.filter((t) => t.taxonomy === taxonomy).map((t) => ({ slug: t.slug }));
}

async function termPageParams(kind: ListingKind, taxonomy: 'post_tag' | 'category') {
  const content = inject(ContentService);
  const params: { slug: string; page: string }[] = [];
  for (const term of (await content.allTerms()).filter((t) => t.taxonomy === taxonomy)) {
    const pages = await content.pageCount(kind, term.slug);
    for (let page = 2; page <= pages; page++) params.push({ slug: term.slug, page: String(page) });
  }
  return params;
}

/** Every known URL is prerendered at build time; anything else falls back to client rendering. */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'posts', renderMode: RenderMode.Prerender },
  {
    path: 'posts/page/:page',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const pages = await inject(ContentService).pageCount('all', null);
      return Array.from({ length: pages - 1 }, (_, i) => ({ page: String(i + 2) }));
    },
  },
  { path: 'tag/:slug', renderMode: RenderMode.Prerender, getPrerenderParams: () => termParams('post_tag') },
  { path: 'tag/:slug/page/:page', renderMode: RenderMode.Prerender, getPrerenderParams: () => termPageParams('tag', 'post_tag') },
  { path: 'category/:slug', renderMode: RenderMode.Prerender, getPrerenderParams: () => termParams('category') },
  {
    path: 'category/:slug/page/:page',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: () => termPageParams('category', 'category'),
  },
  { path: 'tags', renderMode: RenderMode.Prerender },
  { path: 'search', renderMode: RenderMode.Prerender },
  {
    path: ':slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const content = inject(ContentService);
      const site = await content.loadSite();
      const entries = await content.allEntries();
      return entries.filter((e) => e.id !== site.homeId).map((e) => ({ slug: e.slug }));
    },
  },
  { path: '**', renderMode: RenderMode.Client },
];

import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { ContentService, ListingKind, describeTerm } from './content.service';
import { EntryView, HomeView, ListingView, TagsView, Term } from './content.models';
import { Breadcrumb, SeoService } from './seo.service';

const termCrumb = (term: Term): Breadcrumb => ({
  name: term.name,
  path: `/${term.taxonomy === 'category' ? 'category' : 'tag'}/${encodeURIComponent(term.slug)}`,
});

// Note: inject() is only available synchronously, so every resolver injects before its first await.

export const homeResolver: ResolveFn<HomeView> = async () => {
  const [content, seo] = [inject(ContentService), inject(SeoService)];
  const view = await content.home();
  seo.update({ path: '/', image: view.page?.image?.src });
  return view;
};

export const entryResolver: ResolveFn<EntryView | null> = async (route) => {
  const [content, seo] = [inject(ContentService), inject(SeoService)];
  const slug = route.paramMap.get('slug') ?? '';
  const view = await content.entry(slug);
  if (!view) {
    seo.update({ title: 'הדף לא נמצא', path: `/${encodeURIComponent(slug)}`, noIndex: true });
    return null;
  }
  const { entry } = view;
  // Same trail as the visible breadcrumbs on the entry page
  const trail = (['season', 'session'] as const)
    .map((kind) => view.terms.find((t) => t.kind === kind))
    .filter((t): t is Term => !!t)
    .map(termCrumb);
  seo.update({
    title: entry.speaker ? `${entry.title} | ${entry.speaker}` : entry.title,
    description: entry.excerpt,
    path: entry.path,
    image: entry.image?.src,
    type: entry.type === 'post' ? 'article' : 'website',
    noIndex: entry.isEmpty,
    breadcrumbs: [...trail, { name: entry.title, path: entry.path }],
  });
  return view;
};

export const listingResolver: ResolveFn<ListingView | null> = async (route) => {
  const [content, seo] = [inject(ContentService), inject(SeoService)];
  const kind = route.data['kind'] as ListingKind;
  const slug = route.paramMap.get('slug');
  const page = Number(route.paramMap.get('page') ?? 1);
  const view = await content.listing(kind, slug, page);
  if (!view) {
    seo.update({ title: 'הדף לא נמצא', path: '/404', noIndex: true });
    return null;
  }
  seo.update({
    title: view.page > 1 ? `${view.title} – עמוד ${view.page}` : view.title,
    description: view.term ? describeTerm(view.term) : view.description,
    path: view.page > 1 ? `${view.basePath}/page/${view.page}` : view.basePath,
    breadcrumbs: view.term
      ? [{ name: 'מפתח נושאים', path: '/tags' }, termCrumb(view.term)]
      : [{ name: view.title, path: '/posts' }],
  });
  return view;
};

export const tagsResolver: ResolveFn<TagsView> = async () => {
  const [content, seo] = [inject(ContentService), inject(SeoService)];
  const view = await content.tags();
  seo.update({
    title: 'מפתח נושאים, מושבים ודוברות',
    description: 'כל הנושאים, המושבים והדוברות שהשתתפו בפרלמנט נשים',
    path: '/tags',
    breadcrumbs: [{ name: 'מפתח נושאים', path: '/tags' }],
  });
  return view;
};

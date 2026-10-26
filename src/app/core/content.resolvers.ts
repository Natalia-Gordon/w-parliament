import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { ContentService, ListingKind, describeTerm } from './content.service';
import { EntryView, HomeView, ListingView, TagsView } from './content.models';
import { SeoService } from './seo.service';

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
  seo.update({
    title: entry.speaker ? `${entry.title} | ${entry.speaker}` : entry.title,
    description: entry.excerpt,
    path: entry.path,
    image: entry.image?.src,
    type: entry.type === 'post' ? 'article' : 'website',
    noIndex: entry.isEmpty,
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
  });
  return view;
};

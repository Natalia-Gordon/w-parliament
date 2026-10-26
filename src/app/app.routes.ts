import { Routes } from '@angular/router';
import { entryResolver, homeResolver, listingResolver, tagsResolver } from './core/content.resolvers';

const listingPage = () => import('./pages/listing/listing-page').then((m) => m.ListingPage);

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home-page').then((m) => m.HomePage),
    resolve: { view: homeResolver },
  },
  { path: 'posts', loadComponent: listingPage, data: { kind: 'all' }, resolve: { view: listingResolver } },
  { path: 'posts/page/:page', loadComponent: listingPage, data: { kind: 'all' }, resolve: { view: listingResolver } },
  { path: 'tag/:slug', loadComponent: listingPage, data: { kind: 'tag' }, resolve: { view: listingResolver } },
  { path: 'tag/:slug/page/:page', loadComponent: listingPage, data: { kind: 'tag' }, resolve: { view: listingResolver } },
  { path: 'category/:slug', loadComponent: listingPage, data: { kind: 'category' }, resolve: { view: listingResolver } },
  { path: 'category/:slug/page/:page', loadComponent: listingPage, data: { kind: 'category' }, resolve: { view: listingResolver } },
  {
    path: 'tags',
    loadComponent: () => import('./pages/tags/tags-page').then((m) => m.TagsPage),
    resolve: { view: tagsResolver },
  },
  {
    path: 'search',
    loadComponent: () => import('./pages/search/search-page').then((m) => m.SearchPage),
  },
  {
    path: ':slug',
    loadComponent: () => import('./pages/entry/entry-page').then((m) => m.EntryPage),
    resolve: { view: entryResolver },
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];

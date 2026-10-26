import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ContentService } from './content.service';

export interface SeoData {
  title?: string;
  description?: string;
  /** Path of the page (already URL-encoded), e.g. `/tag/%D7%90` */
  path: string;
  image?: string | null;
  type?: 'website' | 'article';
  noIndex?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly content = inject(ContentService);

  update(data: SeoData): void {
    const site = this.content.site();
    const siteName = site?.name ?? 'פרלמנט נשים';
    const baseUrl = site?.url ?? '';
    const fullTitle = data.title ? `${data.title} | ${siteName}` : `${siteName} – ${site?.tagline ?? ''}`.replace(/\s–\s$/, '');
    const description = truncate(data.description || site?.description || '', 300);
    const url = `${baseUrl}${data.path === '/' ? '' : data.path}` || '/';
    const image = data.image ?? site?.logo?.src ?? null;

    this.title.setTitle(fullTitle);
    this.setName('description', description);
    this.setName('robots', data.noIndex ? 'noindex, follow' : 'index, follow');
    this.setProperty('og:site_name', siteName);
    this.setProperty('og:locale', (site?.locale ?? 'he-IL').replace('-', '_'));
    this.setProperty('og:type', data.type ?? 'website');
    this.setProperty('og:title', data.title ?? siteName);
    this.setProperty('og:description', description);
    this.setProperty('og:url', url);
    if (image) this.setProperty('og:image', image.startsWith('http') ? image : `${baseUrl}${image}`);
    else this.meta.removeTag('property="og:image"');
    this.setName('twitter:card', image ? 'summary_large_image' : 'summary');
    this.setCanonical(url);
  }

  private setName(name: string, content: string): void {
    this.meta.updateTag({ name, content });
  }

  private setProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content });
  }

  private setCanonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

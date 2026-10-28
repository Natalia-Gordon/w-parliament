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
  /** Trail below the home page; rendered as schema.org BreadcrumbList JSON-LD. */
  breadcrumbs?: Breadcrumb[];
}

export interface Breadcrumb {
  name: string;
  /** URL-encoded path, e.g. `/tag/%D7%90` */
  path: string;
}

const BREADCRUMBS_SCRIPT_ID = 'ld-breadcrumbs';

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
    this.setBreadcrumbs(data.breadcrumbs ?? [], baseUrl);
  }

  private setBreadcrumbs(trail: Breadcrumb[], baseUrl: string): void {
    this.document.getElementById(BREADCRUMBS_SCRIPT_ID)?.remove();
    if (!trail.length) return;

    const items = [{ name: 'דף הבית', path: '/' }, ...trail].map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: `${baseUrl}${crumb.path === '/' ? '/' : crumb.path}`,
    }));
    const script = this.document.createElement('script');
    script.id = BREADCRUMBS_SCRIPT_ID;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items }).replace(
      /</g,
      '\\u003c',
    );
    this.document.head.appendChild(script);
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

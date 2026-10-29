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
const SITE_SCRIPT_ID = 'ld-site';

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
    this.setSiteIdentity();
  }

  /** Site-wide JSON-LD: the WebSite and the person who created and maintains it. */
  private setSiteIdentity(): void {
    const site = this.content.site();
    const maintainer = site?.maintainer;
    if (!site || !maintainer || this.document.getElementById(SITE_SCRIPT_ID)) return;

    this.setName('author', `${maintainer.name} (${maintainer.alternateName})`);
    this.setName('designer', `${maintainer.name} (${maintainer.alternateName}), ${maintainer.jobTitle}`);

    const personId = `${site.url}/#maintainer`;
    const graph = [
      {
        '@type': 'WebSite',
        '@id': `${site.url}/#website`,
        url: `${site.url}/`,
        name: site.name,
        description: site.tagline,
        inLanguage: site.locale,
        creator: { '@id': personId },
        maintainer: { '@id': personId },
      },
      {
        '@type': 'Person',
        '@id': personId,
        name: maintainer.name,
        alternateName: maintainer.alternateName,
        jobTitle: [maintainer.jobTitle, maintainer.jobTitleEn],
        description: maintainer.description,
        email: `mailto:${maintainer.email}`,
        knowsAbout: maintainer.knowsAbout,
        knowsLanguage: ['he', 'en'],
        sameAs: maintainer.sameAs,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'technical support',
          description: `שאלות בנושאי ${maintainer.contactTopics} של האתר`,
          email: maintainer.email,
          ...(maintainer.telephone ? { telephone: maintainer.telephone } : {}),
          ...(maintainer.whatsappUrl ? { url: maintainer.whatsappUrl } : {}),
          availableLanguage: ['he', 'en'],
        },
      },
    ];
    this.appendJsonLd(SITE_SCRIPT_ID, { '@context': 'https://schema.org', '@graph': graph });
  }

  private appendJsonLd(id: string, data: unknown): void {
    const script = this.document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    this.document.head.appendChild(script);
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
    this.appendJsonLd(BREADCRUMBS_SCRIPT_ID, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items });
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

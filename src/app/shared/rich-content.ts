import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { LightboxService } from './lightbox/lightbox.service';

/**
 * Renders WordPress HTML. The markup is generated and cleaned at build time by
 * scripts/wxr-import.mjs (scripts, event handlers and javascript: URLs removed),
 * so it is trusted here to keep inline styles and video embeds intact.
 * Styling lives in the global `.prose` styles because the HTML is not part of a template.
 */
@Component({
  selector: 'app-rich-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'prose', '[innerHTML]': 'safeHtml()', '(click)': 'onClick($event)' },
  template: '',
})
export class RichContent {
  readonly html = input.required<string>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly lightbox = inject(LightboxService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly safeHtml = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.html()));

  protected onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest('a');
    if (!anchor || !this.host.nativeElement.contains(anchor)) return;

    if (anchor.dataset['lightbox']) {
      event.preventDefault();
      this.openLightbox(anchor);
      return;
    }

    const href = anchor.getAttribute('href');
    if (!href || anchor.target === '_blank' || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/wp-content/')) return;
    event.preventDefault();
    void this.router.navigateByUrl(href);
  }

  private openLightbox(anchor: HTMLAnchorElement): void {
    const gallery = anchor.closest('[data-gallery]');
    const anchors = gallery ? Array.from(gallery.querySelectorAll<HTMLAnchorElement>('a[data-lightbox]')) : [anchor];
    const images = anchors.map((a) => ({
      src: a.getAttribute('href') ?? '',
      caption: a.dataset['caption'] ?? a.querySelector('img')?.getAttribute('alt') ?? '',
    }));
    this.lightbox.open(images, anchors.indexOf(anchor));
  }
}

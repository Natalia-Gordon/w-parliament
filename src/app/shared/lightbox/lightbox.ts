import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { LightboxService } from './lightbox.service';

@Component({
  selector: 'app-lightbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    @if (lightbox.current(); as image) {
      <div class="lightbox" role="dialog" aria-modal="true" aria-label="תצוגת תמונה" (click)="lightbox.close()">
        <figure class="lightbox__figure" (click)="$event.stopPropagation()">
          <img [src]="image.src" [alt]="image.caption" />
          @if (image.caption || lightbox.images().length > 1) {
            <figcaption>
              <span>{{ image.caption }}</span>
              @if (lightbox.images().length > 1) {
                <span class="lightbox__counter">{{ lightbox.index() + 1 }} מתוך {{ lightbox.images().length }}</span>
              }
            </figcaption>
          }
        </figure>
        <button #closeButton type="button" class="lightbox__btn lightbox__close" aria-label="סגירה" (click)="lightbox.close()">✕</button>
        @if (lightbox.images().length > 1) {
          <button type="button" class="lightbox__btn lightbox__prev" aria-label="התמונה הקודמת" (click)="$event.stopPropagation(); lightbox.previous()">›</button>
          <button type="button" class="lightbox__btn lightbox__next" aria-label="התמונה הבאה" (click)="$event.stopPropagation(); lightbox.next()">‹</button>
        }
      </div>
    }
  `,
  styleUrl: './lightbox.scss',
})
export class Lightbox {
  protected readonly lightbox = inject(LightboxService);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  constructor() {
    effect(() => this.closeButton()?.nativeElement.focus());
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.lightbox.isOpen()) return;
    // RTL: the left arrow advances to the next image
    if (event.key === 'Escape') this.lightbox.close();
    else if (event.key === 'ArrowLeft') this.lightbox.next();
    else if (event.key === 'ArrowRight') this.lightbox.previous();
    else return;
    event.preventDefault();
  }
}

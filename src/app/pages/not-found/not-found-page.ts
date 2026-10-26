import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="container container--narrow not-found">
      <p class="not-found__code" aria-hidden="true">404</p>
      <h1>הדף שחיפשתן לא נמצא</h1>
      <p>ייתכן שהקישור שגוי או שהדף הועבר. אפשר לחפש באתר או לחזור לדף הבית.</p>
      <div class="not-found__actions">
        <a class="btn btn--primary" routerLink="/">לדף הבית</a>
        <a class="btn btn--outline" routerLink="/search">חיפוש באתר</a>
      </div>
    </section>
  `,
  styles: `
    .not-found {
      padding-block: 5rem;
      text-align: center;
    }

    .not-found__code {
      margin: 0;
      font-size: clamp(5rem, 18vw, 9rem);
      font-weight: 800;
      line-height: 1;
      color: var(--brand-red);
      opacity: 0.85;
    }

    h1 {
      color: var(--brand-navy);
    }

    .not-found__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.75rem;
      margin-top: 2rem;
    }
  `,
})
export class NotFoundPage {
  constructor() {
    inject(SeoService).update({ title: 'הדף לא נמצא', path: inject(Router).url.split('?')[0], noIndex: true });
  }
}

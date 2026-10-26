import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RoutePathPipe } from '../route-path.pipe';

type PageLink = { page: number; path: string } | { gap: true };

@Component({
  selector: 'app-pagination',
  imports: [RouterLink, RoutePathPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (totalPages() > 1) {
      <nav class="pagination" aria-label="ניווט בין עמודים">
        @if (page() > 1) {
          <a class="pagination__step" [routerLink]="pathFor(page() - 1) | routePath" rel="prev">→ הקודם</a>
        }
        <ol class="pagination__pages">
          @for (link of links(); track $index) {
            <li>
              @if ('gap' in link) {
                <span class="pagination__gap">…</span>
              } @else if (link.page === page()) {
                <span class="pagination__page is-current" aria-current="page">{{ link.page }}</span>
              } @else {
                <a class="pagination__page" [routerLink]="link.path | routePath">{{ link.page }}</a>
              }
            </li>
          }
        </ol>
        @if (page() < totalPages()) {
          <a class="pagination__step" [routerLink]="pathFor(page() + 1) | routePath" rel="next">הבא ←</a>
        }
      </nav>
    }
  `,
  styleUrl: './pagination.scss',
})
export class Pagination {
  readonly basePath = input.required<string>();
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();

  protected readonly links = computed<PageLink[]>(() => {
    const total = this.totalPages();
    const current = this.page();
    const pages = [...new Set([1, total, current - 1, current, current + 1])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const links: PageLink[] = [];
    pages.forEach((p, i) => {
      if (i > 0 && p - pages[i - 1] > 1) links.push({ gap: true });
      links.push({ page: p, path: this.pathFor(p) });
    });
    return links;
  });

  protected pathFor(page: number): string {
    return page <= 1 ? this.basePath() : `${this.basePath()}/page/${page}`;
  }
}

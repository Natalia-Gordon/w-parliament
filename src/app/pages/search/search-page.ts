import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ContentService } from '../../core/content.service';
import { SeoService } from '../../core/seo.service';
import { RoutePathPipe } from '../../shared/route-path.pipe';
import { SearchEngine } from './search-engine';

const PAGE = 30;

@Component({
  selector: 'app-search-page',
  imports: [RouterLink, RoutePathPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage {
  private readonly content = inject(ContentService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly query = signal('');
  protected readonly engine = signal<SearchEngine | null>(null);
  protected readonly loadError = signal(false);
  protected readonly visible = signal(PAGE);

  protected readonly results = computed(() => this.engine()?.search(this.query()) ?? []);
  protected readonly shown = computed(() => this.results().slice(0, this.visible()));

  private debounce: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(SeoService).update({ title: 'חיפוש באתר', description: 'חיפוש בהרצאות, בתקצירים ובמאמרים של פרלמנט נשים', path: '/search', noIndex: true });

    // The search index is only loaded in the browser, after hydration
    afterNextRender(() => {
      this.query.set(this.route.snapshot.queryParamMap.get('q') ?? '');
      this.content
        .searchData()
        .then(({ records, cards }) => this.engine.set(new SearchEngine(records, cards)))
        .catch(() => this.loadError.set(true));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.debounce));
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.query.set(value);
      this.visible.set(PAGE);
      void this.router.navigate([], { queryParams: { q: value.trim() || null }, replaceUrl: true });
    }, 200);
  }

  protected showMore(): void {
    this.visible.update((v) => v + PAGE);
  }
}

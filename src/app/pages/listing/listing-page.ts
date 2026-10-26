import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListingView, TermKind } from '../../core/content.models';
import { EntryCard } from '../../shared/entry-card/entry-card';
import { Pagination } from '../../shared/pagination/pagination';
import { NotFoundPage } from '../not-found/not-found-page';

const KIND_LABELS: Record<TermKind, string> = {
  session: 'מושב',
  season: 'שנת פעילות',
  person: 'דוברת / דובר',
  topic: 'נושא',
  category: 'קטגוריה',
};

@Component({
  selector: 'app-listing-page',
  imports: [RouterLink, EntryCard, Pagination, NotFoundPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './listing-page.html',
})
export class ListingPage {
  readonly view = input<ListingView | null>(null);

  protected readonly kindLabel = computed(() => {
    const term = this.view()?.term;
    return term ? KIND_LABELS[term.kind] : 'ארכיון';
  });
}

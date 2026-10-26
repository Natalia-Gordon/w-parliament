import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EntryView, Term, TermKind } from '../../core/content.models';
import { ContactForm } from '../../shared/contact-form/contact-form';
import { EntryCard } from '../../shared/entry-card/entry-card';
import { RichContent } from '../../shared/rich-content';
import { NotFoundPage } from '../not-found/not-found-page';

const TERM_GROUPS: { kind: TermKind; label: string }[] = [
  { kind: 'session', label: 'מושב' },
  { kind: 'season', label: 'שנת פעילות' },
  { kind: 'person', label: 'דוברות ודוברים' },
  { kind: 'topic', label: 'נושאים' },
];

@Component({
  selector: 'app-entry-page',
  imports: [RouterLink, RichContent, EntryCard, ContactForm, NotFoundPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './entry-page.html',
  styleUrl: './entry-page.scss',
})
export class EntryPage {
  readonly view = input<EntryView | null>(null);

  protected readonly entry = computed(() => this.view()?.entry ?? null);

  protected readonly season = computed(() => this.view()?.terms.find((t) => t.kind === 'season') ?? null);
  protected readonly session = computed(() => this.view()?.terms.find((t) => t.kind === 'session') ?? null);

  protected readonly termGroups = computed(() => {
    const terms = this.view()?.terms ?? [];
    return TERM_GROUPS.map((group) => ({ ...group, terms: terms.filter((t) => t.kind === group.kind) })).filter(
      (group) => group.terms.length,
    );
  });

  protected readonly relatedCards = computed(() =>
    (this.entry()?.related ?? []).map((summary) => ({ ...summary, sessionTerm: null as Term | null })),
  );
}

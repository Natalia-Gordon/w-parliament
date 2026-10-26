import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TagsView, Term } from '../../core/content.models';

@Component({
  selector: 'app-tags-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tags-page.html',
  styleUrl: './tags-page.scss',
})
export class TagsPage {
  readonly view = input.required<TagsView>();

  protected readonly filter = signal('');

  protected readonly people = computed(() => this.filtered(this.view().people));
  protected readonly topics = computed(() => this.filtered(this.view().topics));

  protected onFilter(event: Event): void {
    this.filter.set((event.target as HTMLInputElement).value);
  }

  private filtered(terms: Term[]): Term[] {
    const query = this.filter().trim();
    return query ? terms.filter((t) => t.name.includes(query)) : terms;
  }
}

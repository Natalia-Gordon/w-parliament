import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content.service';
import { HomeView } from '../../core/content.models';
import { EntryCard } from '../../shared/entry-card/entry-card';
import { RichContent } from '../../shared/rich-content';
import { RoutePathPipe } from '../../shared/route-path.pipe';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, EntryCard, RichContent, RoutePathPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  readonly view = input.required<HomeView>();
  protected readonly site = inject(ContentService).site;

  /** `מושבי תשס"ה (2004-2005)` -> label `תשס"ה`, years `2004-2005` */
  protected seasonParts(name: string): { label: string; years: string } {
    const match = name.replace(/^מושבי\s*/, '').match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    return match ? { label: match[1], years: match[2] } : { label: name, years: '' };
  }
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EntryCard as EntryCardData } from '../../core/content.models';
import { RoutePathPipe } from '../route-path.pipe';

@Component({
  selector: 'app-entry-card',
  imports: [RouterLink, RoutePathPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './entry-card.html',
  styleUrl: './entry-card.scss',
})
export class EntryCard {
  readonly card = input.required<EntryCardData>();
  readonly headingLevel = input<2 | 3>(3);
}

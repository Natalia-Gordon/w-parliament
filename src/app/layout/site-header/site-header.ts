import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { ContentService } from '../../core/content.service';
import { MenuItem } from '../../core/content.models';
import { RoutePathPipe } from '../../shared/route-path.pipe';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive, RoutePathPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
  host: { '(document:keydown.escape)': 'closeAll()' },
})
export class SiteHeader {
  private readonly content = inject(ContentService);

  protected readonly site = this.content.site;
  protected readonly menu = computed(() => this.site()?.menus.main ?? []);
  protected readonly menuOpen = signal(false);
  protected readonly expanded = signal<number | null>(null);

  constructor() {
    const subscription = inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.closeAll());
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  protected hasGrandchildren(item: MenuItem): boolean {
    return !!item.children?.some((c) => c.children?.length);
  }

  protected toggle(index: number): void {
    this.expanded.update((current) => (current === index ? null : index));
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
    this.expanded.set(null);
  }

  protected closeAll(): void {
    this.menuOpen.set(false);
    this.expanded.set(null);
  }
}

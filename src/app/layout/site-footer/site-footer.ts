import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content.service';
import { RoutePathPipe } from '../../shared/route-path.pipe';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, RoutePathPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.scss',
})
export class SiteFooter {
  protected readonly site = inject(ContentService).site;
  protected readonly mainLinks = computed(() => (this.site()?.menus.main ?? []).filter((item) => item.path !== '/'));
  protected readonly archive = computed(() => this.mainLinks().find((item) => item.path === '/posts')?.children ?? []);
}

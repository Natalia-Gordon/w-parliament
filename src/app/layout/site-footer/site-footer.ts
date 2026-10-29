import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content.service';
import { RoutePathPipe } from '../../shared/route-path.pipe';

type ContactKind = 'github' | 'linkedin' | 'whatsapp' | 'email';

interface ContactLink {
  kind: ContactKind;
  label: string;
  url: string;
}

const PROFILE_KINDS: { kind: ContactKind; label: string; host: RegExp }[] = [
  { kind: 'github', label: 'GitHub', host: /(^|\.)github\.com$/ },
  { kind: 'linkedin', label: 'LinkedIn', host: /(^|\.)linkedin\.com$/ },
];

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

  protected readonly contactLinks = computed<ContactLink[]>(() => {
    const maintainer = this.site()?.maintainer;
    if (!maintainer) return [];
    const profiles = maintainer.sameAs.flatMap((url) => {
      const host = URL.canParse(url) ? new URL(url).hostname : '';
      const match = PROFILE_KINDS.find((p) => p.host.test(host));
      return match ? [{ kind: match.kind, label: `${maintainer.name} ב-${match.label}`, url }] : [];
    });
    const subject = maintainer.emailSubject ? `?subject=${encodeURIComponent(maintainer.emailSubject)}` : '';
    return [
      ...profiles,
      ...(maintainer.whatsappUrl ? [{ kind: 'whatsapp' as const, label: `שליחת הודעת WhatsApp ל${maintainer.name}`, url: maintainer.whatsappUrl }] : []),
      { kind: 'email', label: `שליחת מייל ל${maintainer.name} (${maintainer.email})`, url: `mailto:${maintainer.email}${subject}` },
    ];
  });
}

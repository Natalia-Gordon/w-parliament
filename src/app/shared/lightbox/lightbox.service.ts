import { Injectable, computed, signal } from '@angular/core';

export interface LightboxImage {
  src: string;
  caption: string;
}

@Injectable({ providedIn: 'root' })
export class LightboxService {
  readonly images = signal<LightboxImage[]>([]);
  readonly index = signal(0);
  readonly isOpen = computed(() => this.images().length > 0);
  readonly current = computed(() => this.images()[this.index()] ?? null);

  open(images: LightboxImage[], index = 0): void {
    this.images.set(images);
    this.index.set(Math.min(Math.max(index, 0), images.length - 1));
  }

  close(): void {
    this.images.set([]);
  }

  next(): void {
    const count = this.images().length;
    if (count) this.index.update((i) => (i + 1) % count);
  }

  previous(): void {
    const count = this.images().length;
    if (count) this.index.update((i) => (i - 1 + count) % count);
  }
}

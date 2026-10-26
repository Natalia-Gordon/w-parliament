import { InjectionToken } from '@angular/core';

/** Reads a JSON file from the generated `content/` folder. */
export type ContentReader = <T>(path: string) => Promise<T>;

export const CONTENT_READER = new InjectionToken<ContentReader>('CONTENT_READER', {
  providedIn: 'root',
  factory: () => async <T>(path: string) => {
    const response = await fetch(`/content/${path}`);
    if (!response.ok) throw new Error(`Failed to load content/${path}: ${response.status}`);
    return (await response.json()) as T;
  },
});

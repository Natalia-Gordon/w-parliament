import { Pipe, PipeTransform } from '@angular/core';

/**
 * Content paths are stored URL-encoded (e.g. `/%D7%9E%D7%99`).
 * `routerLink` encodes its segments itself, so it needs the decoded form.
 */
@Pipe({ name: 'routePath' })
export class RoutePathPipe implements PipeTransform {
  transform(path: string): string {
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  }
}

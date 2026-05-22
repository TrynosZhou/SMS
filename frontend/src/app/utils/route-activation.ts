import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

export interface RouteActivationOptions {
  /** When true (default), only match the path exactly (no child routes). */
  exact?: boolean;
  /**
   * When true (default), run reload when the component is first attached.
   * Uses multiple timing strategies so production navigations still load on first click.
   */
  fireOnAttach?: boolean;
}

export interface PageLoadOptions extends RouteActivationOptions {
  /** Delay before load (ms). Default 0 — immediate load after route is active. */
  deferMs?: number;
}

function normalizePath(url: string): string {
  const path = (url || '').split('?')[0].split('#')[0];
  if (!path || path === '/') return '/';
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

function pathMatches(urlPath: string, path: string, exact: boolean): boolean {
  const current = normalizePath(urlPath);
  const target = normalizePath(path);
  return exact ? current === target : current === target || current.startsWith(target + '/');
}

function scheduleLoad(load: () => void, deferMs: number): void {
  const run = () => {
    try {
      load();
    } catch (e) {
      console.error('Page load handler failed:', e);
    }
  };
  if (deferMs > 0) {
    setTimeout(run, deferMs);
    return;
  }
  queueMicrotask(run);
}

/**
 * Re-run a load function when the user navigates to a route, and when the
 * component is first attached while already on that route.
 */
export function onRouteActivated(
  router: Router,
  destroy$: Subject<void>,
  path: string,
  reload: () => void,
  options?: RouteActivationOptions
): void {
  const exact = options?.exact !== false;
  const fireOnAttach = options?.fireOnAttach !== false;

  const tryReload = (urlPath: string) => {
    if (pathMatches(urlPath, path, exact)) {
      reload();
    }
  };

  if (fireOnAttach) {
    const current = normalizePath(router.url || '');
    tryReload(current);
    // Production: router.url can lag behind NavigationEnd on first paint
    queueMicrotask(() => tryReload(normalizePath(router.url || '')));
    setTimeout(() => tryReload(normalizePath(router.url || '')), 0);
  }

  router.events
    .pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntil(destroy$)
    )
    .subscribe((e) => {
      const urlPath = normalizePath(e.urlAfterRedirects || e.url || '');
      tryReload(urlPath);
    });
}

/**
 * Load page data when the route is active (including first attach after menu navigation).
 * Prefer this over calling load() only in ngOnInit — NavigationEnd may have already fired.
 */
export function activatePageLoad(
  router: Router,
  destroy$: Subject<void>,
  path: string,
  load: () => void,
  options?: PageLoadOptions
): void {
  const deferMs = options?.deferMs ?? 0;
  onRouteActivated(router, destroy$, path, () => scheduleLoad(load, deferMs), {
    exact: options?.exact,
    fireOnAttach: options?.fireOnAttach ?? true
  });
}

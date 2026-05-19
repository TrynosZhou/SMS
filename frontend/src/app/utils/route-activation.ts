import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

export interface RouteActivationOptions {
  /** When true (default), only match the path exactly (no child routes). */
  exact?: boolean;
  /**
   * When true (default), run reload immediately if the router is already on this path.
   * Use when the component is created after NavigationEnd (e.g. login redirect to dashboard).
   */
  fireOnAttach?: boolean;
}

export interface PageLoadOptions extends RouteActivationOptions {
  /** Delay before load (ms). Reduces contention with settings/auth requests. Default 80. */
  deferMs?: number;
}

function pathMatches(urlPath: string, path: string, exact: boolean): boolean {
  return exact ? urlPath === path : urlPath === path || urlPath.startsWith(path + '/');
}

/**
 * Re-run a load function when the user navigates to a route, and optionally when the
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
    const current = (router.url || '').split('?')[0];
    tryReload(current);
  }

  router.events
    .pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntil(destroy$)
    )
    .subscribe((e) => {
      const urlPath = (e.urlAfterRedirects || e.url || '').split('?')[0];
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
  const deferMs = options?.deferMs ?? 80;
  const scheduled = () => setTimeout(() => load(), deferMs);
  onRouteActivated(router, destroy$, path, scheduled, {
    exact: options?.exact,
    fireOnAttach: options?.fireOnAttach ?? true
  });
}

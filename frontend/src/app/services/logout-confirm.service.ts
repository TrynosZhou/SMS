import { ApplicationRef, Injectable } from '@angular/core';

/**
 * Coordinates the in-app logout confirmation modal (replaces window.confirm).
 */
@Injectable({
  providedIn: 'root',
})
export class LogoutConfirmService {
  visible = false;
  private resolveFn: ((confirmed: boolean) => void) | null = null;

  constructor(private appRef: ApplicationRef) {}

  open(): Promise<boolean> {
    if (this.visible) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      this.resolveFn = resolve;
      this.visible = true;
      this.scheduleUiUpdate();
    });
  }

  confirm(): void {
    this.finish(true);
  }

  cancel(): void {
    this.finish(false);
  }

  private finish(confirmed: boolean): void {
    this.visible = false;
    const resolve = this.resolveFn;
    this.resolveFn = null;
    resolve?.(confirmed);
    this.scheduleUiUpdate();
  }

  /** Ensures AppComponent picks up visible changes when opened from AuthService. */
  private scheduleUiUpdate(): void {
    queueMicrotask(() => this.appRef.tick());
  }
}

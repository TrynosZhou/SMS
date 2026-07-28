import { ApplicationRef, Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface SuccessConfirmOptions {
  /** Green heading (default: Success!) */
  title?: string;
  /** Grey supporting detail under the title */
  message?: string;
  /** Pill button label (default: Ok) */
  okLabel?: string;
}

export interface SuccessConfirmState {
  visible: boolean;
  title: string;
  message: string;
  okLabel: string;
}

const DEFAULT_STATE: SuccessConfirmState = {
  visible: false,
  title: 'Success!',
  message: '',
  okLabel: 'Ok',
};

/**
 * System-wide success confirmation dialog
 * (green checkmark + title + detail + Ok), hosted in AppComponent.
 */
@Injectable({
  providedIn: 'root',
})
export class SuccessConfirmService {
  private readonly stateSubject = new BehaviorSubject<SuccessConfirmState>({
    ...DEFAULT_STATE,
  });

  /** Bind in AppComponent with async pipe so the overlay updates after async saves. */
  readonly state$ = this.stateSubject.asObservable();

  private resolveFn: (() => void) | null = null;

  constructor(
    private appRef: ApplicationRef,
    private ngZone: NgZone
  ) {}

  get visible(): boolean {
    return this.stateSubject.value.visible;
  }

  get title(): string {
    return this.stateSubject.value.title;
  }

  get message(): string {
    return this.stateSubject.value.message;
  }

  get okLabel(): string {
    return this.stateSubject.value.okLabel;
  }

  /**
   * Show the success confirmation dialog.
   * Resolves when the user clicks Ok (or dismisses the overlay).
   */
  show(options: SuccessConfirmOptions | string = {}): Promise<void> {
    const opts: SuccessConfirmOptions =
      typeof options === 'string' ? { message: options } : options || {};

    const title = (opts.title || 'Success!').trim() || 'Success!';
    const message = (opts.message || '').trim();
    const okLabel = (opts.okLabel || 'Ok').trim() || 'Ok';

    if (this.visible) {
      this.emitState({ title, message, okLabel });
      return new Promise<void>((resolve) => {
        const prev = this.resolveFn;
        this.resolveFn = () => {
          prev?.();
          resolve();
        };
      });
    }

    return new Promise<void>((resolve) => {
      this.resolveFn = resolve;
      this.emitState({ visible: true, title, message, okLabel });
    });
  }

  /** Shorthand: success title + detail message */
  success(message: string, title = 'Success!'): Promise<void> {
    return this.show({ title, message });
  }

  close(): void {
    if (!this.visible) return;
    const resolve = this.resolveFn;
    this.resolveFn = null;
    this.emitState({ ...DEFAULT_STATE });
    resolve?.();
  }

  private emitState(partial: Partial<SuccessConfirmState>): void {
    this.ngZone.run(() => {
      this.stateSubject.next({ ...this.stateSubject.value, ...partial });
      try {
        this.appRef.tick();
      } catch {
        /* ignore if app is tearing down */
      }
    });
  }
}

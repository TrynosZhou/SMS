import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly onlineSubject = new BehaviorSubject<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  /** Emits true when browser reports online. */
  readonly online$ = this.onlineSubject.asObservable();

  /** Short-lived banner text: "Connection is lost" / "Connection is restored". */
  readonly connectionMessage$ = new Subject<string>();

  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  bannerMessage = '';

  constructor(private ngZone: NgZone) {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  get isOnline(): boolean {
    return this.onlineSubject.value;
  }

  private handleOnline(): void {
    this.ngZone.run(() => {
      this.onlineSubject.next(true);
      this.showBanner('Connection is restored');
    });
  }

  private handleOffline(): void {
    this.ngZone.run(() => {
      this.onlineSubject.next(false);
      this.showBanner('Connection is lost');
    });
  }

  private showBanner(message: string): void {
    this.bannerMessage = message;
    this.connectionMessage$.next(message);
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
    }
    this.messageTimer = setTimeout(() => {
      this.bannerMessage = '';
    }, 6000);
  }

  /** Treat HTTP status 0 as offline / server unreachable. */
  isNetworkError(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    return status === 0 || !this.isOnline;
  }
}

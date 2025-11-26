import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class SessionTimeoutService implements OnDestroy {
  private readonly inactivityTimeoutMs = (environment.sessionTimeoutMinutes || 30) * 60 * 1000;
  private readonly activityEvents = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private monitoring = false;
  private navigationSubscription?: Subscription;
  private resetHandler = () => this.resetTimer();

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private ngZone: NgZone,
    private router: Router,
    private authService: AuthService
  ) {}

  start(): void {
    if (this.monitoring || !this.authService.isAuthenticated()) {
      this.resetTimer();
      return;
    }

    this.monitoring = true;
    this.attachActivityListeners();
    this.watchNavigation();
    this.resetTimer();
  }

  stop(): void {
    if (!this.monitoring) {
      return;
    }
    this.monitoring = false;
    this.clearTimer();
    this.detachActivityListeners();
    this.navigationSubscription?.unsubscribe();
    this.navigationSubscription = undefined;
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private attachActivityListeners() {
    this.activityEvents.forEach(event =>
      this.document.addEventListener(event, this.resetHandler, true)
    );
  }

  private detachActivityListeners() {
    this.activityEvents.forEach(event =>
      this.document.removeEventListener(event, this.resetHandler, true)
    );
  }

  private watchNavigation() {
    this.navigationSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.resetTimer());
  }

  private resetTimer() {
    if (!this.monitoring) {
      return;
    }
    this.clearTimer();
    this.ngZone.runOutsideAngular(() => {
      this.inactivityTimer = setTimeout(() => {
        this.ngZone.run(() => this.handleTimeout());
      }, this.inactivityTimeoutMs);
    });
  }

  private clearTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private handleTimeout() {
    this.stop();
    this.authService.logout('session-timeout');
  }
}


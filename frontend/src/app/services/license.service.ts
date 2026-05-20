import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface LicenseFeatureMeta {
  featureKey: string;
  displayName: string;
  description: string | null;
  granted: boolean;
}

export interface LicenseSnapshot {
  tierName: string | null;
  tierDisplayName: string | null;
  grantedFeatureKeys: string[];
  features: LicenseFeatureMeta[];
}

@Injectable({
  providedIn: 'root'
})
export class LicenseService {
  private apiUrl = environment.apiUrl;
  private snapshot: LicenseSnapshot | null = null;
  private grantedKeys = new Set<string>();
  private featureMeta = new Map<string, LicenseFeatureMeta>();
  private loaded = false;
  private loading = false;
  /** When true, UI treats all features as allowed (safe rollout / API unavailable). */
  private loadFailed = false;

  private readonly snapshotSubject = new BehaviorSubject<LicenseSnapshot | null>(null);
  readonly snapshot$ = this.snapshotSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.load().subscribe();
      } else {
        this.clear();
      }
    });
  }

  load(): Observable<LicenseSnapshot | null> {
    if (!this.authService.isAuthenticated()) {
      this.clear();
      return of(null);
    }

    if (this.loading) {
      return this.snapshot$.pipe(map((s) => s));
    }

    this.loading = true;
    this.loadFailed = false;
    return this.http.get<LicenseSnapshot>(`${this.apiUrl}/license/me`).pipe(
      tap((data) => this.applySnapshot(data)),
      map(() => this.snapshot),
      catchError((err) => {
        console.warn('[LicenseService] License check failed — allowing UI (fail-open):', err);
        this.loadFailed = true;
        this.loaded = true;
        this.snapshot = null;
        this.grantedKeys.clear();
        this.featureMeta.clear();
        this.snapshotSubject.next(null);
        return of(null);
      }),
      tap(() => {
        this.loading = false;
      })
    );
  }

  refresh(): Observable<LicenseSnapshot | null> {
    this.loaded = false;
    this.loading = false;
    this.loadFailed = false;
    return this.load();
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  isLoadFailed(): boolean {
    return this.loadFailed;
  }

  getSnapshot(): LicenseSnapshot | null {
    return this.snapshot;
  }

  getTierDisplayName(): string | null {
    return this.snapshot?.tierDisplayName ?? null;
  }

  hasFeature(featureKey: string): boolean {
    if (!featureKey) {
      return false;
    }
    if (this.authService.hasRole('superadmin') || this.authService.hasRole('admin')) {
      return true;
    }
    // Fail-open: show content until a successful license response denies access.
    if (this.loadFailed || !this.loaded) {
      return true;
    }
    return this.grantedKeys.has(featureKey.trim().toLowerCase());
  }

  getFeatureDisplayName(featureKey: string): string {
    const key = featureKey.trim().toLowerCase();
    const meta = this.featureMeta.get(key);
    if (meta?.displayName) {
      return meta.displayName;
    }
    return featureKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  getFeatureDescription(featureKey: string): string | null {
    const key = featureKey.trim().toLowerCase();
    return this.featureMeta.get(key)?.description ?? null;
  }

  private applySnapshot(data: LicenseSnapshot): void {
    this.snapshot = data;
    this.grantedKeys = new Set((data.grantedFeatureKeys || []).map((k) => k.toLowerCase()));
    this.featureMeta.clear();
    for (const f of data.features || []) {
      this.featureMeta.set(f.featureKey.toLowerCase(), f);
    }
    this.loaded = true;
    this.loadFailed = false;
    this.snapshotSubject.next(this.snapshot);
  }

  private clear(): void {
    this.snapshot = null;
    this.grantedKeys.clear();
    this.featureMeta.clear();
    this.loaded = false;
    this.loading = false;
    this.loadFailed = false;
    this.snapshotSubject.next(null);
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';

const REQUEST_TIMEOUT_MS = 30000;

export interface AdminFeature {
  id: string;
  featureKey: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface TierAssignedFeature {
  assignmentId: string;
  featureId: string;
  featureKey: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
  grantedAt?: string;
  grantedBy?: string | null;
  grantedByName?: string | null;
}

export interface LicenseTierView {
  id: string;
  tierName: string;
  displayName: string;
  description: string | null;
  features: TierAssignedFeature[];
}

export interface LicenseAuditEntry {
  id: string;
  action: string;
  createdAt: string;
  tierId: string | null;
  tierName: string | null;
  tierDisplayName: string | null;
  featureId: string | null;
  featureKey: string | null;
  featureDisplayName: string | null;
  performedBy: string | null;
  performedByName: string | null;
  metadata: Record<string, unknown> | null;
}

@Injectable({
  providedIn: 'root'
})
export class LicenseAdminService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private withTimeout<T>(obs: Observable<T>): Observable<T> {
    return obs.pipe(
      timeout(REQUEST_TIMEOUT_MS),
      catchError((err) => {
        if (err?.name === 'TimeoutError') {
          return throwError(() => ({
            error: { message: 'Request timed out. Check that the server is running.' }
          }));
        }
        return throwError(() => err);
      })
    );
  }

  listFeatures(): Observable<{ features: AdminFeature[] }> {
    return this.withTimeout(
      this.http.get<{ features: AdminFeature[] }>(`${this.apiUrl}/admin/features`)
    );
  }

  createFeature(payload: {
    featureKey: string;
    displayName: string;
    description?: string;
  }): Observable<{ feature: AdminFeature }> {
    return this.withTimeout(
      this.http.post<{ feature: AdminFeature }>(`${this.apiUrl}/admin/features`, payload)
    );
  }

  updateFeature(
    id: string,
    payload: Partial<{ displayName: string; description: string; isActive: boolean }>
  ): Observable<{ feature: AdminFeature }> {
    return this.withTimeout(
      this.http.patch<{ feature: AdminFeature }>(`${this.apiUrl}/admin/features/${id}`, payload)
    );
  }

  deactivateFeature(id: string): Observable<{ feature: AdminFeature }> {
    return this.withTimeout(
      this.http.delete<{ feature: AdminFeature }>(`${this.apiUrl}/admin/features/${id}`)
    );
  }

  listTiers(): Observable<{ tiers: LicenseTierView[] }> {
    return this.withTimeout(
      this.http.get<{ tiers: LicenseTierView[] }>(`${this.apiUrl}/admin/tiers`)
    );
  }

  grantTierFeature(tierId: string, featureId: string): Observable<unknown> {
    return this.withTimeout(
      this.http.post(`${this.apiUrl}/admin/tiers/${tierId}/features/${featureId}`, {})
    );
  }

  revokeTierFeature(tierId: string, featureId: string): Observable<unknown> {
    return this.withTimeout(
      this.http.delete(`${this.apiUrl}/admin/tiers/${tierId}/features/${featureId}`)
    );
  }

  getAuditLog(limit = 50): Observable<{ entries: LicenseAuditEntry[] }> {
    return this.withTimeout(
      this.http.get<{ entries: LicenseAuditEntry[] }>(`${this.apiUrl}/admin/license-audit`, {
        params: { limit: String(limit) }
      })
    );
  }
}

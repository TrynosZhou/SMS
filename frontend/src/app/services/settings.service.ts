import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  private handleError<T>(operation: string, fallback: T) {
    return (error: any): Observable<T> => {
      const status = error?.status;
      const msg = error?.error?.message || error?.message || error?.statusText || 'Unknown error';
      if (status === 0 || error?.message?.includes('Connection refused')) {
        console.warn(
          `[SettingsService] ${operation} failed: backend not reachable (status 0). ` +
          'Ensure the backend is running (e.g. npm run start in backend folder) and listening on port 3001.'
        );
        return of(fallback);
      }
      if (status === 401) {
        console.warn(`[SettingsService] ${operation} failed: 401 Unauthorized. Please log in.`);
      } else if (status === 504) {
        console.warn(
          `[SettingsService] ${operation} failed: 504 Gateway Timeout. ` +
          'The backend took too long to respond. Ensure the backend is running (npm start in backend folder), ' +
          'the database is up, and restart the Angular dev server (ng serve) so the proxy uses a longer timeout.'
        );
      } else {
        console.error(`[SettingsService] ${operation} failed: status ${status} - ${msg}`, error);
      }
      return of(fallback);
    };
  }

  getSettings(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings`).pipe(
      catchError(this.handleError('getSettings', {}))
    );
  }

  updateSettings(settings: any): Observable<any> {
    console.log('[SettingsService] Updating settings, API URL:', `${this.apiUrl}/settings`);
    return this.http.put(`${this.apiUrl}/settings`, settings).pipe(
      tap({
        next: (response) => {
          console.log('[SettingsService] ✅ Settings update response received:', response);
        },
        error: (error) => {
          console.error('[SettingsService] ❌ Error in updateSettings:', error);
        },
        complete: () => {
          console.log('[SettingsService] Settings update observable completed');
        }
      }),
      catchError((error) => {
        console.error('[SettingsService] Error caught in catchError:', error);
        throw error; // Re-throw to let component handle it
      })
    );
  }

  getActiveTerm(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings/active-term`).pipe(
      catchError(this.handleError('getActiveTerm', { activeTerm: null }))
    );
  }

  getYearEndReminders(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings/reminders`).pipe(
      catchError(this.handleError('getYearEndReminders', []))
    );
  }

  processOpeningDay(): Observable<any> {
    return this.http.post(`${this.apiUrl}/settings/opening-day`, {});
  }

  processClosingDay(): Observable<any> {
    return this.http.post(`${this.apiUrl}/settings/closing-day`, {});
  }

  getUniformItems(): Observable<any> {
    return this.http.get(`${this.apiUrl}/settings/uniform-items`).pipe(
      catchError(this.handleError('getUniformItems', []))
    );
  }

  createUniformItem(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/settings/uniform-items`, data);
  }

  updateUniformItem(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/settings/uniform-items/${id}`, data);
  }

  deleteUniformItem(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/settings/uniform-items/${id}`);
  }

  resetSystemData(payload: { confirm: boolean }): Observable<any> {
    return this.http.post(`${this.apiUrl}/settings/reset-system`, payload);
  }
}


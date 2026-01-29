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
      // Don't log connection errors (backend not running)
      if (error?.status === 0 || error?.message?.includes('Connection refused')) {
        // Backend is not running - silently return fallback
        return of(fallback);
      }
      if (error?.status === 401) {
        console.warn(`[SettingsService] ${operation} failed with 401 (unauthorized).`);
      } else {
        console.error(`[SettingsService] ${operation} failed:`, error);
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
}


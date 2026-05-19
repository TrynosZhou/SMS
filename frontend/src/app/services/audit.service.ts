import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuditService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) {}

  logActivity(module: string, sessionId?: string): Observable<any> {
    const headers: any = {};
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }
    return this.http.post(`${this.apiUrl}/audit/activity`, { module }, { headers: new HttpHeaders(headers) });
  }

  getUserSessions(params?: { startDate?: string; endDate?: string; role?: string; search?: string; page?: string; limit?: string }): Observable<any[]> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.startDate && params.startDate !== 'undefined') {
        httpParams = httpParams.set('startDate', params.startDate);
      }
      if (params.endDate && params.endDate !== 'undefined') {
        httpParams = httpParams.set('endDate', params.endDate);
      }
      if (params.role && params.role !== 'undefined' && params.role !== 'all') {
        httpParams = httpParams.set('role', params.role);
      }
      if (params.search && params.search !== 'undefined') {
        httpParams = httpParams.set('search', params.search);
      }
      if ((params as any).sortKey) {
        httpParams = httpParams.set('sortKey', (params as any).sortKey);
      }
      if ((params as any).sortDir) {
        httpParams = httpParams.set('sortDir', (params as any).sortDir);
      }
      if (params.page) {
        httpParams = httpParams.set('page', params.page);
      }
      if (params.limit) {
        httpParams = httpParams.set('limit', params.limit);
      }
    }
    return this.http.get<any[]>(`${this.apiUrl}/audit/user-sessions`, { params: httpParams });
  }

  exportSessionsCsv(params?: any) {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(k => {
        const v = params[k];
        if (v != null && v !== '' && v !== 'undefined') {
          httpParams = httpParams.set(k, v);
        }
      });
    }
    return this.http.get(`${this.apiUrl}/audit/user-sessions/export.csv`, { params: httpParams, responseType: 'blob' });
  }

  exportSessionsPdf(params?: any) {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(k => {
        const v = params[k];
        if (v != null && v !== '' && v !== 'undefined') {
          httpParams = httpParams.set(k, v);
        }
      });
    }
    return this.http.get(`${this.apiUrl}/audit/user-sessions/export.pdf`, { params: httpParams, responseType: 'blob' });
  }
}

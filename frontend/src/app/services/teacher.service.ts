import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { PaginatedResponse } from '../types/pagination';

@Injectable({
  providedIn: 'root'
})
export class TeacherService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getTeachers(): Observable<any[]> {
    return this.http.get<PaginatedResponse<any> | any[]>(`${this.apiUrl}/teachers`).pipe(
      map(response => {
        // Ensure response is valid before processing
        if (!response) return [];
        if (Array.isArray(response)) {
          return response;
        }
        if (typeof response === 'object' && response !== null && Array.isArray(response.data)) {
          return response.data;
        }
        // If response is an error object (has message but no data), return empty array
        if (typeof response === 'object' && response !== null && 'message' in response && !('data' in response)) {
          return [];
        }
        return [];
      }),
      map(data => {
        if (!Array.isArray(data)) {
          console.error('ERROR: Expected array but got:', typeof data, data);
          return [];
        }
        return data;
      }),
      catchError((error: any) => {
        // Always return empty array on any error (401, 500, network, etc.)
        console.error('Error loading teachers:', error);
        return of([]);
      })
    );
  }

  getTeachersPaginated(page = 1, limit = 20): Observable<PaginatedResponse<any>> {
    return this.http.get<PaginatedResponse<any>>(`${this.apiUrl}/teachers`, {
      params: {
        page,
        limit
      }
    }).pipe(
      map(response => {
        // Ensure response is valid and has data array
        if (!response) {
          return { data: [], total: 0, page, limit, totalPages: 0 };
        }
        // If response.data exists, ensure it's an array
        if (response.data !== undefined) {
          return {
            ...response,
            data: Array.isArray(response.data) ? response.data : []
          };
        }
        // If response is an array directly, wrap it
        if (Array.isArray(response)) {
          return {
            data: response,
            total: response.length,
            page,
            limit,
            totalPages: Math.ceil(response.length / limit)
          };
        }
        // If response is an error object, return empty paginated response
        if (typeof response === 'object' && response !== null && 'message' in response && !('data' in response)) {
          return { data: [], total: 0, page, limit, totalPages: 0 };
        }
        // Default: return empty paginated response
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }),
      catchError((error: any) => {
        const status = error?.status;
        const msg = error?.error?.message || error?.message || '';
        if (status === 0) {
          console.warn(
            'Error loading teachers (paginated): backend not reachable (status 0). Start the backend on port 3001.'
          );
        } else {
          console.error(`Error loading teachers (paginated): status ${status} ${msg ? '- ' + msg : ''}`, error);
        }
        return of({ data: [], total: 0, page, limit, totalPages: 0 });
      })
    );
  }

  getCurrentTeacher(): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers/me`);
  }

  getTeacherById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers/${id}`);
  }

  createTeacher(teacher: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/teachers`, teacher);
  }

  updateTeacher(id: string, teacher: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/teachers/${id}`, teacher);
  }

  getTeacherClasses(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers/${id}/classes`).pipe(
      catchError((error: any) => {
        console.error('Error loading teacher classes:', error);
        
        // Handle different error types gracefully
        if (error.status === 500) {
          console.warn('Server error when loading teacher classes, returning empty array');
        } else if (error.status === 404) {
          console.warn('Teacher classes endpoint not found, returning empty array');
        } else {
          console.error('Unexpected error loading teacher classes:', error.message);
        }
        
        return of({ classes: [] });
      })
    );
  }

  createTeacherAccount(teacherId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/teachers/${teacherId}/create-account`, {});
  }

  deleteTeacher(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/teachers/${id}`);
  }

  searchTeacherByEmployeeId(teacherId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers/search`, {
      params: { teacherId }
    });
  }

  linkTeacherAccount(teacherId?: string): Observable<any> {
    const body = teacherId && teacherId.trim() ? { teacherId: teacherId.trim() } : {};
    return this.http.post(`${this.apiUrl}/teachers/link-account`, body);
  }

  getTeacherIdCardPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/teachers/${id}/id-card/pdf`, {
      responseType: 'blob'
    });
  }
}


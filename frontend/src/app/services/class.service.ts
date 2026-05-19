import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { PaginatedResponse } from '../types/pagination';

@Injectable({
  providedIn: 'root'
})
export class ClassService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getClasses(): Observable<any[]> {
    // Request a very high limit so that callers (like teacher edit, settings, etc.)
    // receive the full list of classes in a single request.
    const params: any = { page: 1, limit: 1000 };

    return this.http.get<PaginatedResponse<any> | any[]>(`${this.apiUrl}/classes`, { params }).pipe(
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
        const status = error?.status;
        const msg = error?.error?.message || error?.message || '';
        if (status === 0) {
          console.warn(
            'Error loading classes: backend not reachable (status 0). Start the backend on port 3001.'
          );
        } else if (status === 504) {
          console.warn(
            'Error loading classes: 504 Gateway Timeout. Backend took too long. ' +
            'Ensure backend is running and DB is up; restart ng serve to use longer proxy timeout.'
          );
        } else {
          console.error(`Error loading classes: status ${status} ${msg ? '- ' + msg : ''}`, error);
        }
        return of([]);
      })
    );
  }

  getClassesPaginated(page = 1, limit = 20): Observable<PaginatedResponse<any>> {
    return this.http.get<PaginatedResponse<any>>(`${this.apiUrl}/classes`, {
      params: { page, limit }
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
        // If response is an error object (has message or error property), return empty paginated response
        if (typeof response === 'object' && response !== null && !('data' in response) && ((response as any).message || (response as any).error)) {
          console.warn('API returned error object instead of array, normalizing to empty array:', response);
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
            'Error loading classes (paginated): backend not reachable (status 0). Start the backend on port 3001.'
          );
        } else if (status === 504) {
          console.warn(
            'Error loading classes (paginated): 504 Gateway Timeout. Backend took too long. ' +
            'Ensure backend is running and DB is up; restart ng serve to use longer proxy timeout.'
          );
        } else {
          console.error(`Error loading classes (paginated): status ${status} ${msg ? '- ' + msg : ''}`, error);
        }
        return of({ data: [], total: 0, page, limit, totalPages: 0 });
      })
    );
  }

  getClassById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/classes/${id}`);
  }

  createClass(classData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/classes`, classData);
  }

  updateClass(id: string, classData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/classes/${id}`, classData);
  }

  deleteClass(id: string): Observable<any> {
    console.log('deleteClass service - Received ID:', id, 'Type:', typeof id);
    
    // Clean the ID - remove any trailing characters after colon (e.g., :1)
    let cleanId = String(id).trim();
    console.log('deleteClass service - After String conversion:', cleanId);
    
    // Remove any trailing :number or :text patterns (e.g., :1, :abc)
    // Split by colon and take only the first part
    if (cleanId.includes(':')) {
      const beforeColon = cleanId.split(':')[0].trim();
      console.log('deleteClass service - Found colon, before:', beforeColon, 'full:', cleanId);
      cleanId = beforeColon;
    }
    
    // Extra safety: Remove any non-UUID characters that might have slipped through
    // But preserve hyphens in their correct positions
    const uuidMatch = cleanId.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch) {
      cleanId = uuidMatch[1];
      console.log('deleteClass service - Extracted UUID:', cleanId);
    }
    
    // Validate it's a proper UUID format before making the request
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanId)) {
      console.error('deleteClass service - Invalid UUID format. Original:', id, 'Cleaned:', cleanId);
      return throwError(() => new Error(`Invalid class ID format: ${id}`));
    }
    
    // Construct the URL using template literal - Angular HttpClient handles encoding
    const url = `${this.apiUrl}/classes/${cleanId}`;
    console.log('deleteClass service - Final URL:', url);
    console.log('deleteClass service - URL length:', url.length);
    console.log('deleteClass service - ID in URL:', cleanId, 'Length:', cleanId.length);
    
    // Make the request
    const request = this.http.delete(url);
    console.log('deleteClass service - Request created');
    return request;
  }
}


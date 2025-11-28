import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { PaginatedResponse } from '../types/pagination';

@Injectable({
  providedIn: 'root'
})
export class SubjectService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getSubjects(): Observable<any[]> {
    return this.http.get<PaginatedResponse<any> | any[]>(`${this.apiUrl}/subjects`).pipe(
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
      catchError((error: any) => {
        // Always return empty array on any error (401, 500, network, etc.)
        console.error('Error loading subjects:', error);
        return of([]);
      })
    );
  }

  getSubjectById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/subjects/${id}`);
  }

  createSubject(subject: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/subjects`, subject);
  }

  updateSubject(id: string, subject: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/subjects/${id}`, subject);
  }

  deleteSubject(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/subjects/${id}`);
  }
}


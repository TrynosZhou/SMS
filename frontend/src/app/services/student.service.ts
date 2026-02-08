import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, Observer, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { PaginatedResponse } from '../types/pagination';

@Injectable({
  providedIn: 'root'
})
export class StudentService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getStudents(classId?: string): Observable<any[]> {
    const params: any = {};
    if (classId) {
      params.classId = classId;
    }
    return this.http.get<PaginatedResponse<any> | any[]>(`${this.apiUrl}/students`, { params }).pipe(
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
        // Only log if it's not a connection error (backend not running)
        if (error.status !== 0) {
          console.error('Error loading students:', error);
        }
        return of([]);
      })
    );
  }

  getStudentsPaginated(params: { classId?: string; page?: number; limit?: number; search?: string } = {}): Observable<PaginatedResponse<any>> {
    const queryParams: any = {
      page: params.page ?? 1,
      limit: params.limit ?? 20
    };
    if (params.classId) {
      queryParams.classId = params.classId;
    }
    if (params.search && params.search.trim()) {
      queryParams.search = params.search.trim();
    }
    return this.http.get<PaginatedResponse<any>>(`${this.apiUrl}/students`, { params: queryParams }).pipe(
      map(response => {
        // Ensure response is valid and has data array
        if (!response) {
          return { data: [], total: 0, page: queryParams.page, limit: queryParams.limit, totalPages: 0 };
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
            page: queryParams.page,
            limit: queryParams.limit,
            totalPages: Math.ceil(response.length / queryParams.limit)
          };
        }
        // If response is an error object (has message or error property), return empty paginated response
        if (typeof response === 'object' && response !== null && !('data' in response) && ((response as any).message || (response as any).error)) {
          console.warn('API returned error object instead of array, normalizing to empty array:', response);
          return { data: [], total: 0, page: queryParams.page, limit: queryParams.limit, totalPages: 0 };
        }
        // Default: return empty paginated response
        return { data: [], total: 0, page: queryParams.page, limit: queryParams.limit, totalPages: 0 };
      }),
      catchError((error: any) => {
        // Always return empty paginated response on any error
        // Only log if it's not a connection error (backend not running)
        if (error.status !== 0) {
          console.error('Error loading students (paginated):', error);
        }
        return of({ data: [], total: 0, page: queryParams.page, limit: queryParams.limit, totalPages: 0 });
      })
    );
  }

  getStudentById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/students/${id}`);
  }

  createStudent(student: any, photo?: File): Observable<any> {
    if (photo) {
      const formData = new FormData();
      Object.keys(student).forEach(key => {
        if (student[key] !== null && student[key] !== undefined) {
          formData.append(key, student[key]);
        }
      });
      formData.append('photo', photo);
      return this.http.post(`${this.apiUrl}/students`, formData);
    }
    return this.http.post(`${this.apiUrl}/students`, student);
  }

  updateStudent(id: string, student: any, photo?: File): Observable<any> {
    if (photo) {
      const formData = new FormData();
      Object.keys(student).forEach(key => {
        if (student[key] !== null && student[key] !== undefined) {
          formData.append(key, student[key]);
        }
      });
      formData.append('photo', photo);
      return this.http.put(`${this.apiUrl}/students/${id}`, formData);
    }
    return this.http.put(`${this.apiUrl}/students/${id}`, student);
  }

  enrollStudent(studentId: string, classId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/students/enroll`, { studentId, classId });
  }

  deleteStudent(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/students/${id}`);
  }

  promoteStudents(fromClassId: string, toClassId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/students/promote`, { fromClassId, toClassId });
  }

  getStudentIdCard(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/students/${id}/id-card`, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map((response: any) => {
        const blob = response.body;
        const contentType = response.headers.get('content-type') || '';
        const status = response.status;
        
        // Check if response is PDF
        if (status === 200 && contentType.includes('application/pdf')) {
          return blob;
        }
        
        // If status is not 200 or not PDF, it's an error
        // The body might be a JSON error message as text/blob
        throw { status, blob, contentType };
      }),
      catchError((error: any) => {
        // Handle different error scenarios
        if (error.status && error.blob) {
          // Error response with blob body (JSON error as blob)
          const reader = new FileReader();
          return new Observable((observer: Observer<any>) => {
            reader.onloadend = () => {
              try {
                const errorText = reader.result as string;
                let errorJson: any;
                try {
                  errorJson = JSON.parse(errorText);
                } catch (e) {
                  errorJson = { message: errorText || 'Unknown error' };
                }
                const httpError = new HttpErrorResponse({
                  error: errorJson,
                  status: error.status,
                  statusText: error.statusText || 'Error'
                });
                observer.error(httpError);
              } catch (e) {
                const httpError = new HttpErrorResponse({
                  error: { message: 'Failed to parse error response' },
                  status: error.status || 500,
                  statusText: 'Error'
                });
                observer.error(httpError);
              }
            };
            reader.onerror = () => {
              const httpError = new HttpErrorResponse({
                error: { message: 'Failed to read error response' },
                status: error.status || 500,
                statusText: 'Error'
              });
              observer.error(httpError);
            };
            reader.readAsText(error.blob);
          });
        } else if (error.error instanceof Blob) {
          // Standard HttpErrorResponse with blob error
          const reader = new FileReader();
          return new Observable((observer: Observer<any>) => {
            reader.onloadend = () => {
              try {
                const errorText = reader.result as string;
                let errorJson: any;
                try {
                  errorJson = JSON.parse(errorText);
                } catch (e) {
                  errorJson = { message: errorText || 'Unknown error' };
                }
                const httpError = new HttpErrorResponse({
                  error: errorJson,
                  status: error.status || 500,
                  statusText: error.statusText || 'Error'
                });
                observer.error(httpError);
              } catch (e) {
                observer.error(error);
              }
            };
            reader.onerror = () => observer.error(error);
            reader.readAsText(error.error);
          });
        }
        // For non-blob errors, return as-is
        return throwError(() => error);
      })
    );
  }

  transferStudent(transferData: {
    studentId: string;
    transferType: 'internal' | 'external';
    targetClassId?: string;
    destinationSchool?: string;
    transferReason?: string;
    transferDate?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/students/transfer`, transferData).pipe(
      catchError((error: any) => {
        console.error('Error transferring student:', error);
        return throwError(() => error);
      })
    );
  }

  getStudentTransfers(studentId: string): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/students/${studentId}/transfers`).pipe(
      map(response => {
        if (Array.isArray(response)) {
          return response;
        }
        if (response && Array.isArray(response.data)) {
          return response.data;
        }
        if (!response || (typeof response === 'object' && ('message' in response || 'error' in response))) {
          console.warn('Normalizing invalid transfers response to empty array', response);
          return [];
        }
        console.warn('Unexpected response for student transfers, normalizing to empty array', response);
        return [];
      }),
      catchError((error: any) => {
        console.error('Error loading student transfer history:', error);
        return of([]);
      })
    );
  }

}


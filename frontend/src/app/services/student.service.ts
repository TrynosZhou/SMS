import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, Observer } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StudentService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getStudents(classId?: string): Observable<any> {
    const options: any = {};
    if (classId) {
      options.params = { classId };
    }
    return this.http.get(`${this.apiUrl}/students`, options);
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
}


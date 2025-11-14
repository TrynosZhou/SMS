import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SubjectService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getSubjects(): Observable<any> {
    return this.http.get(`${this.apiUrl}/subjects`);
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
}


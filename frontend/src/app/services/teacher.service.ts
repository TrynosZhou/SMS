import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TeacherService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getTeachers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/teachers`);
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
    return this.http.get(`${this.apiUrl}/teachers/${id}/classes`);
  }

  createTeacherAccount(teacherId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/teachers/${teacherId}/create-account`, {});
  }
}


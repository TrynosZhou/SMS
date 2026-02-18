import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ParentService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getLinkedStudents(): Observable<any> {
    return this.http.get(`${this.apiUrl}/parent/students`);
  }

  searchStudents(query: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/parent/search-students`, { params: { query } });
  }

  linkStudent(studentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/parent/link-student`, { studentId });
  }

  linkStudentByIdAndDob(studentId: string, dateOfBirth: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/parent/link-student-by-id-dob`, { 
      studentId, 
      dateOfBirth 
    });
  }

  unlinkStudent(studentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/parent/unlink-student/${studentId}`);
  }

  getAllParentsAdmin(): Observable<any> {
    return this.http.get(`${this.apiUrl}/parent/admin/parents`);
  }

  getAllParentsStaff(): Observable<any> {
    return this.http.get(`${this.apiUrl}/parent/staff/parents`);
  }

  adminLinkStudentToParent(parentId: string, studentId: string, relationshipType: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/parent/admin/link-student`, {
      parentId,
      studentId,
      relationshipType
    });
  }

  adminUnlinkStudentFromParent(linkId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/parent/admin/unlink-student/${linkId}`);
  }

  updateParentAdmin(parentId: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/parent/admin/parents/${parentId}`, data);
  }

  deleteParentAdmin(parentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/parent/admin/parents/${parentId}`);
  }
}


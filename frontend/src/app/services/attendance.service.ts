import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AttendanceService {
  private apiUrl = environment.apiUrl;
  private readonly attendanceUpdate$ = new Subject<void>();

  /** Emits when attendance records are updated (for syncing with report cards) */
  readonly attendanceUpdated$ = this.attendanceUpdate$.asObservable();

  constructor(private http: HttpClient) {}

  /** Notify listeners that attendance has been updated */
  notifyAttendanceUpdated(): void {
    this.attendanceUpdate$.next();
  }

  markAttendance(classId: string, date: string, attendanceData: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/attendance`, {
      classId,
      date,
      attendanceData
    });
  }

  getAttendance(params?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/attendance`, { params });
  }

  getAttendanceReport(params: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/attendance/report`, { params });
  }

  getStudentTotalAttendance(studentId: string, term?: string): Observable<any> {
    const params: any = { studentId };
    if (term) {
      params.term = term;
    }
    return this.http.get(`${this.apiUrl}/attendance/student/total`, { params });
  }

  deleteAttendance(classId: string, date: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/attendance`, {
      params: { classId, date }
    });
  }

  updateAttendanceRecord(studentId: string, classId: string, field: string, newValue: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/attendance/update`, {
      studentId,
      classId,
      field,
      newValue
    });
  }
}


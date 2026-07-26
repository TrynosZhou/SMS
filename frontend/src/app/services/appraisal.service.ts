import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AppraisalService {
  private readonly api = `${environment.apiUrl}/teacher-appraisal`;

  constructor(private http: HttpClient) {}

  listCycles(status?: string): Observable<any> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get(`${this.api}/cycles`, { params });
  }

  createCycle(body: any): Observable<any> {
    return this.http.post(`${this.api}/cycles`, body);
  }

  updateCycle(id: string, body: any): Observable<any> {
    return this.http.put(`${this.api}/cycles/${id}`, body);
  }

  deleteCycle(id: string): Observable<any> {
    return this.http.delete(`${this.api}/cycles/${id}`);
  }

  listCriteria(): Observable<any> {
    return this.http.get(`${this.api}/criteria`);
  }

  createCriterion(body: any): Observable<any> {
    return this.http.post(`${this.api}/criteria`, body);
  }

  updateCriterion(id: string, body: any): Observable<any> {
    return this.http.put(`${this.api}/criteria/${id}`, body);
  }

  deleteCriterion(id: string): Observable<any> {
    return this.http.delete(`${this.api}/criteria/${id}`);
  }

  listPeerAssignments(cycleId: string): Observable<any> {
    return this.http.get(`${this.api}/peer-assignments`, { params: { cycleId } });
  }

  createPeerAssignment(body: any): Observable<any> {
    return this.http.post(`${this.api}/peer-assignments`, body);
  }

  deletePeerAssignment(id: string): Observable<any> {
    return this.http.delete(`${this.api}/peer-assignments/${id}`);
  }

  myPeerTargets(cycleId: string): Observable<any> {
    return this.http.get(`${this.api}/my-peer-targets`, { params: { cycleId } });
  }

  listAppraisals(filters?: Record<string, string>): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach((k) => {
        if (filters[k]) params = params.set(k, filters[k]);
      });
    }
    return this.http.get(`${this.api}/appraisals`, { params });
  }

  upsertAppraisal(body: any): Observable<any> {
    return this.http.post(`${this.api}/appraisals`, body);
  }

  listTeachers(): Observable<any> {
    return this.http.get(`${this.api}/teachers`);
  }

  getTeacherHistory(teacherId: string): Observable<any> {
    return this.http.get(`${this.api}/teachers/${teacherId}/history`);
  }

  getTeacherCycleSummary(teacherId: string, cycleId: string): Observable<any> {
    return this.http.get(`${this.api}/teachers/${teacherId}/cycles/${cycleId}/summary`);
  }

  listGoals(filters?: Record<string, string>): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach((k) => {
        if (filters[k]) params = params.set(k, filters[k]);
      });
    }
    return this.http.get(`${this.api}/goals`, { params });
  }

  upsertGoal(body: any): Observable<any> {
    return this.http.post(`${this.api}/goals`, body);
  }

  deleteGoal(id: string): Observable<any> {
    return this.http.delete(`${this.api}/goals/${id}`);
  }

  getDashboard(cycleId?: string): Observable<any> {
    let params = new HttpParams();
    if (cycleId) params = params.set('cycleId', cycleId);
    return this.http.get(`${this.api}/dashboard`, { params });
  }

  teacherReportUrl(teacherId: string, cycleId: string): string {
    return `${this.api}/teachers/${teacherId}/report.pdf?cycleId=${encodeURIComponent(cycleId)}`;
  }

  departmentReportUrl(cycleId: string): string {
    return `${this.api}/reports/department.pdf?cycleId=${encodeURIComponent(cycleId)}`;
  }

  downloadPdf(url: string, filename: string): void {
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objectUrl);
      },
    });
  }
}

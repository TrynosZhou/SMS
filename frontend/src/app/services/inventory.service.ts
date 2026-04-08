import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly base = `${environment.apiUrl}/inventory`;

  constructor(private http: HttpClient) {}

  getSettings(): Observable<any> {
    return this.http.get(`${this.base}/settings`);
  }

  updateSettings(body: Partial<{ loanDaysDefault: number; overdueFinePerDay: number; lossGraceDaysAfterDue: number }>): Observable<any> {
    return this.http.put(`${this.base}/settings`, body);
  }

  listTextbooks(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/textbooks`);
  }

  createTextbook(body: any): Observable<any> {
    return this.http.post(`${this.base}/textbooks`, body);
  }

  updateTextbook(id: string, body: any): Observable<any> {
    return this.http.put(`${this.base}/textbooks/${id}`, body);
  }

  deleteTextbook(id: string): Observable<any> {
    return this.http.delete(`${this.base}/textbooks/${id}`);
  }

  listFurniture(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/furniture`);
  }

  createFurniture(body: any): Observable<any> {
    return this.http.post(`${this.base}/furniture`, body);
  }

  updateFurniture(id: string, body: any): Observable<any> {
    return this.http.put(`${this.base}/furniture/${id}`, body);
  }

  deleteFurniture(id: string): Observable<any> {
    return this.http.delete(`${this.base}/furniture/${id}`);
  }

  listTextbookIssuances(params?: { studentId?: string; status?: string }): Observable<any[]> {
    let p = new HttpParams();
    if (params?.studentId) p = p.set('studentId', params.studentId);
    if (params?.status) p = p.set('status', params.status);
    return this.http.get<any[]>(`${this.base}/issuances/textbooks`, { params: p });
  }

  listFurnitureIssuances(params?: { studentId?: string; status?: string }): Observable<any[]> {
    let p = new HttpParams();
    if (params?.studentId) p = p.set('studentId', params.studentId);
    if (params?.status) p = p.set('status', params.status);
    return this.http.get<any[]>(`${this.base}/issuances/furniture`, { params: p });
  }

  issuePermanent(catalogId: string, studentId: string, notes?: string): Observable<any> {
    return this.http.post(`${this.base}/textbooks/${catalogId}/issue-permanent`, { studentId, notes });
  }

  borrowTextbook(catalogId: string, studentId: string, loanDueAt?: string, notes?: string): Observable<any> {
    return this.http.post(`${this.base}/textbooks/${catalogId}/borrow`, { studentId, loanDueAt, notes });
  }

  returnTextbookIssuance(id: string): Observable<any> {
    return this.http.post(`${this.base}/textbook-issuances/${id}/return`, {});
  }

  markTextbookLost(id: string): Observable<any> {
    return this.http.post(`${this.base}/textbook-issuances/${id}/mark-lost`, {});
  }

  issueFurniture(furnitureId: string, studentId: string, notes?: string): Observable<any> {
    return this.http.post(`${this.base}/furniture/${furnitureId}/issue`, { studentId, notes });
  }

  returnFurnitureIssuance(id: string): Observable<any> {
    return this.http.post(`${this.base}/furniture-issuances/${id}/return`, {});
  }

  markFurnitureLost(id: string): Observable<any> {
    return this.http.post(`${this.base}/furniture-issuances/${id}/mark-lost`, {});
  }

  listFines(params?: Record<string, string | undefined>): Observable<any[]> {
    let p = new HttpParams();
    if (params) {
      Object.keys(params).forEach(k => {
        const v = params[k];
        if (v) p = p.set(k, v);
      });
    }
    return this.http.get<any[]>(`${this.base}/fines`, { params: p });
  }

  createFine(body: any): Observable<any> {
    return this.http.post(`${this.base}/fines`, body);
  }

  updateFineStatus(id: string, status: string, invoiceId?: string | null): Observable<any> {
    return this.http.patch(`${this.base}/fines/${id}/status`, { status, invoiceId });
  }

  getStudentSummary(studentId: string): Observable<any> {
    return this.http.get(`${this.base}/students/${studentId}/summary`);
  }

  getMySummary(): Observable<any> {
    return this.http.get(`${this.base}/me`);
  }

  reportLost(params?: Record<string, string | undefined>): Observable<any> {
    return this.http.get(`${this.base}/reports/lost`, { params: this.toParams(params) });
  }

  reportTextbookIssuance(params?: Record<string, string | undefined>): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/reports/textbook-issuance`, { params: this.toParams(params) });
  }

  reportFurnitureIssuance(params?: Record<string, string | undefined>): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/reports/furniture-issuance`, { params: this.toParams(params) });
  }

  reportLoanHistory(params?: Record<string, string | undefined>): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/reports/loan-history`, { params: this.toParams(params) });
  }

  listAudit(params?: Record<string, string | undefined>): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/audit`, { params: this.toParams(params) });
  }

  /* ---- Teacher allocation (admin → teacher) ---- */

  listTeachers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/teachers-list`);
  }

  issueTextbookToTeacher(catalogId: string, teacherUserId: string, quantity: number, notes?: string): Observable<any> {
    return this.http.post(`${this.base}/textbooks/${catalogId}/issue-to-teacher`, { teacherUserId, quantity, notes });
  }

  issueFurnitureToTeacher(furnitureId: string, teacherUserId: string, notes?: string): Observable<any> {
    return this.http.post(`${this.base}/furniture/${furnitureId}/issue-to-teacher`, { teacherUserId, notes });
  }

  bulkCreateFurniture(body: { deskQuantity: number; chairQuantity: number; condition?: string; locationLabel?: string }): Observable<any> {
    return this.http.post(`${this.base}/furniture/bulk`, body);
  }

  bulkAllocateFurnitureToTeacher(body: { teacherUserId: string; deskQuantity: number; chairQuantity: number; condition?: string; locationLabel?: string; notes?: string }): Observable<any> {
    return this.http.post(`${this.base}/furniture/bulk-allocate-to-teacher`, body);
  }

  listTeacherTextbookAllocations(teacherUserId?: string): Observable<any[]> {
    const params = teacherUserId ? { teacherUserId } : undefined;
    return this.http.get<any[]>(`${this.base}/teacher-allocations/textbooks`, { params: this.toParams(params) });
  }

  listTeacherFurnitureAllocations(teacherUserId?: string): Observable<any[]> {
    const params = teacherUserId ? { teacherUserId } : undefined;
    return this.http.get<any[]>(`${this.base}/teacher-allocations/furniture`, { params: this.toParams(params) });
  }

  issueTextbookFromTeacherAllocation(allocationId: string, studentId: string, issuanceType: string, loanDueAt?: string, notes?: string, specificCopyNumber?: string): Observable<any> {
    return this.http.post(`${this.base}/teacher-textbook-allocations/${allocationId}/issue-to-student`, { studentId, issuanceType, loanDueAt, notes, specificCopyNumber });
  }

  issueFurnitureFromTeacherAllocation(allocationId: string, studentId: string, notes?: string): Observable<any> {
    return this.http.post(`${this.base}/teacher-furniture-allocations/${allocationId}/issue-to-student`, { studentId, notes });
  }

  returnTeacherTextbookAllocation(allocationId: string): Observable<any> {
    return this.http.post(`${this.base}/teacher-textbook-allocations/${allocationId}/return`, {});
  }

  returnTeacherFurnitureAllocation(allocationId: string): Observable<any> {
    return this.http.post(`${this.base}/teacher-furniture-allocations/${allocationId}/return`, {});
  }

  getTeacherClassStudents(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/teacher/my-class-students`);
  }

  getTeacherClassReport(): Observable<{ textbooks: any[]; furniture: any[]; classNames: string[] }> {
    return this.http.get<any>(`${this.base}/teacher/my-class-report`);
  }

  patchTeacherTextbookAllocationCopyCondition(
    allocationId: string,
    copyNumber: string,
    condition: string
  ): Observable<{ message: string; conditionLabel: string }> {
    return this.http.patch<{ message: string; conditionLabel: string }>(
      `${this.base}/teacher-textbook-allocations/${allocationId}/copy-condition`,
      { copyNumber, condition }
    );
  }

  patchTeacherTextbookIssuanceCondition(
    issuanceId: string,
    condition: string
  ): Observable<{ message: string; conditionLabel: string; issuance?: any }> {
    return this.http.patch<{ message: string; conditionLabel: string; issuance?: any }>(
      `${this.base}/teacher-textbook-issuances/${issuanceId}/condition`,
      { condition }
    );
  }

  patchTeacherFurnitureItemCondition(
    furnitureItemId: string,
    condition: string
  ): Observable<{ message: string; conditionLabel: string; item?: any }> {
    return this.http.patch<{ message: string; conditionLabel: string; item?: any }>(
      `${this.base}/teacher/furniture-items/${furnitureItemId}/condition`,
      { condition }
    );
  }

  private toParams(obj?: Record<string, string | undefined>): HttpParams {
    let p = new HttpParams();
    if (!obj) return p;
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      if (v) p = p.set(k, v);
    });
    return p;
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PayrollService {
  private apiUrl = `${environment.apiUrl}/payroll`;

  constructor(private http: HttpClient) {}

  // Ancillary Staff
  getAncillaryStaff(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/ancillary-staff`);
  }

  createAncillaryStaff(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/ancillary-staff`, data);
  }

  updateAncillaryStaff(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/ancillary-staff/${id}`, data);
  }

  deleteAncillaryStaff(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/ancillary-staff/${id}`);
  }

  // Salary Structures
  getSalaryStructures(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/salary-structures`);
  }

  createSalaryStructure(data: { name: string; employeeCategory: string; components: any[] }): Observable<any> {
    return this.http.post(`${this.apiUrl}/salary-structures`, data);
  }

  updateSalaryStructure(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/salary-structures/${id}`, data);
  }

  deleteSalaryStructure(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/salary-structures/${id}`);
  }

  // Salary Assignments
  getSalaryAssignments(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/salary-assignments`);
  }

  assignSalary(data: { teacherId?: string; ancillaryStaffId?: string; salaryStructureId: string; effectiveFrom: string; customComponents?: any[] }): Observable<any> {
    return this.http.post(`${this.apiUrl}/salary-assignments`, data);
  }

  updateSalaryAssignment(id: string, data: { effectiveFrom?: string; customComponents?: any[] }): Observable<any> {
    return this.http.put(`${this.apiUrl}/salary-assignments/${id}`, data);
  }

  removeSalaryAssignment(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/salary-assignments/${id}`);
  }

  // Payroll Runs
  getPayrollRuns(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/runs`);
  }

  createPayrollRun(data: { month: number; year: number }): Observable<any> {
    return this.http.post(`${this.apiUrl}/runs`, data);
  }

  approvePayrollRun(id: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/runs/${id}/approve`, {});
  }

  // Payroll Entries
  getPayrollEntries(runId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/runs/${runId}/entries`);
  }

  updatePayrollEntry(id: string, data: { grossSalary?: number; totalAllowances?: number; totalDeductions?: number; netSalary?: number; paymentMethod?: string; bankName?: string | null }): Observable<any> {
    return this.http.put(`${this.apiUrl}/entries/${id}`, data);
  }

  addLoanDeduction(entryId: string, principal: number, repaymentMonths: 1 | 2 | 3): Observable<any> {
    return this.http.post(`${this.apiUrl}/entries/${entryId}/loan-deduction`, { principal, repaymentMonths });
  }

  // Loan accounts (for assignments page)
  getLoanBalances(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/loan-accounts`);
  }

  getLoanBalance(teacherId?: string, ancillaryStaffId?: string): Observable<{ balance: number; account: any }> {
    const params: any = {};
    if (teacherId) params.teacherId = teacherId;
    if (ancillaryStaffId) params.ancillaryStaffId = ancillaryStaffId;
    return this.http.get<{ balance: number; account: any }>(`${this.apiUrl}/loan-accounts/balance`, { params });
  }

  searchPayrollEmployees(query: string): Observable<{ type: string; id: string; firstName: string; lastName: string; teacherId?: string; employeeId?: string }[]> {
    return this.http.get<any[]>(`${this.apiUrl}/employees/search`, { params: { q: query || '' } });
  }

  getLoanHistory(teacherId?: string, ancillaryStaffId?: string): Observable<{ schedules: any[]; deductions: any[] }> {
    const params: any = {};
    if (teacherId) params.teacherId = teacherId;
    if (ancillaryStaffId) params.ancillaryStaffId = ancillaryStaffId;
    return this.http.get<{ schedules: any[]; deductions: any[] }>(`${this.apiUrl}/loan-accounts/history`, { params });
  }

  createLoan(data: { teacherId?: string; ancillaryStaffId?: string; principal: number; repaymentMonths: 1 | 2 | 3 }): Observable<any> {
    return this.http.post(`${this.apiUrl}/loan-accounts`, data);
  }

  // Payslip PDF
  getPayslipPdf(entryId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/entries/${entryId}/payslip`, {
      responseType: 'blob'
    });
  }

  getBulkPayslipsZip(runId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/runs/${runId}/payslips-bulk`, {
      responseType: 'blob'
    });
  }

  // Reports
  getReports(type: string, month: number, year: number): Observable<any> {
    const params: any = { type, month: String(month), year: String(year) };
    return this.http.get(`${this.apiUrl}/reports`, { params });
  }
}

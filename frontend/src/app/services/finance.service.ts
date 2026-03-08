import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { PaginatedResponse } from '../types/pagination';

@Injectable({
  providedIn: 'root'
})
export class FinanceService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getInvoices(studentId?: string, status?: string): Observable<any[]> {
    const params: any = {
      page: 1,
      limit: 1000
    };
    if (studentId) params.studentId = studentId;
    if (status) params.status = status;
    return this.http.get<PaginatedResponse<any> | any[]>(`${this.apiUrl}/finance`, { params }).pipe(
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
        console.error('Error loading invoices:', error);
        return of([]);
      })
    );
  }

  getInvoicesPaginated(options: { studentId?: string; status?: string; page?: number; limit?: number } = {}): Observable<PaginatedResponse<any>> {
    const params: any = {
      page: options.page ?? 1,
      limit: options.limit ?? 20
    };
    if (options.studentId) params.studentId = options.studentId;
    if (options.status) params.status = options.status;
    return this.http.get<PaginatedResponse<any>>(`${this.apiUrl}/finance`, { params });
  }

  createInvoice(invoice: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance`, invoice);
  }

  updatePayment(invoiceId: string, paymentData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/finance/${invoiceId}/payment`, paymentData);
  }

  adjustInvoiceLogistics(
    invoiceId: string,
    payload: { addTransport?: boolean; addDiningHall?: boolean; addTuition?: boolean; diningHallAmount?: number }
  ): Observable<any> {
    return this.http.put(`${this.apiUrl}/finance/${invoiceId}/logistics`, payload);
  }

  calculateNextTermBalance(studentId: string, nextTermAmount: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/calculate-balance`, { studentId, nextTermAmount });
  }

  createBulkInvoices(term: string, dueDate: string, description?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/bulk`, { term, dueDate, description });
  }

  reverseBulkInvoices(payload: { term?: string; currentTerm?: string; startDate?: string; endDate?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/bulk/reverse`, payload || {});
  }

  voidTuitionExemptInvoices(): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/void/tuition-exempt`, {});
  }

  getStudentBalance(studentId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/finance/balance`, { params: { studentId } });
  }

  createUniformCharge(studentId: string, items: { itemId: string; quantity: number }[], description?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/uniform-charge`, { studentId, items, description });
  }

  getNextUniformReceiptNumber(): Observable<{ receiptNumber: string }> {
    return this.http.get<{ receiptNumber: string }>(`${this.apiUrl}/finance/next-uniform-receipt`);
  }

  recordUniformPayment(studentId: string, amount: number, paymentDate?: string, paymentMethod?: string, receiptNumber?: string, notes?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/uniform-payment`, {
      studentId,
      amount,
      paymentDate: paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod,
      receiptNumber,
      notes
    });
  }

  getUniformReceiptPDF(uniformPaymentLogId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/finance/uniform-receipt/${uniformPaymentLogId}`, {
      responseType: 'blob'
    });
  }

  applyInvoiceNote(invoiceId: string, payload: { type: 'credit' | 'debit'; item: string; amount: number }): Observable<any> {
    return this.http.put(`${this.apiUrl}/finance/${invoiceId}/note`, payload);
  }

  getInvoice(invoiceId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/finance`, { params: { invoiceId } });
  }

  getInvoicePDF(invoiceId: string): Observable<{ blob: Blob; filename: string }> {
    return this.http.get(`${this.apiUrl}/finance/${invoiceId}/pdf`, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map((response: any) => {
        const blob = response.body as Blob;
        let filename = 'Invoice.pdf';
        
        // Extract filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
          }
        }
        
        return { blob, filename };
      })
    );
  }

  getReceiptPDF(invoiceId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/finance/${invoiceId}/receipt`, {
      responseType: 'blob'
    });
  }

  getOutstandingBalancePDF(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/finance/outstanding-balances/pdf`, {
      responseType: 'blob'
    });
  }

  getOutstandingBalances(): Observable<any[]> {
    return this.http.get<PaginatedResponse<any> | any[]>(`${this.apiUrl}/finance/outstanding-balances`).pipe(
      map(response => {
        if (!response) return [];
        if (Array.isArray(response)) {
          return response;
        }
        if (typeof response === 'object' && response !== null && Array.isArray((response as any).data)) {
          return (response as any).data;
        }
        console.error('ERROR: Expected array but got:', typeof response, response);
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
        console.error('Error loading outstanding balances:', error);
        return of([]);
      })
    );
  }

  getPaymentLogs(options: { studentId?: string; invoiceId?: string; search?: string; startDate?: string; endDate?: string; paymentMethod?: string; page?: number; limit?: number } = {}): Observable<PaginatedResponse<any>> {
    const params: any = {
      page: options.page ?? 1,
      limit: options.limit ?? 20
    };
    if (options.studentId) params.studentId = options.studentId;
    if (options.invoiceId) params.invoiceId = options.invoiceId;
    if (options.search) params.search = options.search;
    if (options.startDate) params.startDate = options.startDate;
    if (options.endDate) params.endDate = options.endDate;
    if (options.paymentMethod) params.paymentMethod = options.paymentMethod;
    return this.http.get<PaginatedResponse<any>>(`${this.apiUrl}/finance/audit/payment-logs`, { params });
  }

  deletePaymentLog(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/finance/audit/payment-logs/${id}`);
  }

  reverseInvoicePrepayment(invoiceId: string, payload: { amount: number; notes?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/${invoiceId}/prepayment/reverse`, payload);
  }

  exportPaymentLogsCSV(options: { studentId?: string; invoiceId?: string; search?: string; startDate?: string; endDate?: string; paymentMethod?: string } = {}): Observable<Blob> {
    const params: any = {};
    if (options.studentId) params.studentId = options.studentId;
    if (options.invoiceId) params.invoiceId = options.invoiceId;
    if (options.search) params.search = options.search;
    if (options.startDate) params.startDate = options.startDate;
    if (options.endDate) params.endDate = options.endDate;
    if (options.paymentMethod) params.paymentMethod = options.paymentMethod;
    return this.http.get(`${this.apiUrl}/finance/audit/payment-logs/export`, { params, responseType: 'blob' });
  }

  exportInvoicesCSV(options: { status?: string; search?: string } = {}): Observable<Blob> {
    const params: any = {};
    if (options.status) params.status = options.status;
    if (options.search) params.search = options.search;
    return this.http.get(`${this.apiUrl}/finance/audit/invoices/export`, { params, responseType: 'blob' });
  }

  getPaymentLogsSummary(options: { studentId?: string; invoiceId?: string; search?: string; startDate?: string; endDate?: string; paymentMethod?: string } = {}): Observable<{ sumPaid: number; count: number }> {
    const params: any = {};
    if (options.studentId) params.studentId = options.studentId;
    if (options.invoiceId) params.invoiceId = options.invoiceId;
    if (options.search) params.search = options.search;
    if (options.startDate) params.startDate = options.startDate;
    if (options.endDate) params.endDate = options.endDate;
    if (options.paymentMethod) params.paymentMethod = options.paymentMethod;
    return this.http.get<{ sumPaid: number; count: number }>(`${this.apiUrl}/finance/audit/payment-logs/summary`, { params });
  }

  getInvoicesSummary(options: { status?: string; search?: string } = {}): Observable<{ sumPaid: number; sumBalance: number; count: number }> {
    const params: any = {};
    if (options.status) params.status = options.status;
    if (options.search) params.search = options.search;
    return this.http.get<{ sumPaid: number; sumBalance: number; count: number }>(`${this.apiUrl}/finance/audit/invoices/summary`, { params });
  }

  /** Cash receipts PDF: preview (inline) or download (attachment). */
  getCashReceiptsPDF(term?: string, download = false): Observable<Blob> {
    let params: any = {};
    if (term && term.trim()) params.term = term.trim();
    if (download) params.download = '1';
    return this.http.get(`${this.apiUrl}/finance/cash-receipts/pdf`, {
      params,
      responseType: 'blob'
    });
  }

  /** Cash receipts: total payments via /payments/record for the term (Tuition + DH + Transport). Optional feeType, page, limit, startDate, endDate. */
  getCashReceipts(term?: string, feeType?: string, page?: number, limit?: number, startDate?: string, endDate?: string): Observable<{
    term: string;
    activeTerm: string | null;
    feeType: string;
    totalPayments: number;
    totalCollected: number;
    totalInvoiced: number;
    invoicesCount: number;
    studentsWithInvoices: number;
    studentsFullyPaid: number;
    studentsPartiallyPaid: number;
    studentsUnpaid: number;
    totalOutstanding: number;
    count: number;
    items: Array<{
      id: string;
      amountPaid: number;
      paymentDate: string;
      paymentMethod: string;
      receiptNumber: string;
      createdAt: string;
      invoiceNumber: string;
      invoiceTerm: string;
      invoiceDescription?: string;
      studentName: string;
      studentNumber: string;
    }>;
    availableTerms: string[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const params: any = {};
    if (term && term.trim()) params.term = term.trim();
    if (feeType && feeType !== 'all') params.feeType = feeType;
    if (page != null && page >= 1) params.page = String(page);
    if (limit != null && limit >= 1) params.limit = String(Math.min(100, Math.max(1, limit)));
    if (startDate && startDate.trim()) params.startDate = startDate.trim();
    if (endDate && endDate.trim()) params.endDate = endDate.trim();
    return this.http.get<any>(`${this.apiUrl}/finance/cash-receipts`, { params });
  }

  /** Reconciliation summary for a term: compares term-scoped outstanding with latest-invoice outstanding. */
  getReconcileSummary(term?: string): Observable<{
    term: string;
    totalOutstandingTerm: number;
    totalOutstandingLatest: number;
    difference: number;
    totalPaymentsForInScope: number;
    counts: { inScopeInvoices: number; studentsWithInScopeInvoices: number; studentsTotal: number; discrepancies: number };
    discrepancyStudents: Array<{
      studentId: string;
      studentNumber: string;
      studentName: string;
      earlierOutstandingTotal: number;
      earlierInvoicesCount: number;
      latestInvoiceNumber: string | null;
      latestInvoiceTerm: string | null;
      latestBalance: number | null;
      earlierInvoices: Array<{
        invoiceId: string;
        invoiceNumber: string;
        invoiceTerm: string;
        invoiceCreatedAt: string;
        balance: number;
      }>;
    }>;
  }> {
    const params: any = {};
    if (term && term.trim()) params.term = term.trim();
    return this.http.get<any>(`${this.apiUrl}/finance/audit/reconcile-term-outstanding`, { params });
  }
}


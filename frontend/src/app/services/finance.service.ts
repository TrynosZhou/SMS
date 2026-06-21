import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError, from } from 'rxjs';
import { map, catchError, switchMap, timeout } from 'rxjs/operators';
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
        console.error('Error loading invoices:', error);
        if (error?.status === 0) {
          return of([]);
        }
        return throwError(() => error);
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
    return this.http.get<PaginatedResponse<any>>(`${this.apiUrl}/finance`, { params }).pipe(
      catchError((error: any) => {
        if (error?.status !== 0) {
          console.error('Error loading invoices (paginated):', error);
        }
        return of({
          data: [],
          total: 0,
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          totalPages: 0,
          totalBalance: 0,
          totalInvoicedAmount: 0,
          totalPaidAmount: 0,
          loadFailed: true,
          errorMessage: error?.error?.message || error?.message || 'Failed to load invoices'
        });
      })
    );
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

  createBulkInvoices(
    term: string,
    dueDate: string,
    description?: string,
    batch?: { batchOffset: number; batchSize: number }
  ): Observable<any> {
    const body: {
      term: string;
      dueDate: string;
      description?: string;
      batchOffset?: number;
      batchSize?: number;
    } = { term, dueDate, description };
    if (batch) {
      body.batchOffset = batch.batchOffset;
      body.batchSize = batch.batchSize;
    }
    return this.http.post(`${this.apiUrl}/finance/bulk`, body);
  }

  reverseBulkInvoices(payload: { term?: string; currentTerm?: string; startDate?: string; endDate?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/bulk/reverse`, payload || {});
  }

  voidTuitionExemptInvoices(): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/void/tuition-exempt`, {});
  }

  syncStudentExemptionInvoices(studentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/students/${studentId}/sync-exemption-invoices`, {});
  }

  lookupStudent(query: string): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/finance/student-lookup`, { params: { q: query.trim() } })
      .pipe(
        timeout(15000),
        catchError((error: any) => {
          if (error?.name === 'TimeoutError') {
            return throwError(() => ({
              status: 408,
              error: { message: 'Student lookup timed out. Try the student number or a more specific name.' },
            }));
          }
          return throwError(() => error);
        })
      );
  }

  getStudentBalance(studentId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/finance/balance`, { params: { studentId } }).pipe(
      timeout(45000),
      catchError((error: any) => {
        if (error?.name === 'TimeoutError') {
          return throwError(() => ({
            status: 408,
            error: { message: 'Balance lookup timed out. Try the student number or ID.' }
          }));
        }
        return throwError(() => error);
      })
    );
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
    const id = String(invoiceId || '').trim();
    return this.http.put(`${this.apiUrl}/finance/${id}/note`, payload).pipe(
      timeout(45000),
      catchError((error: any) => {
        if (error?.name === 'TimeoutError') {
          return throwError(() => ({
            status: 408,
            error: { message: 'Applying note timed out. Please try again.' }
          }));
        }
        return throwError(() => error);
      })
    );
  }

  getInvoice(invoiceId: string): Observable<any> {
    const id = String(invoiceId || '').trim().replace(/:.*$/, '');
    if (!id) {
      return of(null);
    }
    return this.http.get<PaginatedResponse<any> | any[]>(`${this.apiUrl}/finance`, {
      params: { invoiceId: id, page: 1, limit: 1 }
    }).pipe(
      map((response) => {
        if (!response) return null;
        if (Array.isArray(response)) return response[0] ?? null;
        if (Array.isArray(response.data)) return response.data[0] ?? null;
        return null;
      }),
      catchError((error) => {
        console.error('Error loading invoice:', error);
        return throwError(() => error);
      })
    );
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
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      switchMap((response) => {
        const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
        const body = response.body;
        if (!body || body.size === 0) {
          return throwError(() => ({ status: response.status, error: { message: 'Receipt PDF is empty' } }));
        }
        if (contentType.includes('application/json')) {
          return from(body.text()).pipe(
            switchMap((text) => {
              let message = 'Failed to load receipt';
              try {
                const parsed = JSON.parse(text);
                message = parsed?.message || message;
              } catch {
                if (text) message = text;
              }
              return throwError(() => ({ status: response.status, error: { message } }));
            })
          );
        }
        return of(body);
      })
    );
  }

  getOutstandingBalancePDF(preview = false): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/finance/outstanding-balances/pdf`, {
      params: { preview: preview ? 'true' : 'false' },
      responseType: 'blob'
    });
  }

  getExemptionReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/finance/exemption-report`).pipe(
      map((response) => (Array.isArray(response) ? response : [])),
      catchError((error: any) => {
        console.error('Error loading exemption report:', error);
        return throwError(() => error);
      })
    );
  }

  getExemptionReportPDF(preview = false): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/finance/exemption-report/pdf`, {
      params: { preview: preview ? 'true' : 'false' },
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
        return throwError(() => error);
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

  /** Cash receipts report HTML: preview (inline) or download (attachment). */
  getCashReceiptsPDF(term?: string, preview = false): Observable<Blob> {
    const params: any = { preview: preview ? 'true' : 'false' };
    if (term && term.trim()) params.term = term.trim();
    return this.http.get(`${this.apiUrl}/finance/cash-receipts/pdf`, {
      params,
      responseType: 'blob'
    });
  }

  /** Fees collection report HTML with optional filtered rows (respects on-screen filters). */
  postCashReceiptsReportHtml(
    body: {
      term?: string;
      rows?: Array<{
        paymentDate?: string;
        receiptNumber?: string;
        invoiceNumber?: string;
        studentName?: string;
        studentNumber?: string;
        amountPaid?: number;
        paymentMethod?: string;
      }>;
    },
    preview = true
  ): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/finance/cash-receipts/report-html`, body, {
      params: { preview: preview ? 'true' : 'false' },
      responseType: 'blob'
    });
  }

  /** Cash receipts: total payments via /payments/record for the term (Tuition + DH + Transport). Optional feeType, page, limit, startDate, endDate. Pass fetchAll to return every line (backend cap). */
  getCashReceipts(
    term?: string,
    feeType?: string,
    page?: number,
    limit?: number,
    startDate?: string,
    endDate?: string,
    options?: { fetchAll?: boolean }
  ): Observable<{
    term: string;
    activeTerm: string | null;
    cashLogisticsTermAutoPicked?: boolean;
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
    totalOutstandingRaw?: number;
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
    if (options?.fetchAll) {
      params.all = '1';
    } else {
      if (page != null && page >= 1) params.page = String(page);
      if (limit != null && limit >= 1) params.limit = String(Math.min(100, Math.max(1, limit)));
    }
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

  /** Invoice reconciliation audit: find invoices where paidAmount + balance != amount + previousBalance - prepaidAmount. */
  getInvoiceReconciliationAudit(term?: string): Observable<{
    term: string;
    invoicesChecked: number;
    violationsCount: number;
    totalLeft: number;
    totalRight: number;
    totalDiscrepancy: number;
    identity: string;
    violations: Array<{
      invoiceId: string;
      invoiceNumber: string;
      studentNumber: string | null;
      studentName: string | null;
      term: string | null;
      amount: number;
      previousBalance: number;
      prepaidAmount: number;
      paidAmount: number;
      balance: number;
      leftSide: number;
      rightSide: number;
      discrepancy: number;
    }>;
  }> {
    const params: any = {};
    if (term && term.trim()) params.term = term.trim();
    return this.http.get<any>(`${this.apiUrl}/finance/audit/invoice-reconciliation`, { params });
  }

  // —— Financial Books dashboard ——

  getBalanceSheet(): Observable<{
    cashBalance: number;
    totalDebtors: number;
    monthlyCollections: number;
    debtorCount: number;
  }> {
    return this.http.get<any>(`${this.apiUrl}/finance/balance-sheet`);
  }

  getDebtorsAging(): Observable<Array<{ bucket: string; count: number; amount: number }>> {
    return this.http.get<any[]>(`${this.apiUrl}/finance/debtors-aging`).pipe(
      map((r) => (Array.isArray(r) ? r : [])),
      catchError(() => of([]))
    );
  }

  getClassDebtSummary(): Observable<Array<{ id: string; name: string; formName: string | null; owed: number; studentsOwing: number }>> {
    return this.http.get<any[]>(`${this.apiUrl}/finance/class-debt-summary`).pipe(
      map((r) => (Array.isArray(r) ? r : [])),
      catchError(() => of([]))
    );
  }

  getRecentPayments(limit = 12): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/finance/recent-payments`, { params: { limit } }).pipe(
      map((r) => (Array.isArray(r) ? r : [])),
      catchError(() => of([]))
    );
  }

  getFinanceDebtors(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/finance/debtors`).pipe(
      map((r) => (Array.isArray(r) ? r : [])),
      catchError(() => of([]))
    );
  }

  getCashbook(params: { from?: string; to?: string; search?: string } = {}): Observable<{
    entries: any[];
    summary: { count: number; totalIn: number; totalOut: number };
  }> {
    return this.http.get<any>(`${this.apiUrl}/finance/cashbook`, { params: params as any }).pipe(
      catchError(() => of({ entries: [], summary: { count: 0, totalIn: 0, totalOut: 0 } }))
    );
  }

  createCashbookEntry(body: {
    entryDate: string;
    type: 'receipt' | 'payment';
    description: string;
    amount: number;
    paymentMethod?: string;
    reference?: string;
    studentId?: string;
    invoiceId?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/cashbook`, body);
  }

  getStudentStatement(studentId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/finance/statement/${studentId}`);
  }

  getStudentStatementPDF(studentId: string): Observable<{ blob: Blob; filename: string }> {
    return this.http
      .get(`${this.apiUrl}/finance/statement/${studentId}/pdf`, {
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(
        map((response) => {
          const blob = response.body as Blob;
          const disposition = response.headers.get('Content-Disposition') || '';
          const match = disposition.match(/filename="?([^"]+)"?/);
          const filename = match ? match[1] : `statement-${studentId}.pdf`;
          return { blob, filename };
        })
      );
  }

  sendDebtorReminders(studentIds: string[]): Observable<{ sent: number; skipped?: number }> {
    return this.http.post<{ sent: number; skipped?: number }>(`${this.apiUrl}/finance/reminders/send`, { studentIds });
  }

  getSchoolTermsForReports(): Observable<{
    terms: Array<{ id: string; name: string; label: string; term: string; year: string; startDate: string; endDate: string }>;
    activeTermId: string | null;
    activeTerm: string | null;
  }> {
    return this.http.get<any>(`${this.apiUrl}/finance/reports/school-terms`);
  }

  getStudentLedgerReport(params: { termId: string; studentId?: string; q?: string }): Observable<any> {
    const query: any = { termId: params.termId };
    if (params.studentId) query.studentId = params.studentId;
    if (params.q) query.q = params.q;
    return this.http.get(`${this.apiUrl}/finance/reports/student-ledger`, { params: query });
  }

  getStudentLedgerPdf(termId: string, studentId: string, preview = false): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/finance/reports/student-ledger/pdf`, {
      params: { termId, studentId, preview: preview ? 'true' : 'false' },
      responseType: 'blob',
    });
  }

  getRemediationPreview(options: {
    studentIds: string;
    startDate?: string;
    endDate?: string;
  }): Observable<any> {
    const params: any = { studentIds: options.studentIds };
    if (options.startDate) params.startDate = options.startDate;
    if (options.endDate) params.endDate = options.endDate;
    return this.http.get(`${this.apiUrl}/finance/remediation/preview`, { params });
  }

  postRemediationReverse(payload: {
    paymentLogIds: string[];
    reason?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/remediation/reverse`, payload);
  }

  postRemediationCreditNote(payload: {
    invoiceId: string;
    item: 'tuition' | 'transport' | 'diningHall' | 'combined';
    amount: number;
    reason?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/remediation/credit-note`, payload);
  }
}


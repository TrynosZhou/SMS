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
    const params: any = {};
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

  calculateNextTermBalance(studentId: string, nextTermAmount: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/calculate-balance`, { studentId, nextTermAmount });
  }

  createBulkInvoices(term: string, dueDate: string, description?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/finance/bulk`, { term, dueDate, description });
  }

  getStudentBalance(studentId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/finance/balance`, { params: { studentId } });
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

  getOutstandingBalances(): Observable<any> {
    return this.http.get(`${this.apiUrl}/finance/outstanding-balances`);
  }
}


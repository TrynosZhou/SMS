import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { FinanceService } from '../../../services/finance.service';
import { pdfBlobViewerUrl } from '../../../utils/pdf-preview.util';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  standalone: false,
  selector: 'app-student-invoice-statement',
  templateUrl: './student-invoice-statement.component.html',
  styleUrls: ['./student-invoice-statement.component.css'],
  animations: [
    trigger('fadeIn', [
      state('void', style({ opacity: 0, transform: 'translateY(10px)' })),
      transition(':enter', [animate('320ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))])
    ])
  ]
})
export class StudentInvoiceStatementComponent implements OnInit, OnDestroy {
  user: any;
  student: any;
  studentId = '';

  allInvoices: any[] = [];
  filteredInvoices: any[] = [];

  currentBalance = 0;

  searchQuery = '';
  statusFilter = 'all';

  loading = false;

  error = '';
  success = '';

  currencySymbol = 'KES';

  showPdfViewer = false;
  modalInvoice: any = null;
  modalSafePdfUrl: SafeResourceUrl | null = null;
  private modalPdfBlobUrl: string | null = null;
  modalInvoiceNumber = '';
  modalInvoiceId = '';
  modalLoadingPdf = false;
  modalPdfError = false;

  private readonly destroy$ = new Subject<void>();
  private readonly requestTimeoutMs = 60000;

  constructor(
    private authService: AuthService,
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadStudentData();
    this.loadSettings();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.revokeModalPdfUrl();
  }

  private revokeModalPdfUrl() {
    if (this.modalPdfBlobUrl) {
      window.URL.revokeObjectURL(this.modalPdfBlobUrl);
      this.modalPdfBlobUrl = null;
    }
  }

  loadStudentData(retryCount = 0) {
    const maxRetries = 5;
    this.user = this.authService.getCurrentUser();

    if (!this.user) {
      if (retryCount < maxRetries) { setTimeout(() => this.loadStudentData(retryCount + 1), 500); return; }
      this.error = 'User information not found. Please log in again.';
      return;
    }

    if (this.user.role === 'student' && !this.user.student) {
      if (retryCount < maxRetries) { setTimeout(() => this.loadStudentData(retryCount + 1), 1000); return; }
      this.error = 'Student information not found. Please log out and log in again.';
      return;
    }

    if (!this.user.student) {
      this.error = 'Student information not found. Please log out and log in again.';
      return;
    }

    this.student = this.user.student;
    this.studentId = this.student.id || '';

    if (!this.studentId) {
      this.error = 'Student ID not found. Please log in again.';
      return;
    }

    this.loadInvoices();
    this.loadCurrentBalance();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || 'KES';
      },
      error: () => {}
    });
  }

  loadInvoices() {
    if (!this.studentId) return;
    this.loading = true;
    this.error = '';

    this.financeService.getInvoices(this.studentId).pipe(
      timeout(this.requestTimeoutMs),
      takeUntil(this.destroy$),
      catchError((err: any) => {
        this.error =
          err?.name === 'TimeoutError'
            ? 'Request timed out while loading invoices.'
            : err?.error?.message || err?.message || 'Failed to load invoices.';
        return of([]);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (data: any) => {
        this.allInvoices = (Array.isArray(data) ? data : []).sort((a: any, b: any) => {
          const dA = new Date(a.createdAt || a.dueDate || 0).getTime();
          const dB = new Date(b.createdAt || b.dueDate || 0).getTime();
          return dB - dA;
        });
        this.applyFilter();
        this.cdr.markForCheck();
      },
    });
  }

  loadCurrentBalance() {
    if (!this.studentId) return;
    this.financeService.getStudentBalance(this.studentId).pipe(
      timeout(this.requestTimeoutMs),
      takeUntil(this.destroy$),
      catchError(() => of({ balance: 0 }))
    ).subscribe({
      next: (data: any) => {
        this.currentBalance = parseFloat(String(data.balance || 0));
        this.cdr.markForCheck();
      },
    });
  }

  applyFilter() {
    let list = [...this.allInvoices];

    if (this.statusFilter !== 'all') {
      list = list.filter(inv => (inv.status || '').toLowerCase() === this.statusFilter);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(inv =>
        (inv.invoiceNumber || '').toLowerCase().includes(q) ||
        (inv.term || '').toLowerCase().includes(q)
      );
    }

    this.filteredInvoices = list;
  }

  clearSearch() {
    this.searchQuery = '';
    this.statusFilter = 'all';
    this.applyFilter();
  }

  viewInvoicePdf(invoice: any, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!invoice?.id) {
      return;
    }

    this.modalInvoice = invoice;
    this.showPdfViewer = true;
    this.modalInvoiceNumber = invoice.invoiceNumber || `INV-${invoice.id}`;
    this.modalInvoiceId = invoice.id;
    this.modalPdfError = false;
    this.modalSafePdfUrl = null;
    this.error = '';
    this.loadModalPdf(invoice.id);
  }

  loadModalPdf(invoiceId: string): void {
    this.modalLoadingPdf = true;
    this.modalPdfError = false;
    this.revokeModalPdfUrl();
    this.modalSafePdfUrl = null;

    this.financeService.getInvoicePDF(invoiceId).pipe(
      timeout(this.requestTimeoutMs),
      takeUntil(this.destroy$),
      catchError(() => {
        this.modalPdfError = true;
        return of(null);
      }),
      finalize(() => {
        this.modalLoadingPdf = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (response: any) => {
        if (!response) {
          return;
        }
        const blob: Blob = response.blob || response;
        if (!blob || blob.size === 0) {
          this.modalPdfError = true;
          return;
        }
        this.revokeModalPdfUrl();
        this.modalPdfBlobUrl = window.URL.createObjectURL(blob);
        this.modalSafePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
          pdfBlobViewerUrl(this.modalPdfBlobUrl)
        );
        this.cdr.markForCheck();
      },
    });
  }

  retryModalPdf(): void {
    if (this.modalInvoiceId) {
      this.loadModalPdf(this.modalInvoiceId);
    }
  }

  closePdfViewer(): void {
    this.showPdfViewer = false;
    this.revokeModalPdfUrl();
    this.modalSafePdfUrl = null;
    this.modalPdfError = false;
    this.modalLoadingPdf = false;
    this.modalInvoice = null;
    this.cdr.markForCheck();
  }

  downloadModalPdf(): void {
    if (!this.modalInvoiceId) {
      return;
    }
    this.downloadPDF(this.modalInvoiceId);
  }

  downloadPDF(invoiceId: string) {
    this.error = '';
    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (response: any) => {
        const blob: Blob = response.blob || response;
        const filename = response.filename || `Invoice-${invoiceId}.pdf`;
        if (!blob || blob.size === 0) {
          this.error = 'Received empty PDF file.';
          return;
        }
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        this.success = 'PDF downloaded successfully.';
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to download PDF.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  get studentFullName(): string {
    if (!this.student) return '';
    return `${this.student.firstName || ''} ${this.student.lastName || ''}`.trim()
      || this.user?.fullName || '';
  }

  get latestInvoice(): any | null {
    return this.allInvoices.length > 0 ? this.allInvoices[0] : null;
  }

  get totalPaid(): number {
    return this.allInvoices.reduce((s, inv) => s + parseFloat(String(inv.paidAmount || 0)), 0);
  }

  get paidCount(): number {
    return this.allInvoices.filter(i => (i.status || '').toLowerCase() === 'paid').length;
  }

  get pendingCount(): number {
    return this.allInvoices.length - this.paidCount;
  }

  getStatusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'paid') return 'badge-paid';
    if (s === 'partial') return 'badge-partial';
    if (s === 'overdue') return 'badge-overdue';
    return 'badge-pending';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

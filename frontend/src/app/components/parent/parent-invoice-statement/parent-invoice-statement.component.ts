import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { ParentService } from '../../../services/parent.service';
import { FinanceService } from '../../../services/finance.service';
import { pdfBlobViewerUrl } from '../../../utils/pdf-preview.util';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  standalone: false,
  selector: 'app-parent-invoice-statement',
  templateUrl: './parent-invoice-statement.component.html',
  styleUrls: ['./parent-invoice-statement.component.css'],
  animations: [
    trigger('fadeIn', [
      state('void', style({ opacity: 0, transform: 'translateY(10px)' })),
      transition(':enter', [animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))])
    ])
  ]
})
export class ParentInvoiceStatementComponent implements OnInit, OnDestroy {
  parentName = '';

  students: any[] = [];
  selectedStudent: any = null;
  loadingStudents = false;

  invoices: any[] = [];
  selectedInvoice: any = null;
  loadingInvoices = false;

  inlinePdf: SafeResourceUrl | null = null;
  pdfBlobUrl: string | null = null;
  loadingPdf = false;
  pdfError = false;

  currencySymbol = 'KES';
  schoolLogo: string | null = null;

  error = '';
  success = '';

  private requestedStudentId: string | null = null;
  private readonly destroy$ = new Subject<void>();
  private readonly requestTimeoutMs = 60000;

  constructor(
    private authService: AuthService,
    private parentService: ParentService,
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    const user = this.authService.getCurrentUser();
    const portalParent = this.authService.getParentPortalParent();
    const p = user?.parent || portalParent;
    if (p) {
      this.parentName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || user?.fullName?.trim() || 'Parent';
    } else {
      this.parentName = user?.fullName?.trim() || 'Parent';
    }
  }

  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(q => {
      this.requestedStudentId = q.get('studentId');
      if (this.students.length > 0 && !this.loadingStudents) {
        this.applyPreferredStudent();
      }
    });
    this.loadSettings();
    this.loadStudents();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.revokePdfUrl();
  }

  private revokePdfUrl() {
    if (this.pdfBlobUrl) {
      window.URL.revokeObjectURL(this.pdfBlobUrl);
      this.pdfBlobUrl = null;
    }
  }

  loadSettings() {
    this.settingsService
      .getSettings()
      .pipe(
        timeout(this.requestTimeoutMs),
        takeUntil(this.destroy$),
        catchError(() => of({}))
      )
      .subscribe((data: any) => {
        this.currencySymbol = data?.currencySymbol || 'KES';
        this.schoolLogo = data?.schoolLogo || null;
        this.cdr.markForCheck();
      });
  }

  loadStudents() {
    this.loadingStudents = true;
    this.error = '';

    this.parentService
      .getLinkedStudents()
      .pipe(
        timeout(this.requestTimeoutMs),
        takeUntil(this.destroy$),
        catchError((err: any) => {
          if (err?.status === 401) {
            this.error = 'Session expired. Redirecting to login…';
            setTimeout(() => this.authService.logout(), 2000);
          } else {
            this.error =
              err?.name === 'TimeoutError'
                ? 'Request timed out while loading students.'
                : err?.error?.message || err?.message || 'Failed to load linked students.';
          }
          return of({ students: [] });
        }),
        finalize(() => {
          this.loadingStudents = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          this.students = response?.students || [];
          if (this.students.length > 0) {
            this.applyPreferredStudent();
          }
          this.cdr.markForCheck();
        },
      });
  }

  private applyPreferredStudent() {
    const preferred = this.requestedStudentId
      ? this.students.find(s => String(s?.id) === String(this.requestedStudentId))
      : null;
    const target = preferred || this.students[0];
    if (target && this.selectedStudent?.id !== target.id) {
      this.selectStudent(target);
    }
  }

  selectStudent(student: any) {
    if (!student?.id || this.selectedStudent?.id === student.id) return;
    this.selectedStudent = student;
    this.invoices = [];
    this.selectedInvoice = null;
    this.inlinePdf = null;
    this.revokePdfUrl();
    this.pdfError = false;
    this.loadInvoices(student.id);
  }

  loadInvoices(studentId: string) {
    this.loadingInvoices = true;
    this.error = '';

    this.financeService
      .getInvoices(studentId)
      .pipe(
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
          this.loadingInvoices = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any[]) => {
          this.invoices = (data || []).sort((a: any, b: any) => {
            const dA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dB - dA;
          });
          if (this.invoices.length > 0) {
            this.selectInvoice(this.invoices[0]);
          }
          this.cdr.markForCheck();
        },
      });
  }

  selectInvoice(invoice: any) {
    if (!invoice?.id || this.selectedInvoice?.id === invoice.id) return;
    this.selectedInvoice = invoice;
    this.inlinePdf = null;
    this.revokePdfUrl();
    this.pdfError = false;
    this.loadInlinePdf(invoice.id);
  }

  loadInlinePdf(invoiceId: string) {
    this.loadingPdf = true;
    this.pdfError = false;

    this.financeService
      .getInvoicePDF(invoiceId)
      .pipe(
        timeout(this.requestTimeoutMs),
        takeUntil(this.destroy$),
        catchError(() => {
          this.pdfError = true;
          return of(null);
        }),
        finalize(() => {
          this.loadingPdf = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          if (!response) return;
          const blob: Blob = response.blob || response;
          if (!blob || blob.size === 0) {
            this.pdfError = true;
            return;
          }
          this.revokePdfUrl();
          this.pdfBlobUrl = window.URL.createObjectURL(blob);
          this.inlinePdf = this.sanitizer.bypassSecurityTrustResourceUrl(
            pdfBlobViewerUrl(this.pdfBlobUrl)
          );
        },
      });
  }

  retryPdf() {
    if (this.selectedInvoice?.id) {
      this.loadInlinePdf(this.selectedInvoice.id);
    }
  }

  downloadPdf(invoice: any) {
    if (!invoice?.id) return;
    this.error = '';

    this.financeService
      .getInvoicePDF(invoice.id)
      .pipe(timeout(this.requestTimeoutMs), takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          const blob: Blob = response.blob || response;
          if (!blob || blob.size === 0) {
            this.error = 'Received an empty PDF file.';
            return;
          }
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = response.filename || `Invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          this.success = 'PDF downloaded successfully.';
          setTimeout(() => {
            this.success = '';
            this.cdr.markForCheck();
          }, 3000);
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to download PDF.';
          setTimeout(() => {
            this.error = '';
            this.cdr.markForCheck();
          }, 5000);
        },
      });
  }

  studentInitials(student: any): string {
    const f = (student?.firstName || '')[0]?.toUpperCase() || '';
    const l = (student?.lastName || '')[0]?.toUpperCase() || '';
    return f + l || '?';
  }

  statusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'paid') return 'badge-paid';
    if (s === 'partial') return 'badge-partial';
    if (s === 'overdue') return 'badge-overdue';
    return 'badge-pending';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  get totalBalance(): number {
    return this.invoices.reduce(
      (sum, inv) => sum + Math.max(0, parseFloat(String(inv.balance || inv.remainingBalance || 0))),
      0
    );
  }

  get paidCount(): number {
    return this.invoices.filter(i => (i.status || '').toLowerCase() === 'paid').length;
  }

  logout() {
    this.authService.logout();
  }
}

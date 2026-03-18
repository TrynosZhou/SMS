import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ParentService } from '../../../services/parent.service';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
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

  // Auth & parent info
  parentName = '';

  // Students
  students: any[] = [];
  selectedStudent: any = null;
  loadingStudents = false;

  // Invoices for selected student
  invoices: any[] = [];
  selectedInvoice: any = null;
  loadingInvoices = false;

  // Inline PDF
  inlinePdf: SafeResourceUrl | null = null;
  private pdfBlobUrl: string | null = null;
  loadingPdf = false;
  pdfError = false;

  // Settings
  currencySymbol = 'KES';
  schoolLogo2: string | null = null;

  // UI state
  error = '';
  success = '';

  private requestedStudentId: string | null = null;

  constructor(
    private authService: AuthService,
    private parentService: ParentService,
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer,
    private router: Router,
    private route: ActivatedRoute
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim()
        || user.fullName?.trim() || 'Parent';
    } else {
      this.parentName = user?.fullName?.trim() || 'Parent';
    }
  }

  ngOnInit() {
    this.loadSettings();
    this.route.queryParamMap.subscribe(q => {
      this.requestedStudentId = q.get('studentId');
    });
    this.loadStudents();
  }

  ngOnDestroy() {
    this.revokePdfUrl();
  }

  private revokePdfUrl() {
    if (this.pdfBlobUrl) {
      window.URL.revokeObjectURL(this.pdfBlobUrl);
      this.pdfBlobUrl = null;
    }
  }

  // ── Settings ─────────────────────────────────────────────────
  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || 'KES';
        this.schoolLogo2    = data.schoolLogo2 || null;
      },
      error: () => {}
    });
  }

  // ── Students ─────────────────────────────────────────────────
  loadStudents() {
    this.loadingStudents = true;
    this.error = '';
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        this.students = response.students || [];
        this.loadingStudents = false;
        if (this.students.length > 0) {
          const preferred = this.requestedStudentId
            ? this.students.find(s => String(s?.id) === String(this.requestedStudentId))
            : null;
          this.selectStudent(preferred || this.students[0]);
        }
      },
      error: (err: any) => {
        this.loadingStudents = false;
        this.error = err.error?.message || 'Failed to load linked students.';
      }
    });
  }

  selectStudent(student: any) {
    if (this.selectedStudent?.id === student?.id) return;
    this.selectedStudent = student;
    this.invoices = [];
    this.selectedInvoice = null;
    this.inlinePdf = null;
    this.revokePdfUrl();
    this.pdfError = false;
    this.loadInvoices(student.id);
  }

  // ── Invoices ──────────────────────────────────────────────────
  loadInvoices(studentId: string) {
    this.loadingInvoices = true;
    this.error = '';
    this.financeService.getInvoices(studentId).subscribe({
      next: (data: any[]) => {
        this.loadingInvoices = false;
        this.invoices = (data || []).sort((a: any, b: any) => {
          const dA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dB - dA;
        });
        // Auto-preview the most recent invoice
        if (this.invoices.length > 0) {
          this.selectInvoice(this.invoices[0]);
        }
      },
      error: (err: any) => {
        this.loadingInvoices = false;
        this.error = err.error?.message || 'Failed to load invoices.';
      }
    });
  }

  selectInvoice(invoice: any) {
    if (this.selectedInvoice?.id === invoice?.id) return;
    this.selectedInvoice = invoice;
    this.inlinePdf = null;
    this.revokePdfUrl();
    this.pdfError = false;
    this.loadInlinePdf(invoice.id);
  }

  // ── PDF ───────────────────────────────────────────────────────
  loadInlinePdf(invoiceId: string) {
    this.loadingPdf = true;
    this.pdfError = false;

    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (response: any) => {
        this.loadingPdf = false;
        const blob: Blob = response.blob || response;
        if (!blob || blob.size === 0) { this.pdfError = true; return; }
        this.revokePdfUrl();
        this.pdfBlobUrl = window.URL.createObjectURL(blob);
        this.inlinePdf  = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfBlobUrl);
      },
      error: () => {
        this.loadingPdf = false;
        this.pdfError = true;
      }
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

    this.financeService.getInvoicePDF(invoice.id).subscribe({
      next: (response: any) => {
        const blob: Blob = response.blob || response;
        if (!blob || blob.size === 0) { this.error = 'Received an empty PDF file.'; return; }
        const url  = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href  = url;
        link.download = response.filename || `Invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
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

  // ── Helpers ───────────────────────────────────────────────────
  studentInitials(student: any): string {
    const f = (student?.firstName || '')[0]?.toUpperCase() || '';
    const l = (student?.lastName  || '')[0]?.toUpperCase() || '';
    return f + l || '?';
  }

  statusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'paid')    return 'badge-paid';
    if (s === 'partial') return 'badge-partial';
    if (s === 'overdue') return 'badge-overdue';
    return 'badge-pending';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  get totalBalance(): number {
    return this.invoices.reduce((sum, inv) => sum + Math.max(0, parseFloat(String(inv.balance || inv.remainingBalance || 0))), 0);
  }

  get paidCount(): number {
    return this.invoices.filter(i => (i.status || '').toLowerCase() === 'paid').length;
  }

  logout() { this.authService.logout(); }
}

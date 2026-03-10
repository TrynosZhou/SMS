import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
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

  // Invoices
  allInvoices: any[] = [];
  filteredInvoices: any[] = [];
  selectedInvoice: any = null;

  // Balance
  currentBalance = 0;

  // Filters
  searchQuery = '';
  statusFilter = 'all';

  // Loading states
  loading = false;
  loadingPdf = false;

  // Alerts
  error = '';
  success = '';

  // Settings
  currencySymbol = 'KES';
  schoolLogo: string | null = null;

  // Inline PDF
  inlinePdf: SafeResourceUrl | null = null;
  private pdfBlobUrl: string | null = null;
  pdfError = false;

  constructor(
    private authService: AuthService,
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.loadStudentData();
    this.loadSettings();
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

  // ── Student data ──────────────────────────────────────────────
  loadStudentData(retryCount = 0) {
    const maxRetries = 5;
    this.user = this.authService.getCurrentUser();

    if (!this.user) {
      if (retryCount < maxRetries) { setTimeout(() => this.loadStudentData(retryCount + 1), 500); return; }
      this.error = 'User information not found. Please log in again.'; return;
    }

    if (this.user.role === 'student' && !this.user.student) {
      if (retryCount < maxRetries) { setTimeout(() => this.loadStudentData(retryCount + 1), 1000); return; }
      this.error = 'Student information not found. Please log out and log in again.'; return;
    }

    if (!this.user.student) { this.error = 'Student information not found. Please log out and log in again.'; return; }

    this.student   = this.user.student;
    this.studentId = this.student.id || '';

    if (!this.studentId) { this.error = 'Student ID not found. Please log in again.'; return; }

    this.loadInvoices();
    this.loadCurrentBalance();
  }

  // ── Settings ─────────────────────────────────────────────────
  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || 'KES';
      },
      error: () => {}
    });
  }

  // ── Invoices ──────────────────────────────────────────────────
  loadInvoices() {
    if (!this.studentId) return;
    this.loading = true;
    this.error   = '';

    this.financeService.getInvoices(this.studentId).subscribe({
      next: (data: any) => {
        this.loading = false;
        this.allInvoices = (Array.isArray(data) ? data : []).sort((a: any, b: any) => {
          const dA = new Date(a.createdAt || a.dueDate || 0).getTime();
          const dB = new Date(b.createdAt || b.dueDate || 0).getTime();
          return dB - dA;
        });
        this.applyFilter();
        // Auto-select & preview the most recent invoice
        if (this.allInvoices.length > 0) {
          this.selectInvoice(this.allInvoices[0]);
        }
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to load invoices.';
      }
    });
  }

  loadCurrentBalance() {
    if (!this.studentId) return;
    this.financeService.getStudentBalance(this.studentId).subscribe({
      next: (data: any) => { this.currentBalance = parseFloat(String(data.balance || 0)); },
      error: () => {}
    });
  }

  // ── Filter / search ───────────────────────────────────────────
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
    this.searchQuery  = '';
    this.statusFilter = 'all';
    this.applyFilter();
  }

  // ── Invoice selection & PDF ───────────────────────────────────
  selectInvoice(invoice: any) {
    if (this.selectedInvoice?.id === invoice?.id) return;
    this.selectedInvoice = invoice;
    this.inlinePdf = null;
    this.revokePdfUrl();
    this.pdfError = false;
    this.loadInlinePdf(invoice.id);
  }

  loadInlinePdf(invoiceId: string) {
    this.loadingPdf = true;
    this.pdfError   = false;

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
        this.pdfError   = true;
      }
    });
  }

  retryPdf() {
    if (this.selectedInvoice?.id) this.loadInlinePdf(this.selectedInvoice.id);
  }

  downloadPDF(invoiceId: string) {
    this.error = '';
    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (response: any) => {
        const blob: Blob = response.blob || response;
        const filename   = response.filename || `Invoice-${invoiceId}.pdf`;
        if (!blob || blob.size === 0) { this.error = 'Received empty PDF file.'; return; }
        const url  = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href  = url;
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

  // ── Computed helpers ──────────────────────────────────────────
  get studentFullName(): string {
    if (!this.student) return '';
    return `${this.student.firstName || ''} ${this.student.lastName || ''}`.trim()
      || this.user?.fullName || '';
  }

  get totalInvoiced(): number {
    return this.allInvoices.reduce((s, inv) => s + parseFloat(String(inv.amount || inv.totalAmount || 0)), 0);
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
    if (s === 'paid')    return 'badge-paid';
    if (s === 'partial') return 'badge-partial';
    if (s === 'overdue') return 'badge-overdue';
    return 'badge-pending';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

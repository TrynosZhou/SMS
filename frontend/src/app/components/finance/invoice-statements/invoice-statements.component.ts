import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { pdfBlobViewerUrl } from '../../../utils/pdf-preview.util';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { AuthService } from '../../../services/auth.service';
import { SettingsService } from '../../../services/settings.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  standalone: false,  selector: 'app-invoice-statements',
templateUrl: './invoice-statements.component.html',
  styleUrls: ['./invoice-statements.component.css', './invoice-statements-ledger-modern.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0 })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0 }))
      ])
    ]),
    trigger('slideInUp', [
      state('void', style({ transform: 'translateY(50px)', opacity: 0 })),
      transition(':enter', [
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class InvoiceStatementsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly ledgerSearchInput$ = new Subject<string>();
  readonly ledgerSkeletonRows = [0, 1, 2, 3, 4, 5];

  invoices: any[] = [];
  displayedInvoices: any[] = [];
  students: any[] = [];
  selectedStudent = '';
  selectedStatus = '';
  loading = false;
  success = '';
  error = '';
  showPaymentForm = false;
  selectedInvoice: any = null;
  paymentForm: any = {
    amount: 0,
    paymentDate: '',
    paymentMethod: 'Cash',
    notes: '',
    isPrepayment: false
  };
  currencySymbol = ''; // Loaded from settings
  submitting = false;
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();

  // PDF Viewer properties
  showPdfViewer = false;
  pdfUrl: string | null = null;
  safePdfUrl: SafeResourceUrl | null = null;
  loadingPdf = false;
  currentInvoiceFilename: string = '';
  currentInvoiceNumber: string = '';
  hideInvoiceActions = false;
  pageTitle = 'Invoice Statements';
  pageSubtitle = 'View and manage invoice statements by student and status';

  lastLoadedAt: Date | null = null;
  ledgerSearchQuery = '';
  ledgerStatusChip = 'all';
  ledgerSortColumn:
    | 'invoiceNumber'
    | 'studentName'
    | 'amount'
    | 'balance'
    | 'dueDate'
    | 'term'
    | 'status' = 'dueDate';
  ledgerSortDir: 'asc' | 'desc' = 'desc';

  constructor(
    public financeService: FinanceService,
    private studentService: StudentService,
    public authService: AuthService,
    public router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private settingsService: SettingsService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.ledgerSearchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.ledgerSearchQuery = q;
        if (this.hideInvoiceActions) this.applyLedgerView();
        this.cdr.markForCheck();
      });

    const routeData = this.route.snapshot.data || {};
    this.hideInvoiceActions = !!routeData['hideInvoiceActions'];
    if (routeData['pageTitle']) {
      this.pageTitle = String(routeData['pageTitle']);
    }
    if (this.hideInvoiceActions) {
      this.pageSubtitle = 'Student invoice ledger entries by term and status';
    }

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
if (params['studentId']) {
        this.selectedStudent = params['studentId'];
      }
      if (params['status']) {
        this.selectedStatus = params['status'];
      }
      this.loadInvoices();
    });

    const loadPath = this.hideInvoiceActions
      ? '/financial-reports/student-ledgers'
      : '/invoices/statements';
    activatePageLoad(this.router, this.destroy$, loadPath, () => {
      this.loadSettings();
      if (this.authService.hasRole('parent')) {
        const user = this.authService.getCurrentUser();
        if (user?.parent?.students) {
          this.students = user.parent.students;
          if (this.students.length === 1) {
            this.selectedStudent = this.students[0].id;
          }
        }
      } else {
        this.loadStudents();
      }
      const params = this.route.snapshot.queryParams;
      if (params['studentId']) {
        this.selectedStudent = params['studentId'];
      }
      if (params['status']) {
        this.selectedStatus = params['status'];
      }
      this.loadInvoices();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
}

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || '';
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        // Keep empty symbol if settings fail to load
      }
    });
  }

  loadStudents() {
    this.studentService.getStudents().subscribe({
      next: (data: any) => this.students = data,
      error: (err: any) => console.error(err)
    });
  }

  loadInvoices() {
    this.loading = true;
    this.cdr.markForCheck();
    this.financeService
      .getInvoices(this.selectedStudent || undefined, this.selectedStatus || undefined)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          this.invoices = Array.isArray(data) ? data : [];
          this.lastLoadedAt = new Date();
          if (this.hideInvoiceActions) this.applyLedgerView();
        },
        error: (err: any) => {
          console.error(err);
          this.invoices = [];
        }
      });
}

  onFilterChange() {
    this.ledgerStatusChip = this.selectedStatus || 'all';
    // Update URL with query parameters
    const queryParams: any = {};
    if (this.selectedStudent) {
      queryParams.studentId = this.selectedStudent;
    }
    if (this.selectedStatus) {
      queryParams.status = this.selectedStatus;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge'
    });
    this.loadInvoices();
  }

  openPaymentForm(invoice: any) {
    this.selectedInvoice = invoice;
    // Set default payment date to today
    const today = new Date();
    this.paymentForm.paymentDate = today.toISOString().split('T')[0];
    // Set default amount to the remaining balance
    this.paymentForm.amount = invoice.balance || 0;
    this.paymentForm.paymentMethod = 'Cash';
    this.paymentForm.notes = '';
    this.paymentForm.isPrepayment = false;
    this.showPaymentForm = true;
    this.error = '';
    this.success = '';
  }

  closePaymentForm() {
    this.showPaymentForm = false;
    this.selectedInvoice = null;
    this.paymentForm = {
      amount: 0,
      paymentDate: '',
      paymentMethod: 'Cash',
      notes: '',
      isPrepayment: false
    };
    this.fieldErrors = {};
    this.touchedFields.clear();
    this.submitting = false;
  }

  updatePayment() {
    // Mark all fields as touched
    this.touchedFields.add('amount');
    this.touchedFields.add('paymentDate');
    this.touchedFields.add('paymentMethod');
    
    // Validate all fields
    this.validateField('amount');
    this.validateField('paymentDate');
    this.validateField('paymentMethod');
    
    if (!this.isFormValid()) {
      this.error = 'Please fix the errors in the form';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    if (!this.selectedInvoice) return;

    // Validate that payment amount doesn't exceed balance
    if (this.paymentForm.amount > this.selectedInvoice.balance) {
      if (!confirm(`Payment amount (${this.currencySymbol} ${this.paymentForm.amount}) exceeds the balance (${this.currencySymbol} ${this.selectedInvoice.balance}). Continue anyway?`)) {
        return;
      }
    }

    this.submitting = true;
    this.error = '';
    this.success = '';

    // Prepare payment data
    const paymentData = {
      paidAmount: this.paymentForm.amount,
      paymentDate: this.paymentForm.paymentDate,
      paymentMethod: this.paymentForm.paymentMethod,
      notes: this.paymentForm.notes,
      isPrepayment: this.paymentForm.isPrepayment || false
    };

    this.financeService.updatePayment(this.selectedInvoice.id, paymentData).subscribe({
      next: (response: any) => {
        // Reload invoices to get updated balance
        this.loadInvoices();
        
        // Calculate and display updated balance
        const updatedBalance = response.invoice?.balance || 0;
        this.success = `Payment recorded successfully! Updated balance: ${this.currencySymbol} ${parseFloat(String(updatedBalance)).toFixed(2)}`;
        
        this.submitting = false;
        this.closePaymentForm();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.submitting = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to record payment';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  // Validation methods
  validateField(fieldName: string) {
    this.touchedFields.add(fieldName);
    const value = this.paymentForm[fieldName];
    
    switch (fieldName) {
      case 'amount':
        if (!value || value <= 0) {
          this.fieldErrors[fieldName] = 'Payment amount must be greater than 0';
        } else if (this.selectedInvoice && value > this.selectedInvoice.balance * 1.1) {
          // Allow 10% overpayment as buffer
          this.fieldErrors[fieldName] = 'Payment amount seems unusually high';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
      case 'paymentDate':
        if (!value) {
          this.fieldErrors[fieldName] = 'Payment date is required';
        } else {
          const selectedDate = new Date(value);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (selectedDate > today) {
            this.fieldErrors[fieldName] = 'Payment date cannot be in the future';
          } else {
            delete this.fieldErrors[fieldName];
          }
        }
        break;
      case 'paymentMethod':
        if (!value || value.trim() === '') {
          this.fieldErrors[fieldName] = 'Payment method is required';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.touchedFields.has(fieldName) && !!this.fieldErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    return this.fieldErrors[fieldName] || '';
  }

  isFormValid(): boolean {
    this.validateField('amount');
    this.validateField('paymentDate');
    this.validateField('paymentMethod');
    
    return !this.fieldErrors['amount'] && 
           !this.fieldErrors['paymentDate'] && 
           !this.fieldErrors['paymentMethod'] &&
           !!this.paymentForm.amount && 
           this.paymentForm.amount > 0 &&
           !!this.paymentForm.paymentDate &&
           !!this.paymentForm.paymentMethod;
  }

  onAmountChange() {
    if (this.touchedFields.has('amount')) {
      this.validateField('amount');
    }
  }

  getNewBalance(): number {
    if (!this.selectedInvoice || !this.paymentForm.amount) {
      return this.selectedInvoice?.balance || 0;
    }
    return this.selectedInvoice.balance - this.paymentForm.amount;
  }

  viewInvoicePDF(invoiceId: string, event?: Event) {
    // Prevent any default behavior that might trigger download
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    console.log('viewInvoicePDF called for invoice:', invoiceId);
    
    // Find the invoice to get its number
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    this.currentInvoiceNumber = invoice?.invoiceNumber || 'Invoice';
    
    // Show the modal immediately - this is critical
    this.showPdfViewer = true;
    this.loadingPdf = true;
    this.error = '';
    
    console.log('Modal should be visible now. showPdfViewer:', this.showPdfViewer);
    
    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (result: { blob: Blob; filename: string }) => {
        console.log('PDF received, creating preview URL');
        
        // Clean up previous URL if exists
        if (this.pdfUrl) {
          window.URL.revokeObjectURL(this.pdfUrl);
        }
        
        // Create blob URL for preview (not download)
        this.pdfUrl = window.URL.createObjectURL(result.blob);
        this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(pdfBlobViewerUrl(this.pdfUrl));
        this.currentInvoiceFilename = result.filename;
        this.loadingPdf = false;
        
        console.log('PDF preview ready. URL created:', this.pdfUrl);
      },
      error: (err: any) => {
        this.loadingPdf = false;
        this.showPdfViewer = false;
        console.error('Error loading invoice PDF:', err);
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to load invoice PDF';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  downloadInvoicePDF() {
    if (!this.pdfUrl || !this.currentInvoiceFilename) {
      this.error = 'PDF not available for download';
      return;
    }

    const link = document.createElement('a');
    link.href = this.pdfUrl;
    link.download = this.currentInvoiceFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  closePdfViewer() {
    this.showPdfViewer = false;
    if (this.pdfUrl) {
      window.URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }
    this.safePdfUrl = null;
    this.currentInvoiceFilename = '';
    this.currentInvoiceNumber = '';
  }

  viewReceiptPDF(invoiceId: string) {
    this.financeService.getReceiptPDF(invoiceId).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        // Clean up the URL after a delay to free memory
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
      },
      error: (err: any) => {
        console.error('Error loading receipt PDF:', err);
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to load receipt PDF';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  getStatusClass(status: string): string {
    const key = (status || '').toLowerCase();
    const prefix = this.hideInvoiceActions ? 'sl-status-pill' : 'status-pill';
    const statusMap: Record<string, string> = {
      paid: `${prefix} status-paid`,
      pending: `${prefix} status-pending`,
      partial: `${prefix} status-partial`,
      overdue: `${prefix} status-overdue`
    };
    return statusMap[key] || `${prefix} status-default`;
  }

  /** Total balance across filtered invoices */
  get totalBalance(): number {
    return (this.invoices || []).reduce((sum, inv) => sum + parseFloat(String(inv.balance || 0)), 0);
  }

  /** Total paid amount across filtered invoices */
  get totalPaid(): number {
    return (this.invoices || []).reduce((sum, inv) => sum + parseFloat(String(inv.paidAmount || 0)), 0);
  }

  /** Count of paid invoices */
  get paidCount(): number {
    return (this.invoices || []).filter(inv => (inv.status || '').toLowerCase() === 'paid').length;
  }

  /** Count of overdue invoices */
  get overdueCount(): number {
    return (this.invoices || []).filter(inv => (inv.status || '').toLowerCase() === 'overdue').length;
  }

  get ledgerHasData(): boolean {
    return this.lastLoadedAt != null;
  }

  get totalInvoiced(): number {
    return (this.invoices || []).reduce((s, inv) => s + parseFloat(String(inv.amount || 0)), 0);
  }

  get ledgerStudentCount(): number {
    const ids = new Set(
      (this.displayedInvoices || [])
        .map((inv) => inv.studentId || inv.student?.id)
        .filter(Boolean)
    );
    return ids.size;
  }

  get ledgerFilterSummary(): string {
    const parts: string[] = [];
    if (this.selectedStudent) {
      const st = this.students.find((s) => s.id === this.selectedStudent);
      if (st) parts.push(`Student: ${st.firstName} ${st.lastName}`);
    }
    if (this.ledgerStatusChip !== 'all') parts.push(`Status: ${this.ledgerStatusChip}`);
    if (this.ledgerSearchQuery) parts.push(`Search: "${this.ledgerSearchQuery}"`);
    parts.push(`${this.displayedInvoices.length} of ${this.invoices.length} entries`);
    return parts.join(' · ');
  }

  get ledgerStatusCounts(): Record<string, number> {
    const counts: Record<string, number> = {
      all: this.invoices.length,
      paid: 0,
      pending: 0,
      partial: 0,
      overdue: 0
    };
    for (const inv of this.invoices) {
      const s = (inv.status || '').toLowerCase();
      if (counts[s] !== undefined) counts[s] += 1;
    }
    return counts;
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  onLedgerSearchInput(value: string): void {
    this.ledgerSearchInput$.next((value || '').trim());
  }

  clearLedgerSearch(): void {
    this.ledgerSearchQuery = '';
    this.ledgerSearchInput$.next('');
    this.applyLedgerView();
    this.cdr.markForCheck();
  }

  onLedgerStatusChip(status: string): void {
    this.ledgerStatusChip = status;
    this.selectedStatus = status === 'all' ? '' : status;
    this.onFilterChange();
  }

  toggleLedgerSort(column: typeof this.ledgerSortColumn): void {
    if (this.ledgerSortColumn === column) {
      this.ledgerSortDir = this.ledgerSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.ledgerSortColumn = column;
      this.ledgerSortDir = column === 'studentName' || column === 'invoiceNumber' ? 'asc' : 'desc';
    }
    this.applyLedgerView();
    this.cdr.markForCheck();
  }

  ledgerSortIcon(column: string): string {
    if (this.ledgerSortColumn !== column) return '↕';
    return this.ledgerSortDir === 'asc' ? '↑' : '↓';
  }

  trackByInvoiceId(_index: number, inv: { id?: string }): string {
    return inv.id || String(_index);
  }

  studentDisplayName(inv: any): string {
    const s = inv?.student;
    if (!s) return '—';
    return [s.firstName, s.lastName].filter(Boolean).join(' ') || '—';
  }

  openBalanceEnquiry(inv: any): void {
    const num = inv?.student?.studentNumber || inv?.studentId;
    if (!num) return;
    this.router.navigate(['/balance-enquiry'], { queryParams: { studentId: num } });
  }

  exportLedgerCsv(): void {
    const rows = this.displayedInvoices.length ? this.displayedInvoices : this.invoices;
    if (!rows.length) return;
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Invoice #',
      'Student',
      'Term',
      'Grand Total',
      'Paid',
      'Balance',
      'Previous Balance',
      'Status',
      'Due Date'
    ];
    const lines = [header.join(',')];
    for (const inv of rows) {
      lines.push(
        [
          inv.invoiceNumber,
          this.studentDisplayName(inv),
          inv.term,
          (parseFloat(String(inv.amount || 0)) || 0).toFixed(2),
          (parseFloat(String(inv.paidAmount || 0)) || 0).toFixed(2),
          (parseFloat(String(inv.balance || 0)) || 0).toFixed(2),
          (parseFloat(String(inv.previousBalance || 0)) || 0).toFixed(2),
          inv.status,
          inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : ''
        ]
          .map(esc)
          .join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Student_Ledgers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.success = `Exported ${rows.length} ledger row(s)`;
    setTimeout(() => {
      this.success = '';
      this.cdr.markForCheck();
    }, 3000);
  }

  printLedgerReport(): void {
    const rows = this.displayedInvoices.length ? this.displayedInvoices : this.invoices;
    if (!rows.length) return;
    const body = rows
      .map(
        (inv) => `
      <tr>
        <td>${this.escapeHtml(inv.invoiceNumber)}</td>
        <td>${this.escapeHtml(this.studentDisplayName(inv))}</td>
        <td>${this.escapeHtml(inv.term)}</td>
        <td style="text-align:right">${this.escapeHtml(this.currencySymbol)} ${(parseFloat(String(inv.amount || 0)) || 0).toFixed(2)}</td>
        <td style="text-align:right">${this.escapeHtml(this.currencySymbol)} ${(parseFloat(String(inv.paidAmount || 0)) || 0).toFixed(2)}</td>
        <td style="text-align:right">${this.escapeHtml(this.currencySymbol)} ${(parseFloat(String(inv.balance || 0)) || 0).toFixed(2)}</td>
        <td>${this.escapeHtml(inv.status)}</td>
        <td>${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
      </tr>`
      )
      .join('');
    const html = `<!DOCTYPE html><html><head><title>Student Ledgers</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px}table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #e2e8f0;padding:8px}th{background:#f8fafc;font-size:10px;text-transform:uppercase}</style></head><body>
      <h1>Student Ledgers</h1><p>Total balance: ${this.escapeHtml(this.currencySymbol)} ${this.totalBalance.toFixed(2)} · ${rows.length} rows</p>
      <table><thead><tr><th>Invoice</th><th>Student</th><th>Term</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Due</th></tr></thead>
      <tbody>${body}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  private applyLedgerView(): void {
    if (!this.hideInvoiceActions) return;
    let rows = [...this.invoices];
    const q = (this.ledgerSearchQuery || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((inv) => {
        const name = this.studentDisplayName(inv).toLowerCase();
        return (
          (inv.invoiceNumber || '').toLowerCase().includes(q) ||
          name.includes(q) ||
          (inv.term || '').toLowerCase().includes(q) ||
          (inv.status || '').toLowerCase().includes(q)
        );
      });
    }
    const col = this.ledgerSortColumn;
    const dir = this.ledgerSortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (col) {
        case 'studentName':
          av = this.studentDisplayName(a).toLowerCase();
          bv = this.studentDisplayName(b).toLowerCase();
          break;
        case 'amount':
        case 'balance':
          av = parseFloat(String(a[col] || 0)) || 0;
          bv = parseFloat(String(b[col] || 0)) || 0;
          return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
        case 'dueDate':
          av = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          bv = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
        default:
          av = String((a as any)[col] ?? '').toLowerCase();
          bv = String((b as any)[col] ?? '').toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    this.displayedInvoices = rows;
  }

  private escapeHtml(s: unknown): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  // ===== Narration Breakdown Helpers =====
  getTuitionAmount(inv: any): number {
    if (!inv) return 0;
    const amount = Number(inv.amount || 0);
    const uniform = Number(inv.uniformTotal || 0);
    const tuition = amount - uniform;
    return tuition < 0 ? 0 : tuition;
  }

  getClosingTotal(inv: any): number {
    if (!inv) return 0;
    const prev = Number(inv.previousBalance || 0);
    const grand = Number(inv.amount || 0); // include uniforms in grand total
    return prev + grand;
  }

  getPreviousTermLabel(term: string | null | undefined): string {
    const t = (term || '').toString().toLowerCase();
    if (t.includes('term 2')) return 'Term 1';
    if (t.includes('term 3')) return 'Term 2';
    if (t.includes('term 1')) return 'Previous Term';
    return 'Previous Term';
  }
}


import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';
import { pdfBlobViewerUrl } from '../../../utils/pdf-preview.util';

@Component({
  standalone: false,
  selector: 'app-invoice-form',
  templateUrl: './invoice-form.component.html',
  styleUrls: ['./invoice-form.component.css', './invoice-form-modern.css'],
})
export class InvoiceFormComponent implements OnInit, AfterViewInit {
  private static readonly FOCUS_LOOKUP_KEY = 'invoiceFormFocusLookup';

  @ViewChild('statusBanner') statusBanner?: ElementRef<HTMLElement>;
  @ViewChild('studentLookupInput') studentLookupInput?: ElementRef<HTMLInputElement>;

  invoice: any = {
    studentId: '',
    amount: 0,
    tuitionAmount: 0,
    diningHallAmount: 0,
    dueDate: '',
    term: '',
    description: ''
  };
  filteredStudents: any[] = [];
  selectedStudentData: any = null;
  studentLookupQuery = '';
  studentLookupAttempted = false;
  studentLookupMessage = '';
  fetchingStudent = false;
  nextTermBalance: any = null;
  currencySymbol = '';
  currentTerm = '';
  suggestedTerm = '';
  error = '';
  success = '';
  submitting = false;
  minDate = '';
  createdInvoiceId: string | null = null;
  createdInvoiceNumber: string | null = null;
  pdfUrl: string | null = null;
  safePdfUrl: SafeResourceUrl | null = null;
  loadingPdf = false;
  pdfLoadError = '';
  /** Maximized full-screen PDF preview (always used after invoice creation). */
  showPdfViewer = false;
  /** Snapshot shown on success panel and hero after form reset */
  createdSummary: {
    studentName: string;
    studentNumber: string;
    term: string;
    total: number;
  } | null = null;
  uniformItemsCatalog: any[] = [];
  selectedUniformItems: {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[] = [];
  uniformSelection = {
    itemId: '',
    quantity: 1
  };
  isSuperAdmin = false;
  isAccountant = false;
  canManageFinance = false;
  studentBalanceInfo: any = null;
  fetchingBalance = false;
  balanceLoadError = '';
  discountAmount = 0;
  /** Shown inline below hero — persists until dismissed (errors do not auto-clear). */
  statusMessage = '';
  statusType: 'error' | 'success' | 'info' = 'info';
  lastSubmitStudentName = '';

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    public router: Router
  ) {
    // Set min date to today
    const today = new Date();
    this.minDate = today.toISOString().split('T')[0];
    this.isSuperAdmin = this.authService.hasRole('superadmin');
    this.isAccountant = this.authService.hasRole('accountant');
    this.canManageFinance =
      this.authService.isAdmin() || this.authService.hasRole('accountant');
  }

  ngOnInit() {
    // Allow SuperAdmin, Admin, and Accountant to access this page
    if (!this.canManageFinance) {
      this.router.navigate(['/invoices']);
      return;
    }
    // Initialize amount to 0 for Accountants
    if (this.isAccountant) {
      this.invoice.amount = 0;
    }
    this.loadSettings();
    this.loadUniformItems();
  }

  ngAfterViewInit(): void {
    this.focusStudentLookupIfRequested();
  }

  refreshPage(): void {
    sessionStorage.setItem(InvoiceFormComponent.FOCUS_LOOKUP_KEY, '1');
    window.location.reload();
  }

  private focusStudentLookupIfRequested(): void {
    if (!sessionStorage.getItem(InvoiceFormComponent.FOCUS_LOOKUP_KEY)) {
      return;
    }
    sessionStorage.removeItem(InvoiceFormComponent.FOCUS_LOOKUP_KEY);

    const tryFocus = (attempt = 0): void => {
      const input = this.studentLookupInput?.nativeElement;
      if (input) {
        input.focus();
        return;
      }
      if (attempt < 10) {
        setTimeout(() => tryFocus(attempt + 1), 50);
      }
    };

    tryFocus();
  }

  get hasStudentLookupInput(): boolean {
    return !!this.studentLookupQuery.trim();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || '';
        this.currentTerm = data.currentTerm || '';
        this.suggestedTerm = this.getSuggestedTerm(this.currentTerm);
        // Pre-fill term if available
        if (!this.invoice.term && this.suggestedTerm) {
          this.invoice.term = this.suggestedTerm;
        }
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        this.currencySymbol = '';
      }
    });
  }

  loadUniformItems() {
    this.settingsService.getUniformItems().subscribe({
      next: (items: any[]) => {
        this.uniformItemsCatalog = (items || []).filter(item => item.isActive !== false);
      },
      error: (err: any) => {
        console.error('Error loading uniform items:', err);
      }
    });
  }

  getSuggestedTerm(currentTerm: string): string {
    const currentYear = new Date().getFullYear();
    return `Term 1 ${currentYear}`;
  }

  useSuggestedTerm() {
    if (this.suggestedTerm) {
      this.invoice.term = this.suggestedTerm;
    }
  }

  getStudent(): void {
    const query = this.studentLookupQuery.trim();

    this.studentLookupAttempted = true;
    this.studentLookupMessage = '';
    this.error = '';
    this.filteredStudents = [];

    if (!query) {
      this.studentLookupMessage = 'Enter Student ID, last name, or first name.';
      return;
    }

    this.fetchingStudent = true;
    this.cdr.markForCheck();
    this.financeService
      .lookupStudent(query)
      .pipe(
        finalize(() => {
          this.fetchingStudent = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          if (response?.multipleMatches && Array.isArray(response.matches) && response.matches.length > 0) {
            this.filteredStudents = response.matches.map((m: any) => this.normalizeLookupStudent(m));
            this.studentLookupMessage = `${this.filteredStudents.length} students found — select the correct one below.`;
            return;
          }

          const student = response?.student ? this.normalizeLookupStudent(response.student) : null;
          if (!student) {
            this.studentLookupMessage = 'No student found matching your search.';
            return;
          }

          this.selectStudent(student);
        },
        error: (err: any) => {
          this.filteredStudents = [];
          this.studentLookupMessage =
            err.error?.message || 'Failed to look up student. Please try again.';
        },
      });
  }

  private normalizeLookupStudent(raw: any): any {
    if (!raw?.id) {
      return null;
    }
    return {
      id: raw.id,
      studentNumber: raw.studentNumber,
      firstName: raw.firstName,
      lastName: raw.lastName,
      studentType: raw.studentType,
      class: raw.class || null,
      classEntity: raw.class || raw.classEntity || null,
    };
  }

  selectStudent(student: any) {
    if (!student || !student.id) {
      return;
    }
    this.invoice.studentId = student.id;
    this.selectedStudentData = student;
    this.studentLookupQuery = `${student.firstName} ${student.lastName} (${student.studentNumber})`;
    this.filteredStudents = [];
    this.studentLookupMessage = '';
    this.studentLookupAttempted = false;
    this.calculateBalance();
    this.loadStudentBalance();
    this.discountAmount = 0;
    this.error = '';
    this.submitting = false;
    if (this.isAccountant) {
      this.invoice.amount = 0;
      this.invoice.tuitionAmount = 0;
      this.invoice.diningHallAmount = 0;
    }
  }

  calculateBalance() {
    if (this.isAccountant) {
      this.invoice.amount = 0;
      this.invoice.tuitionAmount = 0;
      this.invoice.diningHallAmount = 0;
      this.nextTermBalance = null;
      return;
    }

    const baseAmount = this.getBaseAmount();
    if (this.invoice.studentId && baseAmount > 0) {
      this.financeService.calculateNextTermBalance(
        this.invoice.studentId,
        baseAmount
      ).subscribe({
        next: (data: any) => {
          this.nextTermBalance = data;
        },
        error: (err: any) => {
          console.error('Error calculating balance:', err);
          this.nextTermBalance = null;
        }
      });
    } else {
      this.nextTermBalance = null;
    }
  }

  getUniformSubtotal(): number {
    return this.selectedUniformItems.reduce((sum, item) => sum + item.lineTotal, 0);
  }

  getInvoiceGrandTotal(): number {
    return this.getBaseAmount() + this.getUniformSubtotal();
  }

  getBaseAmount(): number {
    const tuition = Number(this.invoice.tuitionAmount || 0);
    const diningHall = Number(this.invoice.diningHallAmount || 0);
    const other = Number(this.invoice.amount || 0);
    const total = tuition + diningHall + other;
    if (isNaN(total) || total < 0) {
      return 0;
    }
    return total;
  }

  getCurrentInvoiceBalance(): number {
    const balance = Number(this.studentBalanceInfo?.balance ?? 0);
    return isNaN(balance) ? 0 : balance;
  }

  getUniformBalance(): number {
    const balance = Number(this.studentBalanceInfo?.uniformBalance ?? 0);
    return isNaN(balance) ? 0 : balance;
  }

  getHeroFinalTotal(): number {
    return this.getCurrentInvoiceBalance() + this.getUniformBalance();
  }

  getFinalInvoiceAmount(): number {
    const totalBeforeDiscount = this.getInvoiceGrandTotal();
    const discount = this.isSuperAdmin ? Number(this.discountAmount || 0) : 0;
    const finalTotal = totalBeforeDiscount - (isNaN(discount) ? 0 : discount);
    return finalTotal < 0 ? 0 : finalTotal;
  }

  loadStudentBalance(): void {
    if (!this.invoice.studentId) {
      this.studentBalanceInfo = null;
      this.balanceLoadError = '';
      return;
    }

    this.fetchingBalance = true;
    this.balanceLoadError = '';
    this.studentBalanceInfo = null;
    this.cdr.markForCheck();

    this.financeService
      .getStudentBalance(this.invoice.studentId)
      .pipe(
        finalize(() => {
          this.fetchingBalance = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          if (data?.multipleMatches) {
            this.balanceLoadError = 'Multiple students matched — select the correct student.';
            return;
          }
          this.studentBalanceInfo = data;
        },
        error: (err: any) => {
          this.balanceLoadError = err.error?.message || 'Could not load invoice balance.';
        },
      });
  }

  addUniformItem() {
    if (!this.uniformSelection.itemId) {
      this.error = 'Please select a uniform item';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    const quantity = parseInt(String(this.uniformSelection.quantity), 10);
    if (isNaN(quantity) || quantity <= 0) {
      this.error = 'Quantity must be at least 1';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    const item = this.uniformItemsCatalog.find(i => i.id === this.uniformSelection.itemId);
    if (!item) {
      this.error = 'Selected uniform item not found';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    const unitPrice = parseFloat(String(item.unitPrice || 0));
    const lineTotal = unitPrice * quantity;

    const existingIndex = this.selectedUniformItems.findIndex(sel => sel.id === item.id);
    if (existingIndex >= 0) {
      this.selectedUniformItems[existingIndex].quantity += quantity;
      this.selectedUniformItems[existingIndex].lineTotal = this.selectedUniformItems[existingIndex].unitPrice * this.selectedUniformItems[existingIndex].quantity;
    } else {
      this.selectedUniformItems.push({
        id: item.id,
        name: item.name,
        quantity,
        unitPrice,
        lineTotal
      });
    }

    this.uniformSelection = { itemId: '', quantity: 1 };
  }

  removeUniformItem(itemId: string) {
    this.selectedUniformItems = this.selectedUniformItems.filter(item => item.id !== itemId);
  }

  updateUniformQuantity(item: any, newQuantity: number) {
    const quantity = parseInt(String(newQuantity), 10);
    if (isNaN(quantity) || quantity <= 0) {
      return;
    }
    item.quantity = quantity;
    item.lineTotal = item.unitPrice * quantity;
  }

  onSubmit() {
    this.clearStatus();
    this.error = '';
    this.success = '';
    this.submitting = true;
    this.lastSubmitStudentName = this.selectedStudentData
      ? `${this.selectedStudentData.firstName || ''} ${this.selectedStudentData.lastName || ''}`.trim()
      : '';

    const fail = (message: string) => {
      this.setError(message);
      this.submitting = false;
      this.cdr.markForCheck();
      this.scrollToFormFeedback();
    };

    if (!this.invoice.studentId) {
      fail('Click Get Student to load a student before creating the invoice.');
      return;
    }

    const tuitionAmount = Number(this.invoice.tuitionAmount || 0);
    const diningHallAmount = Number(this.invoice.diningHallAmount || 0);
    const otherAmount = Number(this.invoice.amount || 0);

    if (tuitionAmount < 0 || diningHallAmount < 0 || otherAmount < 0) {
      fail('Amounts cannot be negative.');
      return;
    }

    let baseAmount = this.getBaseAmount();
    if (isNaN(baseAmount) || baseAmount < 0) {
      fail('Total amount cannot be negative.');
      return;
    }

    if (baseAmount === 0 && this.selectedUniformItems.length === 0) {
      fail('Enter a fee amount or add at least one uniform item.');
      return;
    }

    if (this.isAccountant && baseAmount > 0) {
      fail('Accountants can only create uniform invoices. Set fee amounts to zero and add uniform items.');
      return;
    }

    if (!this.invoice.dueDate) {
      fail('Please select a due date.');
      return;
    }

    if (!this.invoice.term?.trim()) {
      fail('Please enter the term (e.g. Term 2 2026).');
      return;
    }

    if (!this.authService.getToken()) {
      fail('You must be logged in to create invoices. Please log in and try again.');
      return;
    }

    const uniformSubtotal = this.getUniformSubtotal();
    if (!this.isSuperAdmin) {
      this.discountAmount = 0;
    }
    const discount = this.isSuperAdmin ? Number(this.discountAmount || 0) : 0;
    if (discount < 0) {
      fail('Discount cannot be negative.');
      return;
    }

    const totalBeforeDiscount = baseAmount + uniformSubtotal;
    if (discount > totalBeforeDiscount) {
      fail('Discount cannot exceed the total invoice amount.');
      return;
    }

    const finalAmount = totalBeforeDiscount - discount;
    baseAmount = Number(baseAmount.toFixed(2));
    const finalAmountRounded = Number(finalAmount.toFixed(2));
    const termLabel = this.invoice.term.trim();
    const studentLabel = this.lastSubmitStudentName || 'student';

    this.invoice.amount = otherAmount;

    const payload = {
      ...this.invoice,
      term: termLabel,
      amount: finalAmountRounded,
      tuitionAmount,
      diningHallAmount,
      otherAmount,
      uniformItems: this.selectedUniformItems.map((item) => ({
        itemId: item.id,
        quantity: item.quantity,
      })),
    };

    if (this.isSuperAdmin && discount > 0) {
      const discountNote = `Discount applied: ${this.currencySymbol} ${discount.toFixed(2)}`;
      payload.description = payload.description
        ? `${payload.description}\n${discountNote}`
        : discountNote;
    }

    this.setInfo(`Creating invoice for ${studentLabel} (${termLabel})…`);

    this.financeService
      .createInvoice(payload)
      .pipe(
        finalize(() => {
          this.submitting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          const inv = response?.invoice ?? (response?.id ? response : null);
          const invoiceId = inv?.id ? String(inv.id) : '';
          const invoiceNumber = inv?.invoiceNumber ? String(inv.invoiceNumber) : '';

          if (!invoiceId) {
            fail(
              'The server responded but no invoice was returned. Please refresh Billing and check whether the invoice was created before trying again.'
            );
            return;
          }

          this.createdInvoiceId = invoiceId;
          this.createdInvoiceNumber = invoiceNumber || null;
          this.createdSummary = {
            studentName: studentLabel,
            studentNumber: this.selectedStudentData?.studentNumber || '',
            term: termLabel,
            total: finalAmountRounded,
          };
          this.statusMessage = '';
          this.statusType = 'info';
          this.error = '';
          this.success = '';
          this.resetFormFields();
          this.showPdfViewer = true;
          this.loadInvoicePreviewInline(invoiceId, response?.invoicePdf);
        },
        error: (err: any) => {
          const msg = this.parseSubmitError(err, studentLabel, termLabel);
          this.setError(msg);
          this.scrollToFormFeedback();
        },
      });
  }

  private parseSubmitError(err: any, studentName: string, term: string): string {
    if (err?.status === 0) {
      return 'Could not reach the server. Check that the backend is running and try again.';
    }
    if (err?.status === 401) {
      return 'Your session expired. Please log in again and retry.';
    }

    const serverMsg = String(err?.error?.message || '').trim();
    if (serverMsg) {
      if (/duplicate term/i.test(serverMsg)) {
        return `${serverMsg} (${studentName}, ${term}). Open Billing to view the existing invoice.`;
      }
      return serverMsg;
    }

    if (err?.status === 400) {
      return `Could not create the invoice for ${studentName} (${term}). Check the form and try again.`;
    }
    if (err?.status >= 500) {
      return 'A server error occurred while creating the invoice. Please try again or contact support.';
    }

    return 'Failed to create the invoice. Please try again.';
  }

  private setError(message: string): void {
    this.error = message;
    this.statusMessage = message;
    this.statusType = 'error';
    this.success = '';
  }

  private setInfo(message: string): void {
    this.statusMessage = message;
    this.statusType = 'info';
  }

  clearStatus(): void {
    this.statusMessage = '';
    this.statusType = 'info';
  }

  private scrollToFormFeedback(): void {
    setTimeout(() => {
      this.statusBanner?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  }

  private loadInvoicePreviewInline(invoiceId: string, base64Pdf?: string): void {
    this.loadingPdf = true;
    this.pdfLoadError = '';
    this.revokePdfUrl();

    if (base64Pdf && String(base64Pdf).trim()) {
      try {
        this.applyPdfBlob(this.base64ToPdfBlob(String(base64Pdf)));
        this.loadingPdf = false;
        this.cdr.markForCheck();
        return;
      } catch {
        // fall through to API fetch
      }
    }

    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (result: { blob: Blob; filename: string }) => {
        this.applyPdfBlob(result.blob);
        this.loadingPdf = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.loadingPdf = false;
        this.pdfLoadError =
          err?.error?.message || 'Invoice was created but the PDF preview could not be loaded.';
        this.cdr.markForCheck();
      },
    });
  }

  private base64ToPdfBlob(base64: string): Blob {
    const normalized = base64.replace(/^data:application\/pdf;base64,/, '');
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'application/pdf' });
  }

  private applyPdfBlob(blob: Blob): void {
    this.revokePdfUrl();
    this.pdfUrl = window.URL.createObjectURL(blob);
    this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(pdfBlobViewerUrl(this.pdfUrl));
    this.showPdfViewer = true;
  }

  closePdfViewer(): void {
    this.goBack();
  }

  private revokePdfUrl(): void {
    if (this.pdfUrl) {
      window.URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
      this.safePdfUrl = null;
    }
  }

  private resetFormFields(): void {
    this.invoice = {
      studentId: '',
      amount: 0,
      tuitionAmount: 0,
      diningHallAmount: 0,
      dueDate: '',
      term: this.suggestedTerm || '',
      description: '',
    };
    this.selectedStudentData = null;
    this.clearStudentLookup();
    this.nextTermBalance = null;
    this.selectedUniformItems = [];
    this.studentBalanceInfo = null;
    this.discountAmount = 0;
  }

  viewInvoicePDF(): void {
    if (!this.createdInvoiceId) {
      this.pdfLoadError = 'Invoice ID not available';
      return;
    }
    this.showPdfViewer = true;
    this.loadInvoicePreviewInline(this.createdInvoiceId);
  }

  downloadInvoicePDF(): void {
    if (!this.createdInvoiceId) {
      this.pdfLoadError = 'Invoice ID not available';
      return;
    }

    this.financeService.getInvoicePDF(this.createdInvoiceId).subscribe({
      next: (result: { blob: Blob; filename: string }) => {
        const url = window.URL.createObjectURL(result.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
      },
      error: (err: any) => {
        console.error('Error downloading invoice PDF:', err);
        this.pdfLoadError = err?.error?.message || 'Failed to download invoice PDF';
        this.cdr.markForCheck();
      },
    });
  }

  createNewInvoice(): void {
    this.showPdfViewer = false;
    this.revokePdfUrl();
    this.createdInvoiceId = null;
    this.createdInvoiceNumber = null;
    this.createdSummary = null;
    this.success = '';
    this.error = '';
    this.pdfLoadError = '';
    this.clearStatus();
    this.resetFormFields();
    if (this.isAccountant) {
      this.invoice.amount = 0;
      this.invoice.tuitionAmount = 0;
      this.invoice.diningHallAmount = 0;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  get displayStudentName(): string {
    if (this.createdSummary?.studentName) return this.createdSummary.studentName;
    if (this.selectedStudentData) {
      return `${this.selectedStudentData.firstName || ''} ${this.selectedStudentData.lastName || ''}`.trim();
    }
    return '—';
  }

  get displayStudentNumber(): string {
    return this.createdSummary?.studentNumber || this.selectedStudentData?.studentNumber || '';
  }

  get displayTerm(): string {
    return this.createdSummary?.term || this.invoice.term || this.suggestedTerm || 'Set term';
  }

  get displayTotal(): number {
    if (this.createdSummary?.total != null) return this.createdSummary.total;
    return this.getHeroFinalTotal();
  }

  goBack(): void {
    this.showPdfViewer = false;
    this.revokePdfUrl();
    this.createdInvoiceId = null;
    this.createdInvoiceNumber = null;
    this.createdSummary = null;
    this.router.navigate(['/invoices']);
  }

  clearAlert(type: 'error' | 'success'): void {
    if (type === 'error') {
      this.error = '';
      if (this.statusType === 'error') this.clearStatus();
    } else {
      this.success = '';
      if (this.statusType === 'success' && !this.createdInvoiceId) this.clearStatus();
    }
  }

  dismissStatus(): void {
    this.clearStatus();
    this.error = '';
  }

  getInitials(name: string): string {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  clearStudentLookup(): void {
    this.studentLookupQuery = '';
    this.filteredStudents = [];
    this.studentLookupAttempted = false;
    this.studentLookupMessage = '';
    this.fetchingStudent = false;
  }

  clearStudentSelection(): void {
    this.invoice.studentId = '';
    this.selectedStudentData = null;
    this.clearStudentLookup();
    this.studentBalanceInfo = null;
    this.balanceLoadError = '';
    this.nextTermBalance = null;
    this.error = '';
  }
}

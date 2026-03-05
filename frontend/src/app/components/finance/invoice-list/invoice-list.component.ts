import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { AuthService } from '../../../services/auth.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-invoice-list',
  templateUrl: './invoice-list.component.html',
  styleUrls: ['./invoice-list.component.css']
})
export class InvoiceListComponent implements OnInit {
  invoices: any[] = [];
  filteredInvoices: any[] = [];
  students: any[] = [];
  selectedStudent = '';
  selectedStatus = '';
  invoiceSearchQuery = '';
  selectedStatusFilter = '';
  selectedTermFilter = '';
  viewMode: 'grid' | 'list' = 'grid';
  loading = false;
  creatingBulk = false;
  reversingBulk = false;
  correctingExemptTuition = false;
  reverseFilter: any = {
    term: '',
    startDate: '',
    endDate: ''
  };
  success = '';
  error = '';
  showBulkInvoiceForm = false;
  bulkInvoiceForm: any = {
    currentTerm: '',
    dueDate: '',
    description: ''
  };
  showPaymentForm = false;
  selectedInvoice: any = null;
  paymentForm: any = {
    amount: 0,
    paymentDate: '',
    paymentMethod: 'Cash',
    notes: '',
    receiptNeeded: false
  };
  showInvoiceDetailsModal = false;
  selectedInvoiceDetails: any = null;
  studentIdLookup = '';
  studentBalanceInfo: any = null;
  loadingBalance = false;
  currencySymbol = 'KES'; // Default, will be loaded from settings
  academicYear = ''; // Will be loaded from settings
  currentTermFromSettings = ''; // Current term from settings
  quickPaymentAmount = 0;
  quickPaymentTerm = '';
  quickPaymentReceiptNeeded = false;
  lastQuickPaymentInvoiceId: string | null = null;
  showNoteForm = false;
  noteForm: any = {
    type: 'credit',
    item: '',
    amount: 0
  };
  noteStudentId = '';
  noteLookupError = '';
  noteFirstName = '';
  noteLastName = '';
  noteSearchQuery = '';
  noteCandidates: any[] = [];

  showCorrectTransactionModal = false;
  correctingInvoice: any = null;
  correctingTransaction = false;
  correctTransactionForm: any = {
    amount: 0,
    notes: ''
  };

  showCorrectPrepaidLookupModal = false;
  correctPrepaidLookupQuery = '';
  correctPrepaidLookupLoading = false;
  correctPrepaidLookupError = '';
  correctPrepaidCandidates: any[] = [];
  correctPrepaidStudentInfo: any = null;
  correctPrepaidInvoice: any = null;
  correctPrepaidSubmitting = false;
  correctPrepaidForm: any = {
    amount: 0,
    notes: ''
  };
  
  // Cached computed values to prevent NG0900 errors
  private _cachedStats = {
    totalAmount: 0,
    paidAmount: 0,
    outstandingAmount: 0,
    totalInvoiceAmount: 0,
    uniformTotal: 0,
    overdueCount: 0,
    prepaidCreditCount: 0,
    totalPrepaidCredit: 0
  };
  
  // PDF Viewer properties
  showPdfViewer = false;
  pdfUrl: string | null = null;
  safePdfUrl: SafeResourceUrl | null = null;
  loadingPdf = false;
  currentInvoiceFilename: string = '';
  currentInvoiceNumber: string = '';
  
  // Receipt Viewer properties
  showReceiptViewer = false;
  receiptUrl: string | null = null;
  safeReceiptUrl: SafeResourceUrl | null = null;
  loadingReceiptPdf = false;
  currentReceiptFilename: string = '';
  currentReceiptNumber: string = '';
  lastPaidInvoiceId: string | null = null;
  recordingQuickPayment = false;
  updatedBalanceAfterPayment: number | null = null; // Track balance after payment
  loadingReceipt = false;
  Math = Math; // Expose Math to template for calculations
  showLogisticsForm = false;
  logisticsForm: any = {
    addTransport: false,
    addDiningHall: false,
    addTuition: false,
    diningHallAmount: 0
  };
  transportCostFromSettings: number | null = null;
  tuitionFeeFromSettings: any = { dayScholar: 0, boarder: 0 };
  diningHallCostFromSettings: number | null = null;
  isNoteAmountAuto = false;
  
  getFollowingTerm(currentTerm: string): string {
    if (!currentTerm) return '';
    
    // Extract term number and year if present
    const termMatch = currentTerm.match(/Term\s*(\d+)(?:\s*(\d{4}))?/i);
    if (!termMatch) {
      // If format is not recognized, try to increment
      if (currentTerm.includes('1')) return currentTerm.replace(/1/g, '2');
      if (currentTerm.includes('2')) return currentTerm.replace(/2/g, '3');
      if (currentTerm.includes('3')) {
        const yearMatch = currentTerm.match(/(\d{4})/);
        if (yearMatch) {
          const nextYear = parseInt(yearMatch[1]) + 1;
          return currentTerm.replace(/\d{4}/, nextYear.toString()).replace(/3/g, '1');
        }
        return currentTerm.replace(/3/g, '1');
      }
      return currentTerm;
    }

    const termNum = parseInt(termMatch[1]);
    const year = termMatch[2] ? parseInt(termMatch[2]) : new Date().getFullYear();

    if (termNum === 1) {
      return `Term 2 ${year}`;
    } else if (termNum === 2) {
      return `Term 3 ${year}`;
    } else if (termNum === 3) {
      return `Term 1 ${year + 1}`;
    }

    return currentTerm;
  }

  constructor(
    public financeService: FinanceService,
    private studentService: StudentService,
    public authService: AuthService,
    private router: Router,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit() {
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
    this.loadInvoices();
    this.loadSettings();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || 'KES';
        this.academicYear = data.academicYear || new Date().getFullYear().toString();
        this.currentTermFromSettings = data.currentTerm || `Term 1 ${new Date().getFullYear()}`;
        this.quickPaymentTerm = this.currentTermFromSettings;

        if (data.feesSettings && data.feesSettings.transportCost != null) {
          const rawTransport = data.feesSettings.transportCost;
          const parsedTransport = parseFloat(String(rawTransport));
          if (!isNaN(parsedTransport) && parsedTransport > 0) {
            this.transportCostFromSettings = parsedTransport;
          }
        }

        if (data.feesSettings) {
          this.tuitionFeeFromSettings.dayScholar = parseFloat(String(data.feesSettings.dayScholarTuitionFee || 0));
          this.tuitionFeeFromSettings.boarder = parseFloat(String(data.feesSettings.boarderTuitionFee || 0));
          const rawDh = data.feesSettings.diningHallCost;
          const parsedDh = parseFloat(String(rawDh));
          if (!isNaN(parsedDh) && parsedDh > 0) {
            this.diningHallCostFromSettings = parsedDh;
          }
        }
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        // Keep defaults if settings fail to load
        const currentYear = new Date().getFullYear();
        this.currentTermFromSettings = `Term 1 ${currentYear}`;
        this.quickPaymentTerm = this.currentTermFromSettings;
      }
    });
  }

  onNoteItemChange(item: string) {
    this.isNoteAmountAuto = false;
    if (item === 'transport') {
      if (this.transportCostFromSettings != null) {
        this.noteForm.amount = this.transportCostFromSettings;
        this.isNoteAmountAuto = true;
      }
    } else if (item === 'diningHall') {
      if (this.diningHallCostFromSettings != null) {
        let dh = this.diningHallCostFromSettings;
        const stu = this.selectedInvoice?.student;
        const isStaffOrExempted = !!(stu?.isStaffChild) || !!(stu?.isExempted);
        if (isStaffOrExempted) {
          dh = dh * 0.5;
        }
        this.noteForm.amount = dh;
        this.isNoteAmountAuto = true;
      }
    } else {
      this.isNoteAmountAuto = false;
    }
  }

  loadStudents() {
    this.studentService.getStudents().subscribe({
      next: (data: any) => {
        this.students = Array.isArray(data) ? data : [];
      },
      error: (err: any) => {
        console.error(err);
        this.students = [];
      }
    });
  }

  loadInvoices() {
    this.loading = true;
    this.financeService.getInvoices().subscribe({
      next: (data: any[]) => {
        const invoicesArray = Array.isArray(data) ? data : [];
        this.invoices = invoicesArray.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        // Initialize filteredInvoices with all invoices if no filters are active
        if (!this.hasActiveInvoiceFilters()) {
          this.filteredInvoices = [...this.invoices];
        } else {
          this.filterInvoices();
        }
        this.updateCachedStats();
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading invoices:', err);
        this.invoices = [];
        this.filteredInvoices = [];
        this.updateCachedStats();
        this.error = 'Failed to load invoices';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onFilterChange() {
    // Navigate to invoice statements with filters
    const queryParams: any = {};
    if (this.selectedStudent) {
      queryParams.studentId = this.selectedStudent;
    }
    if (this.selectedStatus) {
      queryParams.status = this.selectedStatus;
    }
    this.router.navigate(['/invoices/statements'], { queryParams });
  }

  filterInvoices() {
    const invoicesArray = Array.isArray(this.invoices) ? this.invoices : [];
    let filtered = [...invoicesArray];

    // Apply search query filter
    if (this.invoiceSearchQuery && this.invoiceSearchQuery.trim()) {
      const query = this.invoiceSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(invoice => {
        // Safely get student name
        let studentName = '';
        if (invoice.student) {
          const firstName = invoice.student.firstName || '';
          const lastName = invoice.student.lastName || '';
          studentName = `${firstName} ${lastName}`.trim().toLowerCase();
        }
        
        // Get invoice number
        const invoiceNumber = (invoice.invoiceNumber || '').toLowerCase();
        
        // Get term
        const term = (invoice.term || '').toLowerCase();
        
        // Get student number if available
        const studentNumber = invoice.student?.studentNumber ? invoice.student.studentNumber.toLowerCase() : '';
        
        // Check if query matches any of these fields
        return studentName.includes(query) || 
               invoiceNumber.includes(query) || 
               term.includes(query) ||
               studentNumber.includes(query);
      });
    }

    // Apply status filter
    if (this.selectedStatusFilter) {
      filtered = filtered.filter(invoice => {
        const invoiceStatus = (invoice.status || '').toLowerCase();
        return invoiceStatus === this.selectedStatusFilter.toLowerCase();
      });
    }

    // Apply term filter
    if (this.selectedTermFilter) {
      filtered = filtered.filter(invoice => {
        const invoiceTerm = (invoice.term || '').toLowerCase();
        return invoiceTerm === this.selectedTermFilter.toLowerCase();
      });
    }

    // Apply student filter
    if (this.selectedStudent) {
      filtered = filtered.filter(invoice => invoice.studentId === this.selectedStudent);
    }

    this.filteredInvoices = filtered;
    this.updateCachedStats();
  }
  
  private updateCachedStats() {
    const invoicesArray = Array.isArray(this.filteredInvoices) ? this.filteredInvoices : [];
    const activeInvoices = invoicesArray.filter(inv => (String(inv.status || '').toLowerCase() !== 'void'));
    const today = new Date();
    
    this._cachedStats.totalAmount = activeInvoices.reduce((sum, inv) => sum + parseFloat(String(inv.amount || 0)), 0);
    this._cachedStats.paidAmount = activeInvoices.reduce((sum, inv) => sum + parseFloat(String(inv.paidAmount || 0)), 0);
    this._cachedStats.outstandingAmount = activeInvoices.reduce((sum, inv) => sum + parseFloat(String(inv.balance || 0)), 0);
    this._cachedStats.totalInvoiceAmount = this._cachedStats.paidAmount + this._cachedStats.outstandingAmount;
    this._cachedStats.uniformTotal = activeInvoices.reduce((sum, inv) => {
      const uniformTotal = parseFloat(String(inv.uniformTotal || 0));
      return sum + uniformTotal;
    }, 0);
    this._cachedStats.overdueCount = activeInvoices.filter(inv => {
      const status = (inv.status || '').toLowerCase();
      if (status === 'paid') return false;
      if (!inv.dueDate) return false;
      const dueDate = new Date(inv.dueDate);
      return dueDate < today;
    }).length;
    this._cachedStats.prepaidCreditCount = activeInvoices.filter(inv => {
      const prepaidAmount = parseFloat(String(inv.prepaidAmount || 0));
      return prepaidAmount > 0;
    }).length;
    this._cachedStats.totalPrepaidCredit = activeInvoices.reduce((sum, inv) => {
      const prepaidAmount = parseFloat(String(inv.prepaidAmount || 0));
      return sum + prepaidAmount;
    }, 0);
  }

  clearInvoiceFilters() {
    this.invoiceSearchQuery = '';
    this.selectedStatusFilter = '';
    this.selectedTermFilter = '';
    this.selectedStudent = '';
    // After clearing filters, show all invoices
    const invoicesArray = Array.isArray(this.invoices) ? this.invoices : [];
    this.filteredInvoices = [...invoicesArray];
    this.updateCachedStats();
  }

  hasActiveInvoiceFilters(): boolean {
    return !!(this.invoiceSearchQuery || this.selectedStatusFilter || this.selectedTermFilter || this.selectedStudent);
  }

  getActiveFilterCount(): number {
    let count = 0;
    if (this.invoiceSearchQuery) count++;
    if (this.selectedStatusFilter) count++;
    if (this.selectedTermFilter) count++;
    if (this.selectedStudent) count++;
    return count;
  }

  getUniqueTerms(): string[] {
    const termSet = new Set<string>();
    this.invoices.forEach(inv => {
      if (inv.term) {
        termSet.add(inv.term);
      }
    });
    return Array.from(termSet);
  }

  getTotalAmount(): number {
    // Grand Total = Sum of all invoice amounts (current term fees only)
    return this._cachedStats.totalAmount;
  }

  getPaidAmount(): number {
    // Total Paid = Sum of all paid amounts
    return this._cachedStats.paidAmount;
  }

  getOutstandingAmount(): number {
    // Outstanding Balance = Sum of all current balances
    // Note: balance includes previousBalance, so this represents total outstanding across all invoices
    return this._cachedStats.outstandingAmount;
  }

  getTotalInvoiceAmount(): number {
    // Total Invoice Amount = Total Paid + Outstanding Balance
    // This is the correct formula because:
    // - Outstanding Balance already includes previousBalance in its calculation
    // - Total Paid is what has been collected
    // - Together they represent the total amount that should have been collected
    return this._cachedStats.totalInvoiceAmount;
  }

  getTotalInvoiceAmountAlternative(): number {
    // Alternative calculation: Sum of (amount + previousBalance) for all invoices
    // Note: This may double-count previousBalance if a student has multiple invoices
    // But it's useful for verification
    const invoicesArray = Array.isArray(this.filteredInvoices) ? this.filteredInvoices : [];
    return invoicesArray.reduce((sum, inv) => {
      const amount = parseFloat(String(inv.amount || 0));
      const previousBalance = parseFloat(String(inv.previousBalance || 0));
      return sum + amount + previousBalance;
    }, 0);
  }

  verifyCalculation(): boolean {
    // Verify: Total Paid + Outstanding Balance should equal the sum calculation
    const totalPaid = this.getPaidAmount();
    const outstanding = this.getOutstandingAmount();
    const calculatedTotal = totalPaid + outstanding;
    const alternativeTotal = this.getTotalInvoiceAmountAlternative();
    // Allow small rounding differences (0.01)
    // The calculated total (paid + outstanding) is the authoritative value
    return Math.abs(calculatedTotal - alternativeTotal) < 0.01;
  }

  getOverdueCount(): number {
    return this._cachedStats.overdueCount;
  }

  getUniformTotal(): number {
    return this._cachedStats.uniformTotal;
  }

  getTotalPrepaidCredit(): number {
    return this._cachedStats.totalPrepaidCredit;
  }

  getPrepaidCreditCount(): number {
    return this._cachedStats.prepaidCreditCount;
  }

  openInvoiceDetails(invoice: any) {
    this.selectedInvoiceDetails = invoice;
    this.showInvoiceDetailsModal = true;
  }

  closeInvoiceDetails() {
    this.showInvoiceDetailsModal = false;
    this.selectedInvoiceDetails = null;
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
    this.paymentForm.receiptNeeded = false;
    this.showPaymentForm = true;
    this.error = '';
    this.success = '';
  }

  canCorrectTransaction(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  openCorrectPrepaidLookupModal() {
    if (!this.canCorrectTransaction()) {
      this.error = 'You do not have permission to correct transactions';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    this.showCorrectPrepaidLookupModal = true;
    this.correctPrepaidLookupQuery = '';
    this.correctPrepaidLookupLoading = false;
    this.correctPrepaidLookupError = '';
    this.correctPrepaidCandidates = [];
    this.correctPrepaidStudentInfo = null;
    this.correctPrepaidInvoice = null;
    this.correctPrepaidSubmitting = false;
    this.correctPrepaidForm = { amount: 0, notes: '' };
  }

  closeCorrectPrepaidLookupModal() {
    this.showCorrectPrepaidLookupModal = false;
    this.correctPrepaidLookupQuery = '';
    this.correctPrepaidLookupLoading = false;
    this.correctPrepaidLookupError = '';
    this.correctPrepaidCandidates = [];
    this.correctPrepaidStudentInfo = null;
    this.correctPrepaidInvoice = null;
    this.correctPrepaidSubmitting = false;
    this.correctPrepaidForm = { amount: 0, notes: '' };
  }

  lookupCorrectPrepaidStudent() {
    this.correctPrepaidLookupError = '';
    this.correctPrepaidCandidates = [];
    this.correctPrepaidStudentInfo = null;
    this.correctPrepaidInvoice = null;

    const q = String(this.correctPrepaidLookupQuery || '').trim();
    if (!q) {
      this.correctPrepaidLookupError = 'Enter a Student ID or Name.';
      return;
    }

    this.correctPrepaidLookupLoading = true;
    this.financeService.getStudentBalance(q).subscribe({
      next: (resp: any) => {
        this.correctPrepaidLookupLoading = false;
        if (resp && resp.multipleMatches && Array.isArray(resp.matches)) {
          this.correctPrepaidCandidates = resp.matches;
          return;
        }
        if (!resp || !resp.studentId) {
          this.correctPrepaidLookupError = 'Student not found. Please check the Student ID/Number/Name.';
          return;
        }
        this.correctPrepaidStudentInfo = resp;
        this.loadCorrectPrepaidInvoiceForStudent(resp.studentId);
      },
      error: (err: any) => {
        this.correctPrepaidLookupLoading = false;
        this.correctPrepaidLookupError = err?.error?.message || 'Failed to lookup student.';
      }
    });
  }

  chooseCorrectPrepaidCandidate(studentId: string) {
    if (!studentId) {
      return;
    }
    this.correctPrepaidCandidates = [];
    this.correctPrepaidLookupLoading = true;
    this.financeService.getStudentBalance(studentId).subscribe({
      next: (resp: any) => {
        this.correctPrepaidLookupLoading = false;
        if (!resp || !resp.studentId) {
          this.correctPrepaidLookupError = 'Student not found for selected record.';
          return;
        }
        this.correctPrepaidStudentInfo = resp;
        this.loadCorrectPrepaidInvoiceForStudent(resp.studentId);
      },
      error: (err: any) => {
        this.correctPrepaidLookupLoading = false;
        this.correctPrepaidLookupError = err?.error?.message || 'Failed to load selected student.';
      }
    });
  }

  private loadCorrectPrepaidInvoiceForStudent(studentId: string) {
    this.correctPrepaidLookupError = '';
    this.correctPrepaidInvoice = null;
    this.financeService.getInvoices(studentId, undefined).subscribe({
      next: (list: any[]) => {
        const invoices = Array.isArray(list) ? list : [];
        if (invoices.length === 0) {
          this.correctPrepaidLookupError = 'No invoices found for this student.';
          return;
        }
        const invoicesWithCredit = invoices
          .filter(inv => parseFloat(String(inv.prepaidAmount || 0)) > 0)
          .sort((a: any, b: any) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          });
        if (invoicesWithCredit.length === 0) {
          this.correctPrepaidLookupError = 'No prepaid credit found for this student.';
          return;
        }
        this.correctPrepaidInvoice = invoicesWithCredit[0];
        const prepaid = parseFloat(String(this.correctPrepaidInvoice.prepaidAmount || 0));
        this.correctPrepaidForm.amount = isFinite(prepaid) && prepaid > 0 ? prepaid : 0;
      },
      error: (err: any) => {
        this.correctPrepaidLookupError = err?.error?.message || 'Failed to fetch invoices for student.';
      }
    });
  }

  submitCorrectPrepaidLookup() {
    if (!this.correctPrepaidInvoice?.id) {
      this.correctPrepaidLookupError = 'No invoice selected for correction.';
      return;
    }
    const amount = parseFloat(String(this.correctPrepaidForm.amount || 0));
    if (!isFinite(amount) || amount <= 0) {
      this.correctPrepaidLookupError = 'Reversal amount must be greater than 0.';
      return;
    }
    const prepaid = parseFloat(String(this.correctPrepaidInvoice.prepaidAmount || 0));
    if (isFinite(prepaid) && amount > prepaid) {
      if (!confirm(`Amount exceeds available credit (${this.currencySymbol} ${prepaid.toFixed(2)}). Continue?`)) {
        return;
      }
    }

    this.correctPrepaidSubmitting = true;
    this.correctPrepaidLookupError = '';
    const memo = String(this.correctPrepaidForm.notes || '').trim();
    this.financeService.reverseInvoicePrepayment(this.correctPrepaidInvoice.id, { amount, notes: memo || undefined }).subscribe({
      next: (resp: any) => {
        this.correctPrepaidSubmitting = false;
        const reversedAmount = parseFloat(String(resp?.reversedAmount ?? amount));
        this.success = `Corrected prepaid successfully. Reversed: ${this.currencySymbol} ${reversedAmount.toFixed(2)}`;
        this.closeCorrectPrepaidLookupModal();
        this.loadInvoices();
        setTimeout(() => (this.success = ''), 6000);
      },
      error: (err: any) => {
        this.correctPrepaidSubmitting = false;
        this.correctPrepaidLookupError = err?.error?.message || 'Failed to correct prepaid transaction.';
      }
    });
  }

  openCorrectTransaction(invoice: any, event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!this.canCorrectTransaction()) {
      this.error = 'You do not have permission to correct transactions';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    if (!invoice) {
      return;
    }
    const prepaid = parseFloat(String(invoice.prepaidAmount || 0));
    if (!isFinite(prepaid) || prepaid <= 0) {
      this.error = 'No prepaid credit available to correct for this invoice';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    this.correctingInvoice = invoice;
    this.correctTransactionForm = {
      amount: prepaid,
      notes: ''
    };
    this.showCorrectTransactionModal = true;
    this.error = '';
    this.success = '';
  }

  closeCorrectTransactionModal() {
    this.showCorrectTransactionModal = false;
    this.correctingInvoice = null;
    this.correctingTransaction = false;
    this.correctTransactionForm = {
      amount: 0,
      notes: ''
    };
  }

  submitCorrectTransaction() {
    if (!this.correctingInvoice?.id) {
      this.error = 'Invoice not selected';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    const amount = parseFloat(String(this.correctTransactionForm.amount || 0));
    if (!isFinite(amount) || amount <= 0) {
      this.error = 'Reversal amount must be greater than 0';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    const prepaid = parseFloat(String(this.correctingInvoice.prepaidAmount || 0));
    if (isFinite(prepaid) && amount > prepaid) {
      if (!confirm(`Amount exceeds available credit (${this.currencySymbol} ${prepaid.toFixed(2)}). Continue?`)) {
        return;
      }
    }

    const memo = String(this.correctTransactionForm.notes || '').trim();
    this.correctingTransaction = true;
    this.error = '';
    this.success = '';

    this.financeService.reverseInvoicePrepayment(this.correctingInvoice.id, { amount, notes: memo || undefined }).subscribe({
      next: (resp: any) => {
        this.correctingTransaction = false;
        const reversedAmount = parseFloat(String(resp?.reversedAmount ?? amount));
        this.success = `Corrected prepayment successfully. Reversed: ${this.currencySymbol} ${reversedAmount.toFixed(2)}`;
        this.closeCorrectTransactionModal();
        this.loadInvoices();
        setTimeout(() => (this.success = ''), 6000);
      },
      error: (err: any) => {
        this.correctingTransaction = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else if (err.status === 403) {
          this.error = 'Insufficient permissions.';
        } else {
          this.error = err.error?.message || 'Failed to correct transaction';
        }
        setTimeout(() => (this.error = ''), 6000);
      }
    });
  }

  openLogisticsForm(invoice: any) {
    this.selectedInvoice = invoice;
    this.logisticsForm = {
      addTransport: false,
      addDiningHall: false,
      addTuition: false,
      diningHallAmount: 0
    };
    this.showLogisticsForm = true;
    this.error = '';
    this.success = '';
  }

  closeLogisticsForm() {
    this.showLogisticsForm = false;
    this.logisticsForm = {
      addTransport: false,
      addDiningHall: false,
      addTuition: false,
      diningHallAmount: 0
    };
  }

  canAdjustLogistics(invoice: any): boolean {
    if (!this.canManageFinance()) {
      return false;
    }
    if (!invoice || !invoice.student) {
      return false;
    }
    const student = invoice.student;
    const isStaffChild = !!student.isStaffChild;
    // Allow adjustments for both boarders and day scholars, but not staff children
    return !isStaffChild;
  }

  isDayScholar(invoice: any): boolean {
    return invoice?.student?.studentType === 'Day Scholar';
  }

  submitLogisticsAdjustment() {
    if (!this.selectedInvoice) {
      return;
    }

    const addTransport = !!this.logisticsForm.addTransport;
    const addDiningHall = !!this.logisticsForm.addDiningHall;
    const addTuition = !!this.logisticsForm.addTuition;

    if (!addTransport && !addDiningHall && !addTuition) {
      this.error = 'Please select Transport, Dining Hall, and/or Tuition to add.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    let diningHallAmount = 0;
    if (addDiningHall) {
      diningHallAmount = parseFloat(String(this.logisticsForm.diningHallAmount)) || 0;
      if (!diningHallAmount || diningHallAmount <= 0) {
        this.error = 'Please enter a valid Dining Hall amount.';
        setTimeout(() => (this.error = ''), 5000);
        return;
      }
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const payload: any = {
      addTransport,
      addDiningHall,
      addTuition
    };
    if (addDiningHall) {
      payload.diningHallAmount = diningHallAmount;
    }

    this.financeService.adjustInvoiceLogistics(this.selectedInvoice.id, payload).subscribe({
      next: (response: any) => {
        this.loading = false;
        this.success = response.message || 'Invoice adjusted successfully';
        this.closeLogisticsForm();
        this.loadInvoices();
        setTimeout(() => (this.success = ''), 5000);
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to adjust invoice';
        }
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  closePaymentForm() {
    this.showPaymentForm = false;
    this.selectedInvoice = null;
    this.paymentForm = {
      amount: 0,
      paymentDate: '',
      paymentMethod: 'Cash',
      notes: '',
      receiptNeeded: false
    };
  }

  updatePayment() {
    if (!this.selectedInvoice) return;

    if (!this.paymentForm.amount || this.paymentForm.amount <= 0) {
      this.error = 'Please enter a valid payment amount';
      return;
    }

    if (!this.paymentForm.paymentDate) {
      this.error = 'Please select a payment date';
      return;
    }

    // Validate that payment amount doesn't exceed balance
    if (this.paymentForm.amount > this.selectedInvoice.balance) {
      if (!confirm(`Payment amount (${this.currencySymbol} ${this.paymentForm.amount}) exceeds the balance (${this.currencySymbol} ${this.selectedInvoice.balance}). Continue anyway?`)) {
        return;
      }
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    // Prepare payment data
    const paymentData = {
      paidAmount: this.paymentForm.amount,
      paymentDate: this.paymentForm.paymentDate,
      paymentMethod: this.paymentForm.paymentMethod,
      notes: this.paymentForm.notes
    };

    this.financeService.updatePayment(this.selectedInvoice.id, paymentData).subscribe({
      next: (response: any) => {
        // Reload invoices to get updated balance
        this.loadInvoices();
        
        // Calculate and display updated balance
        const updatedBalance = response.invoice?.balance || 0;
        this.success = `Payment recorded successfully! Updated balance: ${this.currencySymbol} ${parseFloat(String(updatedBalance)).toFixed(2)}`;
        
        this.loading = false;
        this.lastPaidInvoiceId = this.selectedInvoice.id;
        
        // If receipt is needed, show receipt preview
        if (this.paymentForm.receiptNeeded && this.lastPaidInvoiceId) {
          this.closePaymentForm();
          setTimeout(() => {
            this.viewReceiptPDFPreview(this.lastPaidInvoiceId!);
          }, 500);
        } else {
          this.closePaymentForm();
        }
        
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to record payment';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onAmountChange() {
    // Real-time validation can be added here if needed
  }

  getNewBalance(): number {
    if (!this.selectedInvoice || !this.paymentForm.amount) {
      return this.selectedInvoice?.balance || 0;
    }
    return this.selectedInvoice.balance - this.paymentForm.amount;
  }

  selectInvoice(invoice: any) {
    this.selectedInvoice = invoice;
  }

  openCreditNoteForm() {
    this.selectedInvoice = null;
    this.noteStudentId = '';
    this.noteLookupError = '';
    this.noteCandidates = [];
    this.noteForm = {
      type: 'credit',
      item: '',
      amount: 0
    };
    this.showNoteForm = true;
    this.error = '';
    this.success = '';
  }

  openDebitNoteForm() {
    this.selectedInvoice = null;
    this.noteStudentId = '';
    this.noteLookupError = '';
    this.noteCandidates = [];
    this.noteForm = {
      type: 'debit',
      item: '',
      amount: 0
    };
    this.showNoteForm = true;
    this.error = '';
    this.success = '';
  }

  closeNoteForm() {
    this.showNoteForm = false;
    this.selectedInvoice = null;
    this.noteStudentId = '';
    this.noteLookupError = '';
    this.noteCandidates = [];
    this.noteForm = {
      type: 'credit',
      item: '',
      amount: 0
    };
  }

  refreshNoteData() {
    if (!this.selectedInvoice?.id) return;
    this.loading = true;
    this.error = '';
    this.financeService.getInvoice(this.selectedInvoice.id).subscribe({
      next: (invoice: any) => {
        this.selectedInvoice = invoice;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to refresh invoice data.';
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  submitNote() {
    if (!this.selectedInvoice) {
      this.error = 'Please select an invoice first.';
      return;
    }
    if (!this.noteForm.item) {
      this.error = 'Please select a cost item to adjust.';
      return;
    }
    if (!this.noteForm.amount || this.noteForm.amount <= 0) {
      this.error = 'Please enter a valid amount greater than 0.';
      return;
    }
    if (this.noteForm.type === 'credit' && this.selectedInvoice && this.noteForm.amount > this.selectedInvoice.balance) {
      this.error = 'Credit note amount cannot be greater than the current balance.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const payload = {
      type: this.noteForm.type,
      item: this.noteForm.item,
      amount: this.noteForm.amount
    };

    this.financeService.applyInvoiceNote(this.selectedInvoice.id, payload).subscribe({
      next: (response: any) => {
        const updatedInvoice = response.invoice || response;
        const index = this.invoices.findIndex(inv => inv.id === updatedInvoice.id);
        if (index !== -1) {
          this.invoices[index] = updatedInvoice;
        }
        const filteredIndex = this.filteredInvoices.findIndex(inv => inv.id === updatedInvoice.id);
        if (filteredIndex !== -1) {
          this.filteredInvoices[filteredIndex] = updatedInvoice;
        }
        if (this.selectedInvoice && this.selectedInvoice.id === updatedInvoice.id) {
          this.selectedInvoice = updatedInvoice;
        }

        this.loading = false;
        this.success = this.noteForm.type === 'credit'
          ? 'Credit Note applied successfully.'
          : 'Debit Note applied successfully.';
        this.closeNoteForm();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to apply note';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
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

  getStatusClass(status: string): string {
    const statusMap: any = {
      'paid': 'alert-success',
      'pending': 'alert-info',
      'partial': 'alert-info',
      'overdue': 'alert-error',
      'void': 'alert-warning'
    };
    return statusMap[status] || '';
  }

  viewInvoicePDF(invoiceId: string, event?: Event) {
    // Prevent any default behavior that might trigger download
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    // Find the invoice to get its number
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    this.currentInvoiceNumber = invoice?.invoiceNumber || 'Invoice';
    
    // Show the modal immediately
    this.showPdfViewer = true;
    this.loadingPdf = true;
    this.error = '';
    
    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (result: { blob: Blob; filename: string }) => {
        // Clean up previous URL if exists
        if (this.pdfUrl) {
          window.URL.revokeObjectURL(this.pdfUrl);
        }
        
        // Create blob URL for preview (not download)
        this.pdfUrl = window.URL.createObjectURL(result.blob);
        this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfUrl);
        this.currentInvoiceFilename = result.filename;
        this.loadingPdf = false;
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

  viewReceiptPDFPreview(invoiceId: string) {
    // Find the invoice to get its number
    const invoice = this.invoices.find(inv => inv.id === invoiceId);
    this.currentReceiptNumber = invoice?.invoiceNumber || 'Receipt';
    
    // Show the modal immediately
    this.showReceiptViewer = true;
    this.loadingReceiptPdf = true;
    this.error = '';
    
    this.financeService.getReceiptPDF(invoiceId).subscribe({
      next: (blob: Blob) => {
        // Clean up previous URL if exists
        if (this.receiptUrl) {
          window.URL.revokeObjectURL(this.receiptUrl);
        }
        
        // Create blob URL for preview
        this.receiptUrl = window.URL.createObjectURL(blob);
        this.safeReceiptUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.receiptUrl);
        this.currentReceiptFilename = `Receipt-${this.currentReceiptNumber}.pdf`;
        this.loadingReceiptPdf = false;
      },
      error: (err: any) => {
        this.loadingReceiptPdf = false;
        this.showReceiptViewer = false;
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

  downloadReceiptPDF() {
    if (!this.receiptUrl || !this.currentReceiptFilename) {
      this.error = 'Receipt not available for download';
      return;
    }

    const link = document.createElement('a');
    link.href = this.receiptUrl;
    link.download = this.currentReceiptFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  printReceipt() {
    if (!this.receiptUrl && this.lastPaidInvoiceId) {
      this.viewReceiptPDFPreview(this.lastPaidInvoiceId);
      setTimeout(() => {
        if (this.receiptUrl) {
          const printWindow = window.open(this.receiptUrl, '_blank');
          if (printWindow) {
            printWindow.onload = () => {
              printWindow.print();
            };
          }
        }
      }, 1000);
      return;
    }

    if (!this.receiptUrl) {
      this.error = 'Receipt not available for printing';
      return;
    }

    const printWindow = window.open(this.receiptUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }

  lookupNoteStudentById() {
    this.noteLookupError = '';
    this.selectedInvoice = null;
    const rawId = (this.noteStudentId || '').trim();
    if (!rawId) {
      this.noteLookupError = 'Please enter a Student ID.';
      return;
    }
    const normalizedId = rawId.toLowerCase();
    const invoicesArray = Array.isArray(this.invoices) ? this.invoices : [];
    const matchingInvoices = invoicesArray.filter(inv => {
      const studentNumber = inv.student?.studentNumber ? String(inv.student.studentNumber).toLowerCase() : '';
      return studentNumber === normalizedId;
    });
    if (matchingInvoices.length === 0) {
      this.noteLookupError = 'No invoices found for the provided Student ID.';
      return;
    }
    const latestInvoice = matchingInvoices.slice().sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    })[0];
    this.selectedInvoice = latestInvoice;
  }

  lookupNoteStudentByName() {
    this.noteLookupError = '';
    this.selectedInvoice = null;
    const first = (this.noteFirstName || '').trim();
    const last = (this.noteLastName || '').trim();
    if (!first && !last) {
      this.noteLookupError = 'Enter First Name and/or Last Name.';
      return;
    }
    const searchQuery = [first, last].filter(Boolean).join(' ');
    // Use loaded invoices to avoid extra network calls
    const invoicesArray = Array.isArray(this.invoices) ? this.invoices : [];
    const matchingInvoices = invoicesArray.filter(inv => {
      const fn = String(inv.student?.firstName || '').toLowerCase();
      const ln = String(inv.student?.lastName || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      // Match when query tokens appear in either first or last name
      const tokens = q.split(/\s+/).filter(Boolean);
      return tokens.every(t => fn.includes(t) || ln.includes(t));
    });
    if (matchingInvoices.length > 0) {
      const latest = matchingInvoices.slice().sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })[0];
      this.selectedInvoice = latest;
      return;
    }
    // Fallback: fetch students by name, then pick latest invoice among them if present locally
    this.studentService.getStudentsPaginated({ search: searchQuery, page: 1, limit: 50 }).subscribe({
      next: (resp: any) => {
        const students = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
        if (!students.length) {
          this.noteLookupError = 'No students found matching the provided name(s).';
          return;
        }
        const studentIds = new Set(students.map((s: any) => s.id));
        const invoicesForStudents = invoicesArray.filter(inv => studentIds.has(inv.student?.id || inv.studentId));
        if (invoicesForStudents.length === 0) {
          this.noteLookupError = 'No invoices found for matching student(s).';
          return;
        }
        const latest = invoicesForStudents.slice().sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })[0];
        this.selectedInvoice = latest;
      },
      error: () => {
        this.noteLookupError = 'Failed to search students by name.';
      }
    });
  }

  lookupNoteStudent() {
    this.noteLookupError = '';
    this.selectedInvoice = null;
    this.noteCandidates = [];
    const queryRaw = (this.noteSearchQuery || '').trim();
    if (!queryRaw) {
      this.noteLookupError = 'Enter a Student ID or Name.';
      return;
    }
    const query = queryRaw.toLowerCase();
    const invoicesArray = Array.isArray(this.invoices) ? this.invoices : [];

    // 1) Try exact student number match
    let matches = invoicesArray.filter(inv => {
      const studentNumber = String(inv.student?.studentNumber || '').toLowerCase();
      return studentNumber === query;
    });

    // 2) If none, try name contains (token-based)
    if (matches.length === 0) {
      const tokens = query.split(/\s+/).filter(Boolean);
      matches = invoicesArray.filter(inv => {
        const fn = String(inv.student?.firstName || '').toLowerCase();
        const ln = String(inv.student?.lastName || '').toLowerCase();
        return tokens.every(t => fn.includes(t) || ln.includes(t));
      });
      if (tokens.length === 1) {
        const byToken = invoicesArray
          .map(inv => inv.student)
          .filter(stu => !!stu)
          .filter(stu => {
            const fn = String(stu.firstName || '').toLowerCase();
            const ln = String(stu.lastName || '').toLowerCase();
            const t = tokens[0];
            return fn.includes(t) || ln.includes(t);
          });
        const uniqueMap: Record<string, any> = {};
        byToken.forEach(stu => {
          const id = stu.id || stu.studentId || stu.userId || '';
          if (id && !uniqueMap[id]) {
            uniqueMap[id] = stu;
          }
        });
        const candidates = Object.values(uniqueMap) as any[];
        if (candidates.length > 1) {
          this.noteCandidates = candidates.map(stu => ({
            id: stu.id,
            studentNumber: stu.studentNumber,
            firstName: stu.firstName,
            lastName: stu.lastName,
            className: (stu.classEntity && stu.classEntity.name) ? stu.classEntity.name : ''
          }));
          return;
        }
      }
    }

    // 3) If still none, query students API and then filter invoices by returned student ids
    if (matches.length === 0) {
      this.studentService.getStudentsPaginated({ search: queryRaw, page: 1, limit: 50 }).subscribe({
        next: (resp: any) => {
          const students = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
          if (!students.length) {
            this.noteLookupError = 'No students found for provided ID/Name.';
            return;
          }
          const studentIds = new Set(students.map((s: any) => s.id));
          const invs = invoicesArray.filter(inv => studentIds.has(inv.student?.id || inv.studentId));
          if (invs.length === 0) {
            this.noteLookupError = 'No invoices found for matching student(s).';
            return;
          }
          if (students.length > 1) {
            this.noteCandidates = students.map((s: any) => ({
              id: s.id,
              studentNumber: s.studentNumber,
              firstName: s.firstName,
              lastName: s.lastName,
              className: (s.classEntity && s.classEntity.name) ? s.classEntity.name : ''
            }));
            return;
          }
          // Pick latest by date
          const latest = invs.slice().sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          })[0];
          this.selectedInvoice = latest;
        },
        error: () => {
          this.noteLookupError = 'Failed to search students. Please try again.';
        }
      });
      return;
    }

    // Choose the latest when we have matches locally
    const latest = matches.slice().sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    })[0];
    this.selectedInvoice = latest;
  }
  
  chooseNoteCandidate(candidateId: string) {
    this.noteLookupError = '';
    this.selectedInvoice = null;
    const invoicesArray = Array.isArray(this.invoices) ? this.invoices : [];
    const invs = invoicesArray.filter(inv => (inv.student?.id || inv.studentId) === candidateId);
    if (invs.length > 0) {
      const latest = invs.slice().sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })[0];
      this.selectedInvoice = latest;
      this.noteCandidates = [];
      return;
    }
    this.financeService.getInvoices(candidateId, undefined).subscribe({
      next: (list: any[]) => {
        if (!list || list.length === 0) {
          this.noteLookupError = 'No invoices found for selected student.';
          return;
        }
        const latest = list.slice().sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })[0];
        this.selectedInvoice = latest;
        this.noteCandidates = [];
      },
      error: () => {
        this.noteLookupError = 'Failed to fetch invoices for selected student.';
      }
    });
  }

  openReceiptForPrint() {
    if (this.lastPaidInvoiceId) {
      this.viewReceiptPDFPreview(this.lastPaidInvoiceId);
    } else {
      this.error = 'No receipt available. Please record a payment first.';
      setTimeout(() => this.error = '', 5000);
    }
  }

  closeReceiptViewer() {
    this.showReceiptViewer = false;
    if (this.receiptUrl) {
      window.URL.revokeObjectURL(this.receiptUrl);
      this.receiptUrl = null;
    }
    this.safeReceiptUrl = null;
    this.currentReceiptFilename = '';
    this.currentReceiptNumber = '';
    // Don't clear lastPaidInvoiceId so the button remains enabled
  }

  viewStudentReceipt() {
    // Determine student ID - use studentBalanceInfo if available
    if (!this.studentBalanceInfo || !this.studentBalanceInfo.studentId) {
      if (this.studentIdLookup && this.studentIdLookup.trim() !== '') {
        // If studentBalanceInfo is not set, we need to get it first
        this.error = 'Please get student balance first by clicking "Get Balance"';
      } else {
        this.error = 'Please enter a student ID and get balance first';
      }
      setTimeout(() => this.error = '', 5000);
      return;
    }

    const studentId = this.studentBalanceInfo.studentId;
    this.loadingReceipt = true;
    this.error = '';

    // Fetch all invoices for the student
    this.financeService.getInvoices(studentId, undefined).subscribe({
      next: (invoices: any[]) => {
        if (invoices.length === 0) {
          this.loadingReceipt = false;
          this.error = 'No invoice found for this student.';
          setTimeout(() => this.error = '', 5000);
          return;
        }

        // Find invoice with payment - prioritize lastInvoiceId if available, otherwise find latest with payment
        let invoice: any = null;
        
        if (this.studentBalanceInfo && this.studentBalanceInfo.lastInvoiceId) {
          // First try to find by lastInvoiceId
          invoice = invoices.find((inv: any) => inv.id === this.studentBalanceInfo.lastInvoiceId);
        }
        
        // If not found or no lastInvoiceId, find the latest invoice with payment
        if (!invoice || parseFloat(String(invoice.paidAmount || 0)) <= 0) {
          // Filter invoices with payments and get the latest one
          const invoicesWithPayment = invoices.filter((inv: any) => {
            const paidAmount = parseFloat(String(inv.paidAmount || 0));
            return paidAmount > 0;
          });
          
          if (invoicesWithPayment.length > 0) {
            // Sort by creation date (latest first) and get the most recent one with payment
            invoice = invoicesWithPayment.sort((a: any, b: any) => {
              const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return dateB - dateA;
            })[0];
          } else {
            // If no invoice with payment, get the latest invoice anyway
            invoice = invoices.sort((a: any, b: any) => {
              const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return dateB - dateA;
            })[0];
          }
        }

        if (!invoice) {
          this.loadingReceipt = false;
          this.error = 'No invoice found for this student.';
          setTimeout(() => this.error = '', 5000);
          return;
        }

        // Check if payment has been made
        const paidAmount = parseFloat(String(invoice.paidAmount || 0));
        if (paidAmount <= 0) {
          this.loadingReceipt = false;
          this.error = 'No payment has been recorded for this invoice. Please record a payment first.';
          setTimeout(() => this.error = '', 5000);
          return;
        }

        // View the receipt PDF
        this.viewReceiptPDF(invoice.id);
        this.loadingReceipt = false;
      },
      error: (err: any) => {
        this.loadingReceipt = false;
        this.error = 'Failed to fetch invoice. Please try again.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  openBulkInvoiceForm() {
    if (!(this.authService.hasRole('admin') || this.authService.hasRole('superadmin'))) {
      this.error = 'Only Administrators or Super Admins can perform bulk creation';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    if (!confirm('Confirm: You are about to create invoices for all students. Proceed?')) {
      return;
    }
    // Set default due date to 30 days from now
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 30);
    this.bulkInvoiceForm.dueDate = defaultDueDate.toISOString().split('T')[0];
    this.bulkInvoiceForm.currentTerm = '';
    this.bulkInvoiceForm.description = '';
    this.showBulkInvoiceForm = true;
    this.error = '';
    this.success = '';
  }

  closeBulkInvoiceForm() {
    this.showBulkInvoiceForm = false;
    this.bulkInvoiceForm = {
      currentTerm: '',
      dueDate: '',
      description: ''
    };
  }

  createBulkInvoices() {
    // Check if user is authenticated
    if (!this.authService.isAuthenticated()) {
      this.error = 'You must be logged in to create invoices. Please log in and try again.';
      return;
    }

    if (!this.bulkInvoiceForm.currentTerm || !this.bulkInvoiceForm.dueDate) {
      this.error = 'Please fill in all required fields (Current Term and Due Date)';
      return;
    }

    // Validate date format
    const dueDate = new Date(this.bulkInvoiceForm.dueDate);
    if (isNaN(dueDate.getTime())) {
      this.error = 'Invalid date format. Please use YYYY-MM-DD format.';
      return;
    }

    if (!confirm(`This will create invoices for all active students for the following term (based on current term: ${this.bulkInvoiceForm.currentTerm}). Continue?`)) {
      return;
    }
    const verify = prompt('Type BULK to confirm bulk creation:');
    if (!verify || verify.trim().toUpperCase() !== 'BULK') {
      alert('Bulk creation cancelled. You must type BULK to proceed.');
      return;
    }

    this.creatingBulk = true;
    this.error = '';
    this.success = '';

    // Pass the current term - backend will calculate the following term
    this.financeService.createBulkInvoices(
      this.bulkInvoiceForm.currentTerm, 
      this.bulkInvoiceForm.dueDate, 
      this.bulkInvoiceForm.description || undefined
    ).subscribe({
      next: (response: any) => {
        this.creatingBulk = false;
        this.success = response.message || 'Bulk invoices created successfully';
        
        // Show detailed summary
        const summary = response.summary;
        let message = `Created: ${summary.created} invoices\nFailed: ${summary.failed}`;
        if (summary.errors && summary.errors.length > 0) {
          message += `\n\nErrors:\n${summary.errors.slice(0, 5).join('\n')}`;
          if (summary.errors.length > 5) {
            message += `\n... and ${summary.errors.length - 5} more errors`;
          }
        }
        
        // Show success message with summary (no automatic PDF downloads)
        alert(message + '\n\nYou can now view and download invoices from the invoice list.');
        
        // Reload invoices to show the newly created ones
        this.loadInvoices();
        
        // Close the form
        this.closeBulkInvoiceForm();
        
        // Clear success message after 5 seconds
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.creatingBulk = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
          // Optionally redirect to login
          setTimeout(() => {
            this.authService.logout();
          }, 2000);
        } else {
          this.error = err.error?.message || 'Failed to create bulk invoices';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  reverseLastBulkCreation() {
    // Restrict to admin/superadmin only
    if (!(this.authService.hasRole('admin') || this.authService.hasRole('superadmin'))) {
      this.error = 'Only Administrators or Super Admins can reverse bulk invoices';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    const infoTerm = this.reverseFilter.term || this.getFollowingTerm(this.currentTermFromSettings);
    const windowText = (this.reverseFilter.startDate || this.reverseFilter.endDate)
      ? `\nDate window: ${this.reverseFilter.startDate || '—'} to ${this.reverseFilter.endDate || '—'}`
      : '';
    const confirmMsg = `This will reverse bulk-created invoices for ${infoTerm}.${windowText}\n\nContinue?`;
    if (!confirm(confirmMsg)) {
      return;
    }
    const verify = prompt('Type REVERSE to confirm reversal:');
    if (!verify || verify.trim().toUpperCase() !== 'REVERSE') {
      alert('Reversal cancelled. You must type REVERSE to proceed.');
      return;
    }

    this.reversingBulk = true;
    this.error = '';
    this.success = '';

    const payload: any = { currentTerm: this.currentTermFromSettings };
    if (this.reverseFilter.term) payload.term = this.reverseFilter.term;
    if (this.reverseFilter.startDate) payload.startDate = this.reverseFilter.startDate;
    if (this.reverseFilter.endDate) payload.endDate = this.reverseFilter.endDate;

    this.financeService.reverseBulkInvoices(payload).subscribe({
      next: (response: any) => {
        this.reversingBulk = false;
        this.success = response.message || 'Bulk creation reversed successfully';
        this.loadInvoices();
        setTimeout(() => (this.success = ''), 5000);
      },
      error: (err: any) => {
        this.reversingBulk = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to reverse bulk invoices';
        }
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  runTuitionExemptionCorrection() {
    if (!this.canManageFinance()) {
      this.error = 'You do not have permission to run this correction';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    const msg = `This will void unpaid tuition invoices for students with tuition exemption.\n\nProceed?`;
    if (!confirm(msg)) {
      return;
    }

    this.correctingExemptTuition = true;
    this.error = '';
    this.success = '';

    this.financeService.voidTuitionExemptInvoices().subscribe({
      next: (response: any) => {
        this.correctingExemptTuition = false;
        this.success = response.message || 'Tuition exemption correction completed';
        this.loadInvoices();
        setTimeout(() => (this.success = ''), 6000);
      },
      error: (err: any) => {
        this.correctingExemptTuition = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to run tuition exemption correction';
        }
        setTimeout(() => (this.error = ''), 6000);
      }
    });
  }

  getStudentBalance() {
    if (!this.studentIdLookup || this.studentIdLookup.trim() === '') {
      this.error = 'Please enter a student ID';
      return;
    }

    this.loadingBalance = true;
    this.error = '';
    this.studentBalanceInfo = null;

    this.financeService.getStudentBalance(this.studentIdLookup.trim()).subscribe({
      next: (data: any) => {
        this.loadingBalance = false;
        this.studentBalanceInfo = data;
        // Set default payment amount to the balance (ensure it's a number)
        this.quickPaymentAmount = parseFloat(String(data.balance || 0));
      },
      error: (err: any) => {
        this.loadingBalance = false;
        if (err.status === 404) {
          this.error = 'Student not found';
        } else if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to get student balance';
        }
        this.studentBalanceInfo = null;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  recordQuickPayment() {
    if (!this.studentBalanceInfo) {
      this.error = 'Please get student balance first';
      return;
    }

    // Ensure quickPaymentAmount is a number
    const paymentAmount = parseFloat(String(this.quickPaymentAmount)) || 0;
    if (!paymentAmount || paymentAmount <= 0) {
      this.error = 'Please enter a valid payment amount';
      return;
    }

    if (!this.quickPaymentTerm || this.quickPaymentTerm.trim() === '') {
      this.error = 'Please enter a term';
      return;
    }

    // Check if we have lastInvoiceId from student balance info
    if (!this.studentBalanceInfo.lastInvoiceId) {
      this.error = 'No invoice found for this student. Please create an invoice first.';
      return;
    }

    this.recordingQuickPayment = true;
    this.error = '';

    // Fetch invoices for this student from the backend
    this.financeService.getInvoices(this.studentBalanceInfo.studentId, undefined).subscribe({
      next: (studentInvoices: any[]) => {
        if (studentInvoices.length === 0) {
          this.recordingQuickPayment = false;
          this.error = 'No invoice found for this student. Please create an invoice first.';
          setTimeout(() => this.error = '', 5000);
          return;
        }
        
        // Try to find the invoice by lastInvoiceId first
        let latestInvoice: any = studentInvoices.find((inv: any) => inv.id === this.studentBalanceInfo.lastInvoiceId);
        
        // If not found by ID, get the latest invoice for the student
        if (!latestInvoice) {
          latestInvoice = studentInvoices.sort((a: any, b: any) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          })[0];
        }
        
        this.processPayment(latestInvoice);
      },
      error: (err: any) => {
        this.recordingQuickPayment = false;
        this.error = 'Failed to fetch invoice. Please try again.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  private processPayment(latestInvoice: any) {
    if (!latestInvoice) {
      this.recordingQuickPayment = false;
      this.error = 'No invoice found for this student. Please create an invoice first.';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    // Validate payment amount
    const invoiceBalance = parseFloat(String(latestInvoice.balance || 0));
    const paymentAmount = parseFloat(String(this.quickPaymentAmount)) || 0;
    if (paymentAmount > invoiceBalance) {
      if (!confirm(`Payment amount (${this.currencySymbol} ${paymentAmount.toFixed(2)}) exceeds the balance (${this.currencySymbol} ${invoiceBalance.toFixed(2)}). Continue anyway?`)) {
        this.recordingQuickPayment = false;
        return;
      }
    }

    // Prepare payment data
    const today = new Date();
    const paymentData = {
      paidAmount: paymentAmount,
      paymentDate: today.toISOString().split('T')[0],
      paymentMethod: 'Cash',
      notes: `Quick payment for ${this.quickPaymentTerm}`
    };

    this.financeService.updatePayment(latestInvoice.id, paymentData).subscribe({
      next: (response: any) => {
        this.recordingQuickPayment = false;
        
        // Calculate updated balance from response
        const updatedBalance = response.invoice?.balance || 0;
        this.updatedBalanceAfterPayment = parseFloat(String(updatedBalance));
        
        const paymentAmount = parseFloat(String(this.quickPaymentAmount)) || 0;
        this.success = `Payment of ${this.currencySymbol} ${paymentAmount.toFixed(2)} recorded successfully! Updated balance: ${this.currencySymbol} ${this.updatedBalanceAfterPayment.toFixed(2)}`;
        
        // Store the invoice ID for receipt access
        this.lastQuickPaymentInvoiceId = latestInvoice.id;
        
        // Reload invoices and student balance
        this.loadInvoices();
        
        // Reload student balance after a short delay to ensure backend has updated
        setTimeout(() => {
          this.getStudentBalance();
          // Clear the updated balance display after 10 seconds
          setTimeout(() => {
            this.updatedBalanceAfterPayment = null;
          }, 10000);
        }, 500);
        
        // If receipt is needed, show receipt preview
        if (this.quickPaymentReceiptNeeded && this.lastQuickPaymentInvoiceId) {
          setTimeout(() => {
            this.viewReceiptPDFPreview(this.lastQuickPaymentInvoiceId!);
          }, 1000);
        }
        
        // Reset payment amount
        this.quickPaymentAmount = 0;
        this.quickPaymentReceiptNeeded = false;
        
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.recordingQuickPayment = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to record payment';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  clearBalanceInfo() {
    this.studentBalanceInfo = null;
    this.studentIdLookup = '';
    this.quickPaymentAmount = 0;
    this.quickPaymentReceiptNeeded = false;
    this.lastQuickPaymentInvoiceId = null;
    // Reset quickPaymentTerm to currentTermFromSettings when clearing
    this.quickPaymentTerm = this.currentTermFromSettings || '';
    this.error = '';
    this.updatedBalanceAfterPayment = null;
  }

  openQuickPaymentReceipt() {
    if (this.lastQuickPaymentInvoiceId) {
      this.viewReceiptPDFPreview(this.lastQuickPaymentInvoiceId);
    } else {
      this.error = 'No receipt available. Please record a payment first.';
      setTimeout(() => this.error = '', 5000);
    }
  }

  // Helper method to check if user has admin or accountant role
  canManageFinance(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin') || this.authService.hasRole('accountant');
  }

  canCreateInvoice(): boolean {
    return this.canManageFinance();
  }
}


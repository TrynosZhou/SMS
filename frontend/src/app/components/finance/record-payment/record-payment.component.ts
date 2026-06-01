import { Component, OnInit, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil, timeout } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { pdfBlobViewerUrl } from '../../../utils/pdf-preview.util';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  standalone: false,  selector: 'app-record-payment',
templateUrl: './record-payment.component.html',
  styleUrls: ['./record-payment.component.css', './record-payment-modern.css'],
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ]),
    trigger('scaleIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ])
  ]
})
export class RecordPaymentComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly studentSearchInput$ = new Subject<string>();

  studentId: string = '';
  studentData: any = null;
  loading = false;
  error = '';
  success = '';
  paymentRecorded = false;
  lastPaymentInvoiceId: string | null = null;
  showConfirmModal = false;
  
  paymentForm = {
    amount: 0,
    term: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'CASH(USD)',
    notes: ''
  };

  paymentMethods = [
    { value: 'CASH(USD)', label: 'Cash', icon: '💵' },
    { value: 'ECOCASH(USD)', label: 'EcoCash', icon: '📱' },
    { value: 'BANK TRANSFER(USD)', label: 'Bank Transfer', icon: '🏦' }
  ];
  
  currentTerm = '';
  currencySymbol = 'USD';
  submitting = false;
  receiptPdfUrl: SafeResourceUrl | null = null;
  receiptBlobUrl: string | null = null;
  showReceipt = false;
  loadingReceipt = false;
  matchingStudents: any[] = [];
  selectedMatchId: string = '';
  recentPayments: any[] = [];
  lastLoadedAt: Date | null = null;
  Math = Math;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
) { }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.showConfirmModal) {
      this.closeConfirmModal();
    } else if (this.showReceipt) {
      this.closeReceipt();
    } else if (this.studentId) {
      this.clear();
    }
  }

  ngOnInit(): void {
    this.studentSearchInput$
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        if (q.length >= 3) {
          this.getBalance();
        }
      });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.applyQueryParams(params);
    });

    activatePageLoad(this.router, this.destroy$, '/payments/record', () => {
      this.loadCurrentTerm();
      this.applyQueryParams(this.route.snapshot.queryParams);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
    }
  }

  private applyQueryParams(params: Record<string, string>): void {
    if (!params['studentId']) {
      return;
    }
    this.studentId = params['studentId'];

    if (params['firstName'] && params['lastName'] && params['balance']) {
      this.studentData = {
        studentNumber: params['studentId'],
        firstName: params['firstName'],
        lastName: params['lastName'],
        fullName: `${params['firstName']} ${params['lastName']}`,
        balance: parseFloat(params['balance']) || 0,
        paymentInvoiceId: params['paymentInvoiceId'] || null
      };
      this.paymentForm.amount = parseFloat(params['balance']) || 0;
    }

    if (this.studentId) {
      setTimeout(() => this.getBalance(), 100);
    }
    this.cdr.markForCheck();
  }

  loadCurrentTerm(): void {
    this.settingsService
      .getSettings()
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
        next: (settings: any) => {
          if (settings) {
            this.currencySymbol = settings.currencySymbol || 'USD';
            this.currentTerm = settings.currentTerm || settings.activeTerm || '';

            if (!this.currentTerm && (settings.term || settings.year)) {
              const term = settings.term || '';
              const year = settings.year || new Date().getFullYear();
              this.currentTerm = term ? `${term} ${year}` : '';
            }

            if (!this.currentTerm) {
              const currentYear = new Date().getFullYear();
              this.currentTerm = `Term 1 ${currentYear}`;
            }

            this.paymentForm.term = this.currentTerm;
          } else {
            const currentYear = new Date().getFullYear();
            this.currentTerm = `Term 1 ${currentYear}`;
            this.paymentForm.term = this.currentTerm;
          }
        },
        error: () => {
const currentYear = new Date().getFullYear();
          this.currentTerm = `Term 1 ${currentYear}`;
          this.paymentForm.term = this.currentTerm;
        }
      });
}

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  onSearchInput(): void {
    this.studentSearchInput$.next((this.studentId || '').trim());
  }

  selectPaymentMethod(value: string): void {
    this.paymentForm.paymentMethod = value;
  }

  trackByStudentId(_index: number, s: any): string {
    return s.studentId || String(_index);
  }

  trackByPaymentIndex(index: number): number {
    return index;
  }

  getBalance(preservePaymentFlag: boolean = false): void {
    if (!this.studentId || this.studentId.trim() === '') {
      this.error = 'Please enter a Student ID, Name, or Student Number';
      return;
    }

    const preservedInvoiceId = preservePaymentFlag ? this.lastPaymentInvoiceId : null;
    const preservedSuccessMessage = preservePaymentFlag ? this.success : '';
    
    this.loading = true;
    this.error = '';
    
    if (!preservePaymentFlag) {
      this.success = '';
      this.paymentRecorded = false;
      this.lastPaymentInvoiceId = null;
      this.showReceipt = false;
      this.recentPayments = [];
      if (this.receiptBlobUrl) {
        window.URL.revokeObjectURL(this.receiptBlobUrl);
        this.receiptBlobUrl = null;
      }
      this.receiptPdfUrl = null;
      this.loadCurrentTerm();
    }
    
    if (!preservePaymentFlag) {
      this.studentData = null;
      this.paymentForm.amount = 0;
      this.matchingStudents = [];
      this.selectedMatchId = '';
    }

    this.cdr.markForCheck();
    this.financeService
      .getStudentBalance(this.studentId.trim())
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
if (data && data.multipleMatches && Array.isArray(data.matches) && data.matches.length > 0) {
          this.matchingStudents = data.matches;
          this.studentData = null;
          this.paymentForm.amount = 0;
          return;
        }
        this.studentData = data;
        this.paymentForm.amount = data.balance || 0;
        
        // Load recent payments if available
        if (data.recentPayments) {
          this.recentPayments = data.recentPayments;
        }
        
        if (preservePaymentFlag) {
          if (preservedInvoiceId) {
            this.lastPaymentInvoiceId = preservedInvoiceId;
          }
          if (preservedSuccessMessage) {
            this.success = preservedSuccessMessage;
          }
        }
        this.lastLoadedAt = new Date();
      },
        error: (error: any) => {
this.error = error.error?.message || 'Student not found. Please check the details and try again.';
        this.studentData = null;
        this.paymentRecorded = false;
        this.lastPaymentInvoiceId = null;
      }
      });
}

  selectStudent(studentId: string): void {
    this.selectedMatchId = studentId;
    this.onStudentMatchSelected();
  }

  onStudentMatchSelected(): void {
    if (!this.selectedMatchId) return;
    
    this.loading = true;
    this.error = '';
    this.success = '';
    this.studentData = null;
    this.paymentForm.amount = 0;

    this.cdr.markForCheck();
    this.financeService
      .getStudentBalance(this.selectedMatchId)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          this.studentData = data;
          this.paymentForm.amount = data.balance || 0;
          this.matchingStudents = [];

          if (data.recentPayments) {
            this.recentPayments = data.recentPayments;
          }
        },
        error: (error: any) => {
          this.error = error.error?.message || 'Failed to get student balance.';
          this.studentData = null;
          this.matchingStudents = [];
        }
      });
}

  clear(): void {
    this.studentId = '';
    this.studentData = null;
    this.error = '';
    this.success = '';
    this.paymentRecorded = false;
    this.lastPaymentInvoiceId = null;
    this.paymentForm.amount = 0;
    this.matchingStudents = [];
    this.selectedMatchId = '';
    this.recentPayments = [];
    this.loadCurrentTerm();
    this.showReceipt = false;
    this.showConfirmModal = false;
    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
      this.receiptBlobUrl = null;
    }
    this.receiptPdfUrl = null;
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.split(' ').filter(p => p);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  setQuickAmount(percentage: number): void {
    if (this.studentData?.balance) {
      this.paymentForm.amount = Math.round(this.studentData.balance * (percentage / 100) * 100) / 100;
    }
  }

  confirmPayment(): void {
    const targetInvoiceId =
      this.studentData?.paymentInvoiceId || this.studentData?.lastInvoiceId;
    if (!this.studentData || !targetInvoiceId) {
      this.error = 'Please search for a student first';
      return;
    }

    if (!this.paymentForm.amount || this.paymentForm.amount <= 0) {
      this.error = 'Payment amount must be greater than 0';
      return;
    }

    if (!this.paymentForm.term) {
      this.error = 'Term is required';
      return;
    }

    this.showConfirmModal = true;
  }

  closeConfirmModal(): void {
    this.showConfirmModal = false;
  }

  hasReceiptAvailable(): boolean {
    if (this.paymentRecorded || !!this.lastPaymentInvoiceId) {
      return true;
    }
    if (this.studentData && this.studentData.lastInvoicePaidAmount !== undefined && this.studentData.lastInvoicePaidAmount !== null) {
      const paidAmount = parseFloat(String(this.studentData.lastInvoicePaidAmount || 0));
      return paidAmount > 0;
    }
    return false;
  }

  recordPayment(): void {
    this.submitting = true;
    this.error = '';

    const paymentData = {
      paidAmount: this.paymentForm.amount,
      paymentDate: this.paymentForm.paymentDate,
      paymentMethod: this.paymentForm.paymentMethod,
      notes: this.paymentForm.notes,
      isPrepayment: false
    };

    const invoiceIdForPayment =
      this.studentData.paymentInvoiceId || this.studentData.lastInvoiceId;
    
    this.financeService.updatePayment(invoiceIdForPayment, paymentData).subscribe({
      next: (response: any) => {
        const paymentAmount = this.paymentForm.amount;
        const updatedBalance = response.invoice?.balance || 0;
        const studentName = this.studentData?.fullName || '';
        
        let successMessage = `Payment of ${this.currencySymbol} ${this.formatCurrency(paymentAmount)} recorded successfully`;
        
        if (studentName) {
          successMessage += ` for ${studentName}`;
        }
        
        if (updatedBalance !== undefined) {
          if (updatedBalance <= 0) {
            successMessage += '. Invoice fully paid! 🎉';
          } else {
            successMessage += `. Remaining: ${this.currencySymbol} ${this.formatCurrency(updatedBalance)}`;
          }
        }
        
        this.success = successMessage;
        this.paymentRecorded = true;
        this.lastPaymentInvoiceId = invoiceIdForPayment;
        this.submitting = false;
        this.showConfirmModal = false;

        if (response?.receiptPdf) {
          this.showReceiptFromBase64(String(response.receiptPdf));
        } else if (this.lastPaymentInvoiceId) {
          this.showReceiptPreview();
        }

        // Refresh student balance without clearing the receipt modal
        this.getBalance(true);
        
        // Auto-hide success message
        setTimeout(() => {
          if (this.success.includes('recorded successfully')) {
            this.success = '';
          }
        }, 10000);
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to record payment. Please try again.';
        this.submitting = false;
      }
    });
  }

  private showReceiptFromBase64(base64: string): void {
    const trimmed = (base64 || '').trim();
    if (!trimmed) {
      this.error = 'Receipt data is missing.';
      return;
    }

    this.loadingReceipt = true;
    this.error = '';
    this.showReceipt = true;

    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
      this.receiptBlobUrl = null;
    }
    this.receiptPdfUrl = null;

    try {
      const blob = this.base64ToPdfBlob(trimmed);
      if (!blob.size) {
        this.error = 'Receipt PDF is empty';
        this.loadingReceipt = false;
        this.showReceipt = false;
        this.cdr.markForCheck();
        return;
      }
      const url = window.URL.createObjectURL(blob);
      this.receiptBlobUrl = url;
      this.receiptPdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(pdfBlobViewerUrl(url));
      this.loadingReceipt = false;
      this.cdr.markForCheck();
    } catch {
      this.error = 'Failed to display receipt';
      this.loadingReceipt = false;
      this.showReceipt = false;
      this.cdr.markForCheck();
    }
  }

  private base64ToPdfBlob(base64: string): Blob {
    const raw = base64.includes(',') ? base64.split(',')[1] : base64;
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'application/pdf' });
  }

  showReceiptPreview(): void {
    if (this.lastPaymentInvoiceId) {
      this.loadReceiptForInvoice(this.lastPaymentInvoiceId);
      return;
    }

    const paidAmount = this.studentData?.lastInvoicePaidAmount !== undefined
      ? parseFloat(String(this.studentData.lastInvoicePaidAmount || 0))
      : 0;

    if (this.studentData?.lastInvoiceId && paidAmount > 0) {
      this.loadReceiptForInvoice(this.studentData.lastInvoiceId);
      return;
    }

    this.error = 'No receipt available for this student.';
  }

  private loadReceiptForInvoice(invoiceId: string): void {
    if (!invoiceId) {
      this.error = 'Invoice ID is required to load receipt';
      return;
    }

    this.loadingReceipt = true;
    this.error = '';
    this.showReceipt = true;
    
    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
      this.receiptBlobUrl = null;
    }
    this.receiptPdfUrl = null;
    
    this.financeService
      .getReceiptPDF(invoiceId)
      .pipe(
        timeout(90000),
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingReceipt = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (blob: Blob) => {
          if (!blob || blob.size === 0) {
            this.error = 'Receipt PDF is empty or invalid';
            this.showReceipt = false;
            return;
          }

          try {
            const url = window.URL.createObjectURL(blob);
            this.receiptBlobUrl = url;
            this.receiptPdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(pdfBlobViewerUrl(url));
            this.cdr.markForCheck();
          } catch {
            this.error = 'Failed to create receipt preview';
            this.showReceipt = false;
          }
        },
        error: (error: any) => {
          this.showReceipt = false;
          this.receiptPdfUrl = null;
          this.receiptBlobUrl = null;

          if (error.status === 404) {
            this.error = error?.error?.message || 'Receipt not found.';
          } else if (error?.name === 'TimeoutError') {
            this.error = 'Receipt generation timed out. Please try again.';
          } else {
            this.error = error?.error?.message || 'Error loading receipt. Please try again.';
          }

          setTimeout(() => {
            if (this.error.includes('receipt') || this.error.includes('Receipt')) {
              this.error = '';
            }
          }, 8000);
        }
      });
  }

  closeReceipt(): void {
    this.showReceipt = false;
    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
      this.receiptBlobUrl = null;
    }
    this.receiptPdfUrl = null;
  }

  openReceiptInNewWindow(): void {
    if (this.receiptBlobUrl) {
      window.open(this.receiptBlobUrl, '_blank');
    }
  }

  downloadReceipt(): void {
    if (!this.receiptBlobUrl) {
      this.error = 'Receipt not available for download';
      return;
    }

    const invoiceId = this.lastPaymentInvoiceId || this.studentData?.lastInvoiceId;
    const studentName = this.studentData?.fullName?.replace(/\s+/g, '_') || 'student';
    const filename = `receipt-${studentName}-${invoiceId || 'payment'}.pdf`;
    
    const link = document.createElement('a');
    link.href = this.receiptBlobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  printReceipt(): void {
    if (this.receiptBlobUrl) {
      const printWindow = window.open(this.receiptBlobUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  }
}

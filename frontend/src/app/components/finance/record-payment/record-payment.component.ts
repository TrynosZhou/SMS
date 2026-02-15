import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-record-payment',
  templateUrl: './record-payment.component.html',
  styleUrls: ['./record-payment.component.css']
})
export class RecordPaymentComponent implements OnInit {
  studentId: string = '';
  studentData: any = null;
  loading = false;
  error = '';
  success = '';
  paymentRecorded = false;
  lastPaymentInvoiceId: string | null = null;
  
  paymentForm = {
    amount: 0,
    term: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
    notes: ''
  };
  
  currentTerm = '';
  currencySymbol = 'KES';
  submitting = false;
  receiptPdfUrl: SafeResourceUrl | null = null;
  receiptBlobUrl: string | null = null;
  showReceipt = false;
  loadingReceipt = false;
  matchingStudents: any[] = [];
  selectedMatchId: string = '';

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.loadCurrentTerm();
    
    // Check for query parameters from outstanding balance page
    this.route.queryParams.subscribe(params => {
      if (params['studentId']) {
        this.studentId = params['studentId'];
        
        // If student data is provided in query params, display it immediately
        if (params['firstName'] && params['lastName'] && params['balance']) {
          // Create a temporary student data object from query params
          this.studentData = {
            studentNumber: params['studentId'],
            firstName: params['firstName'],
            lastName: params['lastName'],
            fullName: `${params['firstName']} ${params['lastName']}`,
            balance: parseFloat(params['balance']) || 0
          };
          
          // Set the payment amount to the balance
          this.paymentForm.amount = parseFloat(params['balance']) || 0;
        }
        
        // Automatically fetch full student balance data
        if (this.studentId) {
          setTimeout(() => {
            this.getBalance();
          }, 300); // Small delay to ensure component is fully initialized
        }
      }
    });
  }

  loadCurrentTerm(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings) {
          // Load currency symbol
          this.currencySymbol = settings.currencySymbol || 'KES';
          
          // Use currentTerm from settings, or fallback to activeTerm, or construct from term/year
          this.currentTerm = settings.currentTerm || settings.activeTerm || '';
          
          // If currentTerm is not available, try to construct it from term and year
          if (!this.currentTerm && (settings.term || settings.year)) {
            const term = settings.term || '';
            const year = settings.year || new Date().getFullYear();
            this.currentTerm = term ? `${term} ${year}` : '';
          }
          
          // If still no term, use a default
          if (!this.currentTerm) {
            const currentYear = new Date().getFullYear();
            this.currentTerm = `Term 1 ${currentYear}`;
          }
          
          // Always populate the term field with the current term from settings
          this.paymentForm.term = this.currentTerm;
        } else {
          // If settings is null, set a default term
          const currentYear = new Date().getFullYear();
          this.currentTerm = `Term 1 ${currentYear}`;
          this.paymentForm.term = this.currentTerm;
        }
      },
      error: (error) => {
        console.error('Error loading settings:', error);
        // Set default term on error
        const currentYear = new Date().getFullYear();
        this.currentTerm = `Term 1 ${currentYear}`;
        this.paymentForm.term = this.currentTerm;
      }
    });
  }

  getBalance(preservePaymentFlag: boolean = false): void {
    if (!this.studentId || this.studentId.trim() === '') {
      this.error = 'Please enter a Student ID, Student Number, Last Name, or First Name';
      return;
    }

    // Store the invoice ID before clearing if we're preserving payment flag
    const preservedInvoiceId = preservePaymentFlag ? this.lastPaymentInvoiceId : null;
    const preservedSuccessMessage = preservePaymentFlag ? this.success : '';
    
    this.loading = true;
    this.error = '';
    // Only clear success message if not preserving it (i.e., new search, not refresh after payment)
    if (!preservePaymentFlag) {
      this.success = '';
    }
    // Only clear paymentRecorded if not preserving it (i.e., new search, not refresh after payment)
    if (!preservePaymentFlag) {
      this.paymentRecorded = false;
      this.lastPaymentInvoiceId = null;
      this.showReceipt = false;
      // Clean up blob URL
      if (this.receiptBlobUrl) {
        window.URL.revokeObjectURL(this.receiptBlobUrl);
        this.receiptBlobUrl = null;
      }
      this.receiptPdfUrl = null;
      // Reload term from settings for new search to ensure it's current
      this.loadCurrentTerm();
    }
    this.studentData = null;
    this.paymentForm.amount = 0;
    this.matchingStudents = [];
    this.selectedMatchId = '';

    this.financeService.getStudentBalance(this.studentId.trim()).subscribe({
      next: (data: any) => {
        this.loading = false;
        if (data && data.multipleMatches && Array.isArray(data.matches) && data.matches.length > 0) {
          this.matchingStudents = data.matches;
          this.studentData = null;
          this.paymentForm.amount = 0;
          return;
        }
        this.studentData = data;
        this.paymentForm.amount = data.balance || 0;
        // Restore preserved invoice ID and success message if we're refreshing after payment
        if (preservePaymentFlag) {
          if (preservedInvoiceId) {
            this.lastPaymentInvoiceId = preservedInvoiceId;
          }
          if (preservedSuccessMessage) {
            this.success = preservedSuccessMessage;
          }
        }
      },
      error: (error: any) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to get student balance. Please check the Student ID, Student Number, Last Name, or First Name.';
        this.studentData = null;
        this.paymentRecorded = false;
        this.lastPaymentInvoiceId = null;
      }
    });
  }

  onStudentMatchSelected(): void {
    if (!this.selectedMatchId) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.studentData = null;
    this.paymentForm.amount = 0;

    this.financeService.getStudentBalance(this.selectedMatchId).subscribe({
      next: (data: any) => {
        this.loading = false;
        this.studentData = data;
        this.paymentForm.amount = data.balance || 0;
        this.matchingStudents = [];
      },
      error: (error: any) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to get student balance. Please check the Student ID, Student Number, Last Name, or First Name.';
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
    // Reload term from settings to ensure it's always current
    this.loadCurrentTerm();
    this.showReceipt = false;
    // Clean up blob URL
    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
      this.receiptBlobUrl = null;
    }
    this.receiptPdfUrl = null;
  }

  hasReceiptAvailable(): boolean {
    if (this.paymentRecorded || !!this.success) {
      return true;
    }
    if (this.studentData && this.studentData.lastInvoicePaidAmount !== undefined && this.studentData.lastInvoicePaidAmount !== null) {
      const paidAmount = parseFloat(String(this.studentData.lastInvoicePaidAmount || 0));
      return paidAmount > 0;
    }
    return false;
  }

  recordPayment(): void {
    if (!this.studentData || !this.studentData.lastInvoiceId) {
      this.error = 'Please get student balance first';
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

    this.submitting = true;
    this.error = '';
    this.success = '';

    const paymentData = {
      paidAmount: this.paymentForm.amount,
      paymentDate: this.paymentForm.paymentDate,
      paymentMethod: this.paymentForm.paymentMethod,
      notes: this.paymentForm.notes,
      isPrepayment: false
    };

    // Store the invoice ID before recording payment
    const invoiceIdForPayment = this.studentData.lastInvoiceId;
    
    this.financeService.updatePayment(invoiceIdForPayment, paymentData).subscribe({
      next: (response: any) => {
        // Get payment details for success message
        const paymentAmount = this.paymentForm.amount;
        const updatedBalance = response.invoice?.balance || 0;
        const studentName = this.studentData?.fullName || `${this.studentData?.firstName || ''} ${this.studentData?.lastName || ''}`.trim();
        
        // Create a comprehensive success message
        let successMessage = `✅ Payment of ${this.currencySymbol} ${this.formatCurrency(paymentAmount)} recorded successfully`;
        
        if (studentName) {
          successMessage += ` for ${studentName}`;
        }
        
        if (updatedBalance !== undefined) {
          if (updatedBalance > 0) {
            successMessage += `. Remaining balance: ${this.currencySymbol} ${this.formatCurrency(updatedBalance)}`;
          } else {
            successMessage += `. Invoice fully paid!`;
          }
        }
        
        successMessage += '.';
        
        this.success = successMessage;
        this.paymentRecorded = true;
        this.lastPaymentInvoiceId = invoiceIdForPayment; // Store the invoice ID used for this payment
        this.submitting = false;
        
        // Refresh student balance (preserve paymentRecorded flag and invoice ID)
        this.getBalance(true);
        
        // Auto-hide success message after 8 seconds
        setTimeout(() => {
          if (this.success.includes('Payment of')) {
            this.success = '';
          }
        }, 8000);
        
        // Automatically load receipt preview for the recorded payment
        if (this.lastPaymentInvoiceId) {
          setTimeout(() => {
            this.showReceiptPreview();
          }, 1000);
        }
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to record payment';
        this.submitting = false;
      }
    });
  }

  showReceiptPreview(): void {
    // Use the invoice ID from the last payment if available, otherwise use current student's last invoice
    const invoiceId = this.lastPaymentInvoiceId || (this.studentData?.lastInvoiceId);
    
    if (!invoiceId) {
      this.error = 'Please get student balance and record payment first';
      return;
    }

    this.loadReceiptForInvoice(invoiceId);
  }

  private loadReceiptForInvoice(invoiceId: string): void {
    if (!invoiceId) {
      this.error = 'Invoice ID is required to load receipt';
      return;
    }

    this.loadingReceipt = true;
    this.error = '';
    this.showReceipt = true; // Show the receipt container immediately to show loading state
    
    // Revoke previous URL if exists to free memory
    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
      this.receiptBlobUrl = null;
    }
    this.receiptPdfUrl = null;
    
    console.log('Loading receipt for invoice ID:', invoiceId);
    
    this.financeService.getReceiptPDF(invoiceId).subscribe({
      next: (blob: Blob) => {
        console.log('Receipt blob received, size:', blob.size, 'type:', blob.type);
        
        if (!blob || blob.size === 0) {
          this.error = 'Receipt PDF is empty or invalid';
          this.loadingReceipt = false;
          this.showReceipt = false;
          return;
        }

        // Check if it's actually a PDF
        if (blob.type !== 'application/pdf' && !blob.type.includes('pdf')) {
          console.warn('Received blob type:', blob.type, 'Expected PDF');
          // Still try to display it as it might be a PDF with wrong content-type
        }

        try {
          const url = window.URL.createObjectURL(blob);
          this.receiptBlobUrl = url;
          this.receiptPdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
          this.loadingReceipt = false;
          console.log('Receipt URL created successfully');
          
          // Scroll to receipt preview
          setTimeout(() => {
            const receiptElement = document.querySelector('.receipt-preview');
            if (receiptElement) {
              receiptElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
        } catch (err: any) {
          console.error('Error creating receipt URL:', err);
          this.error = 'Failed to create receipt preview: ' + (err.message || 'Unknown error');
          this.loadingReceipt = false;
          this.showReceipt = false;
        }
      },
      error: (error: any) => {
        console.error('Error loading receipt PDF:', error);
        this.loadingReceipt = false;
        this.showReceipt = false;
        this.receiptPdfUrl = null;
        this.receiptBlobUrl = null;
        
        if (error.status === 404) {
          this.error = 'Receipt not found. Please ensure the payment was recorded successfully.';
        } else if (error.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else if (error.status === 500) {
          this.error = 'Server error while generating receipt. Please try again.';
        } else {
          const errorMessage = error.error?.message || error.message || 'Failed to load receipt';
          this.error = `Error loading receipt: ${errorMessage}`;
        }
        
        // Show error for 5 seconds
        setTimeout(() => {
          if (this.error.includes('receipt')) {
            this.error = '';
          }
        }, 5000);
      }
    });
  }

  closeReceipt(): void {
    this.showReceipt = false;
    // Clean up blob URL when closing
    if (this.receiptBlobUrl) {
      window.URL.revokeObjectURL(this.receiptBlobUrl);
      this.receiptBlobUrl = null;
    }
    this.receiptPdfUrl = null;
  }

  openReceiptInNewWindow(): void {
    if (this.receiptBlobUrl) {
      window.open(this.receiptBlobUrl, '_blank');
    } else if (this.receiptPdfUrl) {
      // Fallback: try to extract URL from SafeResourceUrl
      const url = (this.receiptPdfUrl as any).changingThisBreaksApplicationSecurity;
      if (url) {
        window.open(url, '_blank');
      }
    }
  }

  downloadReceipt(): void {
    if (!this.receiptBlobUrl) {
      this.error = 'Receipt not available for download';
      return;
    }

    const invoiceId = this.lastPaymentInvoiceId || (this.studentData?.lastInvoiceId);
    const filename = `receipt-${invoiceId || 'payment'}-${new Date().getTime()}.pdf`;
    
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = this.receiptBlobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }
}

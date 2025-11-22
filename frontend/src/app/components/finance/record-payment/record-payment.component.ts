import { Component, OnInit } from '@angular/core';
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
  
  paymentForm = {
    amount: 0,
    term: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
    notes: ''
  };
  
  currentTerm = '';
  submitting = false;
  receiptPdfUrl: SafeResourceUrl | null = null;
  showReceipt = false;
  loadingReceipt = false;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit(): void {
    this.loadCurrentTerm();
  }

  loadCurrentTerm(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings) {
          const term = settings.term || '';
          const year = settings.year || new Date().getFullYear();
          this.currentTerm = term ? `${term} ${year}` : '';
          this.paymentForm.term = this.currentTerm;
        }
      },
      error: (error) => {
        console.error('Error loading settings:', error);
      }
    });
  }

  getBalance(): void {
    if (!this.studentId || this.studentId.trim() === '') {
      this.error = 'Please enter a Student ID';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';
    this.studentData = null;
    this.paymentForm.amount = 0;

    this.financeService.getStudentBalance(this.studentId.trim()).subscribe({
      next: (data: any) => {
        this.studentData = data;
        this.paymentForm.amount = data.balance || 0;
        this.loading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to get student balance. Please check the Student ID.';
        this.loading = false;
        this.studentData = null;
      }
    });
  }

  clear(): void {
    this.studentId = '';
    this.studentData = null;
    this.error = '';
    this.success = '';
    this.paymentForm.amount = 0;
    this.paymentForm.term = this.currentTerm;
    this.showReceipt = false;
    this.receiptPdfUrl = null;
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

    this.financeService.updatePayment(this.studentData.lastInvoiceId, paymentData).subscribe({
      next: (response: any) => {
        this.success = 'Payment recorded successfully!';
        this.submitting = false;
        // Refresh student balance
        this.getBalance();
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to record payment';
        this.submitting = false;
      }
    });
  }

  showReceiptPreview(): void {
    if (!this.studentData || !this.studentData.lastInvoiceId) {
      this.error = 'Please get student balance and record payment first';
      return;
    }

    this.loadingReceipt = true;
    this.financeService.getReceiptPDF(this.studentData.lastInvoiceId).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        this.receiptPdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
        this.showReceipt = true;
        this.loadingReceipt = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load receipt';
        this.loadingReceipt = false;
      }
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }
}

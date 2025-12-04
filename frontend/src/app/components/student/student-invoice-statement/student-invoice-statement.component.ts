import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-student-invoice-statement',
  templateUrl: './student-invoice-statement.component.html',
  styleUrls: ['./student-invoice-statement.component.css']
})
export class StudentInvoiceStatementComponent implements OnInit {
  user: any;
  student: any;
  studentId: string = '';
  invoices: any[] = [];
  currentBalance: number = 0;
  loading = false;
  error = '';
  success = '';
  currencySymbol: string = 'KES';
  
  // PDF Preview
  showPdfPreview = false;
  pdfUrl: string | null = null;
  safePdfUrl: SafeResourceUrl | null = null;
  loadingPdf = false;
  currentInvoiceId: string | null = null;

  constructor(
    private authService: AuthService,
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit() {
    this.loadStudentData();
  }

  loadStudentData(retryCount = 0) {
    const maxRetries = 5; // Increased retries
    this.user = this.authService.getCurrentUser();
    
    // If user not found, try to reload from localStorage
    if (!this.user) {
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          this.user = JSON.parse(storedUser);
          console.log('[StudentInvoiceStatement] Reloaded user from localStorage:', this.user);
        }
      } catch (e) {
        console.error('[StudentInvoiceStatement] Error parsing user from localStorage:', e);
      }
    }
    
    if (!this.user) {
      if (retryCount < maxRetries) {
        setTimeout(() => this.loadStudentData(retryCount + 1), 500);
        return;
      }
      this.error = 'User information not found. Please log in again.';
      return;
    }

    // Debug: Log user object structure
    console.log('[StudentInvoiceStatement] User object:', {
      id: this.user.id,
      role: this.user.role,
      hasStudent: !!this.user.student,
      studentKeys: this.user.student ? Object.keys(this.user.student) : [],
      fullUser: this.user
    });

    // Check if user is a student but student data is missing
    if (this.user.role === 'student' && !this.user.student) {
      if (retryCount < maxRetries) {
        console.log(`[StudentInvoiceStatement] Student data not available, retry ${retryCount + 1}/${maxRetries}`);
        // Wait a bit longer for student data to be loaded
        setTimeout(() => this.loadStudentData(retryCount + 1), 1000);
        return;
      }
      console.error('[StudentInvoiceStatement] Student data not available after retries. User object:', this.user);
      console.error('[StudentInvoiceStatement] This usually means the user session was created before the student data fix. Please log out and log back in.');
      this.error = 'Student information not found. Your session may be outdated. Please log out and log in again to refresh your session.';
      return;
    }

    if (!this.user.student) {
      this.error = 'Student information not found. Please log out and log in again.';
      return;
    }

    this.student = this.user.student;
    
    // Verify student ID is available
    if (!this.student.id) {
      console.error('Student ID not available:', this.student);
      this.error = 'Student ID not found. Please log in again.';
      return;
    }
    
    this.studentId = this.student.id;
    this.loadSettings();
    this.loadInvoices();
    this.loadCurrentBalance();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || 'KES';
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
      }
    });
  }

  loadInvoices() {
    if (!this.student || !this.student.id) {
      return;
    }

    this.loading = true;
    this.error = '';

    this.financeService.getInvoices(this.student.id).subscribe({
      next: (data: any) => {
        this.loading = false;
        this.invoices = Array.isArray(data) ? data : [];
        // Sort by date, newest first
        this.invoices.sort((a, b) => {
          const dateA = new Date(a.createdAt || a.dueDate || 0).getTime();
          const dateB = new Date(b.createdAt || b.dueDate || 0).getTime();
          return dateB - dateA;
        });
      },
      error: (err: any) => {
        this.loading = false;
        console.error('Error loading invoices:', err);
        this.error = err.error?.message || 'Failed to load invoices';
      }
    });
  }

  loadCurrentBalance() {
    if (!this.student || !this.student.id) {
      return;
    }

    this.financeService.getStudentBalance(this.student.id).subscribe({
      next: (data: any) => {
        this.currentBalance = parseFloat(String(data.balance || 0));
      },
      error: (err: any) => {
        console.error('Error loading balance:', err);
      }
    });
  }

  previewPDF(invoiceId: string) {
    this.currentInvoiceId = invoiceId;
    this.loadingPdf = true;
    this.showPdfPreview = true;
    this.error = '';

    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (response: any) => {
        this.loadingPdf = false;
        const blob = response.blob;
        const url = window.URL.createObjectURL(blob);
        this.pdfUrl = url;
        this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      },
      error: (err: any) => {
        this.loadingPdf = false;
        console.error('Error loading PDF:', err);
        this.error = err.error?.message || 'Failed to load PDF preview';
        this.showPdfPreview = false;
      }
    });
  }

  closePdfPreview() {
    this.showPdfPreview = false;
    if (this.pdfUrl) {
      window.URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
      this.safePdfUrl = null;
    }
    this.currentInvoiceId = null;
  }

  downloadPDF(invoiceId: string) {
    this.loading = true;
    this.error = '';

    this.financeService.getInvoicePDF(invoiceId).subscribe({
      next: (response: any) => {
        this.loading = false;
        const blob = response.blob;
        const filename = response.filename || `Invoice-${invoiceId}.pdf`;
        
        if (blob.size === 0) {
          this.error = 'Received empty PDF file';
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
        this.success = 'PDF downloaded successfully';
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.loading = false;
        console.error('PDF download error:', err);
        this.error = err.error?.message || 'Failed to download PDF';
      }
    });
  }

  getStatusClass(status: string): string {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'paid') return 'status-badge status-paid';
    if (statusLower === 'partial') return 'status-badge status-partial';
    if (statusLower === 'overdue') return 'status-badge status-overdue';
    return 'status-badge status-pending';
  }
}


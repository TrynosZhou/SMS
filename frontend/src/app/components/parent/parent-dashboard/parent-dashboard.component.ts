import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';
import { FinanceService } from '../../../services/finance.service';

@Component({
  selector: 'app-parent-dashboard',
  templateUrl: './parent-dashboard.component.html',
  styleUrls: ['./parent-dashboard.component.css']
})
export class ParentDashboardComponent implements OnInit {
  students: any[] = [];
  loading = false;
  error = '';
  currencySymbol = 'KES';
  parentName = '';

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private examService: ExamService,
    private settingsService: SettingsService,
    private financeService: FinanceService,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  ngOnInit() {
    this.loadSettings();
    this.loadStudents();
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

  loadStudents() {
    this.loading = true;
    this.error = '';
    
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        this.students = response.students || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
          setTimeout(() => {
            this.authService.logout();
          }, 2000);
        } else {
          this.error = err.error?.message || 'Failed to load students';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  viewReportCard(student: any) {
    // Check if term balance allows access (term balance must be zero)
    const termBalance = parseFloat(String(student.termBalance || 0));
    
    if (termBalance > 0) {
      this.error = `Report card access is restricted. Please clear the outstanding term balance of ${this.currencySymbol} ${termBalance.toFixed(2)} to view the report card.`;
      setTimeout(() => this.error = '', 8000);
      return;
    }

    // Navigate to report card page with student ID
    this.router.navigate(['/report-cards'], {
      queryParams: { studentId: student.id }
    });
  }

  unlinkStudent(studentId: string) {
    if (!confirm('Are you sure you want to unlink this student?')) {
      return;
    }

    this.parentService.unlinkStudent(studentId).subscribe({
      next: () => {
        this.loadStudents();
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to unlink student';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  linkMoreStudents() {
    this.router.navigate(['/parent/link-students']);
  }

  logout() {
    this.authService.logout();
  }

  manageAccount() {
    this.router.navigate(['/parent/manage-account']);
  }

  getFirstStudent(): any {
    return this.students.length > 0 ? this.students[0] : null;
  }

  viewReportCardForFirstStudent() {
    const firstStudent = this.getFirstStudent();
    if (firstStudent) {
      this.viewReportCard(firstStudent);
    }
  }

  viewCurrentInvoice() {
    if (this.students.length === 0) {
      this.error = 'No linked students found. Please link a student first.';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    // Get the first linked student's invoices
    const firstStudent = this.students[0];
    
    // Fetch invoices for this student
    this.financeService.getInvoices(firstStudent.id).subscribe({
      next: (invoices: any[]) => {
        if (invoices.length === 0) {
          this.error = 'No invoices found for this student.';
          setTimeout(() => this.error = '', 5000);
          return;
        }

        // Get the most recent invoice
        const latestInvoice = invoices.sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })[0];

        // View the invoice PDF
        this.financeService.getInvoicePDF(latestInvoice.id).subscribe({
          next: (result: { blob: Blob; filename: string }) => {
            const url = window.URL.createObjectURL(result.blob);
            // Create a download link with the proper filename
            const link = document.createElement('a');
            link.href = url;
            link.download = result.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            // Clean up the URL after a delay to free memory
            setTimeout(() => window.URL.revokeObjectURL(url), 100);
          },
          error: (err: any) => {
            console.error('Error loading invoice PDF:', err);
            this.error = err.error?.message || 'Failed to load invoice PDF';
            setTimeout(() => this.error = '', 5000);
          }
        });
      },
      error: (err: any) => {
        console.error('Error fetching invoices:', err);
        this.error = err.error?.message || 'Failed to fetch invoices';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}

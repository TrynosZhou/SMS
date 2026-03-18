import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ParentService } from '../../../services/parent.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-student-portal',
  templateUrl: './student-portal.component.html',
  styleUrls: ['./student-portal.component.css']
})
export class StudentPortalComponent implements OnInit {
  students: any[] = [];
  loading = false;
  error = '';
  currencySymbol = '$';

  constructor(
    private parentService: ParentService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => (this.currencySymbol = s?.currencySymbol || '$'),
      error: () => {}
    });
    this.loadStudents();
  }

  loadStudents(): void {
    this.loading = true;
    this.error = '';
    this.parentService.getLinkedStudents().subscribe({
      next: (res: any) => {
        this.students = res?.students || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load linked students.';
      }
    });
  }

  openReportCard(student: any): void {
    if (!student?.id) return;
    this.router.navigate(['/report-cards'], { queryParams: { studentId: student.id } });
  }

  openInvoiceStatement(student: any): void {
    if (!student?.id) return;
    this.router.navigate(['/parent/invoice-statement'], { queryParams: { studentId: student.id } });
  }

  openStudentDashboard(student: any): void {
    if (!student?.id) return;
    // Parent stays logged in, but we switch the UI + API context to this student.
    this.authService.enterStudentPortal(student);
    // Student "home" for e-learning is the task list page.
    this.router.navigate(['/eweb']);
  }

  linkStudents(): void {
    this.router.navigate(['/parent/link-students']);
  }

  studentName(student: any): string {
    return `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || student?.studentNumber || 'Student';
  }

  studentMeta(student: any): string {
    const cls = (student?.class || student?.classEntity)?.name || student?.className || '';
    const num = student?.studentNumber || '';
    return [cls, num].filter(Boolean).join(' • ');
  }
}


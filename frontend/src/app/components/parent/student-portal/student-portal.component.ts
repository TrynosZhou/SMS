import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { ParentService } from '../../../services/parent.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-student-portal',
  templateUrl: './student-portal.component.html',
  styleUrls: ['./student-portal.component.css']
})
export class StudentPortalComponent implements OnInit, OnDestroy {
  students: any[] = [];
  loading = false;
  error = '';
  currencySymbol = '$';

  private readonly destroy$ = new Subject<void>();
  private readonly requestTimeoutMs = 60000;

  constructor(
    private parentService: ParentService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.bootstrap();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrap(): void {
    this.loading = true;
    this.error = '';

    this.settingsService
      .getSettings()
      .pipe(
        timeout(this.requestTimeoutMs),
        takeUntil(this.destroy$),
        catchError(() => of({}))
      )
      .subscribe((s: any) => {
        this.currencySymbol = s?.currencySymbol || '$';
        this.cdr.markForCheck();
      });

    this.loadStudents();
  }

  loadStudents(): void {
    this.loading = true;
    this.error = '';

    this.parentService
      .getLinkedStudents()
      .pipe(
        timeout(this.requestTimeoutMs),
        takeUntil(this.destroy$),
        catchError((err: any) => {
          if (err?.status === 401) {
            this.error = 'Session expired. Redirecting to login…';
            setTimeout(() => this.authService.logout(), 2000);
          } else {
            this.error =
              err?.name === 'TimeoutError'
                ? 'Request timed out while loading students.'
                : err?.error?.message || err?.message || 'Failed to load linked students.';
          }
          return of({ students: [] });
        }),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res: any) => {
          this.students = res?.students || [];
          this.cdr.markForCheck();
        },
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
    this.authService.enterStudentPortal(student);
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

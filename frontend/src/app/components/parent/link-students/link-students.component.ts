import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  standalone: false,  selector: 'app-link-students',
templateUrl: './link-students.component.html',
  styleUrls: ['./link-students.component.css']
})
export class LinkStudentsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('studentIdInput') studentIdInput?: ElementRef<HTMLInputElement>;

  studentId = '';
  linkedStudents: any[] = [];
  linking = false;
  loading = false;
  error = '';
  success = '';
  parentName = '';

  /** ID of the student currently awaiting unlink confirmation */
  confirmUnlinkId: string | null = null;

  private readonly destroy$ = new Subject<void>();
  private readonly requestTimeoutMs = 60000;

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim()
        || user.fullName?.trim() || 'Parent';
    } else {
      this.parentName = user?.fullName?.trim() || 'Parent';
    }
  }

  ngOnInit() {
    this.loadLinkedStudents();
  }

  ngAfterViewInit(): void {
    this.focusStudentIdInput();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadLinkedStudents() {
    this.loading = true;
    this.error = '';
    this.parentService
      .getLinkedStudents()
      .pipe(
        timeout(this.requestTimeoutMs),
        takeUntil(this.destroy$),
        catchError((err: any) => {
          this.error =
            err?.name === 'TimeoutError'
              ? 'Request timed out while loading students.'
              : err?.error?.message || err?.message || 'Failed to load linked students';
          setTimeout(() => {
            this.error = '';
            this.cdr.markForCheck();
          }, 8000);
          return of({ students: [] });
        }),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          this.linkedStudents = response?.students || [];
          this.cdr.markForCheck();
        },
      });
  }

  linkStudent() {
    this.error = '';
    this.success = '';

    if (!this.studentId || !this.studentId.trim()) {
      this.error = 'Please enter a Student ID';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.linking = true;

    this.parentService.linkStudentByIdAndDob(this.studentId.trim()).subscribe({
      next: (response: any) => {
        this.linking = false;
        const name = [response.student?.firstName, response.student?.lastName].filter(Boolean).join(' ');
        this.success = `Successfully linked${name ? ': ' + name : ' student'}`;
        this.studentId = '';
        this.loadLinkedStudents();
        this.focusStudentIdInput();
        setTimeout(() => this.success = '', 6000);
      },
      error: (err: any) => {
        this.linking = false;
        this.error = err.error?.message || 'Failed to link student. Please verify the Student ID.';
        setTimeout(() => this.error = '', 6000);
      }
    });
  }

  requestUnlink(studentId: string) {
    this.confirmUnlinkId = studentId;
  }

  cancelUnlink() {
    this.confirmUnlinkId = null;
  }

  confirmUnlink() {
    if (!this.confirmUnlinkId) return;
    const id = this.confirmUnlinkId;
    this.confirmUnlinkId = null;

    this.parentService.unlinkStudent(id).subscribe({
      next: () => {
        this.success = 'Student unlinked successfully.';
        this.loadLinkedStudents();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to unlink student';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  studentInitials(student: any): string {
    const f = (student.firstName || '').charAt(0).toUpperCase();
    const l = (student.lastName || '').charAt(0).toUpperCase();
    return (f + l) || '?';
  }

  formatStudentName(student: any): string {
    const name = [student?.lastName, student?.firstName].filter(Boolean).join(' ').trim();
    return name || student?.fullName?.trim() || 'Student';
  }

  formatStudentClass(student: any): string {
    const cls = student?.class || student?.classEntity;
    const parts = [cls?.name, cls?.form].filter(Boolean);
    return parts.join(' · ') || 'Class N/A';
  }

  openReportCard(student: any): void {
    if (!student?.id) return;
    this.router.navigate(['/report-cards'], { queryParams: { studentId: student.id } });
  }

  openInvoiceStatement(student: any): void {
    if (!student?.id) return;
    this.router.navigate(['/parent/invoice-statement'], {
      queryParams: { studentId: student.id },
    });
  }

  openStudentPortal(student: any): void {
    if (!student?.id) return;
    this.authService.enterStudentPortal(student);
    this.router.navigate(['/dashboard']);
  }

  goToDashboard() {
    this.router.navigate(['/parent/dashboard']);
  }

  private focusStudentIdInput(): void {
    setTimeout(() => this.studentIdInput?.nativeElement?.focus(), 0);
  }

  logout() {
    this.authService.logout();
  }
}

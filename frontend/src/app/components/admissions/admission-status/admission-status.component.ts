import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdmissionApplication, AdmissionService } from '../../../services/admission.service';
import { AuthService } from '../../../services/auth.service';
import { Subject, switchMap, takeUntil, tap, finalize, of } from 'rxjs';
import { catchError, filter, map } from 'rxjs/operators';

@Component({
  standalone: false,
  selector: 'app-admission-status',
  templateUrl: './admission-status.component.html',
  styleUrls: ['./admission-status.component.css'],
})
export class AdmissionStatusComponent implements OnInit, OnDestroy {
  application: AdmissionApplication | null = null;
  loading = true;
  error = '';
  enrolling = false;
  isStaff = false;

  readonly statusSteps = ['Submitted', 'Under review', 'Decision', 'Enrolled'];

  private readonly destroy$ = new Subject<void>();

  constructor(
    public admissionService: AdmissionService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const role = this.authService.getEffectiveRole();
    this.isStaff = ['admin', 'superadmin', 'director', 'headmaster', 'deputy_headmaster'].includes(role);

    this.route.paramMap
      .pipe(
        map((params) => (params.get('id') || '').trim()),
        filter((id) => !!id),
        tap(() => {
          this.loading = true;
          this.error = '';
          this.application = null;
          this.cdr.markForCheck();
        }),
        switchMap((id) =>
          this.admissionService.getApplication(id).pipe(
            catchError((err) => {
              this.error = err.error?.message || 'Application not found';
              return of(null);
            }),
            finalize(() => {
              this.loading = false;
              this.cdr.markForCheck();
            })
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((app) => {
        if (app) {
          this.application = app;
          sessionStorage.removeItem('admissionFocusApplicationId');
        }
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  docLabel(type: string): string {
    const map: Record<string, string> = {
      birth_certificate: 'Birth certificate',
      report_card: 'Report card',
      id_photo: 'ID / passport photo',
      medical_form: 'Medical form',
      other: 'Supporting document',
    };
    return map[type] || type;
  }

  statusSummary(status: string): string {
    const map: Record<string, string> = {
      pending: 'Your application is in the queue. The admissions office will review it soon.',
      under_review: 'Our team is reviewing your application and documents.',
      accepted: 'Congratulations — your application has been accepted.',
      rejected: 'This application was not approved. See the school message below if provided.',
    };
    return map[status] || '';
  }

  stepIndex(status: string): number {
    if (this.application?.enrolledStudentId || this.application?.enrolledStudent?.id) {
      return 3;
    }
    switch (status) {
      case 'pending':
        return 0;
      case 'under_review':
        return 1;
      case 'accepted':
      case 'rejected':
        return 2;
      default:
        return 0;
    }
  }

  statusProgress(status: string): number {
    const idx = this.stepIndex(status);
    const max = this.statusSteps.length - 1;
    return max > 0 ? Math.round((idx / max) * 100) : 0;
  }

  formatFileSize(bytes: number): string {
    if (!bytes || bytes < 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  downloadDoc(docId: string): void {
    if (!this.application) return;
    const token = sessionStorage.getItem('token');
    const url = this.admissionService.downloadDocumentUrl(this.application.id, docId);
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Download failed');
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'document';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {
        this.error = 'Could not download document';
        this.cdr.markForCheck();
      });
  }

  back(): void {
    const role = this.authService.getEffectiveRole();
    if (['admin', 'superadmin', 'director', 'headmaster', 'deputy_headmaster'].includes(role)) {
      this.router.navigate(['/admin/admissions']);
      return;
    }
    this.router.navigate(['/admissions/portal']);
  }

  canEnroll(): boolean {
    const app = this.application;
    return !!(
      this.isStaff &&
      app &&
      app.status === 'accepted' &&
      !app.enrolledStudentId &&
      !app.enrolledStudent?.id
    );
  }

  enroll(): void {
    if (!this.application || this.enrolling) return;
    if (!confirm('Create a student record from this application?')) return;
    this.enrolling = true;
    this.error = '';
    this.admissionService.enrollApplication(this.application.id).subscribe({
      next: (res) => {
        this.enrolling = false;
        if (res?.application) this.application = res.application;
        else if (this.application) {
          this.admissionService.getApplication(this.application.id).subscribe({
            next: (app) => {
              this.application = app;
              this.cdr.markForCheck();
            },
          });
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.enrolling = false;
        this.error = err.error?.message || 'Enrollment failed';
        this.cdr.markForCheck();
      },
    });
  }
}

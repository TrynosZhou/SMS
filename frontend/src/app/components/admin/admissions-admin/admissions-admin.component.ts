import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import {
  AdmissionApplication,
  AdmissionApplicationStatus,
  AdmissionService,
} from '../../../services/admission.service';
import { Subject, switchMap, takeUntil, catchError, of } from 'rxjs';

@Component({
  standalone: false,
  selector: 'app-admissions-admin',
  templateUrl: './admissions-admin.component.html',
  styleUrls: ['./admissions-admin.component.css'],
})
export class AdmissionsAdminComponent implements OnInit, OnDestroy {
  applications: AdmissionApplication[] = [];
  loading = true;
  error = '';
  search = '';
  statusFilter = 'all';
  selected: AdmissionApplication | null = null;
  reviewNotes = '';
  updating = false;
  enrolling = false;
  whatsAppSending = false;
  whatsAppFeedback = '';

  readonly statuses: { value: string; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'under_review', label: 'Under review' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'rejected', label: 'Rejected' },
  ];

  private readonly destroy$ = new Subject<void>();
  private readonly load$ = new Subject<void>();

  constructor(
    public admissionService: AdmissionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.load$
      .pipe(
        switchMap(() => {
          this.loading = true;
          this.error = '';
          this.cdr.markForCheck();
          return this.admissionService
            .getAdminApplications(this.search, this.statusFilter)
            .pipe(
              catchError((err) => {
                this.error = err.error?.message || 'Failed to load applications';
                return of([] as AdmissionApplication[]);
              })
            );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((list) => {
        this.applications = Array.isArray(list) ? list : [];
        this.loading = false;
        this.cdr.markForCheck();
      });

    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.load$.next();
  }

  selectForReview(app: AdmissionApplication): void {
    this.selected = app;
    this.reviewNotes = app.reviewNotes || '';
    this.whatsAppFeedback = '';
    this.cdr.markForCheck();
  }

  closeReview(): void {
    this.selected = null;
    this.whatsAppFeedback = '';
    this.cdr.markForCheck();
  }

  applicantWhatsAppPhone(app: AdmissionApplication | null): string | null {
    if (!app) return null;
    const phone = String(app.guardianPhone || app.phone || '').trim();
    return phone || null;
  }

  sendWhatsAppToApplicant(): void {
    if (!this.selected || this.whatsAppSending) return;
    const message = this.reviewNotes.trim();
    if (!message) {
      this.whatsAppFeedback = 'Enter a message before sending.';
      this.cdr.markForCheck();
      return;
    }
    const phone = this.applicantWhatsAppPhone(this.selected);
    if (!phone) {
      this.whatsAppFeedback = 'No valid guardian or applicant phone on this application.';
      this.cdr.markForCheck();
      return;
    }

    this.whatsAppSending = true;
    this.whatsAppFeedback = '';
    this.error = '';
    this.cdr.markForCheck();

    this.admissionService.sendWhatsAppToApplicant(this.selected.id, message).subscribe({
      next: (res) => {
        this.whatsAppSending = false;
        this.whatsAppFeedback = res?.message || 'WhatsApp message sent.';
        if (res?.application) {
          this.selected = res.application;
          this.reviewNotes = res.application.reviewNotes || message;
        }
        if (res?.fallbackUrl && (!res.sent || res.dryRun)) {
          window.open(res.fallbackUrl, '_blank', 'noopener,noreferrer');
        }
        this.load();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.whatsAppSending = false;
        this.whatsAppFeedback = err.error?.message || 'Failed to send WhatsApp message';
        this.cdr.markForCheck();
      },
    });
  }

  setStatus(status: AdmissionApplicationStatus): void {
    if (!this.selected) return;
    this.updating = true;
    this.cdr.markForCheck();
    this.admissionService.updateStatus(this.selected.id, status, this.reviewNotes).subscribe({
      next: (res) => {
        this.updating = false;
        if (res?.application) this.selected = res.application;
        else this.selected = null;
        this.load();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.updating = false;
        this.error = err.error?.message || 'Update failed';
        this.cdr.markForCheck();
      },
    });
  }

  canEnrollSelected(): boolean {
    const s = this.selected;
    return !!(s && s.status === 'accepted' && !s.enrolledStudentId && !s.enrolledStudent?.id);
  }

  enrollSelected(): void {
    if (!this.selected || this.enrolling) return;
    if (!confirm('Create a student record from this application?')) return;
    this.enrolling = true;
    this.error = '';
    this.cdr.markForCheck();
    this.admissionService.enrollApplication(this.selected.id).subscribe({
      next: (res) => {
        this.enrolling = false;
        if (res?.application) this.selected = res.application;
        this.load();
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

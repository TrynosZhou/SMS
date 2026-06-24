import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { AuthService } from '../../../services/auth.service';
import { ExamService } from '../../../services/exam.service';
import { ParentService } from '../../../services/parent.service';
import { SettingsService } from '../../../services/settings.service';
import { pdfReportCardViewerUrl } from '../../../utils/pdf-preview.util';
import { buildHeadmasterRemarkFromCard } from '../../../utils/headmaster-remarks.util';
import { computeCoreAverageFromReportSubjects } from '../../../utils/mark-sheet-subject-order';

@Component({
  standalone: false,
  selector: 'app-student-portal',
  templateUrl: './student-portal.component.html',
  styleUrls: [
    '../../student/student-report-card/student-report-card.component.css',
    './student-portal.component.css',
  ],
  animations: [
    trigger('fadeIn', [
      state('void', style({ opacity: 0, transform: 'translateY(12px)' })),
      transition(':enter', [animate('350ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))]),
    ]),
  ],
})
export class StudentPortalComponent implements OnInit, OnDestroy {
  students: any[] = [];
  selectedStudentId = '';
  student: any = null;
  reportCard: any = null;

  loadingStudents = false;
  loading = false;
  loadingPdf = false;
  loadingTerms = false;
  error = '';
  success = '';

  activeTerm = '';
  selectedTerm = '';
  availableTerms: string[] = [];
  selectedExamType = '';
  readonly examTypeOptions = [
    { value: 'mid_term', label: 'Mid-Term', icon: '📋' },
    { value: 'end_term', label: 'End-Term', icon: '🎓' },
  ];

  classId = '';
  className = '';
  headmasterName = '';
  schoolName = '';
  schoolLogo: string | null = null;
  safeSchoolLogoUrl: SafeUrl | null = null;
  currencySymbol = '$';

  inlinePdf: SafeResourceUrl | null = null;
  pdfBlobUrl: string | null = null;
  pdfLoadError = false;
  showPdfViewer = false;

  private readonly destroy$ = new Subject<void>();
  private readonly requestTimeoutMs = 60000;
  private pendingStudentId: string | null = null;

  constructor(
    private parentService: ParentService,
    private settingsService: SettingsService,
    private examService: ExamService,
    private authService: AuthService,
    private sanitizer: DomSanitizer,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.pendingStudentId = String(params['studentId'] || '').trim() || null;
      this.applyPendingStudentSelection();
    });
    this.loadSettings();
    this.loadStudents();
  }

  ngOnDestroy(): void {
    this.revokePdfUrl();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasMultipleStudents(): boolean {
    return this.students.length > 1;
  }

  get canGenerate(): boolean {
    return !!(this.selectedStudentId && this.selectedExamType && this.selectedTerm && this.classId);
  }

  get studentFullName(): string {
    if (!this.student) {
      return '';
    }
    return `${this.student.firstName || ''} ${this.student.lastName || ''}`.trim()
      || this.studentDisplayName(this.student);
  }

  loadStudents(): void {
    this.loadingStudents = true;
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
          this.loadingStudents = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res: any) => {
          this.students = res?.students || [];
          if (this.students.length === 1 && !this.pendingStudentId) {
            this.selectedStudentId = this.students[0].id;
            this.resolveSelectedStudent();
          } else {
            this.applyPendingStudentSelection();
          }
          this.loadTermOptions();
          this.cdr.markForCheck();
        },
      });
  }

  onStudentChange(): void {
    this.resetPreviewState();
    this.resolveSelectedStudent();
  }

  onExamTypeChange(): void {
    this.resetPreviewState();
  }

  onTermChange(): void {
    this.resetPreviewState();
  }

  viewResults(): void {
    if (!this.selectedStudentId) {
      this.error = 'Please select a student.';
      return;
    }
    if (!this.selectedTerm) {
      this.error = 'Please select an academic term.';
      return;
    }
    if (!this.selectedExamType) {
      this.error = 'Please select an exam type.';
      return;
    }
    if (!this.canGenerate) {
      this.error = 'Report card cannot be loaded. Please contact the administrator.';
      return;
    }
    this.generateAndPreview();
  }

  openPdfViewer(): void {
    if (this.inlinePdf) {
      this.showPdfViewer = true;
      this.cdr.markForCheck();
    }
  }

  closePdfViewer(): void {
    this.showPdfViewer = false;
    this.cdr.markForCheck();
  }

  downloadPDF(): void {
    if (!this.pdfBlobUrl && !this.selectedExamType) {
      this.error = 'Select term, exam type, and generate the report card first.';
      return;
    }

    if (this.pdfBlobUrl) {
      const link = document.createElement('a');
      link.href = this.pdfBlobUrl;
      link.download = this.buildFilename();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.success = 'PDF downloaded successfully.';
      setTimeout(() => (this.success = ''), 3000);
      return;
    }

    this.loading = true;
    this.examService
      .downloadAllReportCardsPDF(this.classId, this.selectedExamType, this.selectedTerm, this.student.id)
      .subscribe({
        next: (blob: Blob) => {
          this.loading = false;
          if (!blob.size) {
            this.error = 'Received an empty PDF file.';
            return;
          }
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = this.buildFilename();
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          this.success = 'PDF downloaded successfully.';
          setTimeout(() => (this.success = ''), 3000);
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.loading = false;
          this.error = err.error?.message || 'Failed to download PDF.';
          this.cdr.markForCheck();
        },
      });
  }

  getExamTypeLabel(type: string): string {
    const match = this.examTypeOptions.find((o) => o.value === type);
    return match?.label || type || 'Exam';
  }

  studentDisplayName(student: any): string {
    return `${student?.firstName || ''} ${student?.lastName || ''}`.trim()
      || student?.studentNumber
      || 'Student';
  }

  studentMeta(student: any): string {
    const cls = (student?.class || student?.classEntity)?.name || student?.className || '';
    const num = student?.studentNumber || '';
    return [cls, num].filter(Boolean).join(' · ');
  }

  linkStudents(): void {
    this.router.navigate(['/parent/link-students']);
  }

  private applyPendingStudentSelection(): void {
    if (!this.pendingStudentId || !this.students.length) {
      return;
    }
    const match = this.students.find((s) => s.id === this.pendingStudentId);
    if (match) {
      this.selectedStudentId = match.id;
      this.resolveSelectedStudent();
    }
  }

  private resolveSelectedStudent(): void {
    const match = this.students.find((s) => s.id === this.selectedStudentId);
    if (!match) {
      this.student = null;
      this.classId = '';
      this.className = '';
      return;
    }

    this.student = match;
    const studentClass = match.class || match.classEntity;
    this.classId = studentClass?.id || match.classId || '';
    this.className = studentClass?.name || match.className || '';

    if (!this.classId) {
      this.error = 'Class information not available for the selected student.';
    } else if (this.error === 'Class information not available for the selected student.') {
      this.error = '';
    }
  }

  private loadSettings(): void {
    this.settingsService.getSettings().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data: any) => {
        this.headmasterName = data.headmasterName || '';
        this.schoolName = data.schoolName || '';
        this.currencySymbol = data.currencySymbol || '$';
        this.schoolLogo = this.normalizeImageSrc(data.schoolLogo || null);
        this.safeSchoolLogoUrl = this.schoolLogo
          ? this.sanitizer.bypassSecurityTrustUrl(this.schoolLogo)
          : null;
        this.cdr.markForCheck();
      },
      error: () => {
        /* use defaults */
      },
    });
  }

  private loadTermOptions(): void {
    this.loadingTerms = true;
    const year = new Date().getFullYear();
    this.availableTerms = [
      `Term 1 ${year}`,
      `Term 2 ${year}`,
      `Term 3 ${year}`,
      `Term 1 ${year + 1}`,
      `Term 2 ${year + 1}`,
      `Term 3 ${year + 1}`,
    ];

    this.settingsService.getActiveTerm().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data: any) => {
        const active = String(data?.activeTerm || data?.currentTerm || '').trim();
        if (active) {
          this.activeTerm = active;
          this.availableTerms = [
            active,
            ...this.availableTerms.filter((t) => t !== active),
          ];
        } else if (this.availableTerms.length) {
          this.activeTerm = this.availableTerms[0];
        }
        this.loadingTerms = false;
        this.cdr.markForCheck();
      },
      error: () => {
        if (!this.activeTerm && this.availableTerms.length) {
          this.activeTerm = this.availableTerms[0];
        }
        this.loadingTerms = false;
        this.cdr.markForCheck();
      },
    });
  }

  private generateAndPreview(): void {
    if (!this.classId || !this.selectedTerm || !this.selectedExamType || !this.student?.id) {
      return;
    }

    this.loading = true;
    this.loadingPdf = false;
    this.error = '';
    this.success = '';
    this.pdfLoadError = false;
    this.inlinePdf = null;
    this.reportCard = null;
    this.revokePdfUrl();
    this.showPdfViewer = true;
    this.cdr.markForCheck();

    this.examService
      .getReportCard(this.classId, this.selectedExamType, this.selectedTerm, this.student.id)
      .subscribe({
        next: (data: any) => {
          let cards = Array.isArray(data?.reportCards) ? data.reportCards : [];
          if (!cards.length && data?.student) {
            cards = [data];
          }

          if (!cards.length) {
            this.loading = false;
            this.showPdfViewer = false;
            this.error = 'No report card found for the selected term and exam type.';
            this.cdr.markForCheck();
            return;
          }

          this.reportCard = cards[0];
          if (!this.reportCard.remarks) {
            this.reportCard.remarks = { classTeacherRemarks: null, headmasterRemarks: null };
          }
          if (Array.isArray(this.reportCard.subjects) && this.reportCard.subjects.length) {
            const avg = computeCoreAverageFromReportSubjects(this.reportCard.subjects);
            this.reportCard.overallAverage = avg.toFixed(2);
          }
          const existingHead = String(this.reportCard.remarks.headmasterRemarks || '').trim();
          if (!existingHead) {
            this.reportCard.remarks.headmasterRemarks = buildHeadmasterRemarkFromCard(
              this.reportCard,
              this.headmasterName
            );
          }

          this.loading = false;
          this.cdr.markForCheck();
          this.loadInlinePdf();
        },
        error: (err: any) => {
          this.loading = false;
          this.showPdfViewer = false;
          const msg = err.error?.message || '';
          this.reportCard = null;
          this.inlinePdf = null;
          this.revokePdfUrl();

          if (err.status === 403) {
            this.error = msg || 'Report card access is restricted.';
          } else if (err.status === 404) {
            this.error = msg || 'No report card found for the selected term and exam type.';
          } else {
            this.error = msg || 'Failed to load report card. Please try again.';
          }
          this.cdr.markForCheck();
        },
      });
  }

  private loadInlinePdf(): void {
    if (!this.classId || !this.selectedExamType || !this.selectedTerm || !this.student?.id) {
      return;
    }

    this.loadingPdf = true;
    this.pdfLoadError = false;
    this.cdr.markForCheck();

    const pdfTimeout = setTimeout(() => {
      if (this.loadingPdf) {
        this.loadingPdf = false;
        this.pdfLoadError = true;
        this.cdr.markForCheck();
      }
    }, 20000);

    this.examService
      .downloadAllReportCardsPDF(this.classId, this.selectedExamType, this.selectedTerm, this.student.id)
      .subscribe({
        next: (blob: Blob) => {
          clearTimeout(pdfTimeout);
          this.loadingPdf = false;
          if (!blob || blob.size === 0) {
            this.pdfLoadError = true;
            this.cdr.markForCheck();
            return;
          }
          this.pdfBlobUrl = window.URL.createObjectURL(blob);
          this.inlinePdf = this.sanitizer.bypassSecurityTrustResourceUrl(
            pdfReportCardViewerUrl(this.pdfBlobUrl)
          );
          this.cdr.markForCheck();
        },
        error: () => {
          clearTimeout(pdfTimeout);
          this.loadingPdf = false;
          this.pdfLoadError = true;
          this.cdr.markForCheck();
        },
      });
  }

  private resetPreviewState(): void {
    this.reportCard = null;
    this.inlinePdf = null;
    this.revokePdfUrl();
    this.pdfLoadError = false;
    this.showPdfViewer = false;
    if (this.error && !this.error.includes('linked students') && !this.error.includes('Session expired')) {
      this.error = '';
    }
    this.cdr.markForCheck();
  }

  private revokePdfUrl(): void {
    if (this.pdfBlobUrl) {
      window.URL.revokeObjectURL(this.pdfBlobUrl);
      this.pdfBlobUrl = null;
    }
  }

  private buildFilename(): string {
    const name = `${this.student?.lastName || ''} ${this.student?.firstName || ''}`.trim()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '-') || 'report-card';
    const term = (this.selectedTerm || '').replace(/\s+/g, '-');
    return `${name}-${this.selectedExamType}-${term}.pdf`;
  }

  private normalizeImageSrc(value: string | null): string | null {
    if (!value) {
      return null;
    }
    let v = String(value).trim();
    if (!v) {
      return null;
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }
    v = v.replace(/\\n/g, '').replace(/\\r/g, '').replace(/\\t/g, '').replace(/\\"/g, '"');
    if (v.startsWith('data:image')) {
      const ci = v.indexOf(',');
      if (ci > -1) {
        return `${v.slice(0, ci + 1)}${v.slice(ci + 1).replace(/\s/g, '')}`;
      }
      return v;
    }
    const looksLikeBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(v) && v.length > 64;
    if (looksLikeBase64) {
      const cleaned = v.replace(/\s/g, '');
      const head = cleaned.substring(0, 12);
      let mime = 'image/png';
      if (head.startsWith('/9j/')) mime = 'image/jpeg';
      else if (head.startsWith('iVBORw0')) mime = 'image/png';
      else if (head.startsWith('R0lGOD')) mime = 'image/gif';
      else if (head.startsWith('UklGR')) mime = 'image/webp';
      return `data:${mime};base64,${cleaned}`;
    }
    return v;
  }
}

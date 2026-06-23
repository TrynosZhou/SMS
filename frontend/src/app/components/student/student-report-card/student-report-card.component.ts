import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { pdfReportCardViewerUrl } from '../../../utils/pdf-preview.util';
import { buildHeadmasterRemarkFromCard } from '../../../utils/headmaster-remarks.util';
import { computeCoreAverageFromReportSubjects } from '../../../utils/mark-sheet-subject-order';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  standalone: false,  selector: 'app-student-report-card',
templateUrl: './student-report-card.component.html',
  styleUrls: ['./student-report-card.component.css'],
  animations: [
    trigger('fadeIn', [
      state('void', style({ opacity: 0, transform: 'translateY(12px)' })),
      transition(':enter', [animate('350ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))])
    ])
  ]
})
export class StudentReportCardComponent implements OnInit, OnDestroy {
  user: any;
  student: any;
  reportCard: any = null;

  // Loading / error states
  loading = false;
  loadingPdf = false;
  error = '';
  success = '';

  // Term & exam type
  activeTerm = '';
  selectedTerm = '';        // user-selected term (defaults to activeTerm)
  availableTerms: string[] = [];
  loadingTerms = false;
  selectedExamType = '';
  examTypes: string[] = ['mid_term', 'end_term'];
  readonly examTypeOptions = [
    { value: 'mid_term', label: 'Mid-Term', icon: '📋' },
    { value: 'end_term', label: 'End-Term', icon: '🎓' },
  ];

  // Student class (resolved automatically)
  classId = '';
  className = '';

  // School settings
  headmasterName = '';
  schoolName = '';
  schoolLogo: string | null = null;
  safeSchoolLogoUrl: SafeUrl | null = null;
  currencySymbol = '$';

  // Inline PDF preview
  inlinePdf: SafeResourceUrl | null = null;
  private pdfBlobUrl: string | null = null;
  pdfLoadError = false;
  showPdfViewer = false;

  // Grade data
  gradeThresholds: any = null;
  gradeLabels: any = null;

  constructor(
    private authService: AuthService,
    private examService: ExamService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadSettings();
    this.loadStudentData();
  }

  ngOnDestroy() {
    this.revokePdfUrl();
  }

  private revokePdfUrl() {
    if (this.pdfBlobUrl) {
      window.URL.revokeObjectURL(this.pdfBlobUrl);
      this.pdfBlobUrl = null;
    }
  }

  // ── Image helpers ────────────────────────────────────────────
  private normalizeImageSrc(value: string | null): string | null {
    if (!value) return null;
    let v = String(value).trim();
    if (!v) return null;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }
    v = v.replace(/\\n/g, '').replace(/\\r/g, '').replace(/\\t/g, '').replace(/\\"/g, '"');
    if (v.startsWith('data:image')) {
      const ci = v.indexOf(',');
      if (ci > -1) { return `${v.slice(0, ci + 1)}${v.slice(ci + 1).replace(/\s/g, '')}`; }
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

  // ── Settings ─────────────────────────────────────────────────
  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.headmasterName = data.headmasterName || '';
        this.schoolName     = data.schoolName || '';
        this.currencySymbol = data.currencySymbol || '$';
        this.schoolLogo = this.normalizeImageSrc(data.schoolLogo || null);
        this.safeSchoolLogoUrl = this.schoolLogo
          ? this.sanitizer.bypassSecurityTrustUrl(this.schoolLogo) : null;
        this.gradeThresholds = data.gradeThresholds || null;
        this.gradeLabels     = data.gradeLabels     || null;
      },
      error: () => { /* use defaults */ }
    });
  }

  // ── Term options ─────────────────────────────────────────────
  private loadTermOptions() {
    this.loadingTerms = true;
    const year = new Date().getFullYear();
    this.availableTerms = [
      `Term 1 ${year}`, `Term 2 ${year}`, `Term 3 ${year}`,
      `Term 1 ${year + 1}`, `Term 2 ${year + 1}`, `Term 3 ${year + 1}`
    ];

    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        const active = data?.activeTerm || data?.currentTerm || '';
        if (active) {
          if (!this.availableTerms.includes(active)) this.availableTerms.unshift(active);
          this.activeTerm = active;
        } else if (this.availableTerms.length) {
          this.activeTerm = this.availableTerms[0];
        }
        this.loadingTerms = false;
        this.cdr.markForCheck();
      },
      error: () => {
        if (!this.activeTerm && this.availableTerms.length) this.activeTerm = this.availableTerms[0];
        this.loadingTerms = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ── Student data ──────────────────────────────────────────────
  loadStudentData(retryCount = 0) {
    const maxRetries = 5;
    this.user = this.authService.getCurrentUser();

    if (!this.user) {
      if (retryCount < maxRetries) { setTimeout(() => this.loadStudentData(retryCount + 1), 500); return; }
      this.error = 'User information not found. Please log in again.'; return;
    }

    if (this.user.role === 'student' && !this.user.student) {
      if (retryCount < maxRetries) { setTimeout(() => this.loadStudentData(retryCount + 1), 1000); return; }
      this.error = 'Student information not found. Please log out and log in again.'; return;
    }

    if (!this.user.student) { this.error = 'Student information not found. Please log out and log in again.'; return; }

    this.student = this.user.student;
    if (!this.student.id) { this.error = 'Student ID not found. Please log in again.'; return; }

    this.classId  = this.student.classId || this.student.class?.id || this.student.classEntity?.id || '';
    this.className = this.student.class?.name || this.student.classEntity?.name || this.student.className || '';

    if (!this.classId) { this.error = 'Class information not found. Please contact the administrator.'; return; }

    this.loadTermOptions();
  }

  private resetPreviewState(): void {
    this.reportCard = null;
    this.inlinePdf = null;
    this.revokePdfUrl();
    this.error = '';
    this.pdfLoadError = false;
    this.showPdfViewer = false;
    this.cdr.markForCheck();
  }

  onExamTypeChange(): void {
    this.resetPreviewState();
  }

  getExamTypeLabel(type: string): string {
    const match = this.examTypeOptions.find(o => o.value === type);
    return match?.label || type || 'Exam';
  }

  onTermChange(): void {
    this.resetPreviewState();
  }

  viewReport(): void {
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

  // ── Core: fetch report-card data then load PDF inline ─────────
  generateAndPreview() {
    if (!this.classId || !this.selectedTerm || !this.selectedExamType || !this.student?.id) return;

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

    this.examService.getReportCard(
      this.classId,
      this.selectedExamType,
      this.selectedTerm,
      this.student.id
    ).subscribe({
      next: (data: any) => {
        let cards = Array.isArray(data?.reportCards) ? data.reportCards : [];
        if (!cards.length && data?.student) cards = [data];

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
          this.reportCard.remarks.headmasterRemarks = buildHeadmasterRemarkFromCard(this.reportCard, this.headmasterName);
        }

        // Load PDF into maximized preview
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
      }
    });
  }

  // ── Load PDF into the inline iframe (background, non-blocking) ──
  loadInlinePdf() {
    if (!this.classId || !this.selectedExamType || !this.selectedTerm || !this.student?.id) return;

    this.loadingPdf = true;
    this.pdfLoadError = false;
    this.cdr.markForCheck();

    // Safety timeout: if PDF takes more than 20 s, show error notice rather than spinning forever
    const pdfTimeout = setTimeout(() => {
      if (this.loadingPdf) {
        this.loadingPdf = false;
        this.pdfLoadError = true;
        this.cdr.markForCheck();
      }
    }, 20000);

    this.examService.downloadAllReportCardsPDF(
      this.classId,
      this.selectedExamType,
      this.selectedTerm,
      this.student.id
    ).subscribe({
      next: (blob: Blob) => {
        clearTimeout(pdfTimeout);
        this.loadingPdf = false;
        if (!blob || blob.size === 0) {
          this.pdfLoadError = true;
          this.cdr.markForCheck();
          return;
        }
        this.pdfBlobUrl = window.URL.createObjectURL(blob);
        this.inlinePdf = this.sanitizer.bypassSecurityTrustResourceUrl(pdfReportCardViewerUrl(this.pdfBlobUrl));
        this.cdr.markForCheck();
      },
      error: () => {
        clearTimeout(pdfTimeout);
        this.loadingPdf = false;
        this.pdfLoadError = true;
        this.cdr.markForCheck();
      }
    });
  }

  // ── Download ─────────────────────────────────────────────────
  previewPdf(): void {
    this.openPdfViewer();
  }

  downloadPDF() {
    if (!this.pdfBlobUrl && !this.selectedExamType) {
      this.error = 'Select an exam type and generate the report card first.';
      return;
    }

    if (this.pdfBlobUrl) {
      // Re-use the already-fetched blob
      const link = document.createElement('a');
      link.href = this.pdfBlobUrl;
      link.download = this.buildFilename();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.success = 'PDF downloaded successfully.';
      setTimeout(() => this.success = '', 3000);
      return;
    }

    // Fallback: fetch again
    this.loading = true;
    this.examService.downloadAllReportCardsPDF(
      this.classId, this.selectedExamType, this.selectedTerm, this.student.id
    ).subscribe({
      next: (blob: Blob) => {
        this.loading = false;
        if (!blob.size) { this.error = 'Received an empty PDF file.'; return; }
        const url  = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href  = url;
        link.download = this.buildFilename();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        this.success = 'PDF downloaded successfully.';
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to download PDF.';
      }
    });
  }

  private buildFilename(): string {
    const name = `${this.student?.lastName || ''} ${this.student?.firstName || ''}`.trim()
      .replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-') || 'report-card';
    const term = (this.selectedTerm || '').replace(/\s+/g, '-');
    return `${name}-${this.selectedExamType}-${term}.pdf`;
  }

  // ── Grade display helpers ─────────────────────────────────────
  get studentFullName(): string {
    if (!this.student) return '';
    return `${this.student.firstName || ''} ${this.student.lastName || ''}`.trim()
      || this.user?.fullName || '';
  }

  getMarkScoreColor(_value: number, _isNa = false): string {
    return '#2563eb';
  }

  getSubjectPercentValue(subject: any): number {
    if (subject?.grade === 'N/A') return 0;
    const max = Number(subject?.maxScore) || 0;
    if (max <= 0) return 0;
    return Math.round((Number(subject?.score) || 0) / max * 100);
  }

  get overallGradeClass(): string {
    return this.gradeLabelClass(this.reportCard?.overallGrade);
  }

  subjectGradeClass(_subject: any): string {
    return 'grade-blue';
  }

  private gradeLabelClass(_grade: string | undefined): string {
    return 'grade-blue';
  }

  getOverallAverageColor(): string {
    const avg =
      typeof this.reportCard?.overallAverage === 'number'
        ? this.reportCard.overallAverage
        : parseFloat(String(this.reportCard?.overallAverage ?? 0)) || 0;
    return this.getMarkScoreColor(avg, false);
  }

  get canGenerate(): boolean {
    return !!(this.selectedExamType && this.selectedTerm && this.classId);
  }
}

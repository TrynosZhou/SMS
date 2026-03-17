import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-student-report-card',
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
  availableTerms: string[] = [];
  loadingTerms = false;
  selectedExamType = '';
  examTypes: string[] = ['mid_term', 'end_term'];

  // Student class (resolved automatically)
  classId = '';
  className = '';

  // School settings
  headmasterName = '';
  schoolName = '';
  schoolLogo: string | null = null;
  safeSchoolLogoUrl: SafeUrl | null = null;
  currencySymbol = 'KES';

  // Inline PDF preview
  inlinePdf: SafeResourceUrl | null = null;
  private pdfBlobUrl: string | null = null;
  pdfLoadError = false;

  // Grade data
  gradeThresholds: any = null;
  gradeLabels: any = null;

  constructor(
    private authService: AuthService,
    private examService: ExamService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer
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
        this.currencySymbol = data.currencySymbol || 'KES';
        this.schoolLogo = this.normalizeImageSrc(data.schoolLogo || data.schoolLogo2 || null);
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
        this.autoGenerate();
      },
      error: () => {
        if (!this.activeTerm && this.availableTerms.length) this.activeTerm = this.availableTerms[0];
        this.loadingTerms = false;
        this.autoGenerate();
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

  // ── Auto-generate when both term + examType are ready ─────────
  private autoGenerate() {
    if (this.activeTerm && this.selectedExamType) {
      this.generateAndPreview();
    }
    // If no exam type yet, wait for user to pick one
  }

  onExamTypeChange() {
    this.reportCard = null;
    this.inlinePdf  = null;
    this.revokePdfUrl();
    this.error = '';
    if (this.activeTerm && this.selectedExamType) {
      this.generateAndPreview();
    }
  }

  onTermChange() {
    this.reportCard = null;
    this.inlinePdf  = null;
    this.revokePdfUrl();
    this.error = '';
    if (this.activeTerm && this.selectedExamType) {
      this.generateAndPreview();
    }
  }

  // ── Core: fetch report-card data then load PDF inline ─────────
  generateAndPreview() {
    if (!this.classId || !this.activeTerm || !this.selectedExamType || !this.student?.id) return;

    this.loading = true;
    this.loadingPdf = false;
    this.error = '';
    this.success = '';
    this.pdfLoadError = false;
    this.inlinePdf = null;
    this.revokePdfUrl();

    this.examService.getReportCard(
      this.classId,
      this.selectedExamType,
      this.activeTerm,
      this.student.id
    ).subscribe({
      next: (data: any) => {
        this.loading = false;
        let cards = Array.isArray(data?.reportCards) ? data.reportCards : [];
        if (!cards.length && data?.student) cards = [data];

        if (!cards.length) {
          this.error = 'No report card found for the selected term and exam type.'; return;
        }

        this.reportCard = cards[0];
        if (!this.reportCard.remarks) {
          this.reportCard.remarks = { classTeacherRemarks: null, headmasterRemarks: null };
        }
        const existingHead = this.reportCard.remarks.headmasterRemarks;
        if (!existingHead || !String(existingHead).trim().length) {
          this.reportCard.remarks.headmasterRemarks = this.generateHeadmasterRemark(this.reportCard);
        }

        // Now auto-load the PDF preview
        this.loadInlinePdf();
      },
      error: (err: any) => {
        this.loading = false;
        const msg = err.error?.message || '';
        // Clear any stale data so we never show Mid-Term when End-Term fails.
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
      }
    });
  }

  // ── Load PDF into the inline iframe ──────────────────────────
  loadInlinePdf() {
    if (!this.classId || !this.selectedExamType || !this.activeTerm || !this.student?.id) return;

    this.loadingPdf = true;
    this.pdfLoadError = false;

    this.examService.downloadAllReportCardsPDF(
      this.classId,
      this.selectedExamType,
      this.activeTerm,
      this.student.id
    ).subscribe({
      next: (blob: Blob) => {
        this.loadingPdf = false;
        if (!blob || blob.size === 0) { this.pdfLoadError = true; return; }
        this.pdfBlobUrl = window.URL.createObjectURL(blob);
        this.inlinePdf  = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfBlobUrl);
      },
      error: () => {
        this.loadingPdf = false;
        this.pdfLoadError = true;
      }
    });
  }

  // ── Download ─────────────────────────────────────────────────
  downloadPDF() {
    if (!this.pdfBlobUrl && !this.reportCard) { this.error = 'Generate the report card first.'; return; }

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
      this.classId, this.selectedExamType, this.activeTerm, this.student.id
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
    const term = (this.activeTerm || '').replace(/\s+/g, '-');
    return `${name}-${this.selectedExamType}-${term}.pdf`;
  }

  // ── Grade display helpers ─────────────────────────────────────
  get studentFullName(): string {
    if (!this.student) return '';
    return `${this.student.firstName || ''} ${this.student.lastName || ''}`.trim()
      || this.user?.fullName || '';
  }

  get overallGradeClass(): string {
    const avg = this.reportCard?.overallAverage || 0;
    if (avg >= 80) return 'grade-excellent';
    if (avg >= 70) return 'grade-very-good';
    if (avg >= 60) return 'grade-good';
    if (avg >= 50) return 'grade-satisfactory';
    if (avg >= 40) return 'grade-needs-improvement';
    return 'grade-fail';
  }

  subjectGradeClass(subject: any): string {
    const pct = subject?.percentage ?? (subject?.score && subject?.maxScore
      ? Math.round((subject.score / subject.maxScore) * 100) : 0);
    if (pct >= 80) return 'grade-excellent';
    if (pct >= 70) return 'grade-very-good';
    if (pct >= 60) return 'grade-good';
    if (pct >= 50) return 'grade-satisfactory';
    if (pct >= 40) return 'grade-needs-improvement';
    return 'grade-fail';
  }

  get canGenerate(): boolean {
    return !!(this.selectedExamType && this.activeTerm && this.classId);
  }

  generateHeadmasterRemark(card: any): string {
    if (!card) return '';
    const headName    = (this.headmasterName || '').trim();
    const studentName = card.student?.name ? String(card.student.name).trim() : '';
    const namePart    = studentName ? ` by ${studentName}` : '';
    const sig         = headName ? `. ${headName}` : '';
    const avg = typeof card.overallAverage === 'number' ? card.overallAverage
      : parseFloat(String(card.overallAverage)) || 0;

    if (avg >= 80) return `Excellent performance${namePart}. Keep up the outstanding performance${sig}`;
    if (avg >= 70) return `Very good performance${namePart}. Maintain this strong level of effort${sig}`;
    if (avg >= 60) return `Good results${namePart}. Continued hard work will yield even better outcomes${sig}`;
    if (avg >= 50) return `Satisfactory performance${namePart}. Greater consistency and focus are encouraged${sig}`;
    if (avg >= 40) return `Performance is below expected level${namePart}. Increased effort and support are needed${sig}`;
    return `The learner requires urgent and sustained support${namePart}. Close follow-up and serious commitment are essential${sig}`;
  }
}

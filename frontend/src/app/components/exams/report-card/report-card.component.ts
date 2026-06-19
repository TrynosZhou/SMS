import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { TeacherService } from '../../../services/teacher.service';
import { AuthService } from '../../../services/auth.service';
import { ParentService } from '../../../services/parent.service';
import { SettingsService } from '../../../services/settings.service';
import { ConnectivityService } from '../../../services/connectivity.service';
import { OfflineSyncService } from '../../../services/offline-sync.service';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { activatePageLoad } from '../../../utils/route-activation';
import { pdfReportCardViewerUrl } from '../../../utils/pdf-preview.util';
import { computeCoreAverageFromReportSubjects } from '../../../utils/mark-sheet-subject-order';
import { buildHeadmasterRemarkFromCard } from '../../../utils/headmaster-remarks.util';

type GradeBandFilter = 'all' | 'outstanding' | 'good' | 'needs-support';
@Component({
  standalone: false,  selector: 'app-report-card',
templateUrl: './report-card.component.html',
  styleUrls: ['./report-card.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0, transform: 'translateY(-10px)' })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ]),
    trigger('fadeInUp', [
      state('void', style({ opacity: 0, transform: 'translateY(20px)' })),
      transition(':enter', [
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class ReportCardComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  classes: any[] = [];
  selectedClass = '';
  selectedExamType = '';
  selectedTerm = '';
  reportCards: any[] = [];
  filteredReportCards: any[] = [];
  classInfo: any = null;
  examTypes = [
    { value: 'mid_term', label: 'Mid-Term' },
    { value: 'end_term', label: 'End-Term' }
  ];
  loading = false;
  loadingClasses = false;
error = '';
  success = '';
  canEditRemarks = false;
  savingRemarks = false;
  validationError: any = null; // Store detailed validation error data
  Math = Math; // Make Math available in template
  studentSearchQuery = '';
  selectedGradeBand: GradeBandFilter = 'all';
  lastLoadedAt: Date | null = null;
  aiGeneratingMap: Map<string, boolean> = new Map();
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();
  
  // Parent-specific fields
  isParent = false;
  parentStudentId: string | null = null;
  parentStudentName = '';
  parentReportMaximized = false;
  studentBalance: number | null = null;
  currencySymbol = '$';
  accessDenied = false;
  availableTerms: string[] = [];
  loadingTerms = false;
  parentStudentClassName = '';
  schoolLogoPrimary: string | null = null;
  schoolLogoSecondary: string | null = null;
  schoolName = '';
  schoolAddress = '';
  schoolMotto = '';
  schoolPhone = '';
  schoolEmail = '';
  academicYear = '';
  gradeThresholds: any = null;
  gradeLabels: any = null;
  headmasterName: string = '';
  
  // Teacher data
  teacher: any = null;
  isAdmin = false;

  /** True if current user can download report card PDFs (teachers cannot download; button is hidden for them) */
  canDownloadReportCard = true;
  
  // Auto-generation flag to prevent multiple simultaneous generations
  private autoGenerationInProgress = false;
  private autoGenerationTimeout: any = null;
  // Guard against duplicate parent balance checks (bootstrapPage fires 4+ times)
  private parentBalanceCheckInProgress = false;
  
  // Auto-save state for remarks
  savedRemarks: Set<string> = new Set(); // Track saved remarks by key: "studentId_classTeacher" or "studentId_headmaster"
  autoSaveRemarksTimeout: any = null;
  autoSavingRemarks = false;
  failedRemarksKeys: Set<string> = new Set();
  connectionBanner = '';
  customClassTeacherPhrases: string[] = [];
  newCustomPhrase = '';
  schoolWidePhrases: string[] = [];

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private teacherService: TeacherService,
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private parentService: ParentService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    public connectivity: ConnectivityService,
    private offlineSync: OfflineSyncService
) {
    // Check if user can edit remarks (teacher or admin)
    this.canEditRemarks =
      this.authService.hasRole('teacher') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('superadmin');
    this.isParent = this.authService.hasRole('parent');
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin' || user.role === 'superadmin') : false;
    // Teachers can view report cards but cannot download PDFs; hide download button for teachers
    this.canDownloadReportCard = !this.authService.hasRole('teacher');
  }

  buildBehaviorSuggestions(card: any): string[] {
    const suggestions: string[] = [
      'Demonstrates exemplary conduct and respect for peers and staff.',
      'Consistently punctual and well-prepared for lessons; shows responsibility.',
      'Shows leadership and collaborates effectively in group tasks.',
      'Polite and courteous; follows school rules diligently.',
      'Focused and attentive in class; maintains a positive attitude.',
      'Works independently with minimal supervision; takes initiative.',
      'Shows resilience and a growth mindset when facing challenges.',
      'Improving organization and time management; keep practicing routines.',
      'Needs to participate more actively and ask for help when unsure.',
      'Friendly and cooperative; contributes to a positive class environment.',
      'Occasional lapses in attention; would benefit from minimizing distractions.',
      'Needs more consistency in completing assigned responsibilities on time.',
      'Behaviour improving; continue to practice self-discipline.',
      'Respectful but can be talkative; should manage classroom chatter.',
      'Displays honesty and integrity; a good role model.'
    ];

    return suggestions.slice(0, 15);
  }

  applyClassTeacherSuggestion(reportCard: any, suggestion: string) {
    if (!this.canEditRemarks || !reportCard) return;
    this.ensureRemarksObject(reportCard);
    reportCard.remarks.classTeacherRemarks = String(suggestion || '').trim();
    this.savedRemarks.delete(this.getRemarksKey(reportCard.student.id, 'classTeacher'));
    this.failedRemarksKeys.delete(this.getRemarksKey(reportCard.student.id, 'classTeacher'));
    if (this.autoSaveRemarksTimeout) {
      clearTimeout(this.autoSaveRemarksTimeout);
      this.autoSaveRemarksTimeout = null;
    }
    this.cdr.markForCheck();
    this.autoSaveRemarks(reportCard);
  }

  private ensureRemarksObject(reportCard: any): void {
    if (!reportCard.remarks) {
      reportCard.remarks = {
        id: null,
        classTeacherRemarks: '',
        headmasterRemarks: ''
      };
    }
  }

  ngOnInit() {
    this.searchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.studentSearchQuery = q;
        this.applyFilters();
        this.cdr.markForCheck();
      });

    activatePageLoad(this.router, this.destroy$, '/report-cards', () => this.bootstrapPage());

    this.connectivity.connectionMessage$
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => {
        this.connectionBanner = msg;
        if (msg === 'Connection is restored') {
          void this.offlineSync.flushQueue().then(() => {
            this.failedRemarksKeys.clear();
            this.success = 'Offline remarks synced to server.';
            setTimeout(() => (this.success = ''), 3000);
            this.cdr.markForCheck();
          });
        }
        this.cdr.markForCheck();
      });

    this.offlineSync.onQueueChanged().pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (params['studentId'] && this.isParent) {
        this.parentStudentId = params['studentId'];
        // Only set term/examType if not already set (avoid overwriting snapshot-based values)
        if (params['term'] && !this.selectedTerm) {
          this.selectedTerm = params['term'];
        }
        if (params['examType'] && !this.selectedExamType) {
          this.selectedExamType = params['examType'];
        }
        // Guard inside checkStudentBalance() prevents duplicate concurrent calls
        this.checkStudentBalance();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.autoSaveRemarksTimeout) {
      clearTimeout(this.autoSaveRemarksTimeout);
    }
    for (const card of this.reportCards || []) {
      if (card?.student && !this.isRemarksSaved(card.student.id, 'classTeacher')) {
        this.queueRemarksOffline(card);
      }
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapPage(): void {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? user.role === 'admin' || user.role === 'superadmin' : false;
    this.isParent = this.authService.hasRole('parent');

this.loadCustomPhrases();
    this.loadSettings();
    this.loadTermOptions();

    const params = this.route.snapshot.queryParams;
    if (params['studentId'] && this.isParent) {
      this.parentStudentId = params['studentId'];
      if (params['term'] && !this.selectedTerm) {
        this.selectedTerm = params['term'];
        if (!this.availableTerms.includes(params['term'])) {
          this.availableTerms.unshift(params['term']);
        }
      }
      if (params['examType']) {
        this.selectedExamType = params['examType'];
      } else if (!this.selectedExamType) {
        this.selectedExamType = 'mid_term';
      }
      this.checkStudentBalance();
      return;
    }

    if (this.isParent) {
      this.error = 'Please open a report card from your parent dashboard.';
      return;
    }

    const isUniversalTeacher = user?.role === 'teacher' && (user as any).isUniversalTeacher;
    if (this.isAdmin || isUniversalTeacher) {
      this.loadClasses();
    } else if (user && user.role === 'teacher' && !this.isParent) {
      this.loadTeacherInfo();
    } else {
      this.loadClasses();
    }
}

  getSchoolLogoSrc(logoOverride?: string | null): SafeUrl | null {
    const normalized = this.normalizeImageSrc(logoOverride ?? null);
    if (!normalized) return null;
    return this.sanitizer.bypassSecurityTrustUrl(normalized);
  }

  /** Primary logo for the left banner column. */
  getCardPrimarySchoolLogoSrc(reportCard: any): SafeUrl | null {
    const fromCard = reportCard?.settings?.schoolLogo || null;
    return this.getSchoolLogoSrc(fromCard || this.schoolLogoPrimary);
  }

  hasCardPrimarySchoolLogo(reportCard: any): boolean {
    return !!this.getCardPrimarySchoolLogoSrc(reportCard);
  }

  /** Secondary logo for the right banner column (System Settings → Logo 2). */
  getCardSecondarySchoolLogoSrc(reportCard: any): SafeUrl | null {
    const fromCard = reportCard?.settings?.schoolLogo2 || null;
    return this.getSchoolLogoSrc(fromCard || this.schoolLogoSecondary);
  }

  hasCardSecondarySchoolLogo(reportCard: any): boolean {
    return !!this.getCardSecondarySchoolLogoSrc(reportCard);
  }

  private normalizeImageSrc(value: string | null): string | null {
    if (!value) return null;

    let v = String(value).trim();
    if (!v) return null;

    // Handle values accidentally stored as quoted strings (e.g. "data:image..." or 'data:image...')
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }

    // Unescape common sequences (in case value was serialized/escaped)
    v = v.replace(/\\n/g, '').replace(/\\r/g, '').replace(/\\t/g, '').replace(/\\"/g, '"');

    // Already a proper data URL
    if (v.startsWith('data:image')) {
      const commaIndex = v.indexOf(',');
      if (commaIndex > -1) {
        const header = v.slice(0, commaIndex + 1);
        const payload = v.slice(commaIndex + 1).replace(/\s/g, '');
        return `${header}${payload}`;
      }
      return v;
    }

    // Common base64 signatures to infer mime
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

    // Otherwise treat as URL/path and let the browser try to load it.
    return v;
  }

  private loadCustomPhrases() {
    try {
      const raw = localStorage.getItem('reportCard_customClassTeacherPhrases');
      const arr = raw ? JSON.parse(raw) : [];
      this.customClassTeacherPhrases = Array.isArray(arr) ? arr.filter(x => typeof x === 'string' && x.trim()).slice(0, 100) : [];
    } catch {
      this.customClassTeacherPhrases = [];
    }
  }

  private saveCustomPhrases() {
    try {
      const unique = Array.from(new Set(this.customClassTeacherPhrases.map(s => s.trim()).filter(Boolean)));
      localStorage.setItem('reportCard_customClassTeacherPhrases', JSON.stringify(unique));
      this.customClassTeacherPhrases = unique;
    } catch {
      // ignore storage errors
    }
  }

  addCustomSuggestion() {
    const text = (this.newCustomPhrase || '').trim();
    if (!text) return;
    if (!this.customClassTeacherPhrases.includes(text)) {
      this.customClassTeacherPhrases.unshift(text);
      this.saveCustomPhrases();
      this.refreshAllSuggestionLists();
    }
    this.newCustomPhrase = '';
  }

  removeCustomSuggestion(index: number) {
    if (index >= 0 && index < this.customClassTeacherPhrases.length) {
      this.customClassTeacherPhrases.splice(index, 1);
      this.saveCustomPhrases();
      this.refreshAllSuggestionLists();
    }
  }

  addSchoolPhrase(text?: string) {
    if (!this.canEditRemarks) return;
    const phrase = (text ?? this.newCustomPhrase ?? '').trim();
    if (!phrase) return;
    if (!this.schoolWidePhrases.includes(phrase)) {
      const updated = [phrase, ...this.schoolWidePhrases].filter(Boolean);
      // Optimistically update UI
      this.schoolWidePhrases = Array.from(new Set(updated));
      this.refreshAllSuggestionLists();
      // Persist via settings service (partial update)
      this.settingsService.updateSettings({ classTeacherPhrases: this.schoolWidePhrases }).subscribe({
        next: () => {},
        error: () => {
          // Revert on error
        }
      });
    }
    this.newCustomPhrase = '';
  }

  private getCombinedSuggestions(card: any): string[] {
    const base = this.buildBehaviorSuggestions(card);
    const merged = [...this.customClassTeacherPhrases, ...this.schoolWidePhrases, ...base];
    const seen = new Set<string>();
    const dedup: string[] = [];
    for (const s of merged) {
      const t = s.trim();
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        dedup.push(t);
      }
    }
    return dedup.slice(0, 50);
  }

  private refreshAllSuggestionLists() {
    if (!Array.isArray(this.reportCards)) return;
    for (const card of this.reportCards) {
      if (this.canEditRemarks) {
        card.classTeacherSuggestions = this.getCombinedSuggestions(card);
      }
    }
  }

  loadTeacherInfo() {
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        this.teacher = teacher;
if (teacher.id) {
          this.loadTeacherClasses(teacher.id);
        } else {
          this.classes = [];
          this.error = 'Teacher ID not found. Please contact administrator.';
        }
        this.cdr.markForCheck();
},
      error: (err: any) => {
        console.error('Error loading teacher info:', err);
        this.error = 'Failed to load teacher information. Please try again.';
        this.cdr.markForCheck();
}
    });
  }

  loadTeacherClasses(teacherId: string) {
    this.loadingClasses = true;
    this.cdr.markForCheck();
    this.teacherService
      .getTeacherClasses(teacherId)
      .pipe(
        finalize(() => {
          this.loadingClasses = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          this.classes = response.classes || [];
          setTimeout(() => this.checkAndAutoGenerate(), 300);
        },
        error: (err: any) => {
          console.error('Error loading teacher classes:', err);
          this.classes = [];
          this.error = 'Failed to load assigned classes. Please try again.';
        }
      });
}

  loadTermOptions() {
    this.loadingTerms = true;
    this.cdr.markForCheck();
const currentYear = new Date().getFullYear();
    this.availableTerms = []; // Reset terms
    const nextYear = currentYear + 1;

    this.availableTerms = [
      `Term 1 ${currentYear}`,
      `Term 2 ${currentYear}`,
      `Term 3 ${currentYear}`,
      `Term 1 ${nextYear}`,
      `Term 2 ${nextYear}`,
      `Term 3 ${nextYear}`
    ];

    this.settingsService
      .getActiveTerm()
      .pipe(
        finalize(() => {
          this.loadingTerms = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          const activeTerm = data?.activeTerm || data?.currentTerm;
          if (activeTerm) {
            if (!this.availableTerms.includes(activeTerm)) {
              this.availableTerms.unshift(activeTerm);
            }
            // Only auto-apply active term if no term was pre-selected (e.g. from query params)
            if (!this.selectedTerm) {
              this.selectedTerm = activeTerm;
            }
          } else if (!this.selectedTerm && this.availableTerms.length > 0) {
            this.selectedTerm = this.availableTerms[0];
          }
          if (this.isParent && !this.selectedExamType) {
            this.selectedExamType = 'mid_term';
          }
          if (!this.isParent) {
            this.checkAndAutoGenerate();
          }
        },
        error: (err: any) => {
          if (!this.selectedTerm && this.availableTerms.length > 0) {
            this.selectedTerm = this.availableTerms[0];
          }
          if (this.isParent && !this.selectedExamType) {
            this.selectedExamType = 'mid_term';
          }
          if (!this.isParent) {
            this.checkAndAutoGenerate();
          }
          if (err.status !== 0) {
            console.error('Error loading active term:', err);
          }
        }
      });
}

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || '$';
        this.schoolLogoPrimary = this.normalizeImageSrc(data.schoolLogo || null);
        this.schoolLogoSecondary = this.normalizeImageSrc(data.schoolLogo2 || null);
        this.schoolName = data.schoolName || '';
        this.schoolAddress = data.schoolAddress || '';
        this.schoolMotto = data.schoolMotto || '';
        this.schoolPhone = data.schoolPhone || '';
        this.schoolEmail = data.schoolEmail || '';
        this.academicYear = data.academicYear || String(new Date().getFullYear());
        try {
          const rawPrimary = data?.schoolLogo;
          const rawSecondary = data?.schoolLogo2;
          const primaryPreview = typeof rawPrimary === 'string' ? rawPrimary.trim().slice(0, 40) : String(rawPrimary);
          const secondaryPreview = typeof rawSecondary === 'string' ? rawSecondary.trim().slice(0, 40) : String(rawSecondary);
          console.log('[ReportCard] settings.schoolLogo preview:', primaryPreview);
          console.log('[ReportCard] settings.schoolLogo2 preview:', secondaryPreview);
        } catch {}
        this.headmasterName = data.headmasterName || '';
        const phrases = Array.isArray(data.classTeacherPhrases) ? data.classTeacherPhrases : [];
        this.schoolWidePhrases = phrases
          .map((s: any) => typeof s === 'string' ? s.trim() : '')
          .filter((s: string) => s.length > 0);
        this.gradeThresholds = data.gradeThresholds || {
          excellent: 90,
          veryGood: 80,
          good: 60,
          satisfactory: 40,
          needsImprovement: 20,
          basic: 1
        };
        this.gradeLabels = data.gradeLabels || {
          excellent: 'OUTSTANDING',
          veryGood: 'VERY HIGH',
          good: 'HIGH',
          satisfactory: 'GOOD',
          needsImprovement: 'ASPIRING',
          basic: 'BASIC',
          fail: 'UNCLASSIFIED'
        };
        this.refreshAllSuggestionLists();
        this.cdr.markForCheck();
},
      error: (err: any) => {
        // Use default values if settings fail to load
        this.currencySymbol = '$';
        this.headmasterName = '';
        this.schoolWidePhrases = [];
        this.gradeThresholds = {
          excellent: 90,
          veryGood: 80,
          good: 60,
          satisfactory: 40,
          needsImprovement: 20,
          basic: 1
        };
        this.gradeLabels = {
          excellent: 'OUTSTANDING',
          veryGood: 'VERY HIGH',
          good: 'HIGH',
          satisfactory: 'GOOD',
          needsImprovement: 'ASPIRING',
          basic: 'BASIC',
          fail: 'UNCLASSIFIED'
        };
        // Only log error if it's not a connection error (backend might not be running)
        if (err.status !== 0) {
          console.error('Error loading settings:', err);
        }
        this.cdr.markForCheck();
}
    });
  }

  checkStudentBalance() {
    if (!this.parentStudentId) return;

    // Prevent duplicate/concurrent calls — bootstrapPage() fires up to 4 times
    // via activatePageLoad's queueMicrotask + setTimeout(0/50/150) chain.
    if (this.parentBalanceCheckInProgress) return;
    this.parentBalanceCheckInProgress = true;

    this.loading = true;
    this.error = '';
    this.accessDenied = false;
    this.cdr.markForCheck();

    // Snapshot term/examType NOW before any async delay overwrites them
    const termForBalance = this.selectedTerm || '';
    const preselectedTerm = this.selectedTerm;
    const preselectedExamType = this.selectedExamType;

    this.parentService.getLinkedStudents(termForBalance).subscribe({
      next: (response: any) => {
        const student = (response.students || []).find((s: any) => s.id === this.parentStudentId);

        if (!student) {
          this.loading = false;
          this.parentBalanceCheckInProgress = false;
          this.error = 'Student not found or not linked to your account';
          this.accessDenied = true;
          this.cdr.markForCheck();
          return;
        }

        const termBalance = parseFloat(String(student.termBalance || 0));
        this.studentBalance = termBalance;

        if (termBalance > 0) {
          this.loading = false;
          this.parentBalanceCheckInProgress = false;
          this.accessDenied = true;
          this.error = `Report card access is restricted. Please clear the outstanding fees (tuition) balance of ${this.currencySymbol} ${termBalance.toFixed(2)} to view the report card.`;
          this.cdr.markForCheck();
          return;
        }

        // Balance cleared — resolve the student's class
        const studentClass = student.class || student.classEntity;
        if (!studentClass?.id) {
          this.loading = false;
          this.parentBalanceCheckInProgress = false;
          this.error = 'Student class information not available';
          this.cdr.markForCheck();
          return;
        }

        this.selectedClass = studentClass.id;
        this.parentStudentClassName = studentClass.name || '';
        this.parentStudentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();

        // Restore the pre-selected term/examType (loadTermOptions running concurrently
        // might have overwritten selectedTerm before we get here)
        if (preselectedTerm) this.selectedTerm = preselectedTerm;
        if (preselectedExamType) {
          this.selectedExamType = preselectedExamType;
        } else if (!this.selectedExamType) {
          this.selectedExamType = 'mid_term';
        }

        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.loading = false;
        this.parentBalanceCheckInProgress = false;
        this.error = err.error?.message || 'Failed to check student balance';
        this.accessDenied = true;
        this.cdr.markForCheck();
      }
    });
  }

  loadClasses() {
    this.loadingClasses = true;
    this.classes = [];
    this.cdr.markForCheck();
this.loadAllClasses(1, []);
  }

  loadAllClasses(page: number, accumulatedClasses: any[]) {
    this.classService.getClassesPaginated(page, 100).subscribe({
      next: (response: any) => {
        const data = response?.data || response || [];
        const allClasses = [...accumulatedClasses, ...data];
        const totalPages = response?.totalPages || 1;
        const currentPage = response?.page || page;

        if (currentPage < totalPages) {
          this.loadAllClasses(currentPage + 1, allClasses);
        } else {
          this.classes = allClasses;
          this.loadingClasses = false;
          this.cdr.markForCheck();
setTimeout(() => this.checkAndAutoGenerate(), 300);
        }
      },
      error: (err: any) => {
if (err.status === 0) {
          this.error = 'Unable to connect to server. Please ensure the backend server is running.';
        } else {
          this.error = err.error?.message || 'Failed to load classes';
          console.error('Error loading classes:', err);
        }
        if (accumulatedClasses.length > 0) {
          this.classes = accumulatedClasses;
        }
        this.loadingClasses = false;
        this.cdr.markForCheck();
}
    });
  }

  generateReportCards() {
    if (!this.selectedClass || !this.selectedExamType || !this.selectedTerm) {
      this.error = 'Please select class, term, and exam type';
      return;
    }

    // For parents, check balance again before generating
    if (this.isParent && this.parentStudentId) {
      if (this.studentBalance !== null && this.studentBalance > 0) {
        this.error = `Report card access is restricted. Please clear the outstanding fees (tuition) balance of ${this.currencySymbol} ${this.studentBalance.toFixed(2)} to view the report card.`;
        this.accessDenied = true;
        return;
      }
    }

    this.loading = true;
    this.autoGenerationInProgress = true; // Set flag to prevent duplicate calls
    this.error = '';
    this.success = '';
    this.reportCards = [];
    this.accessDenied = false;
    this.validationError = null; // Clear previous validation errors

    // Ensure all required parameters are strings
    const classIdParam = String(this.selectedClass).trim();
    const examTypeParam = String(this.selectedExamType).trim();
    const termParam = String(this.selectedTerm).trim();
    const studentIdParam = this.parentStudentId && this.parentStudentId.trim() !== ''
      ? this.parentStudentId.trim()
      : undefined;
    
    console.log('Calling getReportCard with:', {
      classId: classIdParam,
      examType: examTypeParam,
      term: termParam,
      studentId: studentIdParam,
      isTeacher: !this.isAdmin && !this.isParent
    });
    
    this.examService.getReportCard(
      classIdParam,
      examTypeParam,
      termParam,
      studentIdParam
    ).subscribe({
      next: (data: any) => {
        let cards = Array.isArray(data?.reportCards) ? data.reportCards : [];
        
        // For parents, filter to only their student
        if (this.isParent && this.parentStudentId) {
          cards = cards.filter((card: any) => String(card.student?.id) === String(this.parentStudentId));
        }

        if (this.isParent && this.parentStudentId && cards.length === 0) {
          this.reportCards = [];
          this.filteredReportCards = [];
          this.error = 'No report card found for the selected term and exam type. Results may not be published yet.';
          this.loading = false;
          this.autoGenerationInProgress = false;
          this.parentBalanceCheckInProgress = false;
          this.cdr.markForCheck();
          return;
        }
        
        this.reportCards = cards.map((card: any) => {
          if (!card.remarks) {
            card.remarks = {
              id: null,
              classTeacherRemarks: null,
              headmasterRemarks: null
            };
          }
          if (card.remarks.id) {
            if (String(card.remarks.classTeacherRemarks || '').trim()) {
              this.savedRemarks.add(this.getRemarksKey(card.student.id, 'classTeacher'));
            }
            if (String(card.remarks.headmasterRemarks || '').trim()) {
              this.savedRemarks.add(this.getRemarksKey(card.student.id, 'headmaster'));
            }
          }
          if (!Array.isArray(card.subjects)) {
            card.subjects = [];
          }
          if (!Array.isArray(card.exams)) {
            card.exams = [];
          }

          if (this.canEditRemarks) {
            card.classTeacherSuggestions = this.getCombinedSuggestions(card);
          }

          return card;
        });
        
        // Align summary with visible core marks (mark-sheet rule).
        // Class position/totalStudents come from the server for parent/student single-card views.
        for (const card of this.reportCards) {
          if (Array.isArray(card.subjects) && card.subjects.length) {
            const avg = computeCoreAverageFromReportSubjects(card.subjects);
            card.overallAverage = avg.toFixed(2);
            card.overallGrade = this.getOverallGradeFromAverage(avg);
          }
        }

        // Only recalculate rankings when viewing the full class roster (admin/teacher).
        if (!this.isParent) {
          this.applyCoreSubjectRanking(this.reportCards);
        }

        // Generate head's remarks after averages are final.
        this.applyHeadmasterRemarksToCards(this.reportCards);

        // Sort report cards by class position in ascending order
        this.reportCards.sort((a: any, b: any) => {
          const posA = a.classPosition || 0;
          const posB = b.classPosition || 0;
          return posA - posB;
        });
        
        const reportCardsArray = Array.isArray(this.reportCards) ? this.reportCards : [];
        this.filteredReportCards = [...reportCardsArray];
        this.classInfo = { name: data.class, examType: data.examType, term: data.term || this.selectedTerm };
        this.success = `Generated ${this.reportCards.length} report card(s) for ${data.class} - ${this.selectedTerm}`;
        this.lastLoadedAt = new Date();
        this.applyFilters();
        this.loading = false;
        this.autoGenerationInProgress = false;
        this.parentBalanceCheckInProgress = false;
        if (this.isParent && this.reportCards.length > 0) {
          this.parentReportMaximized = true;
          setTimeout(() => this.scrollToParentReportCard(), 100);
        }
        this.cdr.markForCheck();
},
      error: (err: any) => {
        console.error('Error generating report cards:', err);
        console.error('Error status:', err.status);
        console.error('Error URL:', err.url);
        console.error('Error message:', err.message);
        console.error('Error error:', err.error);
        
        // Clear any previously generated report cards so we never show
        // Mid-Term data when End-Term fails (or vice versa).
        this.reportCards = [];
        this.filteredReportCards = [];
        this.classInfo = null;
        if (err.status === 0) {
          this.error = 'Cannot connect to server. Please ensure the backend server is running.';
        } else if (err.status === 404) {
          this.error = err.error?.message || 'Report card endpoint not found. Please check the server configuration.';
        } else if (err.status === 400) {
          // Handle validation errors with detailed information
          const errorData = err.error;
          if (errorData?.subjectsWithoutExams || errorData?.subjectsWithMissingMarks) {
            // Store detailed validation error for display
            this.validationError = {
              message: errorData.message || 'Cannot generate report cards.',
              subjectsWithoutExams: errorData.subjectsWithoutExams || [],
              subjectsWithMissingMarks: errorData.subjectsWithMissingMarks || [],
              totalSubjects: errorData.totalSubjects,
              subjectsComplete: errorData.subjectsComplete || 0,
              subjectsWithExams: errorData.subjectsWithExams || 0
            };
            
            // Set a concise error message
            this.error = errorData.message || 'Cannot generate report cards. Please see details below.';
          } else {
            this.error = errorData?.message || 'Invalid request parameters. Please check your selections.';
            this.validationError = null;
          }
        } else if (err.status === 403) {
          this.error = err.error?.message || 'Access denied';
          this.accessDenied = true;
        } else {
          this.error = err.error?.message || 'Failed to generate report cards';
        }
        this.loading = false;
        this.autoGenerationInProgress = false;
        this.parentBalanceCheckInProgress = false;
        this.cdr.markForCheck();
}
    });
  }

  previewPDF(reportCard: any) {
    if (!reportCard?.student?.id || !this.selectedClass || !this.selectedExamType || !this.selectedTerm) {
      this.error = 'Invalid report card data or missing class/term/exam type';
      return;
    }

    this.examService.downloadAllReportCardsPDF(
      this.selectedClass,
      this.selectedExamType,
      this.selectedTerm,
      reportCard.student.id
    ).subscribe({
      next: (blob: Blob) => {
        if (!blob.size) {
          this.error = 'Received empty PDF file';
          return;
        }
        const url = window.URL.createObjectURL(blob);
        window.open(pdfReportCardViewerUrl(url), '_blank', 'noopener,noreferrer');
        setTimeout(() => window.URL.revokeObjectURL(url), 120000);
      },
      error: (err: any) => {
        this.error = err.error?.message || err.message || 'Failed to preview PDF';
        this.cdr.markForCheck();
      }
    });
  }

  downloadPDF(reportCard: any) {
    if (!reportCard || !reportCard.student || !this.selectedClass || !this.selectedExamType || !this.selectedTerm) {
      this.error = 'Invalid report card data or missing class/term/exam type';
      return;
    }

    this.loading = true;
    this.error = '';
    console.log('Downloading PDF for:', {
      classId: this.selectedClass,
      examType: this.selectedExamType,
      term: this.selectedTerm,
      studentId: reportCard.student.id
    });

    // Use the new format: classId + examType + studentId
    this.examService.downloadAllReportCardsPDF(this.selectedClass, this.selectedExamType, this.selectedTerm, reportCard.student.id).subscribe({
      next: (blob: Blob) => {
        console.log('PDF blob received, size:', blob.size);
        if (blob.size === 0) {
          this.error = 'Received empty PDF file';
          this.loading = false;
          return;
        }
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        // Use student's full name for filename (sanitize for filesystem)
        const studentName = reportCard.student.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
        link.download = `${studentName}-${this.selectedExamType}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        this.loading = false;
        this.success = 'PDF downloaded successfully';
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        console.error('PDF download error:', err);
        this.error = err.error?.message || err.message || 'Failed to download PDF';
        this.loading = false;
      }
    });
  }

  private parseNumber(v: any): number {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return isNaN(n) ? 0 : n;
  }

  private getOverallGradeFromAverage(percentage: number): string {
    const thresholds = this.gradeThresholds || {
      excellent: 90,
      veryGood: 80,
      good: 60,
      satisfactory: 40,
      needsImprovement: 20,
      basic: 1
    };
    const labels = this.gradeLabels || {
      excellent: 'OUTSTANDING',
      veryGood: 'VERY HIGH',
      good: 'HIGH',
      satisfactory: 'GOOD',
      needsImprovement: 'ASPIRING',
      basic: 'BASIC',
      fail: 'UNCLASSIFIED'
    };
    if (percentage === 0) return labels.fail || 'UNCLASSIFIED';
    if (percentage >= (thresholds.excellent ?? 90)) return labels.excellent || 'OUTSTANDING';
    if (percentage >= (thresholds.veryGood ?? 80)) return labels.veryGood || 'VERY HIGH';
    if (percentage >= (thresholds.good ?? 60)) return labels.good || 'HIGH';
    if (percentage >= (thresholds.satisfactory ?? 40)) return labels.satisfactory || 'GOOD';
    if (percentage >= (thresholds.needsImprovement ?? 20)) return labels.needsImprovement || 'ASPIRING';
    if (percentage >= (thresholds.basic ?? 1)) return labels.basic || 'BASIC';
    return labels.fail || 'UNCLASSIFIED';
  }

  private isCoreSubjectName(name: string): boolean {
    const n = (name || '').toString().toLowerCase();
    return n.includes('math') || n.includes('english') || n.includes('science');
  }

  private getCoreAverage(card: any): number {
    const subjects = Array.isArray(card?.subjects) ? card.subjects : [];
    if (subjects.length === 0) {
      return this.parseNumber(card?.overallAverage || 0);
    }
    return computeCoreAverageFromReportSubjects(subjects);
  }

  private getClassNameFromCard(card: any): string {
    return (card?.student?.class || card?.class || '').toString().trim();
  }

  /** True for ECD A / ECD B — class position is not shown on report cards or PDFs */
  isEcdAOrBClass(className: string | undefined | null): boolean {
    const raw = (className || '').toString().trim();
    return /\bECD\s*A\b/i.test(raw) || /\bECD\s*B\b/i.test(raw);
  }

  private getGradeGroupName(className: string): string {
    const raw = (className || '').toString().trim().replace(/\s+/g, ' ');
    // Special rule: ECD A and ECD B are standalone grades equal to their class
    // Do NOT combine them into a broader stream. Grade position == class position.
    if (/\bECD\s*A\b/i.test(raw) || /\bECD\s*B\b/i.test(raw)) {
      return raw;
    }
    // Common academic stream patterns e.g., "Stage 1A", "Grade 7 A", "Form 2B", "Class 3C"
    const patterns = [
      /(stage\s*\d+\s*[a-z]?)/i,
      /(grade\s*\d+\s*[a-z]?)/i,
      /(form\s*\d+\s*[a-z]?)/i,
      /(class\s*\d+\s*[a-z]?)/i,
      /(year\s*\d+\s*[a-z]?)/i,
      /(primary\s*\d+\s*[a-z]?)/i
    ];
    for (const re of patterns) {
      const m = raw.match(re);
      if (m && m[1]) {
        return m[1].trim().replace(/\s+/g, ' ');
      }
    }
    // Handle hyphen/dash separated suffixes: "Stage 1A - Diamond"
    const hyphenSplit = raw.split(/\s*[-–—]\s*/);
    if (hyphenSplit.length > 1) {
      return hyphenSplit[0].trim();
    }
    // Remove common stream descriptors at the end: Diamond, Platinum, Gold, Silver, etc.
    const descriptors = /(?:diamond|platinum|gold|silver|bronze|blue|green|red|yellow|purple|white|black|orange|pearl|ruby|sapphire|emerald|topaz)$/i;
    if (descriptors.test(raw)) {
      return raw.replace(descriptors, '').trim();
    }
    // Fallback: if last token is single-letter stream (e.g., "Grade 7 A"), drop it
    const parts = raw.split(' ');
    if (parts.length >= 2 && /^[A-Za-z]$/.test(parts[parts.length - 1])) {
      return parts.slice(0, -1).join(' ').trim();
    }
    return raw;
  }

  private rankGroupByScore(items: any[], scoreKey: string, posKey: string) {
    const sorted = items.slice().sort((a, b) => {
      const av = this.parseNumber(a[scoreKey]);
      const bv = this.parseNumber(b[scoreKey]);
      if (bv !== av) return bv - av;
      const an = (a?.student?.name || '').toString().toLowerCase();
      const bn = (b?.student?.name || '').toString().toLowerCase();
      return an.localeCompare(bn);
    });
    let position = 0;
    let lastScore: number | null = null;
    let rank = 0;
    for (const item of sorted) {
      position += 1;
      const currentScore = this.parseNumber(item[scoreKey]);
      if (lastScore === null || Math.abs(currentScore - lastScore) > 0.009) {
        rank = position;
        lastScore = currentScore;
      }
      item[posKey] = rank;
    }
  }

  private applyCoreSubjectRanking(cards: any[]) {
    const arr = Array.isArray(cards) ? cards : [];
    for (const c of arr) {
      c.coreAverage = this.getCoreAverage(c);
    }
    const byClass: Record<string, any[]> = {};
    for (const c of arr) {
      const cls = this.getClassNameFromCard(c);
      if (!byClass[cls]) byClass[cls] = [];
      byClass[cls].push(c);
    }
    Object.keys(byClass).forEach(cls => {
      const group = byClass[cls];
      this.rankGroupByScore(group, 'coreAverage', 'classPosition');
      group.forEach(g => (g.totalStudents = group.length));
    });
  }

  private enhanceGradePositionsAcrossStream(selectedClassName: string, selectedClassId: string, baseCards: any[]) {
    const streamKey = this.getGradeGroupName(selectedClassName || '');
    if (!streamKey) {
      return;
    }
    // Special rule: ECD A / ECD B -> grade == class; no cross-stream ranking
    if (/\bECD\s*A\b/i.test(selectedClassName || '') || /\bECD\s*B\b/i.test(selectedClassName || '')) {
      return;
    }
    this.classService.getClasses().subscribe({
      next: (classes: any[]) => {
        const peerClasses = (classes || []).filter(c => {
          const name = c?.name || c?.className || c?.title || '';
          return this.getGradeGroupName(name) === streamKey;
        });
        // If only the current class exists, nothing to enhance
        if (!peerClasses || peerClasses.length <= 1) {
          return;
        }
        const otherClassIds = peerClasses
          .map((c: any) => c.id)
          .filter((id: string) => !!id && String(id) !== String(selectedClassId));
        // Fetch report cards for all peer classes in parallel
        const requests = otherClassIds.map((id: string) =>
          this.examService.getReportCard(id, this.selectedExamType, this.selectedTerm).pipe(
            catchError(() => of({ reportCards: [] }))
          )
        );
        forkJoin(requests).subscribe({
          next: (responses: any[]) => {
            const extraCards: any[] = [];
            for (const res of responses) {
              const rc = Array.isArray(res?.reportCards) ? res.reportCards : [];
              extraCards.push(...rc);
            }
            if (extraCards.length === 0) {
              return;
            }
            // Deduplicate by student id within the stream to avoid double counting
            const seen = new Set<string>();
            const combined = ([] as any[]).concat(baseCards, extraCards).filter(card => {
              const sid = String(card?.student?.id || card?.studentId || '');
              if (!sid) return true; // keep if id missing (rare)
              if (seen.has(sid)) return false;
              seen.add(sid);
              return true;
            });
            this.applyCoreSubjectRanking(combined);
            // Re-sort displayed cards after updated positions
            this.reportCards.sort((a: any, b: any) => {
              const posA = a.classPosition || 0;
              const posB = b.classPosition || 0;
              return posA - posB;
            });
          },
          error: () => {
            // Best-effort: keep existing positions if peers fail to load
          }
        });
      },
      error: () => {
        // Silent fail – keep positions based on current class only
      }
    });
  }

  // Get key for tracking saved remarks
  getRemarksKey(studentId: string, remarkType: 'classTeacher' | 'headmaster'): string {
    return `${studentId}_${remarkType}`;
  }
  
  // Check if remarks are saved
  isRemarksSaved(studentId: string, remarkType: 'classTeacher' | 'headmaster'): boolean {
    return this.savedRemarks.has(this.getRemarksKey(studentId, remarkType));
  }
  
  // Auto-save remarks when changed
  onRemarksChange(reportCard: any, remarkType: 'classTeacher' | 'headmaster') {
    if (!reportCard || !reportCard.student) return;
    
    const key = this.getRemarksKey(reportCard.student.id, remarkType);
    // Mark as unsaved when user changes the remarks
    this.savedRemarks.delete(key);
    
    // Schedule auto-save
    this.scheduleAutoSaveRemarks(reportCard);
  }
  
  // Schedule auto-save with debounce
  scheduleAutoSaveRemarks(reportCard: any) {
    // Clear any pending timeout
    if (this.autoSaveRemarksTimeout) {
      clearTimeout(this.autoSaveRemarksTimeout);
    }
    
    // Schedule auto-save after 1.5 seconds of inactivity
    this.autoSaveRemarksTimeout = setTimeout(() => {
      this.autoSaveRemarks(reportCard);
    }, 1500);
  }
  
  // Auto-save remarks
  autoSaveRemarks(reportCard: any) {
    if (!this.canEditRemarks) {
      return;
    }

    if (!reportCard || !reportCard.student || !this.selectedClass || !this.selectedExamType || !this.selectedTerm) {
      return;
    }

    this.ensureRemarksObject(reportCard);
    const classTeacherRemarks = reportCard.remarks?.classTeacherRemarks || '';
    const headmasterRemarks = reportCard.remarks?.headmasterRemarks || '';
    const studentKey = this.getRemarksKey(reportCard.student.id, 'classTeacher');
    const label = `${reportCard.student.name || 'Student'} remarks`;

    if (!this.connectivity.isOnline) {
      this.offlineSync.enqueueRemarks({
        studentId: reportCard.student.id,
        classId: this.selectedClass,
        examType: this.selectedExamType,
        term: this.selectedTerm,
        classTeacherRemarks,
        headmasterRemarks,
        label
      });
      this.failedRemarksKeys.add(studentKey);
      this.error = 'Connection is lost. Remarks saved locally and will sync when connection is restored.';
      this.cdr.markForCheck();
      return;
    }

    if (this.autoSavingRemarks) {
      this.scheduleAutoSaveRemarks(reportCard);
      return;
    }

    this.autoSavingRemarks = true;

    this.examService.saveReportCardRemarks(
      reportCard.student.id,
      this.selectedClass,
      this.selectedExamType,
      this.selectedTerm,
      classTeacherRemarks,
      headmasterRemarks
    ).subscribe({
      next: (response: any) => {
        this.autoSavingRemarks = false;
        this.failedRemarksKeys.delete(studentKey);
        this.savedRemarks.add(this.getRemarksKey(reportCard.student.id, 'classTeacher'));
        this.savedRemarks.add(this.getRemarksKey(reportCard.student.id, 'headmaster'));

        if (!reportCard.remarks) {
          reportCard.remarks = {};
        }
        reportCard.remarks.id = response.remarks.id;
        reportCard.remarks.classTeacherRemarks = response.remarks.classTeacherRemarks;
        reportCard.remarks.headmasterRemarks = response.remarks.headmasterRemarks;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.autoSavingRemarks = false;

        if (err?.status === 403) {
          const msg = err?.error?.message || 'Forbidden: you are not allowed to save remarks for this report card.';
          this.error = msg;
          return;
        }

        this.savedRemarks.delete(this.getRemarksKey(reportCard.student.id, 'classTeacher'));
        this.savedRemarks.delete(this.getRemarksKey(reportCard.student.id, 'headmaster'));
        this.failedRemarksKeys.add(studentKey);
        this.queueRemarksOffline(reportCard);
        this.error =
          this.connectivity.isNetworkError(err)
            ? 'Save failed — remarks queued. Click Retry when connection is restored.'
            : err?.error?.message || 'Failed to save remarks. Click Retry.';
        this.cdr.markForCheck();
      }
    });
  }

  private queueRemarksOffline(reportCard: any): void {
    if (!reportCard?.student) return;
    this.ensureRemarksObject(reportCard);
    this.offlineSync.enqueueRemarks({
      studentId: reportCard.student.id,
      classId: this.selectedClass,
      examType: this.selectedExamType,
      term: this.selectedTerm,
      classTeacherRemarks: reportCard.remarks?.classTeacherRemarks || '',
      headmasterRemarks: reportCard.remarks?.headmasterRemarks || '',
      label: `${reportCard.student.name || 'Student'} remarks`
    });
  }

  remarksSaveFailed(reportCard: any): boolean {
    if (!reportCard?.student) return false;
    const key = this.getRemarksKey(reportCard.student.id, 'classTeacher');
    return (
      this.failedRemarksKeys.has(key) ||
      this.offlineSync.hasPendingRemarks(
        reportCard.student.id,
        this.selectedClass,
        this.selectedExamType,
        this.selectedTerm
      )
    );
  }

  retryRemarksSave(reportCard: any): void {
    if (!reportCard?.student) return;
    this.error = '';
    void this.offlineSync.flushQueue().then(() => {
      this.autoSaveRemarks(reportCard);
    });
  }
  
  // Manual save remarks (kept for explicit save button)
  saveRemarks(reportCard: any) {
    if (!reportCard || !reportCard.student || !this.selectedClass || !this.selectedExamType) {
      this.error = 'Invalid report card data';
      return;
    }

    // Clear any pending auto-save
    if (this.autoSaveRemarksTimeout) {
      clearTimeout(this.autoSaveRemarksTimeout);
    }

    this.savingRemarks = true;
    this.error = '';
    this.success = '';

    const classTeacherRemarks = reportCard.remarks?.classTeacherRemarks || '';
    const headmasterRemarks = reportCard.remarks?.headmasterRemarks || '';

    this.examService.saveReportCardRemarks(
      reportCard.student.id,
      this.selectedClass,
      this.selectedExamType,
      this.selectedTerm,
      classTeacherRemarks,
      headmasterRemarks
    ).subscribe({
      next: (response: any) => {
        this.success = 'Remarks saved successfully';
        // Mark both remarks as saved
        this.savedRemarks.add(this.getRemarksKey(reportCard.student.id, 'classTeacher'));
        this.savedRemarks.add(this.getRemarksKey(reportCard.student.id, 'headmaster'));
        
        // Update the report card with saved remarks
        if (!reportCard.remarks) {
          reportCard.remarks = {};
        }
        reportCard.remarks.id = response.remarks.id;
        reportCard.remarks.classTeacherRemarks = response.remarks.classTeacherRemarks;
        reportCard.remarks.headmasterRemarks = response.remarks.headmasterRemarks;
        this.savingRemarks = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to save remarks';
        this.savingRemarks = false;
      }
    });
  }
  
  // Handle blur event - save immediately
  onRemarksBlur(reportCard: any) {
    if (this.autoSaveRemarksTimeout) {
      clearTimeout(this.autoSaveRemarksTimeout);
    }
    // Save immediately on blur
    this.autoSaveRemarks(reportCard);
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  onSearchInput(value: string): void {
    this.searchInput$.next((value || '').trim());
  }

  clearSearch(): void {
    this.studentSearchQuery = '';
    this.searchInput$.next('');
    this.applyFilters();
  }

  onGradeBandChange(band: GradeBandFilter): void {
    this.selectedGradeBand = band;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  hasActiveFilters(): boolean {
    return !!this.studentSearchQuery.trim() || this.selectedGradeBand !== 'all';
  }

  resetListFilters(): void {
    this.selectedGradeBand = 'all';
    this.clearSearch();
  }

  get gradeBandChips(): Array<{ id: GradeBandFilter; label: string; count: number }> {
    const bands: GradeBandFilter[] = ['all', 'outstanding', 'good', 'needs-support'];
    return bands.map((id) => ({
      id,
      label: id === 'all' ? 'All' : id === 'outstanding' ? '80%+' : id === 'good' ? '60–79%' : 'Below 50%',
      count: this.countByGradeBand(id, this.reportCards)
    }));
  }

  get dashboardStats(): {
    total: number;
    showing: number;
    classAverage: number;
    topStudent: string;
    topAverage: number;
    needsSupport: number;
  } {
    const showing = this.filteredReportCards;
    let topName = '—';
    let topAvg = 0;
    for (const c of showing) {
      const avg = Number(c.overallAverage) || 0;
      if (avg >= topAvg) {
        topAvg = avg;
        topName = c.student?.name || '—';
      }
    }
    return {
      total: this.reportCards.length,
      showing: showing.length,
      classAverage: this.getOverallAverage(),
      topStudent: topName,
      topAverage: topAvg,
      needsSupport: this.reportCards.filter((c) => (Number(c.overallAverage) || 0) < 50).length
    };
  }

  get filterSummary(): string {
    const parts: string[] = [];
    if (this.classInfo?.name) parts.push(this.classInfo.name);
    if (this.selectedTerm) parts.push(this.selectedTerm);
    if (this.selectedExamType) {
      const label = this.examTypes.find((t) => t.value === this.selectedExamType)?.label || this.selectedExamType;
      parts.push(label);
    }
    if (this.selectedGradeBand !== 'all') {
      parts.push(`Band: ${this.gradeBandChips.find((c) => c.id === this.selectedGradeBand)?.label}`);
    }
    if (this.studentSearchQuery) parts.push(`Search: "${this.studentSearchQuery}"`);
    parts.push(`${this.filteredReportCards.length} of ${this.reportCards.length} students`);
    return parts.join(' · ');
  }

  private countByGradeBand(band: GradeBandFilter, cards: any[]): number {
    if (band === 'all') return cards.length;
    return cards.filter((c) => this.matchesGradeBand(c, band)).length;
  }

  private matchesGradeBand(card: any, band: GradeBandFilter): boolean {
    const avg = Number(card?.overallAverage) || 0;
    if (band === 'outstanding') return avg >= 80;
    if (band === 'good') return avg >= 60 && avg < 80;
    if (band === 'needs-support') return avg < 50;
    return true;
  }

  applyFilters(): void {
    const query = this.studentSearchQuery.toLowerCase().trim();
    let list = [...this.reportCards];
    if (this.selectedGradeBand !== 'all') {
      list = list.filter((c) => this.matchesGradeBand(c, this.selectedGradeBand));
    }
    if (query) {
      list = list.filter((card) => {
        const studentName = (card.student?.name || '').toLowerCase();
        const studentNumber = (card.student?.studentNumber || '').toLowerCase();
        return studentName.includes(query) || studentNumber.includes(query);
      });
    }
    list.sort((a, b) => {
      const posA = Number(a.classPosition) || 9999;
      const posB = Number(b.classPosition) || 9999;
      return posA - posB;
    });
    this.filteredReportCards = list;
  }

  filterReportCards(): void {
    this.applyFilters();
  }

  trackByCard(_index: number, card: any): string {
    return String(card?.student?.id || _index);
  }

  exportSummaryCsv(): void {
    const items = this.filteredReportCards;
    if (!items.length) {
      this.success = 'Nothing to export';
      setTimeout(() => {
        if (this.success === 'Nothing to export') this.success = '';
        this.cdr.markForCheck();
      }, 3000);
      return;
    }
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Position', 'Student', 'Student #', 'Class', 'Average %', 'Grade'];
    const lines = [header.join(',')];
    for (const c of items) {
      lines.push(
        [
          esc(c.classPosition ?? ''),
          esc(c.student?.name),
          esc(c.student?.studentNumber),
          esc(c.student?.class),
          esc((Number(c.overallAverage) || 0).toFixed(1)),
          esc(c.overallGrade)
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = (this.classInfo?.name || 'class').replace(/\s+/g, '_');
    a.download = `Report_Cards_Summary_${safe}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.success = `Exported ${items.length} student summary row(s)`;
    this.cdr.markForCheck();
  }

  printSummary(): void {
    if (!this.filteredReportCards.length) return;
    const rows = this.filteredReportCards
      .map(
        (c) => `
      <tr>
        <td>${c.classPosition ?? '—'}</td>
        <td>${this.escapeHtml(c.student?.name || '')}</td>
        <td>${this.escapeHtml(c.student?.studentNumber || '')}</td>
        <td>${(Number(c.overallAverage) || 0).toFixed(1)}%</td>
        <td>${this.escapeHtml(c.overallGrade || '')}</td>
      </tr>`
      )
      .join('');
    const stats = this.dashboardStats;
    const html = `
      <!DOCTYPE html><html><head><title>Report Cards Summary</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; }
        h1 { font-size: 1.2rem; }
        p.meta { color: #64748b; font-size: 0.85rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.85rem; }
        th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
        th { background: #f8fafc; }
      </style></head><body>
      <h1>Report Cards Summary</h1>
      <p class="meta">${this.escapeHtml(this.filterSummary)} · Class avg ${stats.classAverage.toFixed(1)}% · Printed ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>Pos</th><th>Student</th><th>ID</th><th>Average</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  private escapeHtml(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Statistics
  getOverallAverage(): number {
    if (this.filteredReportCards.length === 0) return 0;
    const sum = this.filteredReportCards.reduce((acc, card) => acc + (card.overallAverage || 0), 0);
    return sum / this.filteredReportCards.length;
  }

  private applyHeadmasterRemarksToCards(cards: any[]): void {
    for (const card of cards) {
      if (!card) continue;
      const autoHeadRemark = this.generateHeadmasterRemark(card);
      card.headmasterAutoRemarks = autoHeadRemark;

      const existing = String(card.remarks?.headmasterRemarks || '').trim();
      const headSaved = this.isRemarksSaved(card.student?.id, 'headmaster');

      if (!autoHeadRemark) continue;

      if (this.isAdmin && !headSaved) {
        if (!card.remarks) {
          card.remarks = { classTeacherRemarks: null, headmasterRemarks: null };
        }
        card.remarks.headmasterRemarks = autoHeadRemark;
        this.onRemarksChange(card, 'headmaster');
      } else if (!existing) {
        if (!card.remarks) {
          card.remarks = { classTeacherRemarks: null, headmasterRemarks: null };
        }
        card.remarks.headmasterRemarks = autoHeadRemark;
      }
    }
  }

  generateHeadmasterRemark(card: any): string {
    return buildHeadmasterRemarkFromCard(card, this.headmasterName);
  }

  generateAIRemark(reportCard: any, remarkType: 'classTeacher' | 'headmaster') {
    if (!reportCard || !reportCard.student) return;
    
    const key = reportCard.student.id + '_' + remarkType;
    this.aiGeneratingMap.set(key, true);
    
    // Simulate AI processing delay
    setTimeout(() => {
      let remark = '';
      const studentName = reportCard.student.name || 'the student';
      const avg = parseFloat(reportCard.overallAverage || '0');
      
      if (remarkType === 'classTeacher') {
        const behaviorOnlyRemarks = [
          `${studentName} demonstrates good conduct, respect for others, and a positive attitude in class. Continued consistency in discipline and responsibility is encouraged.`,
          `${studentName} is generally polite and cooperative with peers and teachers. Improving attentiveness and active participation will further strengthen character growth.`,
          `${studentName} shows responsibility and responds well to guidance. Consistent self-discipline and time management should remain a priority.`,
          `${studentName} contributes positively to the classroom environment and relates well with others. Keep building confidence, leadership, and good behaviour habits.`,
          `${studentName} displays respectful behaviour and willingness to learn. Continued focus on punctuality, organization, and classroom conduct is recommended.`
        ];
        const randomIndex = Math.floor(Math.random() * behaviorOnlyRemarks.length);
        remark = behaviorOnlyRemarks[randomIndex];
      } else {
        // Headmaster AI remark is strictly marks/performance-based,
        // and automatically addresses failed subjects (<50%) where present.
        remark = this.generateHeadmasterRemark(reportCard);
        if (!remark) {
          if (avg >= 80) remark = `Excellent performance by ${studentName}. Maintain this high standard.`;
          else if (avg >= 70) remark = `Very good performance by ${studentName}. Keep working consistently.`;
          else if (avg >= 60) remark = `${studentName} is making good progress. Continue applying effort for stronger outcomes.`;
          else if (avg >= 50) remark = `${studentName}'s performance is satisfactory. More effort is needed to improve overall results.`;
          else remark = `${studentName}'s results are below expectation and require urgent academic support.`;
        }
      }
      
      if (!reportCard.remarks) {
        reportCard.remarks = {};
      }
      
      if (remarkType === 'classTeacher') {
        reportCard.remarks.classTeacherRemarks = remark;
      } else {
        reportCard.remarks.headmasterRemarks = remark;
      }
      
      this.onRemarksChange(reportCard, remarkType);
      this.aiGeneratingMap.set(key, false);
      this.success = `AI ${remarkType === 'classTeacher' ? 'teacher' : 'headmaster'} remark generated!`;
      setTimeout(() => this.success = '', 3000);
    }, 1200);
  }

  // Validation
  isSelectionValid(): boolean {
    return !!(this.selectedClass && this.selectedExamType && this.selectedTerm);
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.touchedFields.has(fieldName) && !!this.fieldErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    return this.fieldErrors[fieldName] || '';
  }

  onSelectionChange() {
    this.fieldErrors = {};
    this.touchedFields.clear();
    if (this.isParent) {
      this.reportCards = [];
      this.filteredReportCards = [];
      this.parentReportMaximized = false;
      this.success = '';
      return;
    }
    this.checkAndAutoGenerate();
  }
  
  checkAndAutoGenerate() {
    if (this.isParent) {
      return;
    }
    // Clear any pending timeout
    if (this.autoGenerationTimeout) {
      clearTimeout(this.autoGenerationTimeout);
      this.autoGenerationTimeout = null;
    }

    if (this.loading || this.autoGenerationInProgress || !this.isSelectionValid()) {
      return;
    }

    // For parents/students with pre-selected params, skip the loadingTerms guard
    // (the term was already chosen in the picker; we don't need loadTermOptions to finish)
    const skipTermsGuard = this.isParent && !!this.parentStudentId && !!this.selectedTerm && !!this.selectedExamType;
    if (!skipTermsGuard && this.loadingTerms) {
      return;
    }

    this.autoGenerationTimeout = setTimeout(() => {
      if (this.isSelectionValid() && !this.loading && !this.autoGenerationInProgress) {
        this.autoGenerationInProgress = true;
        this.generateReportCards();
      }
    }, 300);
  }

  resetSelection() {
    // Clear any pending auto-generation
    if (this.autoGenerationTimeout) {
      clearTimeout(this.autoGenerationTimeout);
      this.autoGenerationTimeout = null;
    }
    // Clear any pending auto-save
    if (this.autoSaveRemarksTimeout) {
      clearTimeout(this.autoSaveRemarksTimeout);
    }
    this.autoGenerationInProgress = false;
    this.savedRemarks.clear();
    
    if (!this.isParent) {
      this.selectedClass = '';
    }
    this.selectedExamType = this.isParent ? 'mid_term' : '';
    this.selectedTerm = this.availableTerms.length > 0 ? this.availableTerms[0] : '';
    this.reportCards = [];
    this.filteredReportCards = [];
    this.classInfo = null;
    this.studentSearchQuery = '';
    this.selectedGradeBand = 'all';
    this.lastLoadedAt = null;
    this.parentReportMaximized = false;
    if (!this.isParent) {
      this.onSelectionChange();
    }
  }

  scrollToParentReportCard() {
    const el = document.querySelector('.report-card-preview');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Download all PDFs
  downloadAllPDFs() {
    if (this.filteredReportCards.length === 0) {
      this.error = 'No report cards to download';
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Download each PDF sequentially to avoid browser blocking
    let downloadCount = 0;
    const downloadNext = () => {
      if (downloadCount >= this.filteredReportCards.length) {
        this.loading = false;
        this.success = `Successfully downloaded ${downloadCount} PDF(s)`;
        setTimeout(() => this.success = '', 5000);
        return;
      }

      const reportCard = this.filteredReportCards[downloadCount];
      this.examService.downloadAllReportCardsPDF(this.selectedClass, this.selectedExamType, this.selectedTerm, reportCard.student.id).subscribe({
        next: (blob: Blob) => {
          if (blob.size > 0) {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const studentName = reportCard.student.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
            link.download = `${studentName}-${this.selectedExamType}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
          }
          downloadCount++;
          // Wait a bit before downloading next to avoid browser blocking
          setTimeout(downloadNext, 500);
        },
        error: (err: any) => {
          console.error(`Error downloading PDF for ${reportCard.student.name}:`, err);
          downloadCount++;
          setTimeout(downloadNext, 500);
        }
      });
    };

    downloadNext();
  }

  getSchoolInitials(name?: string): string {
    const n = (name || this.schoolName || 'School').trim();
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return (n.slice(0, 3) || 'SCH').toUpperCase();
  }

  getCardAcademicYear(reportCard?: any): string {
    return reportCard?.settings?.academicYear || this.academicYear || String(new Date().getFullYear());
  }

  getReportCardPillLabel(reportCard: any): string {
    const type = reportCard?.examType || this.selectedExamType || '';
    return `Report Card — ${this.formatExamTypeLabel(type)}`;
  }

  formatExamTypeLabel(examType: string): string {
    if (examType === 'mid_term') return 'Mid Term';
    if (examType === 'end_term') return 'End of Term';
    if (!examType) return 'Exam';
    return examType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  getExamDisplayName(reportCard: any): string {
    if (reportCard?.exams?.length) {
      const names = Array.from(new Set(reportCard.exams.map((e: any) => e.name)));
      return names.join(', ');
    }
    return this.formatExamTypeLabel(reportCard?.examType || this.selectedExamType);
  }

  getPositionDisplay(reportCard: any): string {
    if (this.isEcdAOrBClass(reportCard?.student?.class)) {
      return '—';
    }
    const pos = reportCard?.classPosition || 0;
    const total = reportCard?.totalStudents || 0;
    return total > 0 ? `${pos} / ${total}` : String(pos || '—');
  }

  getAttendanceDisplay(reportCard: any): string {
    if (reportCard?.totalAttendance == null) {
      return '—';
    }
    let text = `${reportCard.totalAttendance} day${reportCard.totalAttendance !== 1 ? 's' : ''}`;
    if (reportCard.presentAttendance != null) {
      text += ` (${reportCard.presentAttendance} present)`;
    }
    return text;
  }

  getSchoolMetaLine(): string {
    const parts = [this.schoolAddress, this.schoolPhone ? `Tel: ${this.schoolPhone}` : ''].filter(Boolean);
    return parts.join('  •  ');
  }

  /** Grade pill: blue bold only */
  getGradePillClass(_grade: string | undefined): string {
    return 'rc-grade-pill rc-grade-pill--blue';
  }

  getSubjectGradeLabel(subject: any): string {
    if (subject?.grade === 'N/A') {
      return 'N/A';
    }
    const existing = String(subject?.grade || '').trim();
    if (existing) {
      return existing;
    }
    return this.getOverallGradeFromAverage(this.getSubjectPercentValue(subject));
  }

  getSubjectPercentScore(subject: any): string {
    if (subject?.grade === 'N/A') {
      return 'N/A';
    }
    const max = Number(subject?.maxScore) || 0;
    if (max <= 0) {
      return 'N/A';
    }
    const pct = Math.round((Number(subject?.score) || 0) / max * 100);
    return `${pct}%`;
  }

  getSubjectPercentValue(subject: any): number {
    if (subject?.grade === 'N/A') {
      return 0;
    }
    const max = Number(subject?.maxScore) || 0;
    if (max <= 0) {
      return 0;
    }
    return Math.round((Number(subject?.score) || 0) / max * 100);
  }

  /** Mark and % score: blue only */
  getMarkScoreColor(_value: number, _isNa = false): string {
    return '#2563eb';
  }

  getOverallAverageColor(_reportCard: any): string {
    return '#2563eb';
  }
}


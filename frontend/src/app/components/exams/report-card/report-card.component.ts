import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { TeacherService } from '../../../services/teacher.service';
import { AuthService } from '../../../services/auth.service';
import { ParentService } from '../../../services/parent.service';
import { SettingsService } from '../../../services/settings.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-report-card',
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
export class ReportCardComponent implements OnInit {
  classes: any[] = [];
  selectedClass = '';
  selectedExamType = '';
  selectedTerm = '';
  reportCards: any[] = [];
  filteredReportCards: any[] = [];
  classInfo: any = null;
  examTypes = [
    { value: 'mid_term', label: 'mid_term' },
    { value: 'end_erm', label: 'end_term' }
  ];
  loading = false;
  error = '';
  success = '';
  canEditRemarks = false;
  savingRemarks = false;
  validationError: any = null; // Store detailed validation error data
  Math = Math; // Make Math available in template
  studentSearchQuery = '';
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();
  
  // Parent-specific fields
  isParent = false;
  parentStudentId: string | null = null;
  studentBalance: number | null = null;
  currencySymbol = '$';
  accessDenied = false;
  availableTerms: string[] = [];
  loadingTerms = false;
  parentStudentClassName = '';
  schoolLogo: string | null = null;
  schoolLogo2: string | null = null;
  gradeThresholds: any = null;
  gradeLabels: any = null;
  headmasterName: string = '';
  
  // Teacher data
  teacher: any = null;
  isAdmin = false;
  
  // Auto-generation flag to prevent multiple simultaneous generations
  private autoGenerationInProgress = false;
  private autoGenerationTimeout: any = null;
  
  // Auto-save state for remarks
  savedRemarks: Set<string> = new Set(); // Track saved remarks by key: "studentId_classTeacher" or "studentId_headmaster"
  autoSaveRemarksTimeout: any = null;
  autoSavingRemarks = false;

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private teacherService: TeacherService,
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private parentService: ParentService,
    private settingsService: SettingsService
  ) {
    // Check if user can edit remarks (teacher or admin)
    this.canEditRemarks = this.authService.hasRole('teacher') || this.authService.hasRole('admin');
    this.isParent = this.authService.hasRole('parent');
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin' || user.role === 'superadmin') : false;
  }

  ngOnInit() {
    this.loadSettings();
    this.loadTermOptions();
    
    // Check if parent is accessing via studentId query param
    this.route.queryParams.subscribe(params => {
      if (params['studentId'] && this.isParent) {
        this.parentStudentId = params['studentId'];
        this.checkStudentBalance();
      } else {
        const user = this.authService.getCurrentUser();
        const isUniversalTeacher = user?.role === 'teacher' && (user as any).isUniversalTeacher;
        // Universal teacher or Admin/SuperAdmin: load all classes
        if (this.isAdmin || isUniversalTeacher) {
          this.loadClasses();
        } else if (user && user.role === 'teacher' && !this.isParent) {
          this.loadTeacherInfo();
        } else {
          this.loadClasses();
        }
      }
    });
  }

  loadTeacherInfo() {
    // Load teacher profile to get teacher ID and subjects
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        this.teacher = teacher;
        // Load classes assigned to this teacher
        if (teacher.id) {
          this.loadTeacherClasses(teacher.id);
        } else {
          this.classes = [];
          this.error = 'Teacher ID not found. Please contact administrator.';
        }
      },
      error: (err: any) => {
        console.error('Error loading teacher info:', err);
        this.error = 'Failed to load teacher information. Please try again.';
      }
    });
  }

  loadTeacherClasses(teacherId: string) {
    this.teacherService.getTeacherClasses(teacherId).subscribe({
      next: (response: any) => {
        this.classes = response.classes || [];
        console.log('Loaded teacher classes:', this.classes.length);
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

    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        const activeTerm = data?.activeTerm || data?.currentTerm;
        if (activeTerm) {
          if (!this.availableTerms.includes(activeTerm)) {
            this.availableTerms.unshift(activeTerm);
          }
          // Auto-select the active term
          this.selectedTerm = activeTerm;
        } else if (!this.selectedTerm && this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
        this.loadingTerms = false;
        // Check if we can auto-generate after term is loaded
        this.checkAndAutoGenerate();
      },
      error: (err: any) => {
        // Use default terms if active term fails to load
        if (!this.selectedTerm && this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
        this.loadingTerms = false;
        // Check if we can auto-generate after term is loaded
        this.checkAndAutoGenerate();
        // Only log error if it's not a connection error (backend might not be running)
        if (err.status !== 0) {
          console.error('Error loading active term:', err);
        }
      }
    });
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.currencySymbol = data.currencySymbol || 'KES';
        this.schoolLogo = data.schoolLogo || null;
        this.schoolLogo2 = data.schoolLogo2 || null;
        this.headmasterName = data.headmasterName || '';
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
      },
      error: (err: any) => {
        // Use default values if settings fail to load
        this.currencySymbol = 'KES';
        this.headmasterName = '';
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
      }
    });
  }

  checkStudentBalance() {
    if (!this.parentStudentId) return;

    this.loading = true;
    this.error = '';
    
    // Get parent's students to find balance
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        const student = (response.students || []).find((s: any) => s.id === this.parentStudentId);
        
        if (!student) {
          this.loading = false;
          this.error = 'Student not found or not linked to your account';
          this.accessDenied = true;
          return;
        }

        const termBalance = parseFloat(String(student.termBalance || 0));
        this.studentBalance = termBalance;

        // Check if term balance allows access (term balance must be zero)
        if (termBalance > 0) {
          this.loading = false;
          this.accessDenied = true;
          this.error = `Report card access is restricted. Please clear the outstanding term balance of ${this.currencySymbol} ${termBalance.toFixed(2)} to view the report card.`;
          return;
        }

        // Balance is OK, load student's class and generate report card
        // Check both 'class' and 'classEntity' properties (backend may use either)
        const studentClass = student.class || student.classEntity;
        if (studentClass?.id) {
          this.selectedClass = studentClass.id;
          this.parentStudentClassName = studentClass.name || '';
          // Load available exam types and let parent select
          this.loadClasses();
          // Check if we can auto-generate after class is set (for parents)
          setTimeout(() => this.checkAndAutoGenerate(), 500);
        } else {
          this.error = 'Student class information not available';
          this.loading = false;
        }
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to check student balance';
        this.accessDenied = true;
      }
    });
  }

  loadClasses() {
    this.loading = true;
    this.classes = [];
    
    // Fetch all classes by making paginated requests
    this.loadAllClasses(1, []);
  }

  loadAllClasses(page: number, accumulatedClasses: any[]) {
    this.classService.getClassesPaginated(page, 100).subscribe({
      next: (response: any) => {
        const data = response?.data || response || [];
        const allClasses = [...accumulatedClasses, ...data];
        
        // Check if there are more pages to fetch
        const totalPages = response?.totalPages || 1;
        const currentPage = response?.page || page;
        
        if (currentPage < totalPages) {
          // Fetch next page
          this.loadAllClasses(currentPage + 1, allClasses);
        } else {
          // All classes loaded
          this.classes = allClasses;
          this.loading = false;
          console.log(`Loaded ${this.classes.length} classes for report cards`);
          // Check if we can auto-generate after classes are loaded
          setTimeout(() => this.checkAndAutoGenerate(), 300);
        }
      },
      error: (err: any) => {
        this.loading = false;
        // Only show error message if it's not a connection error
        if (err.status === 0) {
          this.error = 'Unable to connect to server. Please ensure the backend server is running.';
        } else {
          this.error = err.error?.message || 'Failed to load classes';
          console.error('Error loading classes:', err);
        }
        // Use accumulated classes if we got some before the error
        if (accumulatedClasses.length > 0) {
          this.classes = accumulatedClasses;
          console.warn(`Loaded partial class list (${accumulatedClasses.length} classes) due to error`);
        }
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
        this.error = `Report card access is restricted. Please clear the outstanding term balance of ${this.currencySymbol} ${this.studentBalance.toFixed(2)} to view the report card.`;
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
          cards = cards.filter((card: any) => card.student?.id === this.parentStudentId);
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
            this.savedRemarks.add(this.getRemarksKey(card.student.id, 'classTeacher'));
            this.savedRemarks.add(this.getRemarksKey(card.student.id, 'headmaster'));
          }
          if (!Array.isArray(card.subjects)) {
            card.subjects = [];
          }
          if (!Array.isArray(card.exams)) {
            card.exams = [];
          }

          const autoHeadRemark = this.generateHeadmasterRemark(card);
          card.headmasterAutoRemarks = autoHeadRemark;

          const existingHeadRemark = card.remarks.headmasterRemarks;
          const hasExistingHeadRemark = !!(existingHeadRemark && String(existingHeadRemark).trim().length > 0);

          if (!hasExistingHeadRemark && this.isAdmin && autoHeadRemark) {
            card.remarks.headmasterRemarks = autoHeadRemark;
            this.onRemarksChange(card, 'headmaster');
          }

          return card;
        });
        const reportCardsArray = Array.isArray(this.reportCards) ? this.reportCards : [];
        this.filteredReportCards = [...reportCardsArray];
        this.classInfo = { name: data.class, examType: data.examType, term: data.term || this.selectedTerm };
        this.success = `Generated ${this.reportCards.length} report card(s) for ${data.class} - ${this.selectedTerm}`;
        this.loading = false;
        this.autoGenerationInProgress = false; // Reset flag after successful generation
      },
      error: (err: any) => {
        console.error('Error generating report cards:', err);
        console.error('Error status:', err.status);
        console.error('Error URL:', err.url);
        console.error('Error message:', err.message);
        console.error('Error error:', err.error);
        
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
        this.autoGenerationInProgress = false; // Reset flag after error
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
    if (!reportCard || !reportCard.student || !this.selectedClass || !this.selectedExamType) {
      return;
    }
    
    if (this.autoSavingRemarks) {
      // If already saving, reschedule
      this.scheduleAutoSaveRemarks(reportCard);
      return;
    }
    
    this.autoSavingRemarks = true;
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
        this.autoSavingRemarks = false;
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
        
        console.log(`✓ Auto-saved remarks for ${reportCard.student.name}`);
      },
      error: (err: any) => {
        this.autoSavingRemarks = false;
        // Remove from saved records if save failed
        this.savedRemarks.delete(this.getRemarksKey(reportCard.student.id, 'classTeacher'));
        this.savedRemarks.delete(this.getRemarksKey(reportCard.student.id, 'headmaster'));
        console.error('Auto-save remarks failed:', err);
      }
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

  // Search and filtering
  filterReportCards() {
    if (!this.studentSearchQuery.trim()) {
      this.filteredReportCards = [...this.reportCards];
      return;
    }
    const query = this.studentSearchQuery.toLowerCase().trim();
    this.filteredReportCards = this.reportCards.filter(card => {
      const studentName = (card.student?.name || '').toLowerCase();
      const studentNumber = (card.student?.studentNumber || '').toLowerCase();
      return studentName.includes(query) || studentNumber.includes(query);
    });
  }

  // Statistics
  getOverallAverage(): number {
    if (this.filteredReportCards.length === 0) return 0;
    const sum = this.filteredReportCards.reduce((acc, card) => acc + (card.overallAverage || 0), 0);
    return sum / this.filteredReportCards.length;
  }

  generateHeadmasterRemark(card: any): string {
    if (!card) {
      return '';
    }
    const headName = (this.headmasterName || '').trim();
    const studentName = card.student && card.student.name
      ? String(card.student.name).trim()
      : '';
    const namePart = studentName ? ` by ${studentName}` : '';
    const signature = headName ? `. ${headName}` : '';
    const rawAverage = card.overallAverage;
    let average = 0;
    if (typeof rawAverage === 'number') {
      average = rawAverage;
    } else if (typeof rawAverage === 'string') {
      const parsed = parseFloat(rawAverage);
      average = isNaN(parsed) ? 0 : parsed;
    }
    if (average >= 80) {
      return `Excellent performance${namePart}. Keep up the outstanding performance${signature}`;
    }
    if (average >= 70) {
      return `Very good performance${namePart}. Maintain this strong level of effort${signature}`;
    }
    if (average >= 60) {
      return `Good results${namePart}. Continued hard work will yield even better outcomes${signature}`;
    }
    if (average >= 50) {
      return `Satisfactory performance${namePart}. Greater consistency and focus are encouraged${signature}`;
    }
    if (average >= 40) {
      return `Performance is below expected level${namePart}. Increased effort and support at home and school are needed${signature}`;
    }
    return `The learner requires urgent and sustained support${namePart}. Close follow-up and serious commitment are essential for improvement${signature}`;
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
    // Check if we can auto-generate report cards
    this.checkAndAutoGenerate();
  }
  
  checkAndAutoGenerate() {
    // Clear any pending timeout
    if (this.autoGenerationTimeout) {
      clearTimeout(this.autoGenerationTimeout);
      this.autoGenerationTimeout = null;
    }
    
    // Don't auto-generate if:
    // - Already generating
    // - Auto-generation is in progress
    // - Still loading terms
    // - Selection is not valid
    if (this.loading || this.autoGenerationInProgress || this.loadingTerms || !this.isSelectionValid()) {
      return;
    }
    
    // Small delay to prevent multiple triggers within the same change event cycle
    this.autoGenerationTimeout = setTimeout(() => {
      if (this.isSelectionValid() && !this.loading && !this.autoGenerationInProgress && !this.loadingTerms) {
        console.log('All criteria selected - auto-generating report cards...');
        this.autoGenerationInProgress = true;
        this.generateReportCards();
        // Reset flag after generation completes (handled in generateReportCards)
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
    this.selectedExamType = '';
    this.selectedTerm = this.availableTerms.length > 0 ? this.availableTerms[0] : '';
    this.reportCards = [];
    this.filteredReportCards = [];
    this.classInfo = null;
    this.studentSearchQuery = '';
    this.onSelectionChange();
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
}


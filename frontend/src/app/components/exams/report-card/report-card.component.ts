import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
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
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];
  loading = false;
  error = '';
  success = '';
  canEditRemarks = false;
  savingRemarks = false;
  studentSearchQuery = '';
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();
  
  // Parent-specific fields
  isParent = false;
  parentStudentId: string | null = null;
  studentBalance: number | null = null;
  currencySymbol = 'KES';
  accessDenied = false;
  availableTerms: string[] = [];
  loadingTerms = false;
  parentStudentClassName = '';
  schoolLogo: string | null = null;
  schoolLogo2: string | null = null;
  gradeThresholds: any = null;
  gradeLabels: any = null;

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private parentService: ParentService,
    private settingsService: SettingsService
  ) {
    // Check if user can edit remarks (teacher or admin)
    this.canEditRemarks = this.authService.hasRole('teacher') || this.authService.hasRole('admin');
    this.isParent = this.authService.hasRole('parent');
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
        this.loadClasses();
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
          this.selectedTerm = activeTerm;
        } else if (!this.selectedTerm && this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
        this.loadingTerms = false;
      },
      error: (err: any) => {
        // Use default terms if active term fails to load
        if (!this.selectedTerm && this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
        this.loadingTerms = false;
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
        if (student.class?.id) {
          this.selectedClass = student.class.id;
          this.parentStudentClassName = student.class.name || '';
          // Load available exam types and let parent select
          this.loadClasses();
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
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        this.classes = data;
        this.loading = false;
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
    this.error = '';
    this.success = '';
    this.reportCards = [];
    this.accessDenied = false;

    this.examService.getReportCard(
      this.selectedClass,
      this.selectedExamType,
      this.selectedTerm,
      this.parentStudentId || undefined
    ).subscribe({
      next: (data: any) => {
        let cards = data.reportCards || [];
        
        // For parents, filter to only their student
        if (this.isParent && this.parentStudentId) {
          cards = cards.filter((card: any) => card.student?.id === this.parentStudentId);
        }
        
        this.reportCards = cards.map((card: any) => {
          // Ensure remarks object exists
          if (!card.remarks) {
            card.remarks = {
              id: null,
              classTeacherRemarks: null,
              headmasterRemarks: null
            };
          }
          return card;
        });
        this.filteredReportCards = [...this.reportCards];
        this.classInfo = { name: data.class, examType: data.examType, term: data.term || this.selectedTerm };
        this.success = `Generated ${this.reportCards.length} report card(s) for ${data.class} - ${this.selectedTerm}`;
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to generate report cards';
        this.loading = false;
        if (err.status === 403) {
          this.accessDenied = true;
        }
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

  saveRemarks(reportCard: any) {
    if (!reportCard || !reportCard.student || !this.selectedClass || !this.selectedExamType) {
      this.error = 'Invalid report card data';
      return;
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
      classTeacherRemarks,
      headmasterRemarks
    ).subscribe({
      next: (response: any) => {
        this.success = 'Remarks saved successfully';
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
  }

  resetSelection() {
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


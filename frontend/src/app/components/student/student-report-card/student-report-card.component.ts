import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-student-report-card',
  templateUrl: './student-report-card.component.html',
  styleUrls: ['./student-report-card.component.css']
})
export class StudentReportCardComponent implements OnInit {
  user: any;
  student: any;
  reportCard: any = null;
  loading = false;
  error = '';
  success = '';
  activeTerm: string = '';
  selectedExamType: string = 'End-Term'; // Default to End-Term as it's more commonly available
  examTypes: string[] = ['Mid-Term', 'End-Term'];
  classId: string = '';
  headmasterName: string = '';
  
  // PDF Preview
  showPdfPreview = false;
  pdfUrl: string | null = null;
  safePdfUrl: SafeResourceUrl | null = null;
  loadingPdf = false;

  constructor(
    private authService: AuthService,
    private examService: ExamService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit() {
    this.loadStudentData();
    this.loadSettings();
  }

  loadStudentData(retryCount = 0) {
    const maxRetries = 5; // Increased retries
    this.user = this.authService.getCurrentUser();
    
    // If user not found, try to reload from localStorage
    if (!this.user) {
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          this.user = JSON.parse(storedUser);
          console.log('[StudentReportCard] Reloaded user from localStorage:', this.user);
        }
      } catch (e) {
        console.error('[StudentReportCard] Error parsing user from localStorage:', e);
      }
    }
    
    if (!this.user) {
      if (retryCount < maxRetries) {
        setTimeout(() => this.loadStudentData(retryCount + 1), 500);
        return;
      }
      this.error = 'User information not found. Please log in again.';
      return;
    }

    // Debug: Log user object structure
    console.log('[StudentReportCard] User object:', {
      id: this.user.id,
      role: this.user.role,
      hasStudent: !!this.user.student,
      studentKeys: this.user.student ? Object.keys(this.user.student) : [],
      fullUser: this.user
    });

    // Check if user is a student but student data is missing
    if (this.user.role === 'student' && !this.user.student) {
      if (retryCount < maxRetries) {
        console.log(`[StudentReportCard] Student data not available, retry ${retryCount + 1}/${maxRetries}`);
        // Wait a bit longer for student data to be loaded
        setTimeout(() => this.loadStudentData(retryCount + 1), 1000);
        return;
      }
      console.error('[StudentReportCard] Student data not available after retries. User object:', this.user);
      console.error('[StudentReportCard] This usually means the user session was created before the student data fix. Please log out and log back in.');
      this.error = 'Student information not found. Your session may be outdated. Please log out and log in again to refresh your session.';
      return;
    }

    if (!this.user.student) {
      this.error = 'Student information not found. Please log out and log in again.';
      return;
    }

    this.student = this.user.student;
    
    // Verify student ID is available
    if (!this.student.id) {
      console.error('Student ID not available:', this.student);
      this.error = 'Student ID not found. Please log in again.';
      return;
    }
    
    // Get classId from various possible locations
    this.classId = this.student.classId || 
                   this.student.class?.id || 
                   this.student.classEntity?.id || '';
    
    if (!this.classId) {
      this.error = 'Class information not found. Please contact the administrator.';
      return;
    }
    
    this.loadActiveTerm();
  }

  loadActiveTerm() {
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        this.activeTerm = data.activeTerm || data.currentTerm || '';
        if (this.activeTerm) {
          this.loadReportCard();
        } else {
          this.error = 'No active term found. Please contact the administrator.';
        }
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
        this.error = 'Failed to load active term';
      }
    });
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.headmasterName = data.headmasterName || '';
      },
      error: (_: any) => {
        this.headmasterName = '';
      }
    });
  }

  loadReportCard() {
    if (!this.classId || !this.activeTerm || !this.selectedExamType) {
      this.error = 'Missing required information to load report card';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.examService.getReportCard(
      this.classId,
      this.selectedExamType,
      this.activeTerm,
      this.student.id
    ).subscribe({
      next: (data: any) => {
        this.loading = false;
        console.log('[StudentReportCard] Received data:', data);
        if (data && data.reportCards && data.reportCards.length > 0) {
          this.reportCard = data.reportCards[0];
          console.log('[StudentReportCard] Report card:', this.reportCard);
          console.log('[StudentReportCard] Subjects:', this.reportCard.subjects);
          if (this.reportCard.subjects && this.reportCard.subjects.length > 0) {
            console.log('[StudentReportCard] First subject sample:', this.reportCard.subjects[0]);
            console.log('[StudentReportCard] Class position:', this.reportCard.classPosition);
          }
          console.log('[StudentReportCard] Class:', this.reportCard.class, 'or', this.reportCard.student?.class);
          console.log('[StudentReportCard] Remarks:', this.reportCard.remarks);
          if (this.reportCard.remarks) {
            console.log('[StudentReportCard] Class Teacher Remarks:', this.reportCard.remarks.classTeacherRemarks);
            console.log('[StudentReportCard] Headmaster Remarks:', this.reportCard.remarks.headmasterRemarks);
          }
          if (!this.reportCard.remarks) {
            this.reportCard.remarks = {
              classTeacherRemarks: null,
              headmasterRemarks: null
            };
          }
          const existingHead = this.reportCard.remarks.headmasterRemarks;
          if (!existingHead || !String(existingHead).trim().length) {
            const autoHead = this.generateHeadmasterRemark(this.reportCard);
            this.reportCard.remarks.headmasterRemarks = autoHead;
          }
        } else if (data && data.student) {
          // Single report card format
          this.reportCard = data;
          console.log('[StudentReportCard] Report card (single format):', this.reportCard);
        } else {
          this.error = 'No report card found for the current term';
        }
      },
      error: (err: any) => {
        this.loading = false;
        console.error('Error loading report card:', err);
        if (err.status === 404) {
          // Show the backend's detailed error message if available
          const backendMessage = err.error?.message || 'Report card not found for the current term';
          const availableTypes = err.error?.availableTypes;
          
          if (availableTypes && availableTypes.length > 0) {
            // If the selected exam type is not available, automatically switch to the first available type
            if (!availableTypes.includes(this.selectedExamType)) {
              console.log(`[StudentReportCard] Selected exam type "${this.selectedExamType}" not available. Switching to "${availableTypes[0]}"`);
              this.selectedExamType = availableTypes[0];
              // Retry loading with the available exam type
              setTimeout(() => {
                this.loadReportCard();
              }, 500);
              return; // Don't show error, we're retrying
            }
            this.error = `${backendMessage}. Available exam types: ${availableTypes.join(', ')}`;
          } else {
            this.error = backendMessage;
          }
        } else {
          this.error = err.error?.message || 'Failed to load report card';
        }
      }
    });
  }

  onExamTypeChange() {
    if (this.activeTerm) {
      this.loadReportCard();
    }
  }

  previewPDF() {
    if (!this.reportCard || !this.classId || !this.selectedExamType || !this.activeTerm) {
      this.error = 'Cannot preview PDF: Missing required information';
      return;
    }

    this.loadingPdf = true;
    this.showPdfPreview = true;
    this.error = '';

    // Generate PDF URL
    const params = new URLSearchParams({
      classId: this.classId,
      examType: this.selectedExamType,
      term: this.activeTerm,
      studentId: this.student.id
    });

    this.examService.downloadAllReportCardsPDF(
      this.classId,
      this.selectedExamType,
      this.activeTerm,
      this.student.id
    ).subscribe({
      next: (blob: Blob) => {
        this.loadingPdf = false;
        const url = window.URL.createObjectURL(blob);
        this.pdfUrl = url;
        this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      },
      error: (err: any) => {
        this.loadingPdf = false;
        console.error('Error loading PDF:', err);
        this.error = err.error?.message || 'Failed to load PDF preview';
        this.showPdfPreview = false;
      }
    });
  }

  closePdfPreview() {
    this.showPdfPreview = false;
    if (this.pdfUrl) {
      window.URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
      this.safePdfUrl = null;
    }
  }

  downloadPDF() {
    if (!this.reportCard || !this.classId || !this.selectedExamType || !this.activeTerm) {
      this.error = 'Cannot download PDF: Missing required information';
      return;
    }

    this.loading = true;
    this.error = '';

    this.examService.downloadAllReportCardsPDF(
      this.classId,
      this.selectedExamType,
      this.activeTerm,
      this.student.id
    ).subscribe({
      next: (blob: Blob) => {
        this.loading = false;
        if (blob.size === 0) {
          this.error = 'Received empty PDF file';
          return;
        }

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const studentName = `${this.student.lastName || ''} ${this.student.firstName || ''}`.trim()
          .replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
        link.download = `${studentName}-${this.selectedExamType}-${this.activeTerm.replace(/\s+/g, '-')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        this.success = 'PDF downloaded successfully';
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.loading = false;
        console.error('PDF download error:', err);
        this.error = err.error?.message || 'Failed to download PDF';
      }
    });
  }

  generateHeadmasterRemark(reportCard: any): string {
    if (!reportCard) {
      return '';
    }
    const headName = (this.headmasterName || '').trim();
    const studentName = reportCard.student && reportCard.student.name
      ? String(reportCard.student.name).trim()
      : '';
    const namePart = studentName ? ` by ${studentName}` : '';
    const signature = headName ? `. ${headName}` : '';
    const rawAverage = reportCard.overallAverage;
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
}


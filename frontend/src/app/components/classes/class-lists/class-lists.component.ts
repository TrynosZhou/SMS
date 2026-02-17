import { Component, OnInit } from '@angular/core';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

@Component({
  selector: 'app-class-lists',
  templateUrl: './class-lists.component.html',
  styleUrls: ['./class-lists.component.css']
})
export class ClassListsComponent implements OnInit {
  classes: any[] = [];
  students: any[] = [];
  filteredStudents: any[] = [];
  selectedClassId = '';
  selectedTerm = '';
  availableTerms: string[] = [];
  schoolName = '';
  schoolAddress = '';
  schoolPhone = '';
  schoolEmail = '';
  schoolMotto = '';
  academicYear = '';
  schoolLogo: string | null = null;
  schoolLogo2: string | null = null;
  
  loading = false;
  loadingStudents = false;
  error = '';
  success = '';
  loadingPdf = false;
  downloadingPdf = false;
  
  // User role checks
  isAdmin = false;
  isTeacher = false;
  isSuperAdmin = false;
  generatedAt: Date = new Date();
  lastLoadedClassId: string | null = null;
  lastLoadedTerm: string | null = null;
  movingStudentId: string | null = null;
  moveTargetClassId: string = '';
  enrolling = false;
  showEnrollModal = false;

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private settingsService: SettingsService,
    public authService: AuthService
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin') : false;
    this.isSuperAdmin = user ? (user.role === 'superadmin') : false;
    this.isTeacher = user ? (user.role === 'teacher') : false;
  }

  ngOnInit() {
    this.loadClasses();
    this.loadTerms();
  }

  loadClasses() {
    this.loading = true;
    this.error = '';
    
    this.classService.getClasses().subscribe({
      next: (response: any) => {
        const classesData = Array.isArray(response) ? response : (response?.classes || response?.data || []);
        this.classes = Array.isArray(classesData) ? classesData : [];
        
        // Filter active classes only
        this.classes = this.classes.filter((cls: any) => cls.isActive !== false);
        
        // Remove duplicates by ID
        const uniqueClassesMap = new Map<string, any>();
        this.classes.forEach((classItem: any) => {
          if (classItem.id && !uniqueClassesMap.has(classItem.id)) {
            uniqueClassesMap.set(classItem.id, classItem);
          }
        });
        this.classes = Array.from(uniqueClassesMap.values());
        
        // Sort by name
        this.classes.sort((a: any, b: any) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading classes:', err);
        this.error = 'Failed to load classes. Please try again.';
        this.loading = false;
      }
    });
  }

  loadTerms() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        this.schoolName = settings.schoolName || '';
        this.schoolAddress = settings.schoolAddress || '';
        this.schoolPhone = settings.schoolPhone || '';
        this.schoolEmail = settings.schoolEmail || '';
        this.schoolMotto = settings.schoolMotto || '';
        this.academicYear = settings.academicYear || '';
        this.schoolLogo = settings.schoolLogo || null;
        this.schoolLogo2 = settings.schoolLogo2 || null;

        const terms: string[] = [];
        
        if (settings.activeTerm) {
          terms.push(settings.activeTerm);
        }
        if (settings.currentTerm && !terms.includes(settings.currentTerm)) {
          terms.push(settings.currentTerm);
        }
        
        // Generate common terms if none found
        if (terms.length === 0) {
          const currentYear = new Date().getFullYear();
          terms.push(`Term 1 ${currentYear}`);
          terms.push(`Term 2 ${currentYear}`);
          terms.push(`Term 3 ${currentYear}`);
        }
        
        this.availableTerms = terms;
        
        // Set default term to activeTerm if available
        if (settings.activeTerm) {
          this.selectedTerm = settings.activeTerm;
        } else if (this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
      },
      error: (err) => {
        console.error('Error loading terms:', err);
        // Set default terms
        const currentYear = new Date().getFullYear();
        this.availableTerms = [
          `Term 1 ${currentYear}`,
          `Term 2 ${currentYear}`,
          `Term 3 ${currentYear}`
        ];
        if (this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
      }
    });
  }

  loadStudents() {
    if (!this.selectedClassId) {
      this.error = 'Please select a class first.';
      return;
    }
    
    if (!this.selectedTerm) {
      this.error = 'Please select a term first.';
      return;
    }
    
    if (this.loadingStudents) {
      return;
    }

    this.loadingStudents = true;
    this.error = '';
    this.success = '';
    this.students = [];
    this.filteredStudents = [];
    
    this.studentService.getStudents(this.selectedClassId).subscribe({
      next: (response: any) => {
        const studentsData = Array.isArray(response) ? response : (response?.data || response?.students || []);
        this.students = Array.isArray(studentsData) ? studentsData : [];
        this.filteredStudents = [...this.students];
        this.filteredStudents.sort((a: any, b: any) => {
          const lastA = (a.lastName || '').toLowerCase();
          const lastB = (b.lastName || '').toLowerCase();
          const lastCompare = lastA.localeCompare(lastB);
          if (lastCompare !== 0) {
            return lastCompare;
          }
          const firstA = (a.firstName || '').toLowerCase();
          const firstB = (b.firstName || '').toLowerCase();
          const firstCompare = firstA.localeCompare(firstB);
          if (firstCompare !== 0) {
            return firstCompare;
          }
          const numA = (a.studentNumber || '').toLowerCase();
          const numB = (b.studentNumber || '').toLowerCase();
          return numA.localeCompare(numB);
        });
        
        this.loadingStudents = false;
        this.lastLoadedClassId = this.selectedClassId;
        this.lastLoadedTerm = this.selectedTerm;
        
        if (this.filteredStudents.length === 0) {
          this.error = 'No students found in the selected class for this term.';
        } else {
          this.success = `Successfully loaded ${this.filteredStudents.length} student(s) from the selected class.`;
        }
      },
      error: (err) => {
        console.error('Error loading students:', err);
        this.error = 'Failed to load students. Please try again.';
        this.loadingStudents = false;
        this.students = [];
        this.filteredStudents = [];
      }
    });
  }

  onSelectionChange() {
    if (!this.selectedClassId || !this.selectedTerm) {
      return;
    }
    if (this.loadingStudents) {
      return;
    }
    if (
      this.lastLoadedClassId === this.selectedClassId &&
      this.lastLoadedTerm === this.selectedTerm &&
      this.filteredStudents.length > 0
    ) {
      return;
    }
    this.loadStudents();
  }

  getSelectedClassName(): string {
    const selectedClass = this.classes.find(c => c.id === this.selectedClassId);
    return selectedClass ? selectedClass.name : 'Selected Class';
  }

  canMoveStudent(): boolean {
    return this.isAdmin || this.isSuperAdmin || this.isTeacher;
  }

  startMove(student: any) {
    if (!this.canMoveStudent()) return;
    this.movingStudentId = student.id;
    this.moveTargetClassId = student.classId || this.selectedClassId || '';
    this.showEnrollModal = true;
  }

  cancelMove() {
    this.movingStudentId = null;
    this.moveTargetClassId = '';
    this.showEnrollModal = false;
  }

  confirmEnroll() {
    if (!this.movingStudentId || !this.moveTargetClassId) return;
    this.enrolling = true;
    this.error = '';
    this.success = '';
    this.studentService.updateStudent(this.movingStudentId, { classId: this.moveTargetClassId }).subscribe({
      next: (res: any) => {
        this.success = res?.message || 'Student enrolled to new class successfully.';
        this.enrolling = false;
        const movedId = this.movingStudentId;
        this.cancelMove();
        this.showEnrollModal = false;
        // Refresh current class list so moved student disappears
        this.loadStudents();
        // If we were not filtering by a specific class, update local list only
        this.filteredStudents = this.filteredStudents.filter(s => s.id !== movedId);
      },
      error: (err: any) => {
        this.error = err?.error?.message || err?.message || 'Failed to enroll student to new class.';
        this.enrolling = false;
      }
    });
  }

  viewStudentIdCard(studentId: string) {
    if (!studentId) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.studentService.getStudentIdCard(studentId).subscribe({
      next: (blob: Blob) => {
        this.loading = false;
        const fileURL = window.URL.createObjectURL(blob);
        window.open(fileURL, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(fileURL), 100);
      },
      error: (err: any) => {
        this.loading = false;
        console.error('Error loading student ID card:', err);
        console.error('Error details:', {
          status: err.status,
          statusText: err.statusText,
          error: err.error,
          message: err.message
        });

        let errorMessage = 'Failed to load student ID card';

        if (err.status === 403) {
          const errorObj = typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
          errorMessage = errorObj?.message || 'You do not have permission to view this student\'s ID card. Please ensure you have the required role (Admin, Super Admin, Accountant, or Teacher).';
          if (errorObj?.userRole) {
            errorMessage += ` Your current role: ${errorObj.userRole}.`;
          }
        } else if (err.status === 404) {
          errorMessage = 'Student not found';
        } else if (err.status === 401) {
          errorMessage = 'Authentication required. Please log in again.';
        } else if (err.status === 0 || err.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.error) {
          if (typeof err.error === 'object' && err.error.message) {
            errorMessage = err.error.message;
          } else if (typeof err.error === 'string') {
            try {
              const parsed = JSON.parse(err.error);
              errorMessage = parsed.message || errorMessage;
            } catch (e) {
              errorMessage = err.error;
            }
          }
        } else if (err.message) {
          errorMessage = err.message;
        }

        this.error = errorMessage;
        setTimeout(() => {
          if (this.error === errorMessage) {
            this.error = '';
          }
        }, 7000);
      }
    });
  }

  async previewPdf() {
    const element = document.getElementById('class-list-pdf');
    if (!element) {
      this.error = 'Class list content not found.';
      return;
    }
    this.loadingPdf = true;
    this.error = '';
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      const pdfBlob = pdf.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
    } catch (error: any) {
      this.error = error?.message || 'Failed to generate PDF preview.';
    } finally {
      this.loadingPdf = false;
    }
  }

  async downloadPdf() {
    const element = document.getElementById('class-list-pdf');
    if (!element) {
      this.error = 'Class list content not found.';
      return;
    }
    this.downloadingPdf = true;
    this.error = '';
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      const className = this.getSelectedClassName().replace(/\s+/g, '_');
      const term = (this.selectedTerm || '').replace(/\s+/g, '_');
      const filename = `Class_List_${className}_${term || 'Term'}.pdf`;
      pdf.save(filename);
    } catch (error: any) {
      this.error = error?.message || 'Failed to download PDF.';
    } finally {
      this.downloadingPdf = false;
    }
  }
}


import { Component, OnInit } from '@angular/core';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-student-transfer',
  templateUrl: './student-transfer.component.html',
  styleUrls: ['./student-transfer.component.css']
})
export class StudentTransferComponent implements OnInit {
  // Search and selection
  students: any[] = [];
  filteredStudents: any[] = [];
  searchQuery = '';
  selectedStudent: any = null;
  
  // Transfer type
  transferType: 'internal' | 'external' = 'internal';
  
  // Internal transfer fields
  availableClasses: any[] = [];
  targetClassId = '';
  
  // External transfer fields
  destinationSchool = '';
  transferReason = '';
  transferDate = '';
  
  // UI state
  loading = false;
  loadingStudents = false;
  loadingClasses = false;
  error = '';
  success = '';
  
  // Transfer history
  transferHistory: any[] = [];
  showHistory = false;

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadStudents();
    this.loadClasses();
  }

  loadStudents(): void {
    this.loadingStudents = true;
    this.studentService.getStudents().subscribe({
      next: (students: any[]) => {
        this.students = Array.isArray(students) ? students : [];
        this.filteredStudents = [...this.students];
        this.loadingStudents = false;
      },
      error: (err: any) => {
        console.error('Error loading students:', err);
        if (err.status === 0 || err.message?.includes('Connection refused')) {
          this.error = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else {
          this.error = err.error?.message || 'Failed to load students. Please try again.';
        }
        this.students = [];
        this.filteredStudents = [];
        this.loadingStudents = false;
      }
    });
  }

  loadClasses(): void {
    this.loadingClasses = true;
    this.classService.getClassesPaginated(1, 200).subscribe({
      next: (response: any) => {
        const classes = response?.data || response || [];
        this.availableClasses = Array.isArray(classes) ? classes : [];
        // Filter out the student's current class for internal transfers
        if (this.selectedStudent) {
          const currentClassId = this.selectedStudent.classId || this.selectedStudent.class?.id || this.selectedStudent.classEntity?.id;
          if (currentClassId) {
            this.availableClasses = this.availableClasses.filter(
              (cls: any) => cls.id !== currentClassId
            );
          }
        }
        this.loadingClasses = false;
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        if (err.status === 0 || err.message?.includes('Connection refused')) {
          this.error = 'Cannot connect to server. Please ensure the backend server is running.';
        }
        this.availableClasses = [];
        this.loadingClasses = false;
      }
    });
  }

  searchStudents(): void {
    if (!this.searchQuery.trim()) {
      this.filteredStudents = [...this.students];
      return;
    }

    const query = this.searchQuery.toLowerCase().trim();
    this.filteredStudents = this.students.filter(student => {
      const studentId = (student.studentNumber || '').toLowerCase();
      const firstName = (student.firstName || '').toLowerCase();
      const lastName = (student.lastName || '').toLowerCase();
      const fullName = `${firstName} ${lastName}`;
      const className = (student.class?.name || student.className || '').toLowerCase();
      
      return studentId.includes(query) ||
             firstName.includes(query) ||
             lastName.includes(query) ||
             fullName.includes(query) ||
             className.includes(query);
    });
  }

  selectStudent(student: any): void {
    this.selectedStudent = student;
    this.error = '';
    this.success = '';
    this.transferHistory = [];
    this.showHistory = false;
    
    // Reload classes to exclude current class
    if (student.classId) {
      this.loadClasses();
    }
    
    // Load transfer history
    this.loadTransferHistory(student.id);
  }

  loadTransferHistory(studentId: string): void {
    this.studentService.getStudentTransfers(studentId).subscribe({
      next: (history: any[]) => {
        this.transferHistory = Array.isArray(history) ? history : [];
      },
      error: (err: any) => {
        console.error('Error loading transfer history:', err);
        // Don't show error for history - it's not critical
        this.transferHistory = [];
      }
    });
  }

  onTransferTypeChange(): void {
    this.targetClassId = '';
    this.destinationSchool = '';
    this.transferReason = '';
    this.transferDate = '';
    this.error = '';
  }

  validateForm(): boolean {
    if (!this.selectedStudent) {
      this.error = 'Please select a student first.';
      return false;
    }

    if (this.transferType === 'internal') {
      if (!this.targetClassId) {
        this.error = 'Please select a target class for internal transfer.';
        return false;
      }
      const currentClassId = this.selectedStudent.classId || this.selectedStudent.class?.id || this.selectedStudent.classEntity?.id;
      if (currentClassId && this.targetClassId === currentClassId) {
        this.error = 'The target class must be different from the student\'s current class.';
        return false;
      }
    } else {
      if (!this.destinationSchool.trim()) {
        this.error = 'Destination school name is required for external transfer.';
        return false;
      }
      if (!this.transferDate) {
        this.error = 'Transfer date is required for external transfer.';
        return false;
      }
    }

    return true;
  }

  submitTransfer(): void {
    if (!this.validateForm()) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const transferData: any = {
      studentId: this.selectedStudent.id,
      transferType: this.transferType
    };

    if (this.transferType === 'internal') {
      transferData.targetClassId = this.targetClassId;
    } else {
      transferData.destinationSchool = this.destinationSchool.trim();
      transferData.transferReason = this.transferReason.trim();
      transferData.transferDate = this.transferDate;
    }

    this.studentService.transferStudent(transferData).subscribe({
      next: (response: any) => {
        this.success = `Student ${this.selectedStudent.firstName} ${this.selectedStudent.lastName} has been successfully transferred.`;
        this.loading = false;
        
        // Reload student data to get updated class/status
        this.loadStudents();
        
        // Reload transfer history
        if (this.selectedStudent?.id) {
          this.loadTransferHistory(this.selectedStudent.id);
        }
        
        // Reset form
        setTimeout(() => {
          this.resetForm();
        }, 2000);
      },
      error: (err: any) => {
        console.error('Error transferring student:', err);
        if (err.status === 0 || err.message?.includes('Connection refused')) {
          this.error = 'Cannot connect to server. Please ensure the backend server is running.';
        } else {
          this.error = err.error?.message || 'Failed to transfer student. Please try again.';
        }
        this.loading = false;
      }
    });
  }

  resetForm(): void {
    this.selectedStudent = null;
    this.searchQuery = '';
    this.filteredStudents = [...this.students];
    this.transferType = 'internal';
    this.targetClassId = '';
    this.destinationSchool = '';
    this.transferReason = '';
    this.transferDate = '';
    this.error = '';
    this.success = '';
    this.transferHistory = [];
    this.showHistory = false;
  }

  getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
}


import { Component, OnInit } from '@angular/core';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { validatePhoneNumber } from '../../../utils/phone-validator';

@Component({
  selector: 'app-student-transfer',
  templateUrl: './student-transfer.component.html',
  styleUrls: ['./student-transfer.component.css'],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-20px)' }),
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ])
  ]
})
export class StudentTransferComponent implements OnInit {
  students: any[] = [];
  filteredStudents: any[] = [];
  classes: any[] = [];
  transferHistory: any[] = [];

  selectedStudentId = '';
  selectedStudent: any = null;
  targetClassId = '';
  transferReason = '';
  searchTerm = '';
  
  // Transfer type
  transferType: 'internal' | 'external' = 'internal';
  
  // External transfer fields
  externalSchoolName = '';
  externalSchoolAddress = '';
  externalSchoolPhone = '';
  externalSchoolEmail = '';
  
  // Character limit for reason
  readonly MAX_REASON_LENGTH = 500;

  loadingStudents = false;
  loadingClasses = false;
  loadingHistory = false;
  submitting = false;

  successMessage = '';
  errorMessage = '';

  constructor(
    private studentService: StudentService,
    private classService: ClassService
  ) {}

  ngOnInit(): void {
    this.loadClasses();
    this.loadStudents();
  }

  loadStudents(): void {
    this.loadingStudents = true;
    this.studentService.getStudentsPaginated({ page: 1, limit: 300 }).subscribe({
      next: response => {
        const studentsData = response?.data;
        this.students = Array.isArray(studentsData) ? studentsData : [];
        this.filteredStudents = [...this.students];
        this.loadingStudents = false;
      },
      error: err => {
        console.error('Error loading students for transfer:', err);
        this.errorMessage = err.error?.message || 'Failed to load students';
        this.loadingStudents = false;
      }
    });
  }

  loadClasses(): void {
    this.loadingClasses = true;
    this.classService.getClassesPaginated(1, 200).subscribe({
      next: response => {
        this.classes = response?.data || [];
        this.loadingClasses = false;
      },
      error: err => {
        console.error('Error loading classes for transfer:', err);
        this.errorMessage = err.error?.message || 'Failed to load classes';
        this.loadingClasses = false;
      }
    });
  }

  onStudentChange(): void {
    this.selectedStudent = this.students.find(student => student.id === this.selectedStudentId) || null;
    this.targetClassId = '';
    this.resetExternalFields();
    if (this.selectedStudent) {
      this.loadTransferHistory(this.selectedStudent.id);
    } else {
      this.transferHistory = [];
    }
  }

  onTransferTypeChange(): void {
    this.targetClassId = '';
    this.resetExternalFields();
  }

  resetExternalFields(): void {
    this.externalSchoolName = '';
    this.externalSchoolAddress = '';
    this.externalSchoolPhone = '';
    this.externalSchoolEmail = '';
  }

  filterStudentList(): void {
    if (!this.searchTerm.trim()) {
      this.filteredStudents = [...this.students];
      return;
    }
    const query = this.searchTerm.toLowerCase().trim();
    this.filteredStudents = this.students.filter(student => {
      const fullName = `${student.firstName || ''} ${student.lastName || ''}`.toLowerCase();
      const studentNumber = (student.studentNumber || '').toLowerCase();
      return fullName.includes(query) || studentNumber.includes(query);
    });
  }

  loadTransferHistory(studentId: string): void {
    this.loadingHistory = true;
    this.studentService.getStudentTransfers(studentId).subscribe({
      next: history => {
        this.transferHistory = history || [];
        this.loadingHistory = false;
      },
      error: err => {
        console.error('Error loading transfer history:', err);
        this.loadingHistory = false;
      }
    });
  }

  validateExternalSchoolPhone(): void {
    if (this.externalSchoolPhone && this.externalSchoolPhone.trim()) {
      const result = validatePhoneNumber(this.externalSchoolPhone, false);
      if (!result.isValid) {
        this.errorMessage = result.error || 'Invalid external school phone number';
      } else {
        // Clear error if validation passes
        if (this.errorMessage && this.errorMessage.includes('phone')) {
          this.errorMessage = '';
        }
      }
    }
  }

  submitTransfer(): void {
    if (!this.selectedStudentId) {
      this.errorMessage = 'Please select a student.';
      return;
    }

    // Validate based on transfer type
    if (this.transferType === 'internal') {
      if (!this.targetClassId) {
        this.errorMessage = 'Please select a destination class for internal transfer.';
        return;
      }

      if (this.selectedStudent?.classId && this.selectedStudent.classId === this.targetClassId) {
        this.errorMessage = 'Student is already enrolled in the selected class.';
        return;
      }
    } else {
      // External transfer validation
      if (!this.externalSchoolName || !this.externalSchoolName.trim()) {
        this.errorMessage = 'External school name is required for external transfers.';
        return;
      }

      // Validate external school phone if provided
      if (this.externalSchoolPhone && this.externalSchoolPhone.trim()) {
        const phoneResult = validatePhoneNumber(this.externalSchoolPhone, false);
        if (!phoneResult.isValid) {
          this.errorMessage = phoneResult.error || 'Invalid external school phone number';
          return;
        }
        // Normalize phone number
        if (phoneResult.normalized) {
          this.externalSchoolPhone = phoneResult.normalized;
        }
      }
    }

    // Validate reason length
    if (this.transferReason.length > this.MAX_REASON_LENGTH) {
      this.errorMessage = `Transfer reason cannot exceed ${this.MAX_REASON_LENGTH} characters.`;
      return;
    }

    this.submitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    const transferPayload: any = {
      studentId: this.selectedStudentId,
      transferType: this.transferType,
      reason: this.transferReason.trim()
    };

    if (this.transferType === 'internal') {
      transferPayload.toClassId = this.targetClassId;
    } else {
      transferPayload.externalSchoolName = this.externalSchoolName.trim();
      transferPayload.externalSchoolAddress = this.externalSchoolAddress.trim() || null;
      transferPayload.externalSchoolPhone = this.externalSchoolPhone.trim() || null;
      transferPayload.externalSchoolEmail = this.externalSchoolEmail.trim() || null;
    }

    this.studentService.transferStudent(transferPayload).subscribe({
      next: response => {
        this.successMessage = response?.message || 
          (this.transferType === 'external' 
            ? 'Student transferred to external school successfully!' 
            : 'Student transferred successfully!');
        this.submitting = false;
        
        // Clear form after successful transfer
        setTimeout(() => {
          this.transferReason = '';
          this.targetClassId = '';
          this.resetExternalFields();
          if (this.selectedStudent) {
            if (this.transferType === 'internal') {
              this.selectedStudent.classId = this.targetClassId;
              this.selectedStudent.classEntity = this.classes.find(cls => cls.id === this.targetClassId) || this.selectedStudent.classEntity;
            } else {
              // External transfer - student is no longer active
              this.selectedStudent.isActive = false;
              this.selectedStudent.classId = null;
            }
          }
          this.loadTransferHistory(this.selectedStudentId);
          this.loadStudents();
        }, 2000);
      },
      error: err => {
        console.error('Error transferring student:', err);
        this.errorMessage = err.error?.message || 'Failed to transfer student. Please try again.';
        this.submitting = false;
      }
    });
  }

  getCurrentClassName(): string {
    if (!this.selectedStudent) return 'Not assigned';
    return this.selectedStudent.classEntity?.name || this.classes.find(c => c.id === this.selectedStudent.classId)?.name || 'Not assigned';
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.filterStudentList();
  }

  clearSuccessMessage(): void {
    this.successMessage = '';
  }

  clearErrorMessage(): void {
    this.errorMessage = '';
  }

  getTargetClassName(): string {
    if (!this.targetClassId) return 'Selected Class';
    const targetClass = this.classes.find(c => c.id === this.targetClassId);
    return targetClass?.name || 'Selected Class';
  }

  getPerformedByName(transfer: any): string {
    if (!transfer.performedBy) return '';
    return transfer.performedBy.username || 
           `${transfer.performedBy.firstName || ''} ${transfer.performedBy.lastName || ''}`.trim() || 
           'Unknown';
  }

  trackByTransferId(index: number, transfer: any): any {
    return transfer.id || index;
  }

  isTransferCompleted(transfer: any): boolean {
    return transfer.status === 'completed';
  }

  isTransferCancelled(transfer: any): boolean {
    return transfer.status === 'cancelled';
  }
}


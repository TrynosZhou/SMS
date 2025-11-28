import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-student-list',
  templateUrl: './student-list.component.html',
  styleUrls: ['./student-list.component.css']
})
export class StudentListComponent implements OnInit {
  students: any[] = [];
  filteredStudents: any[] = [];
  classes: any[] = [];
  selectedClass = '';
  selectedType = '';
  selectedGender = '';
  searchQuery = '';
  viewMode: 'grid' | 'list' = 'grid';
  loading = false;
  error = '';
  success = '';
  selectedStudent: any = null;
  pagination = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  };
  stats = {
    totalDayScholars: 0,
    totalBoarders: 0,
    classCount: 0
  };
  pageSizeOptions = [10, 20, 50];

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadClasses();
    this.loadStudents();
  }

  loadClasses() {
    this.classService.getClassesPaginated(1, 100).subscribe({
      next: (response: any) => {
        this.classes = response?.data || response || [];
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
      }
    });
  }

  loadStudents(page = this.pagination.page) {
    this.loading = true;
    this.studentService.getStudentsPaginated({
      classId: this.selectedClass || undefined,
      page,
      limit: this.pagination.limit
    }).subscribe({
      next: (response: any) => {
        this.students = response?.data || [];
        this.pagination = {
          page: response?.page || page,
          limit: response?.limit || this.pagination.limit,
          total: response?.total || this.students.length,
          totalPages: response?.totalPages || 1
        };
        this.stats = {
          totalDayScholars: response?.stats?.totalDayScholars ?? 0,
          totalBoarders: response?.stats?.totalBoarders ?? 0,
          classCount: response?.stats?.classCount ?? this.classes.length
        };
        this.loading = false;
        // Defer filtering to avoid NG0900 error
        setTimeout(() => {
          this.applyFilters();
        }, 0);
      },
      error: (err: any) => {
        console.error('Error loading students:', err);
        this.error = 'Failed to load students';
        this.loading = false;
        this.students = [];
        this.filteredStudents = [];
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  applyFilters() {
    let filtered = [...this.students];

    // Search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(student => {
        const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
        const studentNumber = (student.studentNumber || '').toLowerCase();
        const contact = ((student.contactNumber || student.phoneNumber) || '').toLowerCase();
        return fullName.includes(query) || studentNumber.includes(query) || contact.includes(query);
      });
    }

    // Type filter
    if (this.selectedType) {
      filtered = filtered.filter(student => {
        return (student.studentType || 'Day Scholar') === this.selectedType;
      });
    }

    // Gender filter
    if (this.selectedGender) {
      filtered = filtered.filter(student => {
        return student.gender === this.selectedGender;
      });
    }

    this.filteredStudents = filtered;
  }

  clearFilters() {
    const hadClassFilter = !!this.selectedClass;
    this.searchQuery = '';
    this.selectedClass = '';
    this.selectedType = '';
    this.selectedGender = '';
    if (hadClassFilter) {
      this.loadStudents(1);
    } else {
      this.applyFilters();
    }
  }

  hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.selectedClass || this.selectedType || this.selectedGender);
  }

  viewStudentDetails(student: any) {
    this.selectedStudent = student;
  }

  closeStudentDetails() {
    this.selectedStudent = null;
  }

  editStudent(id: string) {
    this.router.navigate([`/students/${id}/edit`]);
  }

  viewReportCard(studentId: string) {
    this.router.navigate(['/report-cards'], { queryParams: { studentId } });
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
        // Clean up the object URL after a delay
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
        
        // Handle different error types
        if (err.status === 403) {
          const errorObj = typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
          errorMessage = errorObj?.message || 'You do not have permission to view this student\'s ID card. Please ensure you have the required role (Admin, Super Admin, Accountant, or Teacher).';
          
          // Add user role info if available
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

  deleteStudent(id: string, studentName: string, studentNumber: string) {
    if (!confirm(`Are you sure you want to delete student "${studentName}" (${studentNumber})? This will also delete all marks, invoices, and associated user account. This action cannot be undone.`)) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.studentService.deleteStudent(id).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Student deleted successfully';
        this.loading = false;
        this.loadStudents();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error deleting student:', err);
        let errorMessage = 'Failed to delete student';
        if (err.status === 0 || err.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        this.error = errorMessage;
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onClassFilterChange() {
    this.pagination.page = 1;
    this.loadStudents(1);
  }

  onPageChange(page: number) {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.loadStudents(page);
  }

  onPageSizeChange(limit: number | string) {
    const parsedLimit = Number(limit);
    this.pagination.limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : this.pagination.limit;
    this.pagination.page = 1;
    this.loadStudents(1);
  }
}

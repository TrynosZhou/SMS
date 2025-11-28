import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';
import { ClassService } from '../../../services/class.service';

@Component({
  selector: 'app-teacher-list',
  templateUrl: './teacher-list.component.html',
  styleUrls: ['./teacher-list.component.css']
})
export class TeacherListComponent implements OnInit {
  teachers: any[] = [];
  filteredTeachers: any[] = [];
  allSubjects: any[] = [];
  allClasses: any[] = [];
  loading = false;
  searchQuery = '';
  selectedSubjectFilter = '';
  selectedClassFilter = '';
  viewMode: 'grid' | 'list' = 'grid';
  selectedTeacher: any = null;
  error = '';
  success = '';
  pagination = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [10, 20, 50];

  constructor(
    private teacherService: TeacherService,
    private subjectService: SubjectService,
    private classService: ClassService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadTeachers();
    this.loadSubjects();
    this.loadClasses();
  }

  loadTeachers(page = this.pagination.page) {
    this.loading = true;
    this.teacherService.getTeachersPaginated(page, this.pagination.limit).subscribe({
      next: (response: any) => {
        const data = Array.isArray(response) ? response : (response?.data || []);
        this.teachers = data;
        if (response?.page !== undefined) {
          this.pagination = {
            page: response.page,
            limit: response.limit,
            total: response.total,
            totalPages: response.totalPages
          };
        } else {
          this.pagination.total = data.length;
          this.pagination.totalPages = Math.max(1, Math.ceil(this.pagination.total / this.pagination.limit));
          this.pagination.page = page;
        }
        this.filteredTeachers = this.teachers;
        this.loading = false;
        // Defer filtering to avoid NG0900 error
        setTimeout(() => {
          this.filterTeachers();
        }, 0);
      },
      error: (err: any) => {
        console.error('Error loading teachers:', err);
        this.loading = false;
        this.teachers = [];
        this.filteredTeachers = [];
        
        // Show user-friendly error message
        if (err.status === 0 || err.status === undefined) {
          console.error('Backend server is not running or not accessible. Please ensure the backend server is running on port 3001.');
        }
      }
    });
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.allSubjects = data?.data || data || [];
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        if (err.status === 0 || err.status === undefined) {
          console.error('Backend server is not running or not accessible.');
        }
      }
    });
  }

  loadClasses() {
    this.classService.getClassesPaginated(1, 100).subscribe({
      next: (data: any) => {
        this.allClasses = data?.data || data || [];
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        if (err.status === 0 || err.status === undefined) {
          console.error('Backend server is not running or not accessible.');
        }
      }
    });
  }

  filterTeachers() {
    let filtered = [...this.teachers];

    // Search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(teacher => {
        const fullName = `${teacher.firstName} ${teacher.lastName}`.toLowerCase();
        const teacherId = (teacher.teacherId || '').toLowerCase();
        const phone = (teacher.phoneNumber || '').toLowerCase();
        return fullName.includes(query) || teacherId.includes(query) || phone.includes(query);
      });
    }

    // Subject filter
    if (this.selectedSubjectFilter) {
      filtered = filtered.filter(teacher => {
        return teacher.subjects && teacher.subjects.some((s: any) => s.id === this.selectedSubjectFilter);
      });
    }

    // Class filter
    if (this.selectedClassFilter) {
      filtered = filtered.filter(teacher => {
        return teacher.classes && teacher.classes.some((c: any) => c.id === this.selectedClassFilter);
      });
    }

    this.filteredTeachers = filtered;
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedSubjectFilter = '';
    this.selectedClassFilter = '';
    this.filterTeachers();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchQuery || this.selectedSubjectFilter || this.selectedClassFilter);
  }

  viewTeacherDetails(teacher: any) {
    this.selectedTeacher = teacher;
  }

  closeTeacherDetails() {
    this.selectedTeacher = null;
  }

  editTeacher(id: string) {
    this.router.navigate([`/teachers/${id}/edit`]);
  }

  getTotalSubjects(): number {
    const subjectSet = new Set();
    this.teachers.forEach(teacher => {
      if (teacher.subjects) {
        teacher.subjects.forEach((s: any) => subjectSet.add(s.id));
      }
    });
    return subjectSet.size;
  }

  getTotalClasses(): number {
    const classSet = new Set();
    this.teachers.forEach(teacher => {
      if (teacher.classes) {
        teacher.classes.forEach((c: any) => classSet.add(c.id));
      }
    });
    return classSet.size;
  }

  getAverageSubjectsPerTeacher(): number {
    if (this.teachers.length === 0) return 0;
    const total = this.teachers.reduce((sum, teacher) => {
      return sum + (teacher.subjects ? teacher.subjects.length : 0);
    }, 0);
    return Math.round((total / this.teachers.length) * 10) / 10;
  }

  onPageChange(page: number) {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.loadTeachers(page);
  }

  onPageSizeChange(limit: number | string) {
    const parsedLimit = Number(limit);
    this.pagination.limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : this.pagination.limit;
    this.pagination.page = 1;
    this.loadTeachers(1);
  }

  deleteTeacher(id: string, teacherName: string, teacherId: string) {
    if (!confirm(`Are you sure you want to delete teacher "${teacherName}" (${teacherId})? This action cannot be undone.`)) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.teacherService.deleteTeacher(id).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Teacher deleted successfully';
        this.loading = false;
        this.loadTeachers();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error deleting teacher:', err);
        let errorMessage = 'Failed to delete teacher';
        if (err.status === 0 || err.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running.';
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
}

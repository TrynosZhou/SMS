import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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
  viewMode: 'grid' | 'list' = 'list';
  selectedTeacher: any = null;
  error = '';
  success = '';
  showTeachersPreview = false;
  schoolName = '';
  schoolAddress = '';
  schoolMotto = '';
  schoolLogo: string | null = null;
  schoolLogo2: string | null = null;
  loadingPdf = false;
  downloadingPdf = false;
  pagination = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [10, 20, 50];
  sortKey: 'teacherId' | 'lastName' | 'firstName' | 'sex' = 'lastName';
  sortDir: 'asc' | 'desc' = 'asc';

  // Edit popup properties
  showEditPopup = false;
  editingTeacher: any = null;
  editForm = {
    firstName: '',
    lastName: '',
    sex: ''
  };
  editSubmitting = false;

  constructor(
    private teacherService: TeacherService,
    private subjectService: SubjectService,
    private classService: ClassService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private settingsService: SettingsService,
    private authService: AuthService
  ) { }

  ngOnInit() {
    this.loadTeachers();
    this.loadSubjects();
    this.loadClasses();
    this.loadSchoolDetails();
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
    this.applySort();
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

  getLastName(teacher: any): string {
    const v = (teacher?.lastName || '').toString().trim();
    return v || 'N/A';
  }

  getFirstName(teacher: any): string {
    const v = (teacher?.firstName || '').toString().trim();
    return v || 'N/A';
  }

  getGender(teacher: any): string {
    const v = (teacher?.sex || teacher?.gender || '').toString().trim();
    return v || 'N/A';
  }

  setSort(key: 'teacherId' | 'lastName' | 'firstName' | 'sex') {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = 'asc';
    }
    this.applySort();
  }

  private applySort() {
    const dir = this.sortDir === 'asc' ? 1 : -1;
    const toVal = (t: any) => {
      if (this.sortKey === 'teacherId') return (t?.teacherId || '').toString().trim().toLowerCase();
      if (this.sortKey === 'lastName') return this.getLastName(t).toString().trim().toLowerCase();
      if (this.sortKey === 'firstName') return this.getFirstName(t).toString().trim().toLowerCase();
      return this.getGender(t).toString().trim().toLowerCase();
    };
    this.filteredTeachers = [...this.filteredTeachers].sort((a, b) => {
      const av = toVal(a) || '';
      const bv = toVal(b) || '';
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      const at = (a?.teacherId || '').toString().trim().toLowerCase();
      const bt = (b?.teacherId || '').toString().trim().toLowerCase();
      if (at < bt) return -1;
      if (at > bt) return 1;
      return 0;
    });
  }

  async openTeachersPreview() {
    if (!this.filteredTeachers.length) {
      return;
    }
    const element = document.getElementById('teachers-list-pdf');
    if (!element) {
      this.error = 'Teacher list content not found for PDF preview.';
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
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
    } catch (error: any) {
      this.error = error?.message || 'Failed to generate teachers PDF preview.';
      setTimeout(() => this.error = '', 7000);
    } finally {
      this.loadingPdf = false;
    }
  }

  async downloadTeachersPdf() {
    if (!this.filteredTeachers.length) {
      return;
    }
    const element = document.getElementById('teachers-list-pdf');
    if (!element) {
      this.error = 'Teacher list content not found for PDF download.';
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
      const fileName = `Teachers_List_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
    } catch (error: any) {
      this.error = error?.message || 'Failed to download teachers PDF.';
      setTimeout(() => this.error = '', 7000);
    } finally {
      this.downloadingPdf = false;
    }
  }

  viewTeacherDetails(teacher: any) {
    this.selectedTeacher = teacher;
  }

  closeTeacherDetails() {
    this.selectedTeacher = null;
  }

  editTeacher(id: string) {
    this.closeTeacherDetails();
    this.router.navigate([`/teachers/${id}/edit`]);
  }

  createTeacherAccount(teacher: any) {
    if (!teacher?.id) return;
    this.error = '';
    this.success = '';
    this.teacherService.createTeacherAccount(teacher.id).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Account created successfully';
        this.closeTeacherDetails();
        this.loadTeachers(this.pagination.page);
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to create account';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  downloadIdCard(teacher: any) {
    if (!teacher?.id) return;
    this.error = '';
    this.teacherService.getTeacherIdCardPdf(teacher.id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `teacher-id-card-${teacher.teacherId || teacher.id}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.success = 'ID card downloaded';
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to download ID card';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  previewIdCard(teacher: any) {
    if (!teacher?.id) return;
    this.error = '';
    this.teacherService.getTeacherIdCardPdf(teacher.id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to generate ID card';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadSchoolDetails() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        this.schoolName = settings.schoolName || '';
        this.schoolAddress = settings.schoolAddress || '';
        this.schoolMotto = settings.schoolMotto || '';
        this.schoolLogo = settings.schoolLogo || null;
        this.schoolLogo2 = settings.schoolLogo2 || null;
      },
      error: (err: any) => {
        console.error('Error loading school settings for teacher list:', err);
      }
    });
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

  exportTeachersToCSV() {
    if (!this.filteredTeachers.length) {
      return;
    }

    const headers = [
      'Employee Number',
      'First Name',
      'Last Name',
      'Date of Birth',
      'Gender',
      'Contact Phone',
      'Number of Classes'
    ];

    const rows = this.filteredTeachers.map(teacher => {
      const dateOfBirth = teacher.dateOfBirth
        ? new Date(teacher.dateOfBirth).toISOString().split('T')[0]
        : '';
      const classCount = teacher.classes ? teacher.classes.length : 0;

      return [
        teacher.teacherId || '',
        teacher.firstName || '',
        teacher.lastName || '',
        dateOfBirth,
        teacher.sex || '',
        teacher.phoneNumber || '',
        classCount
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row
          .map(value => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      )
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `Teachers_List_${new Date().toISOString().slice(0, 10)}.csv`;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  deleteTeacher(id: string, teacherName: string, teacherId: string) {
    if (!confirm(`Are you sure you want to delete teacher "${teacherName}" (${teacherId})? This action cannot be undone.`)) {
      return;
    }
    if (this.selectedTeacher?.id === id) {
      this.closeTeacherDetails();
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.teacherService.deleteTeacher(id).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Teacher deleted successfully';
        this.loading = false;
        this.loadTeachers(this.pagination.page);
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error deleting teacher:', err);
        console.error('Error status:', err.status, 'message:', err.error?.message || err.message);
        let errorMessage = 'Failed to delete teacher';
        if (err.status === 0 || err.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running.';
        } else if (err.status === 403) {
          errorMessage = err.error?.message || 'You do not have permission to delete teachers.';
        } else if (err.status === 404) {
          errorMessage = err.error?.message || 'Teacher not found.';
        } else if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          } else if (err.error.error) {
            errorMessage = err.error.error;
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

  // Check if user is administrator
  canEditTeachers(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  // View teacher ID card (when Employee ID is clicked)
  viewTeacherIdCard(teacher: any) {
    if (!this.canEditTeachers() || !teacher?.id) {
      return;
    }
    this.previewIdCard(teacher);
  }

  // Open edit popup for specific field
  openEditPopup(teacher: any, field: 'firstName' | 'lastName' | 'sex') {
    if (!this.canEditTeachers()) {
      return;
    }
    
    this.editingTeacher = { ...teacher, editField: field };
    this.editForm = {
      firstName: teacher.firstName || '',
      lastName: teacher.lastName || '',
      sex: teacher.sex || ''
    };
    this.showEditPopup = true;
    this.error = '';
    this.success = '';
  }

  // Close edit popup
  closeEditPopup() {
    this.showEditPopup = false;
    this.editingTeacher = null;
    this.editForm = {
      firstName: '',
      lastName: '',
      sex: ''
    };
    this.error = '';
    this.success = '';
  }

  // Save teacher changes
  saveTeacherChanges() {
    if (!this.editingTeacher || !this.editingTeacher.id) {
      this.error = 'No teacher selected for editing';
      return;
    }

    this.editSubmitting = true;
    this.error = '';
    this.success = '';

    // Only update the specific field that was clicked
    let updateData: any = {};
    
    switch (this.editingTeacher.editField) {
      case 'firstName':
        updateData.firstName = this.editForm.firstName.trim();
        break;
      case 'lastName':
        updateData.lastName = this.editForm.lastName.trim();
        break;
      case 'sex':
        updateData.sex = this.editForm.sex;
        break;
    }

    this.teacherService.updateTeacher(this.editingTeacher.id, updateData).subscribe({
      next: (response: any) => {
        this.success = 'Teacher information updated successfully';
        this.editSubmitting = false;
        
        // Update the teacher in the local array
        const index = this.teachers.findIndex(t => t.id === this.editingTeacher.id);
        if (index !== -1) {
          this.teachers[index] = { ...this.teachers[index], ...updateData };
          this.filterTeachers(); // Refresh filtered list
        }
        
        // Close popup after a short delay
        setTimeout(() => {
          this.closeEditPopup();
          this.success = '';
        }, 1500);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to update teacher information';
        this.editSubmitting = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}

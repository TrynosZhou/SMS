import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { AuthService } from '../../../services/auth.service';

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
  viewMode: 'grid' | 'list' = 'list';
  loading = false;
  error = '';
  success = '';
  selectedStudent: any = null;
  pagination = {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1
  };
  stats = {
    totalDayScholars: 0,
    totalBoarders: 0,
    classCount: 0
  };
  pageSizeOptions = [10, 20, 50, 100];
  pageTitle = 'Students';
  pageSubtitle = 'Manage and view all enrolled students';
  pageIcon = '👨‍🎓';
  filterUsesTransport = false;
  filterUsesDiningHall = false;
  isLogisticsTransport = false;
  isLogisticsDiningHall = false;
  isTeacher = false;
  groupedStudents: Array<{ group: string; students: any[] }> = [];

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private authService: AuthService
  ) { }

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    this.isTeacher = !!user && String(user.role).toLowerCase() === 'teacher';
    const logisticsMode = this.route.snapshot.data?.['logisticsMode'];
    if (logisticsMode === 'transport') {
      this.selectedType = 'Day Scholar';
      this.isLogisticsTransport = true;
      this.filterUsesTransport = true;
      this.pageTitle = 'Transport';
      this.pageSubtitle = 'Day scholar students using school transport';
      this.pageIcon = '🚌';
    } else if (logisticsMode === 'diningHall') {
      this.selectedType = 'Day Scholar';
      this.isLogisticsDiningHall = true;
      this.filterUsesDiningHall = true;
      this.pageTitle = 'Dining Hall';
      this.pageSubtitle = 'Day scholar students using dining hall meals';
      this.pageIcon = '🍽️';
    }
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
    const logisticsMode = this.route.snapshot.data?.['logisticsMode'];
    const usesTransport = this.filterUsesTransport || this.isLogisticsTransport;
    const usesDiningHall = this.filterUsesDiningHall || this.isLogisticsDiningHall;
    this.studentService.getStudentsPaginated({
      classId: this.selectedClass || undefined,
      page,
      limit: this.pagination.limit,
      search: this.searchQuery.trim() || undefined,
      studentType: this.selectedType || (logisticsMode ? 'Day Scholar' : undefined),
      usesTransport: usesTransport ? true : undefined,
      usesDiningHall: usesDiningHall ? true : undefined
    }).subscribe({
      next: (response: any) => {
        // Ensure response.data is an array
        const studentsData = response?.data;
        const studentsArray = Array.isArray(studentsData) ? studentsData : [];
        
        // Normalize class property - create new objects instead of mutating
        this.students = studentsArray.map((student: any) => {
          // Create a new object to avoid mutation issues
          const normalizedStudent = { ...student };
          // Ensure 'class' maps to 'classEntity' if needed
          if (normalizedStudent.classEntity && !normalizedStudent.class) {
            normalizedStudent.class = normalizedStudent.classEntity;
          }
          return normalizedStudent;
        });
        
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
        // Use ChangeDetectorRef to properly trigger change detection
        this.cdr.detectChanges();
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
    if (this.selectedType) {
      filtered = filtered.filter(student => {
        return (student.studentType || 'Day Scholar') === this.selectedType;
      });
    }
    if (this.selectedGender) {
      filtered = filtered.filter(student => {
        return student.gender === this.selectedGender;
      });
    }
    // Sort by Lastname ascending, then Firstname, then StudentNumber
    filtered.sort((a: any, b: any) => {
      const lastA = String(a.lastName || '').toLowerCase();
      const lastB = String(b.lastName || '').toLowerCase();
      const lastCompare = lastA.localeCompare(lastB, undefined, { sensitivity: 'base' });
      if (lastCompare !== 0) return lastCompare;
      const firstA = String(a.firstName || '').toLowerCase();
      const firstB = String(b.firstName || '').toLowerCase();
      const firstCompare = firstA.localeCompare(firstB, undefined, { sensitivity: 'base' });
      if (firstCompare !== 0) return firstCompare;
      const numA = String(a.studentNumber || '').toLowerCase();
      const numB = String(b.studentNumber || '').toLowerCase();
      return numA.localeCompare(numB);
    });
    this.filteredStudents = filtered;
    // Group by Class name (ascending)
    const byClass = new Map<string, any[]>();
    filtered.forEach(s => {
      const cls = this.getStudentClassName(s) || 'N/A';
      if (!byClass.has(cls)) byClass.set(cls, []);
      byClass.get(cls)!.push(s);
    });
    const classNames = Array.from(byClass.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
    const ordered: Array<{ group: string; students: any[] }> = [];
    classNames.forEach(name => {
      const items = byClass.get(name)!;
      items.sort((a: any, b: any) => {
        const lastA = String(a.lastName || '').toLowerCase();
        const lastB = String(b.lastName || '').toLowerCase();
        const lastCompare = lastA.localeCompare(lastB, undefined, { sensitivity: 'base' });
        if (lastCompare !== 0) return lastCompare;
        const firstA = String(a.firstName || '').toLowerCase();
        const firstB = String(b.firstName || '').toLowerCase();
        const firstCompare = firstA.localeCompare(firstB, undefined, { sensitivity: 'base' });
        if (firstCompare !== 0) return firstCompare;
        const numA = String(a.studentNumber || '').toLowerCase();
        const numB = String(b.studentNumber || '').toLowerCase();
        return numA.localeCompare(numB);
      });
      ordered.push({ group: name, students: items });
    });
    this.groupedStudents = ordered;
  }

  onSearchChange() {
    this.pagination.page = 1;
    this.loadStudents(1);
  }

  clearFilters() {
    const hadClassFilter = !!this.selectedClass;
    this.searchQuery = '';
    this.selectedClass = '';
    this.selectedType = '';
    this.selectedGender = '';
    if (!this.isLogisticsTransport && !this.isLogisticsDiningHall) {
      this.filterUsesTransport = false;
      this.filterUsesDiningHall = false;
    }
    if (hadClassFilter) {
      this.loadStudents(1);
    } else {
      this.applyFilters();
    }
  }

  hasActiveFilters(): boolean {
    return !!(
      this.searchQuery ||
      this.selectedClass ||
      this.selectedType ||
      this.selectedGender ||
      this.filterUsesTransport ||
      this.filterUsesDiningHall
    );
  }

  onLogisticsFilterChange() {
    this.pagination.page = 1;
    this.loadStudents(1);
  }

  exportToCsv() {
    const rows = (this.filteredStudents || []).map((student: any) => ({
      StudentNumber: student.studentNumber || '',
      FirstName: student.firstName || '',
      LastName: student.lastName || '',
      Class: student.class?.name || student.classEntity?.name || '',
      StudentType: student.studentType || 'Day Scholar',
      Gender: student.gender || '',
      UsesTransport: student.usesTransport ? 'Yes' : 'No',
      UsesDiningHall: student.usesDiningHall ? 'Yes' : 'No',
      Contact: student.contactNumber || student.phoneNumber || ''
    }));

    if (!rows.length) {
      window.alert('No students available to export for the current filters.');
      return;
    }

    const header = Object.keys(rows[0]);
    const csvContent = [
      header.join(','),
      ...rows.map(row =>
        header
          .map(key => {
            const value = (row as any)[key] ?? '';
            const str = String(value).replace(/"/g, '""');
            return `"${str}"`;
          })
          .join(',')
      )
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filePrefix = this.isLogisticsTransport ? 'transport' : this.isLogisticsDiningHall ? 'dining-hall' : 'students';
    a.download = `${filePrefix}-students.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  printList() {
    if (this.isLogisticsTransport || this.isLogisticsDiningHall) {
      this.downloadLogisticsReportPdf();
      return;
    }
    const rows = (this.filteredStudents || []);
    if (!rows.length) {
      window.alert('No students available to print for the current filters.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    const title = this.pageTitle || 'Students';
    const subtitle = this.pageSubtitle || '';

    const tableHeaders = [
      'Student #',
      'Name',
      'Class',
      'Type',
      'Gender',
      'Uses Transport',
      'Uses Dining Hall',
      'Contact'
    ];

    const tableRows = rows
      .map((student: any) => `
        <tr>
          <td>${student.studentNumber || ''}</td>
          <td>${student.firstName || ''} ${student.lastName || ''}</td>
          <td>${student.class?.name || student.classEntity?.name || ''}</td>
          <td>${student.studentType || 'Day Scholar'}</td>
          <td>${student.gender || ''}</td>
          <td>${student.usesTransport ? 'Yes' : 'No'}</td>
          <td>${student.usesDiningHall ? 'Yes' : 'No'}</td>
          <td>${student.contactNumber || student.phoneNumber || ''}</td>
        </tr>
      `)
      .join('');

    const html = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
            }
            h1 {
              margin: 0 0 5px 0;
              font-size: 20px;
            }
            p.subtitle {
              margin: 0 0 15px 0;
              font-size: 12px;
              color: #555;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            th, td {
              border: 1px solid #ccc;
              padding: 6px 8px;
              font-size: 12px;
              text-align: left;
            }
            th {
              background: #f0f0f0;
            }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p class="subtitle">${subtitle}</p>
          <table>
            <thead>
              <tr>
                ${tableHeaders.map(h => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  generateBusIdCards() {
    if (!this.isLogisticsTransport) {
      return;
    }

    if (!this.filteredStudents.length) {
      window.alert('No transport students available for the current filters.');
      return;
    }

    this.loading = true;
    this.error = '';

    const params: { classId?: string } = {};
    if (this.selectedClass) {
      params.classId = this.selectedClass;
    }

    this.studentService.generateTransportBusIdCards(params).subscribe({
      next: (blob: Blob) => {
        this.loading = false;
        const fileURL = window.URL.createObjectURL(blob);
        window.open(fileURL, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(fileURL), 100);
      },
      error: (err: any) => {
        this.loading = false;
        console.error('Error generating transport bus ID cards:', err);
        this.error = 'Failed to generate transport bus ID cards';
        setTimeout(() => {
          if (this.error === 'Failed to generate transport bus ID cards') {
            this.error = '';
          }
        }, 7000);
      }
    });
  }

  downloadLogisticsReportPdf() {
    if (!this.isLogisticsTransport && !this.isLogisticsDiningHall) {
      return;
    }

    if (!this.filteredStudents.length) {
      window.alert('No students available to include in the PDF report for the current filters.');
      return;
    }

    this.loading = true;
    this.error = '';

    const service: 'transport' | 'dining-hall' = this.isLogisticsTransport ? 'transport' : 'dining-hall';
    const classId = this.selectedClass || undefined;

    this.studentService.generateLogisticsReport(service, classId).subscribe({
      next: (blob: Blob) => {
        this.loading = false;
        const fileURL = window.URL.createObjectURL(blob);
        window.open(fileURL, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(fileURL), 100);
      },
      error: (err: any) => {
        this.loading = false;
        console.error('Error generating logistics PDF report:', err);
        this.error = 'Failed to generate logistics PDF report';
        setTimeout(() => {
          if (this.error === 'Failed to generate logistics PDF report') {
            this.error = '';
          }
        }, 7000);
      }
    });
  }

  viewStudentDetails(student: any) {
    // Fetch full student data with class relation to ensure class is loaded
    this.studentService.getStudentById(student.id).subscribe({
      next: (fullStudent: any) => {
        // Create a new object to avoid mutation issues
        const normalizedStudent = { ...fullStudent };
        // Ensure class information is available - check both 'class' and 'classEntity'
        if (!normalizedStudent.class && normalizedStudent.classEntity) {
          normalizedStudent.class = normalizedStudent.classEntity;
        }
        // Also ensure the student has a class - if not, try to get it from classId
        if (!normalizedStudent.class && normalizedStudent.classId) {
          const foundClass = this.classes.find(c => c.id === normalizedStudent.classId);
          if (foundClass) {
            normalizedStudent.class = foundClass;
          }
        }
        this.selectedStudent = normalizedStudent;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading student details:', err);
        // Fallback to using the student from the list, but ensure class is set
        // Create a new object to avoid mutation
        const fallbackStudent = { ...student };
        if (!fallbackStudent.class && fallbackStudent.classEntity) {
          fallbackStudent.class = fallbackStudent.classEntity;
        }
        if (!fallbackStudent.class && fallbackStudent.classId) {
          const foundClass = this.classes.find(c => c.id === fallbackStudent.classId);
          if (foundClass) {
            fallbackStudent.class = foundClass;
          }
        }
        this.selectedStudent = fallbackStudent;
        this.cdr.detectChanges();
      }
    });
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
    const request$ = this.isLogisticsTransport
      ? this.studentService.getTransportBusIdCard(studentId)
      : this.studentService.getStudentIdCard(studentId);
    request$.subscribe({
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
        this.selectedStudent = null;
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

  getStudentClassName(student: any): string {
    if (!student) return 'N/A';
    if (student.class?.name) return student.class.name;
    if (student.classEntity?.name) return student.classEntity.name;
    if (student.classId) {
      const foundClass = this.classes.find(c => c.id === student.classId);
      if (foundClass?.name) return foundClass.name;
    }
    return 'N/A';
  }
}

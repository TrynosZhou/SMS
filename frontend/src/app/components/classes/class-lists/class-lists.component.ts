import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil, timeout } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { TeacherService } from '../../../services/teacher.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';
import { buildStudentConfirmation, studentDisplayLabelFromParams } from '../../../utils/student-confirmation.util';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

type StudentViewMode = 'table' | 'cards';
type GenderFilter = 'all' | 'male' | 'female';
type TypeFilter = 'all' | 'day' | 'boarder';
type StudentEditableField = 'dob' | 'gender' | 'studentType' | 'firstName' | 'lastName';
type StudentFieldPayload = Partial<{
  dateOfBirth: string;
  gender: string;
  studentType: string;
  firstName: string;
  lastName: string;
}>;

@Component({
  standalone: false,  selector: 'app-class-lists',
  templateUrl: './class-lists.component.html',
  styleUrls: ['./class-lists.component.css']
})
export class ClassListsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly studentSearchInput$ = new Subject<string>();
  private lastBootstrapMs = 0;
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  classes: any[] = [];
  students: any[] = [];
  filteredStudents: any[] = [];
  /** Students sorted by lastName asc and grouped by gender (Female first) for display */
  studentsGroupedByGender: { gender: string; students: any[] }[] = [];
  selectedClassId = '';
  selectedTerm = '';
  availableTerms: string[] = [];
  schoolName = '';
  schoolAddress = '';
  schoolPhone = '';
  schoolEmail = '';
  schoolMotto = '';
  academicYear = '';
  // Logo used in the PDF header. Must prefer logo2 from Settings.
  schoolLogo: string | null = null;
  
  loading = false;
  loadingStudents = false;
  error = '';
  success = '';
  pageConfirmation: { type: 'success' | 'error'; title: string; message: string } | null = null;
  loadingPdf = false;
  downloadingPdf = false;
  
  // User role checks
  isAdmin = false;
  isTeacher = false;
  isSuperAdmin = false;
  isAccountant = false;
  generatedAt: Date = new Date();
  lastLoadedClassId: string | null = null;
  lastLoadedTerm: string | null = null;
  movingStudentId: string | null = null;
  moveTargetClassId: string = '';
  enrolling = false;
  showEnrollModal = false;
  classSearchQuery: string = '';
  filteredClassesList: any[] = [];
  sortField: 'lastName' | 'firstName' | 'studentNumber' = 'lastName';
  sortDirection: 'asc' | 'desc' = 'asc';
  sortBy = 'lastName';
  studentSearchQuery = '';
  genderFilter: GenderFilter = 'all';
  typeFilter: TypeFilter = 'all';
  viewMode: StudentViewMode = 'table';
  lastLoadedAt: Date | null = null;
  editingStudentId: string | null = null;
  editingField: StudentEditableField | null = null;
  tempValue: any = null;
  showEditModal = false;
  editModalField: StudentEditableField | null = null;
  editModalStudent: any | null = null;
  editModalValue: any = null;
  editModalError = '';
  savingEdit = false;
  classTeacher1FullName: string = '';
  classTeacher2FullName: string = '';
  // Class teacher editor
  showClassTeacherModal = false;
  allTeachers: any[] = [];
  filteredTeachersList: any[] = [];
  teacherSearchQuery: string = '';
  selectedClassTeacherId: string = '';
  editingClassTeacherSlot: 1 | 2 = 1;
  updatingClassTeacher = false;
  
  // Date validation
  maxDob: string = new Date().toISOString().split('T')[0];

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private teacherService: TeacherService,
    private settingsService: SettingsService,
    public authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = this.authService.isAdmin() || this.authService.hasRole('admin');
    this.isSuperAdmin = this.authService.isSuperAdmin();
    this.isTeacher = this.authService.hasRole('teacher');
    this.isAccountant = this.authService.hasRole('accountant');
  }

  /** Administrators and finance staff who may remove a student from the database. */
  canDeleteStudent(): boolean {
    const role = (this.authService.getCurrentUser()?.role || '').toLowerCase();
    return [
      'superadmin',
      'director',
      'admin',
      'headmaster',
      'deputy_headmaster',
      'accountant',
    ].includes(role);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.showEditModal && !this.savingEdit) {
      this.cancelEditModal();
    } else if (this.showClassTeacherModal && !this.updatingClassTeacher) {
      this.closeClassTeacherModal();
    } else if (this.showEnrollModal && !this.enrolling) {
      this.cancelMove();
    }
  }

  /** True if the current user can change the class teacher (admin or superadmin). */
  canEditClassTeacher(): boolean {
    return (this.isAdmin || this.isSuperAdmin) && !!this.selectedClassId;
  }

  openClassTeacherModal(slot: 1 | 2 = 1) {
    if (!this.canEditClassTeacher()) return;
    this.editingClassTeacherSlot = slot;
    this.selectedClassTeacherId = '';
    this.teacherSearchQuery = '';
    this.showClassTeacherModal = true;
    // Load teachers list if empty
    if (!this.allTeachers || this.allTeachers.length === 0) {
      this.teacherService.getTeachers().subscribe({
        next: (rows: any[]) => {
          this.allTeachers = Array.isArray(rows) ? rows : [];
          this.filteredTeachersList = [...this.allTeachers];
        },
        error: () => {
          this.allTeachers = [];
          this.filteredTeachersList = [];
        }
      });
    } else {
      this.filteredTeachersList = [...this.allTeachers];
    }
  }
  
  filterTeachers() {
    const query = (this.teacherSearchQuery || '').toLowerCase().trim();
    if (!query) {
      this.filteredTeachersList = [...this.allTeachers];
    } else {
      this.filteredTeachersList = this.allTeachers.filter(t => {
        const fullName = `${t.lastName || ''} ${t.firstName || ''}`.toLowerCase();
        const teacherId = (t.teacherId || '').toLowerCase();
        return fullName.includes(query) || teacherId.includes(query);
      });
    }
  }
  
  getTeacherInitial(t: any): string {
    const first = (t.firstName || '').charAt(0).toUpperCase();
    const last = (t.lastName || '').charAt(0).toUpperCase();
    return last + first || 'T';
  }

  closeClassTeacherModal() {
    this.showClassTeacherModal = false;
    this.selectedClassTeacherId = '';
  }

  saveClassTeacher() {
    if (!this.canEditClassTeacher() || !this.selectedClassTeacherId) return;
    this.updatingClassTeacher = true;
    
    const selectedClass = this.classes.find(c => c.id === this.selectedClassId);
    
    const payload: any = {};
    const teacherIds: string[] = [];

    if (this.editingClassTeacherSlot === 1) {
      payload.classTeacher1Id = this.selectedClassTeacherId;
      teacherIds.push(this.selectedClassTeacherId);
      if (selectedClass?.classTeacher2Id) {
        teacherIds.push(selectedClass.classTeacher2Id);
      }
    } else {
      payload.classTeacher2Id = this.selectedClassTeacherId;
      teacherIds.push(this.selectedClassTeacherId);
      if (selectedClass?.classTeacher1Id) {
        teacherIds.push(selectedClass.classTeacher1Id);
      }
    }
    
    payload.teacherIds = [...new Set(teacherIds)];

    this.classService.updateClass(this.selectedClassId, payload).subscribe({
      next: (resp: any) => {
        if (selectedClass) {
          if (this.editingClassTeacherSlot === 1) {
            selectedClass.classTeacher1Id = this.selectedClassTeacherId;
          } else {
            selectedClass.classTeacher2Id = this.selectedClassTeacherId;
          }
        }
        
        const t = this.allTeachers.find(x => x.id === this.selectedClassTeacherId);
        if (t) {
          const newName = this.resolveTeacherFullName(t);
          if (this.editingClassTeacherSlot === 1) {
            this.classTeacher1FullName = newName;
          } else {
            this.classTeacher2FullName = newName;
          }
        } else {
          this.loadClassTeacherName();
        }
        this.updatingClassTeacher = false;
        this.showClassTeacherModal = false;
      },
      error: (err: any) => {
        console.error('Failed to update class teacher:', err);
        this.error = err?.error?.message || err?.message || 'Failed to update class teacher';
        setTimeout(() => this.error = '', 5000);
        this.updatingClassTeacher = false;
      }
    });
  }

  ngOnInit() {
    this.studentSearchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.studentSearchQuery = q;
        this.applyFilters();
        this.cdr.markForCheck();
      });

    activatePageLoad(this.router, this.destroy$, '/classes/lists', () => this.bootstrapPage());
    queueMicrotask(() => this.bootstrapPage());
  }

  get hasStudentData(): boolean {
    return this.students.length > 0 || (!this.loadingStudents && this.lastLoadedAt !== null);
  }

  get dashboardStats(): {
    total: number;
    showing: number;
    male: number;
    female: number;
    day: number;
    boarder: number;
  } {
    const counts = this.getFilteredGenderCounts();
    let day = 0;
    let boarder = 0;
    this.filteredStudents.forEach((s: any) => {
      if (s.studentType === 'Boarder') boarder++;
      else day++;
    });
    return {
      total: this.students.length,
      showing: this.filteredStudents.length,
      male: counts.male,
      female: counts.female,
      day,
      boarder
    };
  }

  get genderChips(): Array<{ id: GenderFilter; label: string; count: number }> {
    let male = 0;
    let female = 0;
    this.students.forEach((s: any) => {
      const g = String(s?.gender || s?.sex || '').toLowerCase();
      if (g === 'male' || g === 'm') male++;
      else if (g === 'female' || g === 'f') female++;
    });
    return [
      { id: 'all', label: 'All', count: this.students.length },
      { id: 'female', label: 'Female', count: female },
      { id: 'male', label: 'Male', count: male }
    ];
  }

  get typeChips(): Array<{ id: TypeFilter; label: string; count: number }> {
    let day = 0;
    let boarder = 0;
    this.students.forEach((s: any) => {
      if (s.studentType === 'Boarder') boarder++;
      else day++;
    });
    return [
      { id: 'all', label: 'All types', count: this.students.length },
      { id: 'day', label: 'Day', count: day },
      { id: 'boarder', label: 'Boarder', count: boarder }
    ];
  }

  get filterSummary(): string {
    const parts: string[] = [];
    if (this.studentSearchQuery) parts.push(`Search: "${this.studentSearchQuery}"`);
    if (this.genderFilter !== 'all') parts.push(`Gender: ${this.genderFilter}`);
    if (this.typeFilter !== 'all') parts.push(`Type: ${this.typeFilter}`);
    parts.push(`${this.filteredStudents.length} of ${this.students.length} students`);
    return parts.join(' · ');
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') {
      this.success = '';
      this.pageConfirmation = null;
    } else {
      this.error = '';
      if (this.pageConfirmation?.type === 'error') {
        this.pageConfirmation = null;
      }
    }
    this.cdr.markForCheck();
  }

  private showPageConfirmation(type: 'success' | 'error', title: string, message: string): void {
    this.pageConfirmation = { type, title, message };
    if (type === 'success') {
      this.success = message;
      this.error = '';
    } else {
      this.error = message;
      this.success = '';
    }
    this.cdr.markForCheck();
  }

  onStudentSearchInput(value: string): void {
    this.studentSearchInput$.next((value || '').trim());
  }

  clearStudentSearch(): void {
    this.studentSearchQuery = '';
    this.studentSearchInput$.next('');
    this.applyFilters();
  }

  onGenderFilterChange(value: GenderFilter): void {
    this.genderFilter = value;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onTypeFilterChange(value: TypeFilter): void {
    this.typeFilter = value;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onSortByChange(value: string): void {
    const field = value as 'lastName' | 'firstName' | 'studentNumber';
    if (this.sortField !== field) {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.sortBy = field;
    this.applySort();
    this.buildGroupedByGender();
    this.cdr.markForCheck();
  }

  hasActiveFilters(): boolean {
    return !!this.studentSearchQuery || this.genderFilter !== 'all' || this.typeFilter !== 'all';
  }

  clearFilters(): void {
    this.studentSearchQuery = '';
    this.studentSearchInput$.next('');
    this.genderFilter = 'all';
    this.typeFilter = 'all';
    this.applyFilters();
    this.cdr.markForCheck();
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'table' ? 'cards' : 'table';
  }

  sortIndicator(field: string): string {
    if (this.sortField !== field) return '';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  trackByStudent(_index: number, item: any): string {
    return String(item?.id || item?.studentNumber || _index);
  }

  refreshAll(): void {
    this.loadClasses();
    this.loadTerms();
    if (this.selectedClassId && this.selectedTerm) {
      this.loadStudents();
    }
  }

  exportCsv(): void {
    const items = this.filteredStudents;
    if (!items.length) {
      this.success = 'Nothing to export';
      setTimeout(() => {
        if (this.success === 'Nothing to export') this.success = '';
        this.cdr.markForCheck();
      }, 3000);
      return;
    }
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const className = this.getSelectedClassName().replace(/\s+/g, '_');
    const header = ['Student ID', 'Last Name', 'First Name', 'DOB', 'Gender', 'Type', 'Class'];
    const lines = [header.join(',')];
    for (const s of items) {
      const dob = s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('en-GB') : '';
      lines.push(
        [
          esc(s.studentNumber),
          esc(s.lastName),
          esc(s.firstName),
          esc(dob),
          esc(s.gender),
          esc(s.studentType || 'Day Scholar'),
          esc(s.class?.name)
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Class_List_${className}_${(this.selectedTerm || 'Term').replace(/\s+/g, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.success = `Exported ${items.length} student(s) to CSV`;
    this.cdr.markForCheck();
  }

  printReport(): void {
    if (!this.filteredStudents.length) return;
    const stats = this.dashboardStats;
    const rows = this.filteredStudents
      .map(
        (s) => `
      <tr>
        <td>${this.escapeHtml(s.studentNumber || '')}</td>
        <td>${this.escapeHtml(s.lastName || '')}</td>
        <td>${this.escapeHtml(s.firstName || '')}</td>
        <td>${s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('en-GB') : ''}</td>
        <td>${this.escapeHtml(s.gender || '')}</td>
        <td>${this.escapeHtml(s.studentType || 'Day Scholar')}</td>
      </tr>`
      )
      .join('');
    const html = `
      <!DOCTYPE html><html><head><title>Class List</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; }
        h1 { font-size: 1.2rem; }
        p.meta { color: #64748b; font-size: 0.85rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.85rem; }
        th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
        th { background: #f8fafc; }
      </style></head><body>
      <h1>${this.escapeHtml(this.getSelectedClassName())} — ${this.escapeHtml(this.selectedTerm || '')}</h1>
      <p class="meta">${this.escapeHtml(this.filterSummary)} · ${stats.male} M · ${stats.female} F · Printed ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>ID</th><th>Last Name</th><th>First Name</th><th>DOB</th><th>Gender</th><th>Type</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  private escapeHtml(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapPage(): void {
    const now = Date.now();
    if (now - this.lastBootstrapMs < 400) {
      return;
    }
    this.lastBootstrapMs = now;
    this.loadClasses();
    this.loadTerms();
  }

  loadClasses() {
    this.loading = true;
    this.error = '';
    const user = this.authService.getCurrentUser();
    const isTeacher = user?.role === 'teacher';
    const isUniversalTeacher = !!(user as any)?.isUniversalTeacher;

    if (isTeacher && !isUniversalTeacher) {
      // Teachers see only their assigned classes (universal teacher sees all)
      this.teacherService.getCurrentTeacher().subscribe({
        next: (teacher: any) => {
          if (!teacher?.id) {
            this.classes = [];
            this.error = 'No teacher profile found. Please contact the administrator.';
            this.loading = false;
            return;
          }
          this.teacherService.getTeacherClasses(teacher.id).subscribe({
            next: (response: any) => {
              const classesData = response?.classes || response || [];
              this.classes = Array.isArray(classesData) ? classesData : [];
              this.classes = this.classes.filter((cls: any) => cls.isActive !== false);
              const uniqueClassesMap = new Map<string, any>();
              this.classes.forEach((classItem: any) => {
                if (classItem.id && !uniqueClassesMap.has(classItem.id)) {
                  uniqueClassesMap.set(classItem.id, classItem);
                }
              });
              this.classes = Array.from(uniqueClassesMap.values());
              this.classes.sort((a: any, b: any) => {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
              });
              if (this.classes.length === 0) {
                this.error = 'No classes assigned to you. Please contact the administrator to assign a class.';
              } else {
                this.error = '';
              }
              this.loading = false;
              this.cdr.markForCheck();
},
            error: (err) => {
              console.error('Error loading teacher classes:', err);
              this.error = 'Failed to load your assigned classes. Please try again.';
              this.classes = [];
              this.loading = false;
              this.cdr.markForCheck();
}
          });
        },
        error: (err) => {
          console.error('Error loading teacher:', err);
          this.error = 'Failed to load teacher profile. Please try again.';
          this.classes = [];
          this.loading = false;
          this.cdr.markForCheck();
}
      });
    } else {
      // Admins, superadmins, and universal teachers see all classes
      this.classService
        .getClasses()
        .pipe(
          finalize(() => {
            this.loading = false;
            this.cdr.markForCheck();
          })
        )
        .subscribe({
          next: (response: any) => {
            const classesData = Array.isArray(response) ? response : (response?.classes || response?.data || []);
            this.classes = Array.isArray(classesData) ? classesData : [];
            this.classes = this.classes.filter((cls: any) => cls.isActive !== false);
            const uniqueClassesMap = new Map<string, any>();
            this.classes.forEach((classItem: any) => {
              if (classItem.id && !uniqueClassesMap.has(classItem.id)) {
                uniqueClassesMap.set(classItem.id, classItem);
              }
            });
            this.classes = Array.from(uniqueClassesMap.values());
            this.classes.sort((a: any, b: any) => {
              const nameA = (a.name || '').toLowerCase();
              const nameB = (b.name || '').toLowerCase();
              return nameA.localeCompare(nameB);
            });
            this.error = '';
            this.cdr.markForCheck();
          },
          error: (err) => {
            console.error('Error loading classes:', err);
            this.error = 'Failed to load classes. Please try again.';
            this.cdr.markForCheck();
          }
        });
}
  }

  loadTerms() {
    this.settingsService
      .getSettings()
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
next: (settings: any) => {
        this.schoolName = settings.schoolName || '';
        this.schoolAddress = settings.schoolAddress || '';
        this.schoolPhone = settings.schoolPhone || '';
        this.schoolEmail = settings.schoolEmail || '';
        this.schoolMotto = settings.schoolMotto || '';
        this.academicYear = settings.academicYear || '';
        this.schoolLogo = settings.schoolLogo || null;

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
    this.genderFilter = 'all';
    this.typeFilter = 'all';
    this.studentSearchQuery = '';
    this.studentSearchInput$.next('');
    
    this.studentService
      .getStudents(this.selectedClassId)
      .pipe(
        finalize(() => {
          this.loadingStudents = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
      next: (response: any) => {
        const studentsData = Array.isArray(response) ? response : (response?.data || response?.students || []);
        this.students = Array.isArray(studentsData) ? studentsData : [];
        this.studentSearchQuery = '';
        this.filteredStudents = [...this.students];
        this.applySort();
        this.buildGroupedByGender();
        
        this.lastLoadedClassId = this.selectedClassId;
        this.lastLoadedTerm = this.selectedTerm;
        this.lastLoadedAt = new Date();
        this.generatedAt = new Date();
        this.loadClassTeacherName();

        if (this.filteredStudents.length === 0) {
          this.error = 'No students found in the selected class for this term.';
        } else {
          this.success = `Successfully loaded ${this.filteredStudents.length} student(s) from the selected class.`;
        }
      },
      error: (err) => {
        console.error('Error loading students:', err);
        this.error = 'Failed to load students. Please try again.';
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
    this.loadClassTeacherName();
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

  /** Gender counts for the current filtered list (for stats strip). */
  getFilteredGenderCounts(): { male: number; female: number } {
    let male = 0, female = 0;
    this.filteredStudents.forEach((s: any) => {
      const g = String(s?.gender || s?.sex || '').toLowerCase();
      if (g === 'male' || g === 'm') male++;
      else if (g === 'female' || g === 'f') female++;
    });
    return { male, female };
  }

  canMoveStudent(): boolean {
    return this.isAdmin || this.isSuperAdmin || this.isTeacher;
  }

  startMove(student: any) {
    if (!this.canMoveStudent()) return;
    this.movingStudentId = student.id;
    this.moveTargetClassId = '';
    this.classSearchQuery = '';
    this.filteredClassesList = [...this.classes];
    this.showEnrollModal = true;
  }

  cancelMove() {
    this.movingStudentId = null;
    this.moveTargetClassId = '';
    this.classSearchQuery = '';
    this.showEnrollModal = false;
  }
  
  filterClasses() {
    const query = (this.classSearchQuery || '').toLowerCase().trim();
    if (!query) {
      this.filteredClassesList = [...this.classes];
    } else {
      this.filteredClassesList = this.classes.filter(cls => {
        const name = (cls.name || '').toLowerCase();
        const teacherName = (cls.teacherName || '').toLowerCase();
        return name.includes(query) || teacherName.includes(query);
      });
    }
  }
  
  getMovingStudent(): any {
    if (!this.movingStudentId) return null;
    return this.students.find(s => s.id === this.movingStudentId);
  }
  
  getMovingStudentInitial(): string {
    const student = this.getMovingStudent();
    if (!student) return '?';
    const first = (student.firstName || '').charAt(0).toUpperCase();
    const last = (student.lastName || '').charAt(0).toUpperCase();
    return first + last || '?';
  }
  
  getMovingStudentName(): string {
    const student = this.getMovingStudent();
    if (!student) return 'Unknown Student';
    return `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown';
  }
  
  getMovingStudentNumber(): string {
    const student = this.getMovingStudent();
    return student?.studentNumber || 'N/A';
  }
  
  getTargetClassName(): string {
    if (!this.moveTargetClassId) return '';
    const cls = this.classes.find(c => c.id === this.moveTargetClassId);
    return cls?.name || '';
  }

  confirmEnroll() {
    if (!this.movingStudentId || !this.moveTargetClassId) return;
    if (this.moveTargetClassId === this.selectedClassId) return;
    
    this.enrolling = true;
    this.error = '';
    this.success = '';
    
    // Use the dedicated enrollStudent method for moving students between classes
    this.studentService.enrollStudent(this.movingStudentId, this.moveTargetClassId).subscribe({
      next: (res: any) => {
        this.success = res?.message || 'Student moved to new class successfully.';
        this.enrolling = false;
        const movedId = this.movingStudentId;
        this.cancelMove();
        this.showEnrollModal = false;
        // Refresh current class list so moved student disappears
        this.loadStudents();
        // Remove moved student from local list
        this.students = this.students.filter(s => s.id !== movedId);
        this.filteredStudents = this.filteredStudents.filter(s => s.id !== movedId);
        this.applySearchFilter();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Failed to move student:', err);
        this.error = err?.error?.message || err?.message || 'Failed to move student to new class.';
        this.enrolling = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  /** Apply search and chip filters, then sort and group. */
  applyFilters(): void {
    const q = (this.studentSearchQuery || '').trim().toLowerCase();
    this.filteredStudents = this.students.filter((s: any) => {
      if (q) {
        const num = String(s.studentNumber || '').toLowerCase();
        const first = String(s.firstName || '').toLowerCase();
        const last = String(s.lastName || '').toLowerCase();
        const full = `${last} ${first}`.trim();
        if (!num.includes(q) && !first.includes(q) && !last.includes(q) && !full.includes(q)) {
          return false;
        }
      }
      if (this.genderFilter !== 'all') {
        const g = String(s?.gender || s?.sex || '').toLowerCase();
        if (this.genderFilter === 'male' && g !== 'male' && g !== 'm') return false;
        if (this.genderFilter === 'female' && g !== 'female' && g !== 'f') return false;
      }
      if (this.typeFilter === 'day' && s.studentType === 'Boarder') return false;
      if (this.typeFilter === 'boarder' && s.studentType !== 'Boarder') return false;
      return true;
    });
    this.applySort();
    this.buildGroupedByGender();
  }

  applySearchFilter(): void {
    this.applyFilters();
  }

  changeSort(field: 'lastName' | 'firstName' | 'studentNumber') {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.sortBy = field;
    this.applySort();
    this.buildGroupedByGender();
  }

  getSortDirection(field: 'lastName' | 'firstName' | 'studentNumber'): 'asc' | 'desc' | '' {
    return this.sortField === field ? this.sortDirection : '';
  }

  private applySort() {
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    const compareText = (a: string, b: string) => a.localeCompare(b) * dir;
    const getVal = (s: any, key: 'lastName' | 'firstName' | 'studentNumber') =>
      String((s?.[key] || '')).toLowerCase();
    this.filteredStudents.sort((a: any, b: any) => {
      // Primary field
      const primary = compareText(getVal(a, this.sortField), getVal(b, this.sortField));
      if (primary !== 0) return primary;
      // Tie-breakers
      if (this.sortField === 'lastName') {
        const t1 = compareText(getVal(a, 'firstName'), getVal(b, 'firstName'));
        if (t1 !== 0) return t1;
        return compareText(getVal(a, 'studentNumber'), getVal(b, 'studentNumber'));
      }
      if (this.sortField === 'firstName') {
        const t1 = compareText(getVal(a, 'lastName'), getVal(b, 'lastName'));
        if (t1 !== 0) return t1;
        return compareText(getVal(a, 'studentNumber'), getVal(b, 'studentNumber'));
      }
      // studentNumber
      const t1 = compareText(getVal(a, 'lastName'), getVal(b, 'lastName'));
      if (t1 !== 0) return t1;
      return compareText(getVal(a, 'firstName'), getVal(b, 'firstName'));
    });
  }

  /** Build list sorted by lastName ascending and grouped by gender (Female first). */
  private buildGroupedByGender() {
    const sorted = [...this.filteredStudents].sort((a: any, b: any) => {
      const lastA = String((a?.lastName || '')).toLowerCase();
      const lastB = String((b?.lastName || '')).toLowerCase();
      const cmp = lastA.localeCompare(lastB, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      const firstA = String((a?.firstName || '')).toLowerCase();
      const firstB = String((b?.firstName || '')).toLowerCase();
      return firstA.localeCompare(firstB, undefined, { sensitivity: 'base' });
    });
    const byGender = new Map<string, any[]>();
    sorted.forEach(s => {
      const g = (s.gender || s.sex || 'Other').trim() || 'Other';
      if (!byGender.has(g)) byGender.set(g, []);
      byGender.get(g)!.push(s);
    });
    const genderOrder = ['Female', 'F', 'Male', 'M'];
    const ordered: { gender: string; students: any[] }[] = [];
    const seen = new Set<string>();
    genderOrder.forEach(g => {
      const key = g.trim();
      if (byGender.has(key)) {
        seen.add(key);
        ordered.push({ gender: key, students: byGender.get(key)! });
      }
    });
    Array.from(byGender.keys())
      .filter(k => !seen.has(k))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .forEach(k => ordered.push({ gender: k, students: byGender.get(k)! }));
    this.studentsGroupedByGender = ordered;
  }

  canEditField(field: 'dob' | 'gender' | 'studentType' | 'firstName' | 'lastName'): boolean {
    if (field === 'studentType' || field === 'firstName' || field === 'lastName') {
      return this.isAdmin || this.isSuperAdmin || this.isAccountant || this.isTeacher;
    }
    return this.isAdmin || this.isSuperAdmin || this.isAccountant || this.isTeacher;
  }

  private formatDateForInput(value: any): string {
    if (!value) return '';
    const d = typeof value === 'string' ? new Date(value) : value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  isEditing(studentId: string, field: 'dob' | 'gender' | 'studentType'): boolean {
    return this.editingStudentId === studentId && this.editingField === field;
  }

  startEdit(student: any, field: 'dob' | 'gender' | 'studentType' | 'firstName' | 'lastName') {
    if (!this.canEditField(field)) return;
    this.editingStudentId = student.id;
    this.editingField = field;
    if (field === 'dob') {
      this.tempValue = this.formatDateForInput(student.dateOfBirth || null);
    } else if (field === 'gender') {
      this.tempValue = student.gender || '';
    } else if (field === 'studentType') {
      this.tempValue = student.studentType || 'Day Scholar';
    } else if (field === 'firstName') {
      this.tempValue = student.firstName || '';
    } else if (field === 'lastName') {
      this.tempValue = student.lastName || '';
    }
  }

  cancelEdit() {
    this.editingStudentId = null;
    this.editingField = null;
    this.tempValue = null;
  }

  saveEdit(student: any, field?: 'dob' | 'gender' | 'studentType' | 'firstName' | 'lastName') {
    const activeField = field || this.editingField;
    if (!activeField || this.editingStudentId !== student.id) {
      this.cancelEdit();
      return;
    }
    if (!this.canEditField(activeField)) {
      this.error = 'You do not have permission to edit this field.';
      this.cancelEdit();
      return;
    }
    const payload = this.buildStudentFieldPayload(activeField, this.tempValue);
    this.error = '';
    this.success = '';
    this.submitStudentFieldEdit(student, activeField, payload, {
      onSuccess: () => this.cancelEdit(),
      onError: () => this.cancelEdit()
    });
  }

  openEditModal(student: any, field: 'dob' | 'gender' | 'studentType' | 'firstName' | 'lastName') {
    if (!this.canEditField(field)) return;
    this.editModalStudent = student;
    this.editModalField = field;
    this.editModalError = '';
    if (field === 'dob') {
      this.editModalValue = this.formatDateForInput(student.dateOfBirth || null);
    } else if (field === 'gender') {
      this.editModalValue = student.gender || '';
    } else if (field === 'studentType') {
      this.editModalValue = student.studentType || 'Day Scholar';
    } else if (field === 'firstName') {
      this.editModalValue = student.firstName || '';
    } else if (field === 'lastName') {
      this.editModalValue = student.lastName || '';
    }
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  cancelEditModal() {
    this.showEditModal = false;
    this.editModalField = null;
    this.editModalStudent = null;
    this.editModalValue = null;
    this.editModalError = '';
    this.savingEdit = false;
    this.cdr.detectChanges();
  }

  saveEditModal() {
    if (!this.editModalStudent || !this.editModalField || this.savingEdit) {
      return;
    }
    if (!this.canEditField(this.editModalField)) {
      this.editModalError = 'You do not have permission to edit this field.';
      this.cdr.detectChanges();
      return;
    }
    const field = this.editModalField;
    const payload = this.buildStudentFieldPayload(field, this.editModalValue);
    if (field === 'firstName' && !payload.firstName) {
      this.editModalError = 'First name is required.';
      this.cdr.detectChanges();
      return;
    }
    if (field === 'lastName' && !payload.lastName) {
      this.editModalError = 'Last name is required.';
      this.cdr.detectChanges();
      return;
    }

    this.editModalError = '';
    this.error = '';
    this.success = '';
    this.submitStudentFieldEdit(this.editModalStudent, field, payload, {
      onSuccess: () => this.cancelEditModal(),
      onError: () => {
        /* keep modal open; error shown in editModalError */
      }
    });
  }

  private buildStudentFieldPayload(
    field: StudentEditableField,
    value: any
  ): StudentFieldPayload {
    const payload: StudentFieldPayload = {};
    if (field === 'dob') {
      payload.dateOfBirth = value || '';
    } else if (field === 'gender') {
      payload.gender = value || '';
    } else if (field === 'studentType') {
      payload.studentType = value || 'Day Scholar';
    } else if (field === 'firstName') {
      payload.firstName = String(value || '').trim();
    } else if (field === 'lastName') {
      payload.lastName = String(value || '').trim();
    }
    return payload;
  }

  private applyStudentFieldUpdate(
    student: any,
    field: StudentEditableField,
    payload: StudentFieldPayload
  ): void {
    if (field === 'dob') {
      student.dateOfBirth = payload.dateOfBirth ? new Date(payload.dateOfBirth) : null;
    } else if (field === 'gender') {
      student.gender = payload.gender;
    } else if (field === 'studentType') {
      student.studentType = payload.studentType;
    } else if (field === 'firstName') {
      student.firstName = payload.firstName;
    } else if (field === 'lastName') {
      student.lastName = payload.lastName;
    }
    if (field === 'gender' || field === 'firstName' || field === 'lastName') {
      this.applySort();
      this.buildGroupedByGender();
    }
  }

  private submitStudentFieldEdit(
    student: any,
    field: StudentEditableField,
    payload: StudentFieldPayload,
    hooks: { onSuccess: () => void; onError: () => void }
  ): void {
    if (!student?.id) {
      this.editModalError = 'Student record is missing. Refresh the page and try again.';
      this.error = this.editModalError;
      this.cdr.detectChanges();
      return;
    }

    this.savingEdit = true;
    this.cdr.detectChanges();

    this.studentService
      .updateStudent(student.id, payload)
      .pipe(
        timeout(60000),
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingEdit = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: () => {
          this.applyStudentFieldUpdate(student, field, payload);
          const parts = buildStudentConfirmation('updated', { student });
          this.showPageConfirmation('success', parts.title, parts.message);
          hooks.onSuccess();
        },
        error: (err: any) => {
          let msg = 'Failed to save.';
          if (err?.name === 'TimeoutError') {
            msg = 'Request timed out. Check that the backend is running and try again.';
          } else if (err?.error?.message) {
            msg = err.error.message;
          } else if (typeof err?.error === 'string') {
            msg = err.error;
          } else if (err?.message) {
            msg = err.message;
          }
          this.editModalError = msg;
          this.error = msg;
          hooks.onError();
          setTimeout(() => {
            if (this.error) {
              this.error = '';
              this.cdr.detectChanges();
            }
          }, 6000);
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
        setTimeout(() => window.URL.revokeObjectURL(fileURL), 60000);
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
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3000.';
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

  private resolveTeacherFullName(teacher: any): string {
    if (!teacher) return '';
    const fn = (teacher.firstName || '').toString().trim();
    const ln = (teacher.lastName || '').toString().trim();
    return [ln, fn].filter(Boolean).join(' ').trim();
  }

  private resolveClassTeacherNamesFromClass(cls: any): { teacher1: string; teacher2: string } {
    if (!cls) return { teacher1: '', teacher2: '' };

    const t1 = cls.classTeacher1 || null;
    const t2 = cls.classTeacher2 || null;

    const teacher1 = this.resolveTeacherFullName(t1);
    const teacher2 = this.resolveTeacherFullName(t2);

    return { teacher1, teacher2 };
  }

  loadClassTeacherName() {
    this.classTeacher1FullName = '';
    this.classTeacher2FullName = '';
    const selected = this.classes.find(c => c.id === this.selectedClassId);
    const fromList = this.resolveClassTeacherNamesFromClass(selected);
    if (fromList.teacher1 || fromList.teacher2) {
      this.classTeacher1FullName = fromList.teacher1;
      this.classTeacher2FullName = fromList.teacher2;
      return;
    }
    if (this.selectedClassId) {
      this.classService.getClassById(this.selectedClassId).subscribe({
        next: (cls: any) => {
          const names = this.resolveClassTeacherNamesFromClass(cls);
          this.classTeacher1FullName = names.teacher1;
          this.classTeacher2FullName = names.teacher2;
        },
        error: () => {
          this.classTeacher1FullName = '';
          this.classTeacher2FullName = '';
        }
      });
    }
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
      element.classList.add('pdf-mode');
      await new Promise(resolve => setTimeout(resolve, 50));
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
      element.classList.remove('pdf-mode');
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
      element.classList.add('pdf-mode');
      await new Promise(resolve => setTimeout(resolve, 50));
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
      element.classList.remove('pdf-mode');
      this.downloadingPdf = false;
    }
  }

  deleteStudent(id: string, studentName: string, studentNumber: string) {
    if (!this.canDeleteStudent()) {
      this.error = 'You do not have permission to delete students.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    if (!id) {
      this.error = 'Student record is missing an ID. Refresh the list and try again.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    const displayName = (studentName || '').trim() || 'Student';
    const displayNumber = studentNumber || 'N/A';
    const confirmed = confirm(
      `Are you sure you want to delete "${displayName}" (${displayNumber})?\n` +
      `This will also delete related marks, invoices and the associated user account.\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.studentService.deleteStudent(id).subscribe({
      next: (data: any) => {
        const parts = buildStudentConfirmation('deleted', {
          displayName: studentDisplayLabelFromParams(displayName, displayNumber),
        });
        this.showPageConfirmation('success', parts.title, data?.message || parts.message);
        this.loading = false;
        this.students = this.students.filter((s) => s.id !== id);
        this.applyFilters();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error('Error deleting student:', err);
        let errorMessage = 'Failed to delete student';
        if (err?.status === 0 || err?.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3000.';
        } else if (err?.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err?.message) {
          errorMessage = err.message;
        }
        this.error = errorMessage;
        this.loading = false;
        setTimeout(() => {
          if (this.error) this.error = '';
        }, 5000);
      }
    });
  }
}


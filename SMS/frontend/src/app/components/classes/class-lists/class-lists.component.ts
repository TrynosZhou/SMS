import { Component, OnInit } from '@angular/core';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { TeacherService } from '../../../services/teacher.service';
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
  sortField: 'lastName' | 'firstName' | 'studentNumber' = 'lastName';
  sortDirection: 'asc' | 'desc' = 'asc';
  /** Search filter for student name or ID */
  studentSearchQuery = '';
  editingStudentId: string | null = null;
  editingField: 'dob' | 'gender' | 'studentType' | 'firstName' | 'lastName' | null = null;
  tempValue: any = null;
  showEditModal = false;
  editModalField: 'dob' | 'gender' | 'studentType' | 'firstName' | 'lastName' | null = null;
  editModalStudent: any | null = null;
  editModalValue: any = null;
  savingEdit = false;
  classTeacherFullName: string = '';
  // Class teacher editor
  showClassTeacherModal = false;
  allTeachers: any[] = [];
  selectedClassTeacherId: string = '';
  updatingClassTeacher = false;

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private teacherService: TeacherService,
    private settingsService: SettingsService,
    public authService: AuthService
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin') : false;
    this.isSuperAdmin = user ? (user.role === 'superadmin') : false;
    this.isTeacher = user ? (user.role === 'teacher') : false;
    this.isAccountant = user ? (user.role === 'accountant') : false;
  }

  /** True if the current user can change the class teacher (admin or superadmin). */
  canEditClassTeacher(): boolean {
    return (this.isAdmin || this.isSuperAdmin) && !!this.selectedClassId;
  }

  openClassTeacherModal() {
    if (!this.canEditClassTeacher()) return;
    this.selectedClassTeacherId = '';
    this.showClassTeacherModal = true;
    // Load teachers list if empty
    if (!this.allTeachers || this.allTeachers.length === 0) {
      this.teacherService.getTeachers().subscribe({
        next: (rows: any[]) => {
          this.allTeachers = Array.isArray(rows) ? rows : [];
        },
        error: () => {
          this.allTeachers = [];
        }
      });
    }
  }

  closeClassTeacherModal() {
    this.showClassTeacherModal = false;
    this.selectedClassTeacherId = '';
  }

  saveClassTeacher() {
    if (!this.canEditClassTeacher() || !this.selectedClassTeacherId) return;
    this.updatingClassTeacher = true;
    this.classService.updateClass(this.selectedClassId, { teacherIds: [this.selectedClassTeacherId] }).subscribe({
      next: (resp: any) => {
        // Update UI label
        const t = this.allTeachers.find(x => x.id === this.selectedClassTeacherId);
        if (t) {
          const ln = String(t.lastName || '').trim();
          const fn = String(t.firstName || '').trim();
          this.classTeacherFullName = [ln, fn].filter(Boolean).join(' ').trim() || 'Teacher';
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
            },
            error: (err) => {
              console.error('Error loading teacher classes:', err);
              this.error = 'Failed to load your assigned classes. Please try again.';
              this.classes = [];
              this.loading = false;
            }
          });
        },
        error: (err) => {
          console.error('Error loading teacher:', err);
          this.error = 'Failed to load teacher profile. Please try again.';
          this.classes = [];
          this.loading = false;
        }
      });
    } else {
      // Admins, superadmins, and universal teachers see all classes
      this.classService.getClasses().subscribe({
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
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading classes:', err);
          this.error = 'Failed to load classes. Please try again.';
          this.loading = false;
        }
      });
    }
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
        // Prefer secondary logo (schoolLogo2) for printable reports such as class lists.
        // Fallback to primary logo if logo2 is not configured.
        this.schoolLogo = settings.schoolLogo2 || settings.schoolLogo || null;

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
        this.studentSearchQuery = '';
        this.filteredStudents = [...this.students];
        this.applySort();
        this.buildGroupedByGender();
        
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

  /** Apply search filter and rebuild grouped list. */
  applySearchFilter() {
    const q = (this.studentSearchQuery || '').trim().toLowerCase();
    if (!q) {
      this.filteredStudents = [...this.students];
    } else {
      this.filteredStudents = this.students.filter((s: any) => {
        const num = String(s.studentNumber || '').toLowerCase();
        const first = String(s.firstName || '').toLowerCase();
        const last = String(s.lastName || '').toLowerCase();
        const full = `${last} ${first}`.trim();
        return num.includes(q) || first.includes(q) || last.includes(q) || full.includes(q);
      });
    }
    this.applySort();
    this.buildGroupedByGender();
  }

  changeSort(field: 'lastName' | 'firstName' | 'studentNumber') {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
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
    const payload: any = {};
    if (activeField === 'dob') {
      payload.dateOfBirth = this.tempValue || '';
    } else if (activeField === 'gender') {
      payload.gender = this.tempValue || '';
    } else if (activeField === 'studentType') {
      payload.studentType = this.tempValue || 'Day Scholar';
    } else if (activeField === 'firstName') {
      payload.firstName = String(this.tempValue || '').trim();
    } else if (activeField === 'lastName') {
      payload.lastName = String(this.tempValue || '').trim();
    }
    this.error = '';
    this.success = '';
    this.studentService.updateStudent(student.id, payload).subscribe({
      next: (updated: any) => {
        if (activeField === 'dob') {
          student.dateOfBirth = payload.dateOfBirth ? new Date(payload.dateOfBirth) : null;
        } else if (activeField === 'gender') {
          student.gender = payload.gender;
        } else if (activeField === 'studentType') {
          student.studentType = payload.studentType;
        } else if (activeField === 'firstName') {
          student.firstName = payload.firstName;
        } else if (activeField === 'lastName') {
          student.lastName = payload.lastName;
        }
        if (activeField === 'gender' || activeField === 'firstName' || activeField === 'lastName') {
          this.applySort();
          this.buildGroupedByGender();
        }
        this.success = 'Saved successfully.';
        this.cancelEdit();
        setTimeout(() => {
          if (this.success) this.success = '';
        }, 4000);
      },
      error: (err: any) => {
        let msg = 'Failed to save.';
        if (err?.error?.message) msg = err.error.message;
        else if (typeof err?.error === 'string') msg = err.error;
        this.error = msg;
        this.cancelEdit();
        setTimeout(() => {
          if (this.error) this.error = '';
        }, 6000);
      }
    });
  }

  openEditModal(student: any, field: 'dob' | 'gender' | 'studentType' | 'firstName' | 'lastName') {
    if (!this.canEditField(field)) return;
    this.editModalStudent = student;
    this.editModalField = field;
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
  }

  cancelEditModal() {
    this.showEditModal = false;
    this.editModalField = null;
    this.editModalStudent = null;
    this.editModalValue = null;
    this.savingEdit = false;
  }

  saveEditModal() {
    if (!this.editModalStudent || !this.editModalField) {
      this.cancelEditModal();
      return;
    }
    if (!this.canEditField(this.editModalField)) {
      this.error = 'You do not have permission to edit this field.';
      this.cancelEditModal();
      return;
    }
    const payload: any = {};
    if (this.editModalField === 'dob') {
      payload.dateOfBirth = this.editModalValue || '';
    } else if (this.editModalField === 'gender') {
      payload.gender = this.editModalValue || '';
    } else if (this.editModalField === 'studentType') {
      payload.studentType = this.editModalValue || 'Day Scholar';
    } else if (this.editModalField === 'firstName') {
      payload.firstName = String(this.editModalValue || '').trim();
    } else if (this.editModalField === 'lastName') {
      payload.lastName = String(this.editModalValue || '').trim();
    }
    this.savingEdit = true;
    this.error = '';
    this.success = '';
    this.studentService.updateStudent(this.editModalStudent.id, payload).subscribe({
      next: () => {
        if (this.editModalField === 'dob') {
          this.editModalStudent.dateOfBirth = payload.dateOfBirth ? new Date(payload.dateOfBirth) : null;
        } else if (this.editModalField === 'gender') {
          this.editModalStudent.gender = payload.gender;
        } else if (this.editModalField === 'studentType') {
          this.editModalStudent.studentType = payload.studentType;
        } else if (this.editModalField === 'firstName') {
          this.editModalStudent.firstName = payload.firstName;
        } else if (this.editModalField === 'lastName') {
          this.editModalStudent.lastName = payload.lastName;
        }
        if (this.editModalField === 'gender' || this.editModalField === 'firstName' || this.editModalField === 'lastName') {
          this.applySort();
          this.buildGroupedByGender();
        }
        this.success = 'Saved successfully.';
        this.savingEdit = false;
        this.cancelEditModal();
        setTimeout(() => {
          if (this.success) this.success = '';
        }, 4000);
      },
      error: (err: any) => {
        let msg = 'Failed to save.';
        if (err?.error?.message) msg = err.error.message;
        else if (typeof err?.error === 'string') msg = err.error;
        this.error = msg;
        this.savingEdit = false;
        this.cancelEditModal();
        setTimeout(() => {
          if (this.error) this.error = '';
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

  private resolveClassTeacherNameFromClass(cls: any): string {
    if (!cls) return '';
    
    // Strictly use classTeacher1 (Home Class Teacher) as assigned by the administrator
    if (cls.classTeacher1 && (cls.classTeacher1.firstName || cls.classTeacher1.lastName)) {
      const fn = (cls.classTeacher1.firstName || '').toString().trim();
      const ln = (cls.classTeacher1.lastName || '').toString().trim();
      return [fn, ln].filter(Boolean).join(' ').trim();
    }
    
    // Legacy/Fallback checks
    if (cls.classTeacher && (cls.classTeacher.firstName || cls.classTeacher.lastName)) {
      const fn = (cls.classTeacher.firstName || '').toString().trim();
      const ln = (cls.classTeacher.lastName || '').toString().trim();
      return [fn, ln].filter(Boolean).join(' ').trim();
    }
    if (cls.teacher && (cls.teacher.firstName || cls.teacher.lastName)) {
      const fn = (cls.teacher.firstName || '').toString().trim();
      const ln = (cls.teacher.lastName || '').toString().trim();
      return [fn, ln].filter(Boolean).join(' ').trim();
    }
    
    const teachers = Array.isArray(cls.teachers) ? cls.teachers : [];
    if (teachers.length > 0) {
      // If teachers are sorted alphabetically, this could pick the wrong one
      // but we only reach here if classTeacher1 is not assigned.
      const t = teachers[0] || {};
      const fn = (t.firstName || '').toString().trim();
      const ln = (t.lastName || '').toString().trim();
      return [fn, ln].filter(Boolean).join(' ').trim();
    }
    return '';
    }

  loadClassTeacherName() {
    this.classTeacherFullName = '';
    const selected = this.classes.find(c => c.id === this.selectedClassId);
    const fromList = this.resolveClassTeacherNameFromClass(selected);
    if (fromList) {
      this.classTeacherFullName = fromList;
      return;
    }
    if (this.selectedClassId) {
      this.classService.getClassById(this.selectedClassId).subscribe({
        next: (cls: any) => {
          this.classTeacherFullName = this.resolveClassTeacherNameFromClass(cls);
        },
        error: () => {
          this.classTeacherFullName = '';
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
    if (!this.isAdmin) {
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
        this.success = data?.message || 'Student deleted successfully';
        this.loading = false;
        // Reload the list for the current class/term
        this.loadStudents();
        setTimeout(() => {
          if (this.success) this.success = '';
        }, 5000);
      },
      error: (err: any) => {
        console.error('Error deleting student:', err);
        let errorMessage = 'Failed to delete student';
        if (err?.status === 0 || err?.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
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


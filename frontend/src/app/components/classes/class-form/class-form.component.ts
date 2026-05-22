import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ClassService } from '../../../services/class.service';
import { TeacherService } from '../../../services/teacher.service';
import { SubjectService } from '../../../services/subject.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  standalone: false,  selector: 'app-class-form',
templateUrl: './class-form.component.html',
  styleUrls: ['./class-form.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0, transform: 'translateY(-10px)' })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ])
  ]
})
export class ClassFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loadError = '';
  classItem: any = {
    name: '',
    form: '',
    description: '',
    isActive: true
  };
  isEdit = false;
  error = '';
  success = '';
  submitting = false;
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();
  
  // Teachers
  teachers: any[] = [];
  filteredTeachers: any[] = [];
  selectedTeacherIds: string[] = [];
  teacherSearchQuery = '';
  loadingTeachers = false;
  
  // Subjects
  subjects: any[] = [];
  filteredSubjects: any[] = [];
  selectedSubjectIds: string[] = [];
  subjectSearchQuery = '';
  loadingSubjects = false;
  
  // Form suggestions
  formSuggestions = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
  formSuggestionsId = 'formSuggestions';

  get pageTitle(): string {
    return this.isEdit ? 'Edit class' : 'Create new class';
  }

  get assignmentsLoading(): boolean {
    return this.loadingTeachers || this.loadingSubjects;
  }

  get formCompletion(): number {
    let score = 0;
    if (this.classItem.name?.trim()) score += 40;
    if (this.classItem.form?.trim()) score += 40;
    if (this.classItem.description?.trim()) score += 10;
    if (this.selectedTeacherIds.length) score += 5;
    if (this.selectedSubjectIds.length) score += 5;
    return Math.min(100, score);
  }

  get formStats(): { teachers: number; subjects: number; completion: number } {
    return {
      teachers: this.selectedTeacherIds.length,
      subjects: this.selectedSubjectIds.length,
      completion: this.formCompletion
    };
  }

  constructor(
    private classService: ClassService,
    private teacherService: TeacherService,
    private subjectService: SubjectService,
    private route: ActivatedRoute,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit = true;
      this.loadClass(id);
    } else {
      this.loadTeachersAndSubjects();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Ensure API result is always an array (handles paginated or malformed responses). */
  private normalizeList(data: unknown): any[] {
    if (!data) {
      return [];
    }
    if (Array.isArray(data)) {
      return data;
    }
    if (typeof data === 'object' && data !== null && Array.isArray((data as { data?: unknown }).data)) {
      return (data as { data: any[] }).data;
    }
    return [];
  }

  loadClass(id: string) {
    this.classService
      .getClassById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any) => {
          this.classItem = data;
          if (data.teachers) {
            this.selectedTeacherIds = data.teachers.map((t: any) => t.id);
          }
          if (data.subjects) {
            this.selectedSubjectIds = data.subjects.map((s: any) => s.id);
          }
          this.loadTeachersAndSubjects();
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = 'Failed to load class';
          setTimeout(() => (this.error = ''), 5000);
          this.cdr.markForCheck();
        }
      });
  }

  loadTeachersAndSubjects(): void {
    this.loadingTeachers = true;
    this.loadingSubjects = true;
    this.loadError = '';
    this.cdr.markForCheck();

    forkJoin({
      teachers: this.teacherService.getTeachers(1, 500).pipe(
        catchError((err) => {
          console.error('Error loading teachers:', err);
          return of([]);
        })
      ),
      subjects: this.subjectService.getSubjects().pipe(
        catchError((err) => {
          console.error('Error loading subjects:', err);
          return of([]);
        })
      )
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingTeachers = false;
          this.loadingSubjects = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: ({ teachers, subjects }) => {
          try {
            this.teachers = this.normalizeList(teachers).filter((t: any) => t.isActive !== false);
            this.filteredTeachers = [...this.teachers];
            this.subjects = this.normalizeList(subjects).filter((s: any) => s.isActive !== false);
            this.filteredSubjects = [...this.subjects];
          } catch (e) {
            console.error('Error processing teachers/subjects:', e);
            this.teachers = [];
            this.filteredTeachers = [];
            this.subjects = [];
            this.filteredSubjects = [];
            this.loadError = 'Could not display teachers or subjects. Please try again.';
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.teachers = [];
          this.filteredTeachers = [];
          this.subjects = [];
          this.filteredSubjects = [];
          this.loadError =
            err?.name === 'TimeoutError'
              ? 'Loading timed out. Check that the backend is running and try again.'
              : 'Failed to load teachers and subjects.';
          this.cdr.markForCheck();
        }
      });
  }

  clearAlert(kind: 'success' | 'error' | 'load'): void {
    if (kind === 'success') this.success = '';
    else if (kind === 'error') this.error = '';
    else this.loadError = '';
  }

  applyFormSuggestion(value: string): void {
    this.classItem.form = value;
    this.touchedFields.add('form');
    this.validateField('form');
  }

  getTeacherInitial(teacher: any): string {
    const f = (teacher.firstName || '').charAt(0).toUpperCase();
    const l = (teacher.lastName || '').charAt(0).toUpperCase();
    return l + f || 'T';
  }

  trackByTeacher(_index: number, item: any): string {
    return String(item?.id || _index);
  }

  trackBySubject(_index: number, item: any): string {
    return String(item?.id || _index);
  }

  getSelectedTeacherNames(): string[] {
    return this.selectedTeacherIds
      .map((id) => this.teachers.find((t) => t.id === id))
      .filter(Boolean)
      .map((t: any) => `${t.firstName || ''} ${t.lastName || ''}`.trim())
      .filter((n) => n);
  }

  getSelectedSubjectNames(): string[] {
    return this.selectedSubjectIds
      .map((id) => this.subjects.find((s) => s.id === id))
      .filter(Boolean)
      .map((s: any) => s.name || s.code || 'Subject');
  }

  selectAllVisibleTeachers(): void {
    this.filteredTeachers.forEach((t) => {
      if (t.id && !this.selectedTeacherIds.includes(t.id)) {
        this.selectedTeacherIds.push(t.id);
      }
    });
    this.cdr.markForCheck();
  }

  clearAllTeachers(): void {
    this.selectedTeacherIds = [];
    this.cdr.markForCheck();
  }

  selectAllVisibleSubjects(): void {
    this.filteredSubjects.forEach((s) => {
      if (s.id && !this.selectedSubjectIds.includes(s.id)) {
        this.selectedSubjectIds.push(s.id);
      }
    });
    this.cdr.markForCheck();
  }

  clearAllSubjects(): void {
    this.selectedSubjectIds = [];
    this.cdr.markForCheck();
  }

  filterTeachers() {
    if (!this.teacherSearchQuery.trim()) {
      this.filteredTeachers = [...this.teachers];
      return;
    }
    const query = this.teacherSearchQuery.toLowerCase().trim();
    this.filteredTeachers = this.teachers.filter(teacher => {
      const fullName = `${teacher.firstName} ${teacher.lastName}`.toLowerCase();
      const teacherId = (teacher.teacherId || '').toLowerCase();
      return fullName.includes(query) || teacherId.includes(query);
    });
  }

  filterSubjects() {
    if (!this.subjectSearchQuery.trim()) {
      this.filteredSubjects = [...this.subjects];
      return;
    }
    const query = this.subjectSearchQuery.toLowerCase().trim();
    this.filteredSubjects = this.subjects.filter(subject => {
      const name = (subject.name || '').toLowerCase();
      const code = (subject.code || '').toLowerCase();
      return name.includes(query) || code.includes(query);
    });
  }

  isTeacherSelected(teacherId: string): boolean {
    return this.selectedTeacherIds.includes(teacherId);
  }

  isSubjectSelected(subjectId: string): boolean {
    return this.selectedSubjectIds.includes(subjectId);
  }

  toggleTeacher(teacherId: string) {
    const index = this.selectedTeacherIds.indexOf(teacherId);
    if (index > -1) {
      this.selectedTeacherIds.splice(index, 1);
    } else {
      this.selectedTeacherIds.push(teacherId);
    }
    this.cdr.markForCheck();
  }

  toggleSubject(subjectId: string) {
    const index = this.selectedSubjectIds.indexOf(subjectId);
    if (index > -1) {
      this.selectedSubjectIds.splice(index, 1);
    } else {
      this.selectedSubjectIds.push(subjectId);
    }
    this.cdr.markForCheck();
  }

  validateField(fieldName: string) {
    this.touchedFields.add(fieldName);
    const value = this.classItem[fieldName];
    
    switch (fieldName) {
      case 'name':
        if (!value || value.trim() === '') {
          this.fieldErrors[fieldName] = 'Class name is required';
        } else if (value.length > 50) {
          this.fieldErrors[fieldName] = 'Class name must be 50 characters or less';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
      case 'form':
        if (!value || value.trim() === '') {
          this.fieldErrors[fieldName] = 'Form level is required';
        } else if (value.length > 30) {
          this.fieldErrors[fieldName] = 'Form level must be 30 characters or less';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
      case 'description':
        if (value && value.length > 500) {
          this.fieldErrors[fieldName] = 'Description must be 500 characters or less';
        } else {
          delete this.fieldErrors[fieldName];
        }
        break;
    }
    // Trigger change detection after validation
    this.cdr.markForCheck();
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.touchedFields.has(fieldName) && !!this.fieldErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    return this.fieldErrors[fieldName] || '';
  }

  onFieldChange(fieldName: string) {
    if (this.touchedFields.has(fieldName)) {
      // Defer validation to avoid ExpressionChangedAfterItHasBeenCheckedError
      Promise.resolve().then(() => {
        this.validateField(fieldName);
      });
    }
  }


  isFormValid(): boolean {
    // Check validity without modifying state to avoid ExpressionChangedAfterItHasBeenCheckedError
    const nameValid = !!this.classItem.name?.trim() && this.classItem.name.length <= 50;
    const formValid = !!this.classItem.form?.trim() && this.classItem.form.length <= 30;
    
    // Only check existing errors, don't create new ones during change detection
    const hasNameError = this.touchedFields.has('name') && !!this.fieldErrors['name'];
    const hasFormError = this.touchedFields.has('form') && !!this.fieldErrors['form'];
    
    return nameValid && formValid && !hasNameError && !hasFormError;
  }

  onSubmit() {
    // Mark all fields as touched
    this.touchedFields.add('name');
    this.touchedFields.add('form');
    this.touchedFields.add('description');
    
    // Validate all fields
    this.validateField('name');
    this.validateField('form');
    this.validateField('description');
    
    if (!this.isFormValid()) {
      this.error = 'Please fix the errors in the form';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.error = '';
    this.success = '';
    this.submitting = true;

    // Prepare class data
    const classData: any = {
      name: this.classItem.name.trim(),
      form: this.classItem.form.trim(),
      description: this.classItem.description?.trim() || '',
      isActive: this.classItem.isActive !== false
    };

    // Include teacher and subject IDs if selected
    if (this.selectedTeacherIds.length > 0) {
      classData.teacherIds = this.selectedTeacherIds;
    }
    if (this.selectedSubjectIds.length > 0) {
      classData.subjectIds = this.selectedSubjectIds;
    }

    if (this.isEdit) {
      this.classService.updateClass(this.classItem.id, classData).subscribe({
        next: () => {
          this.success = 'Class updated successfully!';
          this.submitting = false;
          // Show success message for 3 seconds before navigating
          setTimeout(() => {
            this.router.navigate(['/classes'], { 
              queryParams: { success: 'Class updated successfully!' } 
            });
          }, 3000);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to update class';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    } else {
      this.classService.createClass(classData).subscribe({
        next: () => {
          this.success = 'Class created successfully!';
          this.submitting = false;
          // Show success message for 3 seconds before navigating
          setTimeout(() => {
            this.router.navigate(['/classes'], { 
              queryParams: { success: 'Class created successfully!' } 
            });
          }, 3000);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to create class';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    }
  }
}

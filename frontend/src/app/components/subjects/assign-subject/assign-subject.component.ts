import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { trigger, transition, style, animate } from '@angular/animations';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';

@Component({
  standalone: false,  selector: 'app-assign-subject',
templateUrl: './assign-subject.component.html',
  styleUrls: ['./assign-subject.component.css'],
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ])
  ]
})
export class AssignSubjectComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  classes: any[] = [];
  subjects: any[] = [];
  filteredSubjects: any[] = [];
  
  selectedClassId: string = '';
  selectedClass: any = null;
  selectedSubjectIds: string[] = [];
  subjectSearchQuery: string = '';
  
  loading = false;
  loadingClasses = false;
  loadingSubjects = false;
  loadingClassDetails = false;
  error = '';
  success = '';
  successDetails: { class: string; count: number; subjects: string[] } | null = null;

  constructor(
    private classService: ClassService,
    private subjectService: SubjectService,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.bootstrapPage();
    activatePageLoad(this.router, this.destroy$, '/subjects/assign', () => this.bootstrapPage());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapPage(): void {
    this.loadClasses();
    this.loadSubjects();
  }

  private normalizeList(data: unknown): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && data !== null && Array.isArray((data as { data?: unknown }).data)) {
      return (data as { data: any[] }).data;
    }
    return [];
  }

  loadClasses() {
    this.loadingClasses = true;
    if (this.error && (this.error.includes('classes') || this.error.includes('class'))) {
      this.error = '';
    }
    
    this.classService
      .getClasses()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingClasses = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data: any) => {
          const list = this.normalizeList(data);
          this.classes = list.map((c: any) => ({
            ...c,
            id: this.classService.cleanClassId(c.id) || c.id,
            subjects: Array.isArray(c.subjects) ? c.subjects : []
          }));
        },
        error: (err: any) => {
          console.error('Error loading classes:', err);
          this.classes = [];
          if (!this.error || this.error.includes('classes') || this.error.includes('class')) {
            this.error = 'Failed to load classes. Please try again or create a class first.';
          }
        }
      });
  }

  loadSubjects() {
    this.loadingSubjects = true;
    this.subjectService
      .getSubjects()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingSubjects = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data: any) => {
          this.subjects = this.normalizeList(data);
          this.filteredSubjects = [...this.subjects];
        },
        error: (err: any) => {
          console.error('Error loading subjects:', err);
          this.error = 'Failed to load subjects';
        }
      });
  }

  selectClass(classId: string): void {
    const cleanId = this.classService.cleanClassId(classId);
    if (this.selectedClassId === cleanId && !this.loadingClassDetails) {
      return;
    }
    this.selectedClassId = cleanId;
    this.onClassChange();
  }

  private applySubjectsFromClass(cls: any): void {
    const subjects = cls?.subjects;
    if (subjects && Array.isArray(subjects)) {
      this.selectedSubjectIds = subjects
        .map((s: any) => s?.id)
        .filter((id: string) => !!id);
    } else {
      this.selectedSubjectIds = [];
    }
  }

  onClassChange() {
    this.error = '';
    this.success = '';

    if (!this.selectedClassId) {
      this.selectedClass = null;
      this.selectedSubjectIds = [];
      this.loadingClassDetails = false;
      this.cdr.markForCheck();
      return;
    }

    const cleanId = this.classService.cleanClassId(this.selectedClassId);
    this.selectedClassId = cleanId;

    const fromList = this.classes.find(
      (c) => this.classService.cleanClassId(c.id) === cleanId
    );
    if (fromList) {
      this.selectedClass = { ...fromList };
      this.applySubjectsFromClass(this.selectedClass);
      this.cdr.markForCheck();
    }

    this.loadingClassDetails = true;
    this.cdr.markForCheck();

    this.classService
      .getClassById(cleanId, { slim: true })
      .pipe(
        takeUntil(this.destroy$),
        catchError((err) => {
          console.error('Error loading class details:', err);
          if (!fromList) {
            this.error =
              err?.status === 0
                ? 'Cannot reach the server. Ensure the backend is running.'
                : 'Failed to load class details. You can still assign subjects if the list loaded.';
          }
          return of(fromList || null);
        }),
        finalize(() => {
          this.loadingClassDetails = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data: any) => {
          try {
            if (!data) {
              if (!fromList) {
                this.error = 'Class not found';
              }
              return;
            }
            const entity = data?.class || data;
            this.selectedClass = {
              ...(fromList || {}),
              ...entity,
              subjects: Array.isArray(entity?.subjects) ? entity.subjects : fromList?.subjects || []
            };
            this.applySubjectsFromClass(this.selectedClass);
            this.error = '';
          } catch (e) {
            console.error('Error processing class details:', e);
            if (fromList) {
              this.applySubjectsFromClass(fromList);
            } else {
              this.error = 'Could not read class details.';
            }
          }
          this.cdr.markForCheck();
        }
      });
  }

  filterSubjects() {
    if (!this.subjectSearchQuery.trim()) {
      this.filteredSubjects = [...this.subjects];
      return;
    }

    const query = this.subjectSearchQuery.toLowerCase().trim();
    this.filteredSubjects = this.subjects.filter(subject =>
      subject.name?.toLowerCase().includes(query) ||
      subject.code?.toLowerCase().includes(query) ||
      subject.description?.toLowerCase().includes(query)
    );
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

  isSubjectSelected(subjectId: string): boolean {
    return this.selectedSubjectIds.includes(subjectId);
  }

  selectAllSubjects() {
    this.selectedSubjectIds = this.filteredSubjects.map(s => s.id);
  }

  clearSelectedSubjects() {
    this.selectedSubjectIds = [];
  }

  onSubmit() {
    if (!this.selectedClassId) {
      this.error = 'Please select a class';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    // Update the class with selected subjects
    const updateData = {
      subjectIds: this.selectedSubjectIds
    };

    const cleanId = this.classService.cleanClassId(this.selectedClassId);
    this.classService.updateClass(cleanId, updateData).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data: any) => {
        this.loading = false;
        this.cdr.markForCheck();

        // Get selected subject names for the success message
        const selectedSubjectNames = this.subjects
          .filter(subject => this.selectedSubjectIds.includes(subject.id))
          .map(subject => subject.name);
        
        const subjectCount = this.selectedSubjectIds.length;
        const className = this.selectedClass?.name || 'class';
        
        // Create detailed success message
        if (subjectCount === 0) {
          this.success = `All subjects have been removed from ${className}`;
          this.successDetails = {
            class: className,
            count: 0,
            subjects: []
          };
        } else if (subjectCount === 1) {
          this.success = `Successfully assigned "${selectedSubjectNames[0]}" to ${className}`;
          this.successDetails = {
            class: className,
            count: 1,
            subjects: selectedSubjectNames
          };
        } else if (subjectCount <= 3) {
          this.success = `Successfully assigned ${subjectCount} subjects (${selectedSubjectNames.join(', ')}) to ${className}`;
          this.successDetails = {
            class: className,
            count: subjectCount,
            subjects: selectedSubjectNames
          };
        } else {
          this.success = `Successfully assigned ${subjectCount} subjects (${selectedSubjectNames.slice(0, 2).join(', ')}, and ${subjectCount - 2} more) to ${className}`;
          this.successDetails = {
            class: className,
            count: subjectCount,
            subjects: selectedSubjectNames
          };
        }
        
        // Clear any previous errors
        this.error = '';
        
        // Reload class details to show updated subjects
        this.onClassChange();
        
        // Scroll to top to show success message
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Clear success message after 8 seconds (increased for better visibility)
        setTimeout(() => {
          this.success = '';
          this.successDetails = null;
        }, 8000);
      },
      error: (err: any) => {
        console.error('Error assigning subjects:', err);
        let errorMessage = 'Failed to assign subjects';
        
        if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        }
        
        this.error = errorMessage;
        this.loading = false;
        this.cdr.markForCheck();

        // Clear error message after 8 seconds
        setTimeout(() => {
          this.error = '';
        }, 8000);
      }
    });
  }

  getSelectedClassSubjects(): any[] {
    if (!this.selectedClass || !this.selectedClass.subjects) {
      return [];
    }
    return this.selectedClass.subjects;
  }
}


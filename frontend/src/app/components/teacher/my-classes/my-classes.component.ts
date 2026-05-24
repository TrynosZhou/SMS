import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';
import { activatePageLoad } from '../../../utils/route-activation';

@Component({
  standalone: false,  selector: 'app-my-classes',
templateUrl: './my-classes.component.html',
  styleUrls: ['./my-classes.component.css']
})
export class MyClassesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private loadSeq = 0;
  teacher: any = null;
  teacherName: string = '';
  classes: any[] = [];
  loading = false;
  error = '';
  searchTerm = '';
  filteredClasses: any[] = [];

  // Universal teacher: lookup by EmployeeID
  isUniversalTeacher = false;
  showEmployeeIdModal = false;
  employeeIdInput = '';
  lookedUpTeacher: any = null;
  lookupLoading = false;
  lookupError = '';

  constructor(
    private authService: AuthService,
    private teacherService: TeacherService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    activatePageLoad(this.router, this.destroy$, '/teacher/my-classes', () => this.bootstrapPage());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapPage(): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.authService.currentUser$
        .pipe(filter((u) => !!u), take(1), takeUntil(this.destroy$))
        .subscribe(() => this.loadTeacherInfo());
      return;
    }
    this.loadTeacherInfo();
  }

  private getFullName(firstName?: string, lastName?: string): string {
    // Handle null, undefined, or empty strings
    const first = (firstName && typeof firstName === 'string') ? firstName.trim() : '';
    const last = (lastName && typeof lastName === 'string') ? lastName.trim() : '';
    
    // Filter out default placeholder values
    const validFirst = (first && first !== 'Teacher' && first !== 'Account') ? first : '';
    const validLast = (last && last !== 'Teacher' && last !== 'Account') ? last : '';
    
    // Combine as LastName + FirstName (as requested)
    const parts = [validLast, validFirst].filter(part => part.length > 0);
    const fullName = parts.join(' ').trim();
    
    // Return full name if available, otherwise return 'Teacher'
    return fullName || 'Teacher';
  }

  loadTeacherInfo() {
    const seq = ++this.loadSeq;
    const user = this.authService.getCurrentUser();
    if (!user) {
      return;
    }

    const role = (user.role || '').toLowerCase();
    const isUniversalTeacher = (user as any).isUniversalTeacher === true;
    const isTeacher = role === 'teacher' || isUniversalTeacher;

    if (!isTeacher) {
      this.error = 'Only teachers can access this page';
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.error = '';

    // Universal teacher: show modal to enter EmployeeID and lookup teacher's classes
    if (isUniversalTeacher) {
      this.isUniversalTeacher = true;
      this.teacher = { id: null, firstName: 'Universal', lastName: 'Teacher' };
      this.teacherName = 'Head Teacher';
      this.classes = [];
      this.filteredClasses = [];
      this.loading = false;
      this.showEmployeeIdModal = true;
      this.cdr.markForCheck();
      return;
    }
    
    // First, get the teacher profile to get teacherId and full name
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        if (seq !== this.loadSeq) return;
        this.teacher = teacher;
        
        // Extract and format full name (LastName + FirstName)
        const firstName = (teacher.firstName && teacher.firstName.trim() && teacher.firstName !== 'Teacher' && teacher.firstName !== 'Account') ? teacher.firstName.trim() : '';
        const lastName = (teacher.lastName && teacher.lastName.trim() && teacher.lastName !== 'Teacher' && teacher.lastName !== 'Account') ? teacher.lastName.trim() : '';
        this.teacherName = this.getFullName(firstName, lastName);
        
        console.log('Teacher loaded:', {
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          fullName: this.teacherName,
          teacherId: teacher.teacherId
        });
        
        // Now fetch classes using the teacherId (from junction table)
        if (teacher.id) {
          console.log('Fetching classes for teacher ID:', teacher.id);
          this.loadTeacherClasses(teacher.id, seq);
        } else {
          this.error = 'Teacher ID not found';
          this.loading = false;
          this.cdr.markForCheck();
        }
      },
      error: (err: any) => {
        if (seq !== this.loadSeq) return;
        console.error('Error loading teacher:', err);
        this.error = 'Failed to load teacher information. Please try again.';
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  loadTeacherClasses(teacherId: string, seq = this.loadSeq) {
    // Fetch classes from dedicated endpoint (uses junction table)
    this.teacherService.getTeacherClasses(teacherId).subscribe({
      next: (response: any) => {
        if (seq !== this.loadSeq) return;
        const classesData = response?.classes || response || [];
        this.classes = Array.isArray(classesData) ? classesData : [];
        const classesArray = Array.isArray(this.classes) ? this.classes : [];
        this.filteredClasses = [...classesArray];
        this.loading = false;
        
        console.log('✓ Classes loaded from junction table:', this.classes.length);
        if (this.classes.length > 0) {
          console.log('Classes:', this.classes.map(c => c?.name || 'Unknown').join(', '));
        }
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        if (seq !== this.loadSeq) return;
        console.error('Error loading classes:', err);
        this.error = 'Failed to load classes. Please try again.';
        this.loading = false;
        this.classes = [];
        this.filteredClasses = [];
        this.cdr.markForCheck();
      }
    });
  }

  filterClasses() {
    const classesArray = Array.isArray(this.classes) ? this.classes : [];
    if (!this.searchTerm.trim()) {
      this.filteredClasses = [...classesArray];
      return;
    }

    const term = this.searchTerm.toLowerCase().trim();
    this.filteredClasses = classesArray.filter(classItem =>
      classItem.name.toLowerCase().includes(term) ||
      classItem.form.toLowerCase().includes(term) ||
      (classItem.description && classItem.description.toLowerCase().includes(term))
    );
  }

  clearSearch() {
    this.searchTerm = '';
    this.filterClasses();
  }

  getClassStatusClass(isActive: boolean): string {
    return isActive ? 'status-active' : 'status-inactive';
  }

  getClassStatusText(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }

  searchByEmployeeId(): void {
    const id = (this.employeeIdInput || '').trim();
    if (!id) {
      this.lookupError = 'Please enter an EmployeeID';
      return;
    }
    this.lookupLoading = true;
    this.lookupError = '';
    this.teacherService.searchTeacherByEmployeeId(id).subscribe({
      next: (response: any) => {
        this.lookupLoading = false;
        const teacherInfo = response.teacher;
        if (!teacherInfo) {
          this.lookupError = response.message || 'Teacher not found';
          return;
        }
        this.lookedUpTeacher = teacherInfo;
        this.classes = teacherInfo.classes || [];
        this.filteredClasses = [...this.classes];
        this.showEmployeeIdModal = false;
        this.employeeIdInput = '';
      },
      error: (err: any) => {
        this.lookupLoading = false;
        this.lookupError = err.error?.message || 'Failed to find teacher. Please check the EmployeeID.';
      }
    });
  }

  openEmployeeIdModal(): void {
    this.showEmployeeIdModal = true;
    this.lookupError = '';
    this.employeeIdInput = '';
  }

  closeEmployeeIdModal(): void {
    this.showEmployeeIdModal = false;
    this.lookupError = '';
  }

  getSubjectNames(subjects: any[]): string {
    if (!subjects || !Array.isArray(subjects)) return '';
    return subjects.map(s => s?.name).filter(Boolean).join(', ');
  }
}


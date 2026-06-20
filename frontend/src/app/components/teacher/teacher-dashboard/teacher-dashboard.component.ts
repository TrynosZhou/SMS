import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, switchMap, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';
import { SettingsService } from '../../../services/settings.service';
import { ModuleAccessService } from '../../../services/module-access.service';
import { activatePageLoad } from '../../../utils/route-activation';

@Component({
  standalone: false,
  selector: 'app-teacher-dashboard',
  templateUrl: './teacher-dashboard.component.html',
  styleUrls: ['./teacher-dashboard.component.css']
})
export class TeacherDashboardComponent implements OnInit, OnDestroy {
  teacher: any = null;
  teacherClasses: any[] = [];
  selectedClassId: string = '';
  loading = false;
  error = '';
  teacherName = '';
  /** Greeting line: e.g. "Mr Zhou Trynos" (LastName FirstName with honorific). */
  teacherWelcomeName = '';
  schoolName = '';
  moduleAccess: any = null;
  availableModules: any[] = [];

  private readonly destroy$ = new Subject<void>();
  private readonly requestTimeoutMs = 30000;
  private loadGeneration = 0;

  constructor(
    private authService: AuthService,
    private teacherService: TeacherService,
    private settingsService: SettingsService,
    private moduleAccessService: ModuleAccessService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.applyTeacherNameFromUser(this.authService.getCurrentUser());
  }

  ngOnInit(): void {
    activatePageLoad(this.router, this.destroy$, '/teacher/dashboard', () => this.bootstrapDashboard());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapDashboard(): void {
    const generation = ++this.loadGeneration;
    this.error = '';
    this.hydrateFromSession();
    this.loadSettings();
    this.loadModuleAccess();

    const user = this.authService.getCurrentUser();
    if (!this.authService.hasRole('teacher')) {
      this.error = 'Only teachers can access this dashboard';
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    if ((user as any).isUniversalTeacher) {
      this.teacherName = 'Head Teacher';
      this.teacherWelcomeName = 'Head Teacher';
      this.teacher = { id: null, fullName: 'Head Teacher', firstName: 'Head', lastName: 'Teacher', classes: [] };
      this.teacherClasses = [];
      this.loading = false;
      this.updateAvailableModules();
      this.cdr.markForCheck();
      return;
    }

    const hadSessionData = this.teacherClasses.length > 0 || !!this.teacher?.id;
    if (!hadSessionData) {
      this.loading = true;
      this.cdr.markForCheck();
    }

    this.teacherService
      .getCurrentTeacher()
      .pipe(
        timeout(this.requestTimeoutMs),
        switchMap((teacher: any) => {
          if (generation !== this.loadGeneration) {
            return of(null);
          }
          this.applyTeacherFromApi(teacher);
          const teacherId = teacher?.id;
          if (!teacherId) {
            this.teacherClasses = Array.isArray(teacher?.classes) ? teacher.classes : [];
            return of(null);
          }
          return this.teacherService.getTeacherClasses(teacherId).pipe(
            timeout(this.requestTimeoutMs),
            catchError((err: any) => {
              console.error('Error loading teacher classes:', err);
              this.teacherClasses = Array.isArray(teacher?.classes) ? teacher.classes : this.teacherClasses;
              return of({ classes: this.teacherClasses });
            })
          );
        }),
        catchError((err: any) => this.handleTeacherLoadError(err)),
        takeUntil(this.destroy$),
        finalize(() => {
          if (generation === this.loadGeneration) {
            this.loading = false;
            this.cdr.markForCheck();
          }
        })
      )
      .subscribe((classesResponse: any) => {
        if (generation !== this.loadGeneration || classesResponse === null) {
          return;
        }
        if (classesResponse?.classes) {
          this.teacherClasses = classesResponse.classes;
        }
        this.cdr.markForCheck();
      });
  }

  /** Show dashboard immediately from login session while API refresh runs in background. */
  private hydrateFromSession(): void {
    const user = this.authService.getCurrentUser();
    if (!user?.teacher) {
      return;
    }

    this.teacher = { ...user.teacher };
    const sessionClasses = Array.isArray((user as any).classes) ? (user as any).classes : [];
    if (sessionClasses.length > 0) {
      this.teacherClasses = sessionClasses;
    } else if (Array.isArray(user.teacher.classes) && user.teacher.classes.length > 0) {
      this.teacherClasses = user.teacher.classes;
    }

    this.applyTeacherNameFromUser(user);

    if (this.teacher?.id || this.teacherClasses.length > 0) {
      this.loading = false;
    }
  }

  private applyTeacherNameFromUser(user: any): void {
    if (!user?.teacher) {
      this.teacherName = 'Teacher';
      this.teacherWelcomeName = 'Teacher';
      return;
    }

    const t = user.teacher;
    if (t.fullName && t.fullName.trim() && t.fullName !== 'Teacher') {
      this.teacherName = t.fullName.trim();
    } else {
      this.teacherName = this.getFullName(t.firstName, t.lastName);
    }
    this.teacherWelcomeName = this.buildWelcomeDisplay(
      t.firstName,
      t.lastName,
      t.sex,
      t.fullName && t.fullName.trim() ? t.fullName.trim() : undefined
    );
  }

  private applyTeacherFromApi(teacher: any): void {
    if (!teacher) {
      return;
    }

    this.teacher = teacher;

    const hasValidName =
      teacher.firstName?.trim() && teacher.lastName?.trim();

    if (hasValidName) {
      const firstName = teacher.firstName.trim();
      const lastName = teacher.lastName.trim();
      this.teacherName = this.getFullName(firstName, lastName);
      this.teacherWelcomeName = this.buildWelcomeDisplay(firstName, lastName, teacher.sex);
    } else if (teacher.fullName?.trim() && teacher.fullName !== 'Teacher') {
      this.teacherName = teacher.fullName.trim();
      this.teacherWelcomeName = this.buildWelcomeDisplay(
        teacher.firstName,
        teacher.lastName,
        teacher.sex,
        teacher.fullName.trim()
      );
    } else {
      const firstName = teacher.firstName?.trim() || '';
      const lastName = teacher.lastName?.trim() || '';
      this.teacherName = this.getFullName(firstName, lastName);
      this.teacherWelcomeName = this.buildWelcomeDisplay(firstName, lastName, teacher.sex);
    }

    const user = this.authService.getCurrentUser();
    if ((!this.teacherName || this.teacherName === 'Teacher') && user?.teacher) {
      this.applyTeacherNameFromUser(user);
    }
  }

  private handleTeacherLoadError(err: any) {
    console.error('Error loading teacher:', err);

    const user = this.authService.getCurrentUser();
    if (user?.teacher) {
      this.applyTeacherNameFromUser(user);
      if (!this.teacher?.id) {
        this.teacher = user.teacher;
      }
      const sessionClasses = Array.isArray((user as any).classes) ? (user as any).classes : [];
      if (sessionClasses.length > 0) {
        this.teacherClasses = sessionClasses;
      }
    }

    if (err?.name === 'TimeoutError') {
      this.error =
        'Loading is taking longer than expected. Showing your last known data — use Refresh or try again shortly.';
    } else if (err.status === 0) {
      this.error =
        'Cannot reach the server. Showing cached login data if available.';
    } else if (err.status === 404) {
      this.error = 'No teacher profile found for your account. Please contact the administrator.';
    } else if (err.status === 401) {
      this.error = 'You are not authenticated. Please log in again.';
      setTimeout(() => this.authService.logout(), 2000);
    } else if (!this.teacherClasses.length) {
      const errorMsg = err.error?.message || err.message || 'Unknown error';
      this.error = `Failed to load teacher information: ${errorMsg}. Please try again.`;
    }

    if (this.error) {
      setTimeout(() => (this.error = ''), 8000);
    }

    return of(null);
  }

  private getFullName(firstName?: string, lastName?: string): string {
    const first = (firstName && typeof firstName === 'string') ? firstName.trim() : '';
    const last = (lastName && typeof lastName === 'string') ? lastName.trim() : '';
    const parts = [last, first].filter(part => part.length > 0);
    return parts.join(' ').trim() || 'Teacher';
  }

  private getHonorific(sex: string | null | undefined): string {
    const s = String(sex || '').trim().toLowerCase();
    if (s === 'male' || s === 'm') return 'Mr';
    if (s === 'female' || s === 'f') return 'Mrs';
    return '';
  }

  private buildWelcomeDisplay(
    firstName?: string,
    lastName?: string,
    sex?: string | null,
    fullNameOverride?: string
  ): string {
    let base = '';
    if (fullNameOverride && fullNameOverride.trim() && fullNameOverride !== 'Teacher') {
      base = fullNameOverride.trim();
    } else {
      base = this.getFullName(firstName, lastName);
    }
    if (!base || base === 'Teacher') return base || 'Teacher';
    const h = this.getHonorific(sex);
    return h ? `${h} ${base}` : base;
  }

  loadSettings(): void {
    this.settingsService
      .getSettings()
      .pipe(
        timeout(this.requestTimeoutMs),
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      )
      .subscribe((data: any) => {
        if (data?.schoolName) {
          this.schoolName = data.schoolName;
          this.cdr.markForCheck();
        }
      });
  }

  loadModuleAccess(): void {
    this.moduleAccessService.loadModuleAccess();
    this.moduleAccess = this.moduleAccessService.getModuleAccess();
    this.updateAvailableModules();

    this.settingsService
      .getSettings()
      .pipe(
        timeout(this.requestTimeoutMs),
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      )
      .subscribe((settings: any) => {
        if (settings?.moduleAccess) {
          this.moduleAccess = settings.moduleAccess;
          (this.moduleAccessService as any).moduleAccess = settings.moduleAccess;
        }
        this.updateAvailableModules();
        this.cdr.markForCheck();
      });
  }

  private updateAvailableModules(): void {
    const access = this.moduleAccessService.getModuleAccess();
    const user = this.authService.getCurrentUser();
    const isUniversal = user?.role?.toLowerCase() === 'teacher' && (user as any).isUniversalTeacher;
    const teacherModules = (isUniversal ? access?.universalTeacher : access?.teachers) || {};

    const allModules = [
      { key: 'students', name: 'Students', route: '/students', icon: '👥', description: 'View and manage students' },
      { key: 'classes', name: 'Classes', route: '/classes', icon: '🏫', description: 'View class information' },
      { key: 'subjects', name: 'Subjects', route: '/subjects', icon: '📚', description: 'View subject details' },
      { key: 'exams', name: 'Exams', route: '/exams', icon: '📝', description: 'Manage exams and assessments' },
      { key: 'reportCards', name: 'Report Cards', route: '/report-cards', icon: '📊', description: 'View and generate report cards' },
      { key: 'recordBook', name: 'Record Book', route: '/teacher/record-book', icon: '📖', description: 'Enter and view marks' },
      { key: 'attendance', name: 'Attendance', route: '/attendance', icon: '✅', description: 'Manage student attendance' },
      { key: 'finance', name: 'Finance', route: '/invoices', icon: '💰', description: 'View financial information' },
      { key: 'settings', name: 'Settings', route: '/settings', icon: '⚙️', description: 'System settings' }
    ];

    this.availableModules = allModules.filter(module => {
      const moduleAccess = teacherModules as { [key: string]: boolean | undefined };
      return moduleAccess[module.key] !== false;
    });
  }

  refreshDashboard(): void {
    this.bootstrapDashboard();
  }

  openRecordBook(classItem?: any): void {
    const classId = classItem?.id || this.selectedClassId;
    if (!classId) {
      this.error = 'Please select a class first';
      setTimeout(() => (this.error = ''), 3000);
      return;
    }
    this.router.navigate(['/teacher/record-book'], {
      queryParams: { classId }
    });
  }

  onClassSelected(): void {
    if (this.selectedClassId) {
      console.log('Class selected:', this.selectedClassId);
    }
  }

  navigateToModule(module: any): void {
    if (module.route) {
      this.router.navigate([module.route]);
    }
  }

  canAccessModule(moduleName: string): boolean {
    return this.moduleAccessService.canAccessModule(moduleName);
  }

  getClassInitial(classItem: any): string {
    const name = classItem?.name || 'C';
    return name.charAt(0).toUpperCase();
  }

  getCurrentDate(): string {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  get mustChangePassword(): boolean {
    return this.authService.getCurrentUser()?.mustChangePassword === true;
  }
}

import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';
import { AuthService } from './auth.service';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { map, catchError, filter } from 'rxjs/operators';

export interface ModuleAccess {
  universalTeacher?: {
    students?: boolean;
    classes?: boolean;
    subjects?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    rankings?: boolean;
    finance?: boolean;
    settings?: boolean;
    // Per-module manager flags for Universal Teacher
    subjectManager?: boolean;
    studentManager?: boolean;
    examManager?: boolean;
    logisticsManager?: boolean;
    classManager?: boolean;
    teacherManager?: boolean;
    inventory?: boolean;
  };
  teachers?: {
    students?: boolean;
    classes?: boolean;
    subjects?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    rankings?: boolean;
    finance?: boolean;
    settings?: boolean;
    recordBook?: boolean;
    attendance?: boolean;
    teacherManager?: boolean;
    inventory?: boolean;
  };
  parents?: {
    reportCards?: boolean;
    invoices?: boolean;
    dashboard?: boolean;
    teacherManager?: boolean;
  };
  students?: {
    dashboard?: boolean;
    reportCards?: boolean;
    invoices?: boolean;
    teacherManager?: boolean;
    inventory?: boolean;
  };
  accountant?: {
    students?: boolean;
    invoices?: boolean;
    finance?: boolean;
    dashboard?: boolean;
    settings?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    attendance?: boolean;
    classes?: boolean;
    logistics?: boolean;
    teacherManager?: boolean;
    payroll?: boolean;
    inventory?: boolean;
  };
  admin?: {
    students?: boolean;
    teachers?: boolean;
    classes?: boolean;
    subjects?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    rankings?: boolean;
    finance?: boolean;
    attendance?: boolean;
    settings?: boolean;
    dashboard?: boolean;
    teacherManager?: boolean;
    payroll?: boolean;
    inventory?: boolean;
  };
  director?: {
    students?: boolean;
    teachers?: boolean;
    classes?: boolean;
    subjects?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    rankings?: boolean;
    finance?: boolean;
    attendance?: boolean;
    settings?: boolean;
    dashboard?: boolean;
    teacherManager?: boolean;
    payroll?: boolean;
    inventory?: boolean;
    parents?: boolean;
    logistics?: boolean;
  };
  headmaster?: {
    students?: boolean;
    teachers?: boolean;
    classes?: boolean;
    subjects?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    rankings?: boolean;
    finance?: boolean;
    attendance?: boolean;
    settings?: boolean;
    dashboard?: boolean;
    teacherManager?: boolean;
    payroll?: boolean;
    inventory?: boolean;
    parents?: boolean;
    logistics?: boolean;
  };
  deputy_headmaster?: {
    students?: boolean;
    teachers?: boolean;
    classes?: boolean;
    subjects?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    rankings?: boolean;
    finance?: boolean;
    attendance?: boolean;
    settings?: boolean;
    dashboard?: boolean;
    teacherManager?: boolean;
    payroll?: boolean;
    inventory?: boolean;
    parents?: boolean;
    logistics?: boolean;
  };
  superadmin?: {
    [key: string]: boolean; // Superadmin has access to everything
  };
  demo_user?: {
    dashboard?: boolean;
    students?: boolean;
    teachers?: boolean;
    classes?: boolean;
    subjects?: boolean;
    exams?: boolean;
    reportCards?: boolean;
    rankings?: boolean;
    finance?: boolean;
    attendance?: boolean;
    settings?: boolean;
    teacherManager?: boolean;
    payroll?: boolean;
    inventory?: boolean;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ModuleAccessService {
  private moduleAccess: ModuleAccess | null = null;
  private readonly readySubject = new BehaviorSubject<boolean>(false);
  /** Emits when module access has been loaded (or defaults applied). */
  readonly ready$ = this.readySubject.asObservable();
  private defaultAccess: ModuleAccess = {
    universalTeacher: {
      students: true,
      classes: true,
      subjects: true,
      exams: true,
      reportCards: true,
      rankings: true,
      finance: false,
      settings: false,
      subjectManager: true,
      studentManager: true,
      examManager: true,
      logisticsManager: true,
      classManager: true,
      teacherManager: true,
      inventory: false
    },
    teachers: {
      students: true,
      classes: true,
      subjects: true,
      exams: true,
      reportCards: true,
      rankings: true,
      finance: false, // Teachers cannot access finance by default
      settings: false,
      recordBook: true,
      attendance: true,
      teacherManager: false,
      inventory: false
    },
    parents: {
      reportCards: true,
      invoices: true,
      dashboard: true,
      teacherManager: false
    },
    students: {
      dashboard: true,
      reportCards: true,
      invoices: true,
      teacherManager: false,
      inventory: true
    },
    accountant: {
      students: true,
      invoices: true,
      finance: true,
      dashboard: true,
      settings: false,
      exams: false,
      reportCards: false,
      attendance: false,
      classes: false,
      logistics: true,
      teacherManager: false,
      payroll: false,
      inventory: true
    },
    admin: {
      students: true,
      teachers: true,
      classes: true,
      subjects: true,
      exams: true,
      reportCards: true,
      rankings: true,
      finance: true,
      attendance: true,
      settings: true,
      dashboard: true,
      teacherManager: true,
      payroll: true,
      inventory: true
    },
    director: {
      students: true,
      teachers: true,
      classes: true,
      subjects: true,
      exams: true,
      reportCards: true,
      rankings: true,
      finance: true,
      attendance: true,
      settings: true,
      dashboard: true,
      teacherManager: true,
      payroll: true,
      inventory: true,
      parents: true,
      logistics: true
    },
    headmaster: {
      students: true,
      teachers: true,
      classes: true,
      subjects: true,
      exams: true,
      reportCards: true,
      rankings: true,
      finance: false,
      attendance: true,
      settings: false,
      dashboard: true,
      teacherManager: true,
      payroll: false,
      inventory: true,
      parents: true,
      logistics: true
    },
    deputy_headmaster: {
      students: true,
      teachers: true,
      classes: true,
      subjects: true,
      exams: true,
      reportCards: true,
      rankings: true,
      finance: false,
      attendance: true,
      settings: false,
      dashboard: true,
      teacherManager: false,
      payroll: false,
      inventory: false,
      parents: true,
      logistics: false
    },
    superadmin: {}, // All access
    demo_user: {
      dashboard: true,
      students: true,
      teachers: true,
      classes: true,
      subjects: true,
      exams: true,
      reportCards: true,
      rankings: true,
      finance: true,
      attendance: true,
      settings: false, // Demo users cannot access settings
      teacherManager: true,
      payroll: false,
      inventory: true
    }
  };

  constructor(
    private settingsService: SettingsService,
    private authService: AuthService
  ) {
    // Always initialize with default access
    this.moduleAccess = this.defaultAccess;
    
    // Load module access from settings if user is authenticated
    if (this.authService.isAuthenticated()) {
      this.loadModuleAccess();
    }
    
    // Subscribe to auth state changes to refresh module access on login
    this.authService.currentUser$.pipe(
      filter(user => user !== null)
    ).subscribe(() => {
      // User just logged in, refresh module access
      if (this.authService.isAuthenticated()) {
        this.loadModuleAccess();
      }
    });
  }

  loadModuleAccess(): void {
    // Check if user is authenticated before making API call
    if (!this.authService.isAuthenticated()) {
      this.moduleAccess = this.defaultAccess;
      this.readySubject.next(true);
      return;
    }

    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings && settings.moduleAccess) {
          const loaded = settings.moduleAccess as ModuleAccess;
          const merged: ModuleAccess = { ...this.defaultAccess };

          Object.keys(loaded).forEach(key => {
            const k = key as keyof ModuleAccess;
            const defaultsForRole = (this.defaultAccess as any)[k] || {};
            const loadedForRole = (loaded as any)[k] || {};
            (merged as any)[k] = { ...defaultsForRole, ...loadedForRole };
          });

          this.moduleAccess = merged;
        } else {
          this.moduleAccess = this.defaultAccess;
        }
        this.readySubject.next(true);
      },
      error: () => {
        this.moduleAccess = this.defaultAccess;
        this.readySubject.next(true);
      }
    });
  }

  canAccessModule(moduleName: string): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;

    const role = this.authService.getEffectiveRole();

    // Ensure accountant can always access Logistics (Transport & Dining Hall)
    if (role === 'accountant' && moduleName === 'logistics') {
      return true;
    }

    // Payroll: not for School Admin leadership unless RBAC grants it (handled in PermissionService first)
    if (moduleName === 'payroll') {
      if (role === 'headmaster' || role === 'deputy_headmaster') {
        return false;
      }
      return role === 'admin' || role === 'superadmin' || role === 'director';
    }

    if (moduleName === 'finance') {
      if (role === 'headmaster' || role === 'deputy_headmaster') {
        return false;
      }
    }

    // Teachers must not access Teacher Records or Parent Records (registration menus)
    if (role === 'teacher' && !(user as any).isUniversalTeacher) {
      if (moduleName === 'teachers' || moduleName === 'parents') {
        return false;
      }
    }

    // Hard restrictions for accountant role regardless of settings
    if (role === 'accountant') {
      const blockedForAccountant = new Set(['exams', 'reportCards', 'attendance', 'rankings']);
      if (blockedForAccountant.has(moduleName)) {
        return false;
      }
    }

    // Superadmin and Director have access to everything (legacy moduleAccess matrix)
    if (role === 'superadmin' || role === 'director') return true;

    // Map role names to module access keys (handle singular/plural differences)
    const roleMap: { [key: string]: string } = {
      'teacher': 'teachers',
      'parent': 'parents',
      'student': 'students',
      'accountant': 'accountant',
      'admin': 'admin',
      'director': 'director',
      'headmaster': 'headmaster',
      'deputy_headmaster': 'deputy_headmaster',
      'superadmin': 'superadmin',
      'demo_user': 'demo_user'
    };

    let accessKey = roleMap[role] || role;
    // Universal teacher account uses its own module access (settings.moduleAccess.universalTeacher)
    if (role === 'teacher' && (user as any).isUniversalTeacher) {
      accessKey = 'universalTeacher';
    }

    // Get module access for the user's role
    const access = this.moduleAccess || this.defaultAccess;
    const roleAccess = (access as any)[accessKey];

    if (!roleAccess) {
      return false;
    }

    // Check if the module is explicitly allowed
    const hasAccess = roleAccess[moduleName] !== false;
    return hasAccess;
  }

  getModuleAccess(): ModuleAccess {
    return this.moduleAccess || this.defaultAccess;
  }

  refreshModuleAccess(): Observable<boolean> {
    // Check if user is authenticated before making API call
    if (!this.authService.isAuthenticated()) {
      this.moduleAccess = this.defaultAccess;
      return of(false);
    }

    return this.settingsService.getSettings().pipe(
      map((settings: any) => {
        if (settings && settings.moduleAccess) {
          this.moduleAccess = settings.moduleAccess;
        } else {
          this.moduleAccess = this.defaultAccess;
        }
        return true;
      }),
      catchError((err) => {
        // Silently fall back to default access on error
        this.moduleAccess = this.defaultAccess;
        return of(false);
      })
    );
  }
}


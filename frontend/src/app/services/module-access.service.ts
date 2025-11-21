import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';
import { AuthService } from './auth.service';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface ModuleAccess {
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
  };
  parents?: {
    reportCards?: boolean;
    invoices?: boolean;
    dashboard?: boolean;
  };
  accountant?: {
    students?: boolean;
    invoices?: boolean;
    finance?: boolean;
    dashboard?: boolean;
    settings?: boolean;
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
  };
}

@Injectable({
  providedIn: 'root'
})
export class ModuleAccessService {
  private moduleAccess: ModuleAccess | null = null;
  private defaultAccess: ModuleAccess = {
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
      attendance: true
    },
    parents: {
      reportCards: true,
      invoices: true,
      dashboard: true
    },
    accountant: {
      students: true,
      invoices: true,
      finance: true,
      dashboard: true,
      settings: false
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
      dashboard: true
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
      settings: false // Demo users cannot access settings
    }
  };

  constructor(
    private settingsService: SettingsService,
    private authService: AuthService
  ) {
    this.loadModuleAccess();
  }

  loadModuleAccess(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings && settings.moduleAccess) {
          this.moduleAccess = settings.moduleAccess;
        } else {
          this.moduleAccess = this.defaultAccess;
        }
      },
      error: () => {
        this.moduleAccess = this.defaultAccess;
      }
    });
  }

  canAccessModule(moduleName: string): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;

    const role = user.role.toLowerCase();

    // Superadmin has access to everything
    if (role === 'superadmin') return true;

    // Get module access for the user's role
    const access = this.moduleAccess || this.defaultAccess;
    const roleAccess = (access as any)[role];

    if (!roleAccess) return false;

    // Check if the module is explicitly allowed
    return roleAccess[moduleName] !== false;
  }

  getModuleAccess(): ModuleAccess {
    return this.moduleAccess || this.defaultAccess;
  }

  refreshModuleAccess(): Observable<boolean> {
    return this.settingsService.getSettings().pipe(
      map((settings: any) => {
        if (settings && settings.moduleAccess) {
          this.moduleAccess = settings.moduleAccess;
        } else {
          this.moduleAccess = this.defaultAccess;
        }
        return true;
      }),
      catchError(() => {
        this.moduleAccess = this.defaultAccess;
        return of(false);
      })
    );
  }
}


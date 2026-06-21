import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { ModuleAccessService } from './module-access.service';
import { RbacService } from './rbac.service';

/** Maps frontend route module keys to RBAC module keys */
const ROUTE_TO_RBAC: Record<string, string> = {
  students: 'students',
  teachers: 'staff',
  classes: 'classes',
  subjects: 'subjects',
  exams: 'exams',
  reportCards: 'reportCards',
  rankings: 'rankings',
  finance: 'finance',
  attendance: 'attendance',
  settings: 'settings',
  dashboard: 'dashboard',
  payroll: 'payroll',
  inventory: 'library',
  logistics: 'logistics',
  news: 'notices',
  messages: 'messages',
  recordBook: 'recordBook',
  timetable: 'timetable',
  audit: 'audit',
  accounts: 'accounts',
  reports: 'reports',
  parents: 'parents',
};

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private permissions: Record<string, boolean> = {};
  private readonly permissionsReadySubject = new BehaviorSubject<boolean>(false);
  /** Emits when RBAC permissions have been fetched (or skipped). */
  readonly permissionsReady$ = this.permissionsReadySubject.asObservable();

  constructor(
    private authService: AuthService,
    private moduleAccessService: ModuleAccessService,
    private rbacService: RbacService
  ) {
    const sync = (user: { permissions?: Record<string, boolean> } | null) => {
      if (user?.permissions && Object.keys(user.permissions).length) {
        this.permissions = { ...user.permissions };
      }
    };
    sync(this.authService.getCurrentUser());
    if (this.authService.getCurrentUser()?.permissions && Object.keys(this.authService.getCurrentUser()!.permissions!).length) {
      this.permissionsReadySubject.next(true);
    }
    this.authService.currentUser$.subscribe((user) => {
      if (this.authService.isViewAsRoleActive()) {
        return;
      }
      sync(user);
      if (user && (!user.permissions || !Object.keys(user.permissions).length)) {
        this.loadPermissionsFromApi();
      } else if (user) {
        this.permissionsReadySubject.next(true);
      } else {
        this.permissionsReadySubject.next(false);
      }
    });
  }

  loadPermissionsFromApi(): void {
    if (!this.authService.isAuthenticated()) return;
    if (this.authService.isViewAsRoleActive()) return;
    this.rbacService.getMyPermissions().subscribe({
      next: (res) => {
        this.permissions = res.permissions || {};
        const user = this.authService.getCurrentUser();
        if (user) {
          user.permissions = this.permissions;
          sessionStorage.setItem('user', JSON.stringify(user));
        }
        this.permissionsReadySubject.next(true);
      },
      error: () => {
        this.permissionsReadySubject.next(true);
      }
    });
  }

  setPermissions(perms: Record<string, boolean>): void {
    this.permissions = { ...perms };
  }

  /** Apply RBAC permissions while previewing another role (View as role). */
  applyViewAsPreview(perms: Record<string, boolean>): void {
    this.permissions = { ...(perms || {}) };
    this.permissionsReadySubject.next(true);
  }

  private isAdminBypass(): boolean {
    if (this.authService.isViewAsRoleActive()) {
      return false;
    }
    const actual = this.authService.getActualRole();
    return actual === 'superadmin' || actual === 'director';
  }

  /** Can open system settings / RBAC (Director, Super Admin, Administrator) */
  canManageRbacSettings(): boolean {
    if (this.authService.isViewAsRoleActive()) {
      return false;
    }
    const role = this.authService.getActualRole();
    return role === 'admin' || role === 'superadmin' || role === 'director';
  }

  hasPermission(module: string, action: string = 'view'): boolean {
    if (this.isAdminBypass()) return true;
    const key = `${module}.${action}`;
    if (this.permissions[key] === true) return true;
    return false;
  }

  /** Module-level view for navigation (RBAC + legacy moduleAccess fallback) */
  canAccessModule(routeModule: string): boolean {
    if (this.isAdminBypass()) return true;

    const rbacModule = ROUTE_TO_RBAC[routeModule] || routeModule;
    const effectiveRole = this.authService.getEffectiveRole();

    if (effectiveRole === 'teacher') {
      if (rbacModule === 'staff' || rbacModule === 'parents') {
        return false;
      }
    }

    if (this.authService.isSchoolLeadership()) {
      if (rbacModule === 'finance' || rbacModule === 'payroll') {
        return this.hasPermission(rbacModule, 'view');
      }
    }

    if (this.hasPermission(rbacModule, 'view')) return true;

    // When previewing a role, rely on RBAC + role matrix only (no admin fallbacks).
    if (this.authService.isViewAsRoleActive()) {
      return this.moduleAccessService.canAccessModule(routeModule);
    }

    // Legacy settings.moduleAccess matrix (not used for School Admin finance/payroll)
    if (
      this.authService.isSchoolLeadership() &&
      (rbacModule === 'finance' || rbacModule === 'payroll')
    ) {
      return false;
    }

    return this.moduleAccessService.canAccessModule(routeModule);
  }

  permissionKey(module: string, action: string): string {
    return `${module}.${action}`;
  }

  private hasFinancePageRbac(): boolean {
    return Object.keys(this.permissions).some((k) => k.startsWith('financePage.'));
  }

  financePagePermissionKey(pageKey: string, action: 'view' | 'edit' = 'view'): string {
    return `financePage.${pageKey}.${action}`;
  }

  /** Granular Finance Manager / Financial Reports page or sensitive action access */
  canAccessFinancePage(pageKey: string, action: 'view' | 'edit' = 'view'): boolean {
    if (this.isAdminBypass()) return true;

    if (this.authService.isSchoolLeadership() && !this.hasPermission('finance', 'view')) {
      return false;
    }

    const key = this.financePagePermissionKey(pageKey, action);
    if (this.hasFinancePageRbac()) {
      return this.permissions[key] === true;
    }

    if (action === 'view') {
      if (pageKey === 'reportDiningHall' || pageKey === 'reportTransport') {
        return this.canAccessModule('logistics') || this.canAccessModule('finance');
      }
      return this.canAccessModule('finance');
    }

    const sensitivePages = [
      'creditNotes',
      'debitNotes',
      'transportAdjust',
      'diningAdjust',
      'tuitionAdjust',
      'bulkInvoices',
      'exemptionCorrection',
      'invoiceSyncRemediation',
    ];
    if (sensitivePages.includes(pageKey)) {
      return false;
    }
    return this.hasPermission('finance', action);
  }
}

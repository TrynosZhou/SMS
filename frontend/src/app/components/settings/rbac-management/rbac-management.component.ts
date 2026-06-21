import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import {
  RbacService,
  RbacRole,
  RbacUserRow,
  RbacModule,
  RbacModuleGroup,
  FinancePageDef,
  FinancePageGroup,
  RbacRoleGroup,
} from '../../../services/rbac.service';

type RbacPanel = 'roles' | 'matrix' | 'users';

@Component({
  standalone: false,
  selector: 'app-rbac-management',
  templateUrl: './rbac-management.component.html',
  styleUrls: ['./rbac-management.component.css'],
})
export class RbacManagementComponent implements OnInit {
  activePanel: RbacPanel = 'matrix';
  loading = false;
  saving = false;
  error = '';
  success = '';
  readonly skeletonSlots = [1, 2, 3, 4, 5];

  modules: RbacModule[] = [];
  moduleGroups: RbacModuleGroup[] = [];
  actions: string[] = [];
  financePages: FinancePageDef[] = [];
  financePageActions: string[] = ['view', 'edit'];
  financePageGroups: FinancePageGroup[] = [];
  roleGroups: RbacRoleGroup[] = [];
  roles: RbacRole[] = [];
  users: RbacUserRow[] = [];

  selectedRoleId: string | null = null;
  matrixPermissions: Record<string, boolean> = {};

  newRoleName = '';
  newRoleDescription = '';
  editingRole: RbacRole | null = null;

  userSearch = '';
  selectedUser: RbacUserRow | null = null;
  selectedUserRoleIds: string[] = [];

  constructor(
    private rbacService: RbacService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  get selectedRole(): RbacRole | undefined {
    return this.roles.find((r) => r.id === this.selectedRoleId);
  }

  get dashboardStats(): {
    roles: number;
    customRoles: number;
    users: number;
    modules: number;
    financePages: number;
  } {
    return {
      roles: this.roles.length,
      customRoles: this.roles.filter((r) => !r.isSystem).length,
      users: this.users.length,
      modules: this.modules.length,
      financePages: this.financePages.length,
    };
  }

  clearAlert(type: 'success' | 'error'): void {
    if (type === 'success') {
      this.success = '';
    } else {
      this.error = '';
    }
    this.cdr.markForCheck();
  }

  /** Teacher / Class Teacher roles cannot be granted Teacher or Parent registration records */
  isTeacherPeopleRecordsLocked(moduleKey: string): boolean {
    const role = this.selectedRole;
    if (!role) return false;
    if (moduleKey !== 'staff' && moduleKey !== 'parents') return false;
    const slug = (role.slug || '').toLowerCase();
    const legacy = (role.legacyRoleKey || '').toLowerCase();
    return slug === 'teacher' || slug === 'class-teacher' || legacy === 'teacher';
  }

  isTeacherRoleSelected(): boolean {
    const role = this.selectedRole;
    if (!role) return false;
    const slug = (role.slug || '').toLowerCase();
    const legacy = (role.legacyRoleKey || '').toLowerCase();
    return slug === 'teacher' || slug === 'class-teacher' || legacy === 'teacher';
  }

  get filteredUsers(): RbacUserRow[] {
    const q = this.userSearch.toLowerCase().trim();
    if (!q) return this.users;
    return this.users.filter(
      (u) =>
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
    );
  }

  loadAll(): void {
    this.loading = true;
    this.error = '';
    forkJoin({
      catalog: this.rbacService.getCatalog().pipe(
        catchError((e) => {
          this.handleErr(e);
          return of({
            modules: [],
            moduleGroups: [],
            actions: [],
            financePages: [],
            financePageActions: ['view', 'edit'],
            financePageGroups: [],
            roleGroups: [],
          });
        })
      ),
      roles: this.rbacService.listRoles().pipe(
        catchError((e) => {
          this.handleErr(e);
          return of({ roles: [] as RbacRole[] });
        })
      ),
      users: this.rbacService.listUsers().pipe(
        catchError((e) => {
          this.handleErr(e);
          return of({ users: [] as RbacUserRow[] });
        })
      ),
    })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe(({ catalog, roles, users }) => {
        this.modules = catalog.modules || [];
        this.moduleGroups = catalog.moduleGroups?.length
          ? catalog.moduleGroups
          : [{ key: 'all', label: 'All modules' }];
        this.actions = catalog.actions || [];
        this.financePages = catalog.financePages || [];
        this.financePageActions = catalog.financePageActions?.length
          ? catalog.financePageActions
          : ['view', 'edit'];
        this.financePageGroups = catalog.financePageGroups || [];
        this.roleGroups = catalog.roleGroups || [];
        this.roles = roles.roles || [];
        this.users = users.users || [];

        if (!this.selectedRoleId && this.roles.length) {
          this.selectRole(this.roles[0].id);
        } else if (this.selectedRoleId) {
          this.selectRole(this.selectedRoleId);
        }
      });
  }

  refreshRoles(): void {
    this.rbacService
      .listRoles()
      .pipe(
        catchError((e) => {
          this.handleErr(e);
          return of({ roles: [] as RbacRole[] });
        })
      )
      .subscribe((res) => {
        this.roles = res.roles || [];
        if (this.selectedRoleId) {
          this.selectRole(this.selectedRoleId);
        }
        this.cdr.markForCheck();
      });
  }

  setPanel(panel: RbacPanel): void {
    this.activePanel = panel;
    this.clearMsg();
  }

  selectRole(roleId: string): void {
    this.selectedRoleId = roleId;
    const role = this.roles.find((r) => r.id === roleId);
    this.matrixPermissions = { ...(role?.permissions || {}) };
    this.enforceTeacherPeopleRecordsLock();
    if (this.activePanel !== 'matrix') this.activePanel = 'matrix';
  }

  private enforceTeacherPeopleRecordsLock(): void {
    for (const mod of ['staff', 'parents']) {
      if (!this.isTeacherPeopleRecordsLocked(mod)) continue;
      for (const action of this.actions) {
        this.matrixPermissions[this.permKey(mod, action)] = false;
      }
    }
  }

  permKey(module: string, action: string): string {
    return `${module}.${action}`;
  }

  isPermOn(module: string, action: string): boolean {
    return this.matrixPermissions[this.permKey(module, action)] === true;
  }

  togglePerm(module: string, action: string): void {
    if (this.isTeacherPeopleRecordsLocked(module)) return;
    const key = this.permKey(module, action);
    this.matrixPermissions[key] = !this.matrixPermissions[key];
  }

  toggleModuleRow(module: string, on: boolean): void {
    if (this.isTeacherPeopleRecordsLocked(module)) return;
    for (const action of this.actions) {
      this.matrixPermissions[this.permKey(module, action)] = on;
    }
  }

  moduleRowAllOn(module: string): boolean {
    return this.actions.every((a) => this.isPermOn(module, a));
  }

  financePagePermKey(pageKey: string, action: string): string {
    return `financePage.${pageKey}.${action}`;
  }

  isFinancePageOn(pageKey: string, action: string): boolean {
    return this.matrixPermissions[this.financePagePermKey(pageKey, action)] === true;
  }

  toggleFinancePage(pageKey: string, action: string): void {
    const key = this.financePagePermKey(pageKey, action);
    this.matrixPermissions[key] = !this.matrixPermissions[key];
  }

  modulesInGroup(groupKey: string): RbacModule[] {
    if (groupKey === 'all') return this.modules;
    return this.modules.filter((m) => (m.group || 'core') === groupKey);
  }

  moduleGroupLabel(groupKey: string): string {
    return this.moduleGroups.find((g) => g.key === groupKey)?.label || groupKey;
  }

  financePagesInGroup(groupKey: string): FinancePageDef[] {
    return this.financePages.filter((p) => p.group === groupKey);
  }

  financeGroupLabel(groupKey: string): string {
    return this.financePageGroups.find((g) => g.key === groupKey)?.label || groupKey;
  }

  toggleFinancePageRow(pageKey: string, on: boolean): void {
    for (const action of this.financePageActions) {
      this.matrixPermissions[this.financePagePermKey(pageKey, action)] = on;
    }
  }

  financePageRowAllOn(pageKey: string): boolean {
    return this.financePageActions.every((a) => this.isFinancePageOn(pageKey, a));
  }

  rolesInPickerGroup(group: RbacRoleGroup): RbacRole[] {
    return this.roles.filter((r) => group.slugs.includes(r.slug));
  }

  ungroupedPickerRoles(): RbacRole[] {
    const grouped = new Set(this.roleGroups.flatMap((g) => g.slugs));
    return this.roles.filter((r) => !grouped.has(r.slug));
  }

  /** Normalize permission map before save (booleans only, valid keys). */
  private sanitizePermissions(perms: Record<string, boolean>): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(perms || {})) {
      if (typeof key !== 'string' || !key.includes('.')) continue;
      out[key] = val === true;
    }
    return out;
  }

  saveMatrix(): void {
    if (!this.selectedRoleId || this.saving) return;
    this.saving = true;
    this.clearMsg();
    this.enforceTeacherPeopleRecordsLock();
    const permissions = this.sanitizePermissions(this.matrixPermissions);

    this.rbacService
      .updateRole(this.selectedRoleId, { permissions })
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res) => {
          this.success = res?.message || 'Permissions saved successfully.';
          const updated = res?.role as RbacRole | undefined;
          if (updated?.id) {
            const idx = this.roles.findIndex((r) => r.id === updated.id);
            if (idx >= 0) {
              this.roles[idx] = updated;
            }
            this.matrixPermissions = { ...(updated.permissions || {}) };
          } else {
            this.refreshRoles();
          }
          setTimeout(() => (this.success = ''), 4000);
        },
        error: (e) => this.handleErr(e),
      });
  }

  createRole(): void {
    if (!this.newRoleName.trim()) {
      this.error = 'Role name is required.';
      return;
    }
    if (this.saving) return;
    this.saving = true;
    this.rbacService
      .createRole({ name: this.newRoleName.trim(), description: this.newRoleDescription.trim() })
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.success = 'Role created.';
          this.newRoleName = '';
          this.newRoleDescription = '';
          this.refreshRoles();
          setTimeout(() => (this.success = ''), 4000);
        },
        error: (e) => this.handleErr(e),
      });
  }

  startEditRole(role: RbacRole): void {
    this.editingRole = { ...role };
  }

  saveEditRole(): void {
    if (!this.editingRole || this.saving) return;
    this.saving = true;
    this.rbacService
      .updateRole(this.editingRole.id, {
        name: this.editingRole.name,
        description: this.editingRole.description || '',
      })
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.success = 'Role updated.';
          this.editingRole = null;
          this.refreshRoles();
          setTimeout(() => (this.success = ''), 4000);
        },
        error: (e) => this.handleErr(e),
      });
  }

  deleteRole(role: RbacRole): void {
    if (role.isSystem) {
      this.error = 'System roles cannot be deleted.';
      return;
    }
    if (!confirm(`Delete role "${role.name}"? Users will lose this role assignment.`)) return;
    this.rbacService
      .deleteRole(role.id)
      .pipe(
        finalize(() => this.cdr.markForCheck())
      )
      .subscribe({
        next: () => {
          this.success = 'Role deleted.';
          if (this.selectedRoleId === role.id) this.selectedRoleId = null;
          this.refreshRoles();
          setTimeout(() => (this.success = ''), 4000);
        },
        error: (e) => this.handleErr(e),
      });
  }

  selectUser(user: RbacUserRow): void {
    this.selectedUser = user;
    this.selectedUserRoleIds = (user.rbacRoles || []).map((r) => r.id);
    this.activePanel = 'users';
  }

  toggleUserRole(roleId: string): void {
    const idx = this.selectedUserRoleIds.indexOf(roleId);
    if (idx >= 0) {
      this.selectedUserRoleIds = this.selectedUserRoleIds.filter((id) => id !== roleId);
    } else {
      this.selectedUserRoleIds = [...this.selectedUserRoleIds, roleId];
    }
  }

  userHasRole(roleId: string): boolean {
    return this.selectedUserRoleIds.includes(roleId);
  }

  saveUserRoles(): void {
    if (!this.selectedUser || this.saving) return;
    this.saving = true;
    this.rbacService
      .updateUserRoles(this.selectedUser.id, this.selectedUserRoleIds)
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.success = 'User roles updated. User must log in again for changes to apply fully.';
          this.rbacService.listUsers().subscribe({
            next: (res) => {
              this.users = res.users || [];
              const updated = this.users.find((u) => u.id === this.selectedUser?.id);
              if (updated) this.selectedUser = updated;
              this.cdr.markForCheck();
            },
          });
          setTimeout(() => (this.success = ''), 5000);
        },
        error: (e) => this.handleErr(e),
      });
  }

  private handleErr(err: any): void {
    const msg = err?.error?.message || err?.message || 'Request failed';
    if (err?.status === 0) {
      this.error =
        'Could not reach the server. Ensure the backend is running (npm run dev in the backend folder).';
    } else {
      this.error = msg;
    }
    setTimeout(() => (this.error = ''), 8000);
    this.cdr.markForCheck();
  }

  private clearMsg(): void {
    this.error = '';
    this.success = '';
  }
}

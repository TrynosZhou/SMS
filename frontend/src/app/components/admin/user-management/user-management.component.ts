import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { AccountService } from '../../../services/account.service';
import { AuthService } from '../../../services/auth.service';

export interface UserManagementRow {
  id: string;
  username: string;
  email?: string | null;
  name: string;
  firstName?: string;
  lastName?: string;
  role: string;
  status: 'Active' | 'Locked' | 'Inactive';
  isLocked: boolean;
  isDemo?: boolean;
  createdAt: string;
}

@Component({
  standalone: false,
  selector: 'app-user-management',
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
export class UserManagementComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  users: UserManagementRow[] = [];
  filteredUsers: UserManagementRow[] = [];
  loading = false;
  error = '';
  success = '';

  searchQuery = '';
  roleFilter = 'all';
  statusFilter = 'all';

  showAddUserModal = false;
  creatingUser = false;
  showManualPassword = false;

  readonly roleFilterOptions = [
    { value: 'all', label: 'All Roles' },
    { value: 'superadmin', label: 'Super Administrator' },
    { value: 'director', label: 'Director' },
    { value: 'headmaster', label: 'Headmaster' },
    { value: 'deputy_headmaster', label: 'Deputy Headmaster' },
    { value: 'admin', label: 'Administrator' },
    { value: 'accountant', label: 'Accountant' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'parent', label: 'Parent' },
    { value: 'student', label: 'Student' },
    { value: 'demo_user', label: 'Demo User' },
  ];

  readonly statusFilterOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'Active', label: 'Active' },
    { value: 'Locked', label: 'Locked' },
    { value: 'Inactive', label: 'Inactive' }
  ];

  private readonly allManualAccountRoles: Array<{ value: string; label: string; group: string }> = [
    { value: 'superadmin', label: 'Super Administrator', group: 'Executive leadership' },
    { value: 'director', label: 'Director', group: 'Executive leadership' },
    { value: 'headmaster', label: 'Headmaster', group: 'School Admin' },
    { value: 'deputy_headmaster', label: 'Deputy Headmaster', group: 'School Admin' },
    { value: 'admin', label: 'Administrator', group: 'School operations' },
    { value: 'accountant', label: 'Accountant', group: 'School operations' },
    { value: 'teacher', label: 'Teacher', group: 'Teaching' },
    { value: 'parent', label: 'Parent', group: 'Portal users' },
    { value: 'student', label: 'Student', group: 'Portal users' },
    { value: 'demo-user', label: 'Demo User', group: 'Other' },
  ];

  manualAccount = this.defaultManualAccount();

  selectedUser: UserManagementRow | null = null;
  showResetModal = false;
  resetGeneratePassword = false;
  resetPassword = '';
  resetPasswordConfirm = '';
  showResetPasswordNew = false;
  showResetPasswordConfirm = false;
  resettingPassword = false;
  unlockingUserId: string | null = null;
  deletingUserId: string | null = null;

  showEditNameModal = false;
  editingNameUser: UserManagementRow | null = null;
  editFirstName = '';
  editLastName = '';
  editNameError = '';
  savingName = false;

  constructor(
    private accountService: AccountService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get dashboardStats(): {
    total: number;
    showing: number;
    active: number;
    locked: number;
    staff: number;
    portal: number;
  } {
    let active = 0;
    let locked = 0;
    let staff = 0;
    let portal = 0;
    for (const u of this.users) {
      if (u.status === 'Active') active++;
      else if (u.status === 'Locked') locked++;
      const role = (u.role || '').toLowerCase();
      if (role === 'parent' || role === 'student') portal++;
      else staff++;
    }
    return {
      total: this.users.length,
      showing: this.filteredUsers.length,
      active,
      locked,
      staff,
      portal
    };
  }

  get statusChips(): Array<{ id: string; label: string; count: number }> {
    let active = 0;
    let locked = 0;
    let inactive = 0;
    for (const u of this.users) {
      if (u.status === 'Active') active++;
      else if (u.status === 'Locked') locked++;
      else inactive++;
    }
    return [
      { id: 'all', label: 'All statuses', count: this.users.length },
      { id: 'Active', label: 'Active', count: active },
      { id: 'Locked', label: 'Locked', count: locked },
      { id: 'Inactive', label: 'Inactive', count: inactive }
    ];
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') {
      this.success = '';
    } else {
      this.error = '';
    }
    this.cdr.markForCheck();
  }

  hasActiveFilters(): boolean {
    return !!this.searchQuery.trim() || this.roleFilter !== 'all' || this.statusFilter !== 'all';
  }

  refreshUsers(): void {
    this.clearAlert('success');
    this.clearAlert('error');
    this.loadUsers();
  }

  setStatusFilter(value: string): void {
    this.statusFilter = value;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  isSuperAdmin(): boolean {
    return this.authService.isSuperAdmin();
  }

  isFullAccess(): boolean {
    return this.authService.isFullAccess();
  }

  getCreatableRoleOptions(): Array<{ value: string; label: string; group: string }> {
    if (this.isFullAccess()) {
      return this.allManualAccountRoles;
    }
    // Administrators can create Director and school roles; Super Admin stays executive-only
    return this.allManualAccountRoles.filter((o) => o.value !== 'superadmin');
  }

  getCreatableRoleGroups(): string[] {
    const groups = new Set<string>();
    for (const o of this.getCreatableRoleOptions()) {
      groups.add(o.group);
    }
    return Array.from(groups);
  }

  getCreatableRolesInGroup(group: string): Array<{ value: string; label: string; group: string }> {
    return this.getCreatableRoleOptions().filter((o) => o.group === group);
  }

  isCurrentUser(userId: string): boolean {
    return this.authService.getCurrentUser()?.id === userId;
  }

  loadUsers(): void {
    this.loading = true;
    this.error = '';
    this.accountService
      .getAllUsers()
      .pipe(
        timeout(60000),
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res) => {
          this.users = (res?.users || []).map((u: any) => ({
            ...u,
            createdAt: u.createdAt
          }));
          this.applyFilters();
          this.cdr.detectChanges();
        },
        error: (err) => {
          if (err?.name === 'TimeoutError') {
            this.error = 'Request timed out. Check that the backend is running and try again.';
            this.loadUsersFallback();
            return;
          }
          this.error = err?.error?.message || err?.message || 'Failed to load users.';
          this.loadUsersFallback();
        }
      });
  }

  /** If all-users fails, show at least staff accounts so the page is usable */
  private loadUsersFallback(): void {
    this.accountService
      .getStaffUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.users = (res?.users || []).map((u: any) => ({
            id: u.id,
            username: u.username,
            email: u.email,
            name: u.email || u.username,
            role: u.role,
            status: u.isLocked ? 'Locked' : 'Active',
            isLocked: !!u.isLocked,
            isDemo: false,
            createdAt: u.createdAt || ''
          }));
          this.applyFilters();
          this.cdr.detectChanges();
        },
        error: () => {
          this.users = [];
          this.filteredUsers = [];
          this.cdr.detectChanges();
        }
      });
  }

  applyFilters(): void {
    const q = this.searchQuery.trim().toLowerCase();
    this.filteredUsers = this.users.filter((u) => {
      if (this.roleFilter !== 'all') {
        const role = (u.role || '').toLowerCase();
        const filter = this.roleFilter.toLowerCase();
        if (filter === 'demo_user') {
          if (role !== 'demo_user' && !u.isDemo) return false;
        } else if (role !== filter) {
          return false;
        }
      }
      if (this.statusFilter !== 'all' && u.status !== this.statusFilter) {
        return false;
      }
      if (!q) return true;
      return [u.username, u.name, u.email, u.role, this.getRoleLabel(u.role)]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.roleFilter = 'all';
    this.statusFilter = 'all';
    this.applyFilters();
  }

  getRoleLabel(role: string): string {
    const r = (role || '').toLowerCase();
    if (r === 'superadmin') return 'Super Administrator';
    if (r === 'director') return 'Director';
    if (r === 'headmaster') return 'Headmaster';
    if (r === 'deputy_headmaster') return 'Deputy Headmaster';
    if (r === 'admin') return 'Administrator';
    if (r === 'accountant') return 'Accountant';
    if (r === 'teacher') return 'Teacher';
    if (r === 'parent') return 'Parent';
    if (r === 'student') return 'Student';
    if (r === 'demo_user') return 'Demo User';
    return role || '—';
  }

  getRoleBadgeClass(role: string): string {
    const r = (role || '').toLowerCase();
    if (r === 'director' || r === 'superadmin') return 'um-role-badge--executive';
    if (r === 'headmaster' || r === 'deputy_headmaster') return 'um-role-badge--school-admin';
    return '';
  }

  formatCreated(dateStr: string): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  openAddUser(): void {
    this.manualAccount = this.defaultManualAccount();
    this.error = '';
    this.showAddUserModal = true;
  }

  closeAddUser(): void {
    this.showAddUserModal = false;
    this.creatingUser = false;
  }

  onManualRoleChange(): void {
    if (this.manualAccount.role === 'teacher') {
      this.manualAccount.email = '';
    }
  }

  createUser(): void {
    const role = (this.manualAccount.role || '').trim();
    if (!role) {
      this.error = 'Role is required.';
      return;
    }
    if (!this.manualAccount.firstName?.trim() && role !== 'teacher') {
      this.error = 'First name is required.';
      return;
    }
    if (!this.manualAccount.lastName?.trim() && role !== 'teacher') {
      this.error = 'Last name is required.';
      return;
    }
    if (!this.manualAccount.username?.trim()) {
      this.error =
        role === 'teacher'
          ? 'Username (Teacher ID) is required for teacher accounts.'
          : 'Username is required for login.';
      return;
    }
    if (!this.manualAccount.generatePassword && !this.manualAccount.password?.trim()) {
      this.error = 'Password is required, or enable auto-generate.';
      return;
    }
    if (this.manualAccount.password?.trim() && this.manualAccount.password.trim().length < 8) {
      this.error = 'Password must be at least 8 characters.';
      return;
    }

    const isDemoRole = role === 'demo-user';
    const resolvedRole = isDemoRole ? 'admin' : role;
    const payload: any = {
      role: resolvedRole,
      username: this.manualAccount.username.trim(),
      generatePassword: this.manualAccount.generatePassword,
    };
    const firstName = this.manualAccount.firstName?.trim();
    const lastName = this.manualAccount.lastName?.trim();
    if (firstName) payload.firstName = firstName;
    if (lastName) payload.lastName = lastName;
    const email = (this.manualAccount.email || '').trim();
    if (email) {
      payload.email = email;
    }
    if (!this.manualAccount.generatePassword) {
      payload.password = this.manualAccount.password.trim();
    }
    if (isDemoRole || (this.manualAccount.isDemo && this.isFullAccess())) {
      payload.isDemo = true;
    }

    this.creatingUser = true;
    this.error = '';
    this.accountService.createUserAccount(payload).subscribe({
      next: (response: any) => {
        this.creatingUser = false;
        const password = response.temporaryCredentials?.password;
        const loginUser = response.user?.username || payload.username;
        this.success = password
          ? `Account created. Username: ${loginUser} · Password: ${password}`
          : `Account created. Username: ${loginUser}`;
        this.closeAddUser();
        this.loadUsers();
        setTimeout(() => (this.success = ''), 12000);
      },
      error: (err) => {
        this.creatingUser = false;
        this.error = err?.error?.message || 'Failed to create account.';
      }
    });
  }

  goToSystemActivity(): void {
    this.router.navigate(['/user-log']);
  }

  openAdvancedManagement(): void {
    this.router.navigate(['/admin/manage-accounts']);
  }

  canEditUserName(user: UserManagementRow): boolean {
    const role = (user.role || '').toLowerCase();
    if ((role === 'superadmin' || role === 'director') && !this.isFullAccess()) {
      return false;
    }
    return true;
  }

  openEditNameModal(user: UserManagementRow): void {
    if (!this.canEditUserName(user)) return;
    this.editingNameUser = user;
    this.editFirstName = user.firstName || '';
    this.editLastName = user.lastName || '';
    if (!this.editFirstName && !this.editLastName && user.name && user.name !== '—') {
      const parts = user.name.trim().split(/\s+/);
      if (parts.length === 1) {
        this.editFirstName = parts[0];
      } else if (parts.length >= 2) {
        this.editFirstName = parts[0];
        this.editLastName = parts.slice(1).join(' ');
      }
    }
    this.editNameError = '';
    this.showEditNameModal = true;
    this.cdr.detectChanges();
  }

  closeEditNameModal(): void {
    this.showEditNameModal = false;
    this.editingNameUser = null;
    this.editFirstName = '';
    this.editLastName = '';
    this.editNameError = '';
    this.savingName = false;
    this.cdr.detectChanges();
  }

  saveUserName(): void {
    if (!this.editingNameUser || this.savingName) return;
    const firstName = this.editFirstName.trim();
    const lastName = this.editLastName.trim();
    if (!firstName && !lastName) {
      this.editNameError = 'Enter at least a first name or last name.';
      this.cdr.detectChanges();
      return;
    }
    const userId = this.editingNameUser.id;
    if (!userId) {
      this.editNameError = 'User account id is missing. Refresh the page and try again.';
      this.cdr.detectChanges();
      return;
    }

    this.savingName = true;
    this.editNameError = '';
    this.accountService
      .updateUserDisplayName(userId, { firstName, lastName })
      .pipe(
        timeout(60000),
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingName = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res: any) => {
          const updatedName = res?.user?.name || [firstName, lastName].filter(Boolean).join(' ');
          const editedUsername = this.editingNameUser?.username || 'user';
          const editedId = userId;
          this.success = `Name updated for ${editedUsername}.`;
          this.closeEditNameModal();
          const idx = this.users.findIndex((u) => u.id === editedId);
          if (idx >= 0) {
            this.users[idx] = {
              ...this.users[idx],
              name: updatedName,
              firstName: res?.user?.firstName ?? firstName,
              lastName: res?.user?.lastName ?? lastName
            };
            this.applyFilters();
          } else {
            this.loadUsers();
          }
          this.cdr.detectChanges();
          setTimeout(() => {
            this.success = '';
            this.cdr.detectChanges();
          }, 6000);
        },
        error: (err) => {
          if (err?.name === 'TimeoutError') {
            this.editNameError = 'Request timed out. Check that the backend is running and try again.';
          } else {
            this.editNameError = err?.error?.message || err?.message || 'Failed to update name.';
          }
          this.cdr.detectChanges();
        }
      });
  }

  openResetModal(user: UserManagementRow): void {
    this.selectedUser = user;
    this.resetGeneratePassword = false;
    this.resetPassword = '';
    this.resetPasswordConfirm = '';
    this.showResetPasswordNew = false;
    this.showResetPasswordConfirm = false;
    this.error = '';
    this.showResetModal = true;
  }

  closeResetModal(): void {
    this.showResetModal = false;
    this.selectedUser = null;
    this.showResetPasswordNew = false;
    this.showResetPasswordConfirm = false;
  }

  toggleResetPasswordNewVisibility(): void {
    this.showResetPasswordNew = !this.showResetPasswordNew;
  }

  toggleResetPasswordConfirmVisibility(): void {
    this.showResetPasswordConfirm = !this.showResetPasswordConfirm;
  }

  confirmResetPassword(): void {
    if (!this.selectedUser) return;
    if (!this.resetGeneratePassword) {
      if (!this.resetPassword?.trim() || this.resetPassword.length < 8) {
        this.error = 'Password must be at least 8 characters.';
        return;
      }
      if (this.resetPassword !== this.resetPasswordConfirm) {
        this.error = 'Passwords do not match.';
        return;
      }
    }
    this.resettingPassword = true;
    this.error = '';
    this.accountService
      .resetUserPassword(
        this.selectedUser.id,
        this.resetGeneratePassword ? '' : this.resetPassword.trim(),
        this.resetGeneratePassword
      )
      .subscribe({
        next: (res: any) => {
          this.resettingPassword = false;
          const temp = res?.temporaryPassword;
          this.success = temp
            ? `Password reset. Temporary password: ${temp} — user must change it on first login.`
            : 'Password set. The user can sign in with this password and change it later from My Account.';
          this.closeResetModal();
          this.loadUsers();
          setTimeout(() => (this.success = ''), 12000);
        },
        error: (err) => {
          this.resettingPassword = false;
          this.error = err?.error?.message || 'Failed to reset password.';
        }
      });
  }

  unlockUser(user: UserManagementRow): void {
    this.unlockingUserId = user.id;
    this.accountService.unlockUser(user.id).subscribe({
      next: () => {
        this.unlockingUserId = null;
        this.success = `Account unlocked for ${user.username}.`;
        this.loadUsers();
        setTimeout(() => (this.success = ''), 6000);
      },
      error: (err) => {
        this.unlockingUserId = null;
        this.error = err?.error?.message || 'Failed to unlock account.';
      }
    });
  }

  canDeleteUser(user: UserManagementRow): boolean {
    if (this.isCurrentUser(user.id)) return false;
    const role = (user.role || '').toLowerCase();
    if (role === 'superadmin' || role === 'director') return this.isFullAccess();
    return true;
  }

  deleteUser(user: UserManagementRow): void {
    if (!this.canDeleteUser(user)) return;
    const label = `${this.getRoleLabel(user.role)} (${user.username})`;
    if (!confirm(`Delete the account for ${label}? They will no longer be able to sign in.`)) {
      return;
    }
    this.deletingUserId = user.id;
    this.accountService.deleteUserAccount(user.id).subscribe({
      next: () => {
        this.deletingUserId = null;
        this.success = `Account deleted for ${user.username}.`;
        this.loadUsers();
        setTimeout(() => (this.success = ''), 8000);
      },
      error: (err) => {
        this.deletingUserId = null;
        this.error = err?.error?.message || 'Failed to delete account.';
      }
    });
  }

  canUnlockUser(user: UserManagementRow): boolean {
    const role = (user.role || '').toLowerCase();
    const staffRoles = [
      'admin',
      'superadmin',
      'director',
      'headmaster',
      'deputy_headmaster',
      'accountant',
    ];
    if (!user.isLocked || !staffRoles.includes(role)) {
      return false;
    }
    if (role === 'superadmin' || role === 'director') {
      return this.isFullAccess();
    }
    return true;
  }

  requiresFullName(role: string): boolean {
    return (role || '').trim() !== 'teacher';
  }

  private defaultManualAccount() {
    return {
      firstName: '',
      lastName: '',
      email: '',
      username: '',
      role: 'headmaster',
      generatePassword: false,
      password: '',
      isDemo: false,
    };
  }
}

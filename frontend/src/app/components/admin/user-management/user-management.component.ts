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
    { value: 'superadmin', label: 'Super Admin' },
    { value: 'admin', label: 'Administrator' },
    { value: 'accountant', label: 'Accountant' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'parent', label: 'Parent' },
    { value: 'student', label: 'Student' },
    { value: 'demo_user', label: 'Demo User' }
  ];

  readonly statusFilterOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'Active', label: 'Active' },
    { value: 'Locked', label: 'Locked' },
    { value: 'Inactive', label: 'Inactive' }
  ];

  manualAccountRoles = [
    { value: 'superadmin', label: 'Super Admin' },
    { value: 'admin', label: 'Administrator' },
    { value: 'accountant', label: 'Accountant' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'demo-user', label: 'Demo User' }
  ];

  manualAccount = this.defaultManualAccount();

  selectedUser: UserManagementRow | null = null;
  showResetModal = false;
  resetGeneratePassword = true;
  resetPassword = '';
  resetPasswordConfirm = '';
  resettingPassword = false;
  unlockingUserId: string | null = null;
  deletingUserId: string | null = null;

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

  isSuperAdmin(): boolean {
    return this.authService.getCurrentUser()?.role === 'superadmin';
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
    if (r === 'superadmin') return 'Super Admin';
    if (r === 'admin') return 'Administrator';
    if (r === 'accountant') return 'Accountant';
    if (r === 'teacher') return 'Teacher';
    if (r === 'parent') return 'Parent';
    if (r === 'student') return 'Student';
    if (r === 'demo_user') return 'Demo User';
    return role || '—';
  }

  formatCreated(dateStr: string): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  openAddUser(): void {
    this.manualAccount = this.defaultManualAccount();
    if (!this.isSuperAdmin()) {
      this.manualAccountRoles = this.manualAccountRoles.filter((o) => o.value !== 'superadmin');
    }
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
    if (role === 'teacher') {
      if (!this.manualAccount.username?.trim()) {
        this.error = 'Username (Teacher ID) is required for teacher accounts.';
        return;
      }
    } else if (!this.manualAccount.email?.trim() || !role) {
      this.error = 'Email and role are required.';
      return;
    }
    if (!this.manualAccount.generatePassword && !this.manualAccount.password?.trim()) {
      this.error = 'Please provide a password or enable auto-generate.';
      return;
    }

    const isDemoRole = role === 'demo-user';
    const resolvedRole = isDemoRole ? 'admin' : role;
    const payload: any = {
      role: resolvedRole,
      username: this.manualAccount.username?.trim() || undefined,
      generatePassword: this.manualAccount.generatePassword
    };
    if (resolvedRole !== 'teacher') {
      payload.email = (this.manualAccount.email || '').trim();
    }
    if (!this.manualAccount.generatePassword) {
      payload.password = this.manualAccount.password.trim();
    }
    if (isDemoRole || (this.manualAccount.isDemo && this.isSuperAdmin())) {
      payload.isDemo = true;
    }

    this.creatingUser = true;
    this.error = '';
    this.accountService.createUserAccount(payload).subscribe({
      next: (response: any) => {
        this.creatingUser = false;
        const password = response.temporaryCredentials?.password;
        this.success = password
          ? `Account created. Temporary password: ${password}`
          : 'Account created successfully.';
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

  openResetModal(user: UserManagementRow): void {
    this.selectedUser = user;
    this.resetGeneratePassword = true;
    this.resetPassword = '';
    this.resetPasswordConfirm = '';
    this.error = '';
    this.showResetModal = true;
  }

  closeResetModal(): void {
    this.showResetModal = false;
    this.selectedUser = null;
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
            ? `Password reset. Temporary password: ${temp}`
            : 'Password reset successfully.';
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
    if (role === 'superadmin') return this.isSuperAdmin();
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
    return (
      user.isLocked &&
      ['admin', 'superadmin', 'accountant'].includes(role) &&
      (role !== 'superadmin' || this.isSuperAdmin())
    );
  }

  private defaultManualAccount() {
    return {
      email: '',
      username: '',
      role: 'accountant',
      generatePassword: true,
      password: '',
      isDemo: false
    };
  }
}

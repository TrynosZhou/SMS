import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { TeacherService } from '../../../services/teacher.service';
import { AccountService } from '../../../services/account.service';
import { AuthService } from '../../../services/auth.service';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { Subscription } from 'rxjs';
import { safeArray } from '../../../utils/array-utils';

@Component({
  selector: 'app-manage-accounts',
  templateUrl: './manage-accounts.component.html',
  styleUrls: ['./manage-accounts.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0 })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0 }))
      ])
    ]),
    trigger('fadeInUp', [
      state('void', style({ opacity: 0, transform: 'translateY(10px)' })),
      transition(':enter', [
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('slideInUp', [
      state('void', style({ transform: 'translateY(50px)', opacity: 0 })),
      transition(':enter', [
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class ManageAccountsComponent implements OnInit, OnDestroy {
  teachers: any[] = [];
  filteredTeachers: any[] = [];
  loading = false;
  error = '';
  success = '';
  creatingAccount = false;
  creatingUserAccount = false;
  selectedTeacher: any = null;
  showManualPassword = false;
  manualAccountRoles = [
    { value: 'superadmin', label: 'Super Admin' },
    { value: 'admin', label: 'Administrator' },
    { value: 'accountant', label: 'Accountant' },
    { value: 'teacher', label: 'Teacher' },
    { value: 'demo-user', label: 'Demo User' }
  ];
  manualAccount = this.getDefaultManualAccountForm();
  
  // Search and filter
  searchQuery = '';
  filterStatus: 'all' | 'with-account' | 'without-account' = 'all';

  // Pagination for teacher accounts table
  pageSizeOptions: number[] = [10, 20, 50];
  pageSize = 50; // default rows per page
  currentPage = 1;
  
  // Modals
  showCreateModal = false;
  showDetailsModal = false;
  showResetPasswordModal = false;
  sendCredentials = false;
  deletingAccountUserId: string | null = null;
  
  // Reset password form (for teacher accounts)
  resetPasswordNewPassword = '';
  resetPasswordConfirm = '';
  showResetPasswordNew = false;
  showResetPasswordConfirm = false;
  resettingPassword = false;

  // Change user role (in Account Details modal)
  selectedUserRoleForEdit = '';
  updatingRole = false;

  // Password change
  showPasswordChangeSection = false;
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  changingPassword = false;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  // Edit own profile (role, username, email) modals
  showEditRoleModal = false;
  showEditUsernameModal = false;
  showEditEmailModal = false;
  editRoleValue = '';
  editUsernameValue = '';
  editEmailValue = '';
  editUsernamePassword = '';
  editEmailPassword = '';
  showEditUsernamePassword = false;
  showEditEmailPassword = false;
  updatingOwnRole = false;
  updatingOwnUsername = false;
  updatingOwnEmail = false;

  // User subscription
  private userSubscription?: Subscription;
  currentUser: any = null;

  // Universal teacher account
  universalTeacherStatus: { exists: boolean; username?: string; userId?: string; universalTeacherEnabled?: boolean } = { exists: false };
  loadingUniversalTeacher = false;
  creatingUniversalTeacher = false;
  universalTeacherPassword = '';
  universalTeacherGeneratePassword = true;
  showUniversalTeacherPassword = false;

  // Staff accounts (admin, superadmin, accountant)
  staffUsers: any[] = [];
  loadingStaff = false;
  selectedStaff: any = null;
  showStaffResetModal = false;
  staffResetGeneratePassword = true;
  resetStaffPasswordNewPassword = '';
  resetStaffPasswordConfirm = '';
  showStaffResetNew = false;
  showStaffResetConfirm = false;
  resettingStaffPassword = false;
  unlockingStaffId: string | null = null;
  deletingStaffId: string | null = null;

  // Staff profile popup (edit role/username/email from list)
  showStaffProfileModal = false;
  staffProfileTarget: any = null;
  editStaffField: 'role' | 'username' | 'email' | null = null;
  editStaffRoleValue = '';
  editStaffUsernameValue = '';
  editStaffEmailValue = '';
  updatingStaffField = false;

  constructor(
    private teacherService: TeacherService,
    private accountService: AccountService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadTeachers();
    this.loadUniversalTeacherStatus();
    if (this.canCreateManualAccounts()) {
      this.loadStaffUsers();
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('changePassword') === '1') {
      this.showPasswordChangeSection = true;
    }

    // Get current user immediately
    this.currentUser = this.authService.getCurrentUser();
    
    // Subscribe to user changes to ensure we have the latest user data
    this.userSubscription = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      // Force change detection to update the view
      this.cdr.detectChanges();
    });
    
    // Double-check user after a short delay (for production builds where user might load asynchronously)
    setTimeout(() => {
      const user = this.authService.getCurrentUser();
      if (user && !this.currentUser) {
        this.currentUser = user;
        this.cdr.detectChanges();
      }
    }, 200);
    
    // Initialize form - ensure email is cleared if role is teacher
    if (this.manualAccount.role === 'teacher') {
      this.manualAccount.email = '';
    }
  }

  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  loadUniversalTeacherStatus() {
    if (!this.isAdmin()) return;
    this.loadingUniversalTeacher = true;
    this.accountService.getUniversalTeacherStatus().subscribe({
      next: (data: any) => {
        this.universalTeacherStatus = {
          exists: !!data.exists,
          username: data.username,
          userId: data.userId,
          universalTeacherEnabled: data.universalTeacherEnabled
        };
        this.loadingUniversalTeacher = false;
      },
      error: () => {
        this.loadingUniversalTeacher = false;
      }
    });
  }

  loadTeachers() {
    this.loading = true;
    this.error = '';
    // Use paginated endpoint with a high limit so all teachers are loaded
    this.teacherService.getTeachersPaginated(1, 500).subscribe({
      next: (response: any) => {
        const data = Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []);
        this.teachers = data;
        
        // Load account info for each teacher
        safeArray(this.teachers).forEach((teacher: any) => {
          if (teacher.userId) {
            teacher.hasAccount = true;
            teacher.accountStatus = 'Active';
          } else {
            teacher.hasAccount = false;
            teacher.accountStatus = 'No Account';
          }
        });
        
        this.filterTeachers();
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to load teachers';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  filterTeachers() {
    let filtered = [...safeArray(this.teachers)];

    // Apply status filter
    if (this.filterStatus === 'with-account') {
      filtered = safeArray(filtered).filter(t => t.hasAccount);
    } else if (this.filterStatus === 'without-account') {
      filtered = safeArray(filtered).filter(t => !t.hasAccount);
    }

    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = safeArray(filtered).filter(teacher => 
        teacher.firstName?.toLowerCase().includes(query) ||
        teacher.lastName?.toLowerCase().includes(query) ||
        teacher.teacherId?.toLowerCase().includes(query) ||
        teacher.email?.toLowerCase().includes(query) ||
        teacher.accountStatus?.toLowerCase().includes(query)
      );
    }

    this.filteredTeachers = filtered;
    // Reset to first page whenever filters/search change
    this.currentPage = 1;
  }

  setFilter(status: 'all' | 'with-account' | 'without-account') {
    this.filterStatus = status;
    this.filterTeachers();
  }

  clearSearch() {
    this.searchQuery = '';
    this.filterTeachers();
  }

  clearFilters() {
    this.searchQuery = '';
    this.filterStatus = 'all';
    this.filterTeachers();
  }

  // Pagination helpers
  get totalPages(): number {
    if (!this.filteredTeachers || this.filteredTeachers.length === 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.filteredTeachers.length / this.pageSize));
  }

  get paginatedTeachers(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return safeArray(this.filteredTeachers).slice(start, start + this.pageSize);
  }

  onPageChange(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  onPageSizeChange(size: number) {
    this.pageSize = Number(size) || 50;
    this.currentPage = 1;
  }

  // Statistics
  getAccountsWithAccount(): number {
    return safeArray(this.teachers).filter(t => t.hasAccount).length;
  }

  getAccountsWithoutAccount(): number {
    return safeArray(this.teachers).filter(t => !t.hasAccount).length;
  }

  getAccountPercentage(): number {
    const teacherList = safeArray(this.teachers);
    if (teacherList.length === 0) return 0;
    return Math.round((this.getAccountsWithAccount() / teacherList.length) * 100);
  }

  // Modal Management
  openCreateAccountModal(teacher: any) {
    this.selectedTeacher = teacher;
    this.showCreateModal = true;
    this.sendCredentials = false;
    this.error = '';
  }

  closeCreateModal() {
    this.showCreateModal = false;
    this.selectedTeacher = null;
    this.sendCredentials = false;
  }

  confirmCreateAccount() {
    if (!this.selectedTeacher) return;

    this.creatingAccount = true;
    this.error = '';
    this.success = '';

    this.teacherService.createTeacherAccount(this.selectedTeacher.id).subscribe({
      next: (response: any) => {
        this.creatingAccount = false;
        const username = response.temporaryCredentials?.username || 'N/A';
        const password = response.temporaryCredentials?.password || 'N/A';
        
        this.success = `Account created successfully for ${this.selectedTeacher.firstName} ${this.selectedTeacher.lastName}. ` +
                      `<strong>Username:</strong> ${username}<br>` +
                      `<strong>Temporary Password:</strong> ${password}<br>` +
                      `<small>Please share these credentials with the teacher securely.</small>`;
        
        this.closeCreateModal();
        this.loadTeachers();
        setTimeout(() => this.success = '', 15000);
      },
      error: (err: any) => {
        this.creatingAccount = false;
        this.error = err.error?.message || 'Failed to create account';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  viewAccountDetails(teacher: any) {
    this.selectedTeacher = teacher;
    const rawRole = teacher.user?.role || teacher.role || 'teacher';
    this.selectedUserRoleForEdit = typeof rawRole === 'string' ? rawRole.toLowerCase() : 'teacher';
    this.showDetailsModal = true;
  }

  closeDetailsModal() {
    this.showDetailsModal = false;
    this.selectedTeacher = null;
    this.selectedUserRoleForEdit = '';
  }

  getEditableRoleOptions(): { value: string; label: string }[] {
    const all = this.manualAccountRoles;
    if (!this.isSuperAdmin()) {
      return all.filter(o => o.value !== 'superadmin');
    }
    return all;
  }

  updateUserRole() {
    if (!this.selectedTeacher?.userId) return;
    const newRole = (this.selectedUserRoleForEdit || '').trim().toLowerCase();
    if (!newRole) return;
    this.updatingRole = true;
    this.error = '';
    this.accountService.updateUserRole(this.selectedTeacher.userId, newRole).subscribe({
      next: (res: any) => {
        this.updatingRole = false;
        if (this.selectedTeacher.user) {
          this.selectedTeacher.user.role = newRole;
        } else {
          this.selectedTeacher.user = { id: this.selectedTeacher.userId, role: newRole };
        }
        this.success = `User role updated to ${newRole}.`;
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.updatingRole = false;
        this.error = err.error?.message || 'Failed to update role';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  isRoleChanged(): boolean {
    if (!this.selectedTeacher?.userId) return false;
    const current = (this.selectedTeacher.user?.role || '').toString().toLowerCase();
    const selected = (this.selectedUserRoleForEdit || '').toString().toLowerCase();
    return current !== selected;
  }

  openResetPasswordModal(teacher: any) {
    this.selectedTeacher = teacher;
    this.resetPasswordNewPassword = '';
    this.resetPasswordConfirm = '';
    this.showResetPasswordNew = false;
    this.showResetPasswordConfirm = false;
    this.error = '';
    this.success = '';
    this.showResetPasswordModal = true;
  }

  closeResetPasswordModal() {
    this.showResetPasswordModal = false;
    this.selectedTeacher = null;
    this.resetPasswordNewPassword = '';
    this.resetPasswordConfirm = '';
    this.showResetPasswordNew = false;
    this.showResetPasswordConfirm = false;
    this.error = '';
  }

  deleteAccount(teacher: any) {
    if (!teacher?.userId) return;
    const name = [teacher.firstName, teacher.lastName].filter(Boolean).join(' ') || teacher.teacherId || 'this teacher';
    if (!confirm(`Delete the login account for ${name}? They will no longer be able to sign in. The teacher record will remain and you can create a new account later.`)) {
      return;
    }
    this.deletingAccountUserId = teacher.userId;
    this.error = '';
    this.accountService.deleteUserAccount(teacher.userId).subscribe({
      next: () => {
        this.deletingAccountUserId = null;
        this.success = `Account deleted for ${name}. They can be given a new account from this page.`;
        this.loadTeachers();
        setTimeout(() => this.success = '', 8000);
      },
      error: (err: any) => {
        this.deletingAccountUserId = null;
        this.error = err.error?.message || 'Failed to delete account';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  resetPassword() {
    if (!this.selectedTeacher || !this.selectedTeacher.userId) {
      this.error = 'Teacher account not found';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    // Relaxed policy for teacher passwords: any non-empty string is allowed
    if (!this.resetPasswordNewPassword || !this.resetPasswordNewPassword.trim()) {
      this.error = 'Password is required';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    if (this.resetPasswordNewPassword !== this.resetPasswordConfirm) {
      this.error = 'Passwords do not match';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.resettingPassword = true;
    this.error = '';
    this.success = '';

    // Trim password to avoid whitespace issues
    const trimmedPassword = this.resetPasswordNewPassword.trim();
    
    this.accountService.resetUserPassword(this.selectedTeacher.userId, trimmedPassword).subscribe({
      next: (response: any) => {
        this.resettingPassword = false;
        this.error = '';
        this.success = `<strong>Password has been reset successfully.</strong><br>` +
          `Teacher: ${this.selectedTeacher.firstName} ${this.selectedTeacher.lastName}. ` +
          `They will be required to change it on next login.`;
        this.closeResetPasswordModal();
        this.scrollToSuccessMessage();
        setTimeout(() => this.success = '', 10000);
      },
      error: (err: any) => {
        this.resettingPassword = false;
        this.error = err.error?.message || 'Failed to reset password';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  private scrollToSuccessMessage(): void {
    setTimeout(() => {
      const el = document.getElementById('success-message');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 150);
  }

  toggleResetPasswordNewVisibility() {
    this.showResetPasswordNew = !this.showResetPasswordNew;
  }

  toggleResetPasswordConfirmVisibility() {
    this.showResetPasswordConfirm = !this.showResetPasswordConfirm;
  }

  createAccountForTeacher(teacher: any) {
    // Legacy method - redirects to modal
    this.openCreateAccountModal(teacher);
  }

  createUniversalTeacherAccount() {
    if (!this.universalTeacherStatus.universalTeacherEnabled) {
      this.error = 'Enable Universal Teacher in Settings first (Settings → Module Access Control).';
      setTimeout(() => this.error = '', 5000);
      return;
    }
    if (this.universalTeacherStatus.exists) {
      this.error = 'Universal teacher account already exists.';
      setTimeout(() => this.error = '', 5000);
      return;
    }
    const payload: any = { generatePassword: this.universalTeacherGeneratePassword };
    if (!this.universalTeacherGeneratePassword) {
      if (!this.universalTeacherPassword || this.universalTeacherPassword.trim().length < 8) {
        this.error = 'Password must be at least 8 characters long.';
        setTimeout(() => this.error = '', 5000);
        return;
      }
      payload.password = this.universalTeacherPassword.trim();
    }
    this.creatingUniversalTeacher = true;
    this.error = '';
    this.success = '';
    this.accountService.createUniversalTeacherAccount(payload).subscribe({
      next: (response: any) => {
        this.creatingUniversalTeacher = false;
        const password = response.temporaryCredentials?.password || payload.password;
        this.success = `Universal teacher account created. <strong>Username:</strong> ${response.user?.username || 'teacher'}<br>` +
          (password ? `<strong>Password:</strong> ${password}<br>` : '') +
          `<small>Share these credentials with teachers so they can test the system.</small>`;
        this.loadUniversalTeacherStatus();
        this.universalTeacherPassword = '';
        this.universalTeacherGeneratePassword = true;
        setTimeout(() => this.success = '', 15000);
      },
      error: (err: any) => {
        this.creatingUniversalTeacher = false;
        this.error = err.error?.message || 'Failed to create universal teacher account';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  openResetPasswordForUniversalTeacher() {
    if (!this.universalTeacherStatus.userId) return;
    this.selectedTeacher = {
      userId: this.universalTeacherStatus.userId,
      firstName: 'Universal',
      lastName: 'Teacher',
      teacherId: this.universalTeacherStatus.username || 'teacher'
    };
    this.openResetPasswordModal(this.selectedTeacher);
  }

  loadStaffUsers() {
    if (!this.canCreateManualAccounts()) return;
    this.loadingStaff = true;
    this.accountService.getStaffUsers().subscribe({
      next: (data: any) => {
        this.staffUsers = data.users || [];
        this.loadingStaff = false;
      },
      error: () => {
        this.loadingStaff = false;
      }
    });
  }

  openResetStaffModal(staff: any) {
    this.selectedStaff = staff;
    this.staffResetGeneratePassword = true;
    this.resetStaffPasswordNewPassword = '';
    this.resetStaffPasswordConfirm = '';
    this.error = '';
    this.showStaffResetModal = true;
  }

  closeResetStaffModal() {
    this.showStaffResetModal = false;
    this.selectedStaff = null;
    this.resetStaffPasswordNewPassword = '';
    this.resetStaffPasswordConfirm = '';
    this.showStaffResetNew = false;
    this.showStaffResetConfirm = false;
    this.error = '';
  }

  toggleStaffResetNewVisibility() {
    this.showStaffResetNew = !this.showStaffResetNew;
  }

  toggleStaffResetConfirmVisibility() {
    this.showStaffResetConfirm = !this.showStaffResetConfirm;
  }

  resetStaffPassword() {
    if (!this.selectedStaff?.id) return;
    if (this.staffResetGeneratePassword) {
      this.resettingStaffPassword = true;
      this.error = '';
      this.accountService.resetUserPassword(this.selectedStaff.id, '', true).subscribe({
      next: (response: any) => {
        this.resettingStaffPassword = false;
        this.error = '';
        const tempPass = response.temporaryPassword;
        const roleLabel = this.getStaffRoleLabel(this.selectedStaff.role);
        this.success = `<strong>Password has been reset successfully.</strong><br>` +
          `Account: ${roleLabel} (${this.selectedStaff.username}). ` +
          (tempPass
            ? `Temporary password: <strong>${tempPass}</strong> — share it securely; they must change it on first login.`
            : 'They must change it on first login.');
        this.closeResetStaffModal();
        this.loadStaffUsers();
        this.scrollToSuccessMessage();
        setTimeout(() => this.success = '', 15000);
      },
      error: (err: any) => {
        this.resettingStaffPassword = false;
        this.error = err.error?.message || 'Failed to reset password';
        setTimeout(() => this.error = '', 5000);
      }
    });
      return;
    }
    // Keep stronger policy for staff (admin/superadmin/accountant): still require 8+ chars
    if (!this.resetStaffPasswordNewPassword || this.resetStaffPasswordNewPassword.trim().length < 8) {
      this.error = 'Password must be at least 8 characters long';
      return;
    }
    if (this.resetStaffPasswordNewPassword !== this.resetStaffPasswordConfirm) {
      this.error = 'Passwords do not match';
      return;
    }
    this.resettingStaffPassword = true;
    this.error = '';
    this.accountService.resetUserPassword(this.selectedStaff.id, this.resetStaffPasswordNewPassword.trim()).subscribe({
      next: () => {
        this.resettingStaffPassword = false;
        this.error = '';
        const roleLabel = this.getStaffRoleLabel(this.selectedStaff.role);
        this.success = `<strong>Password has been reset successfully.</strong><br>` +
          `Account: ${roleLabel} (${this.selectedStaff.username}). They must change it on first login.`;
        this.closeResetStaffModal();
        this.loadStaffUsers();
        this.scrollToSuccessMessage();
        setTimeout(() => this.success = '', 10000);
      },
      error: (err: any) => {
        this.resettingStaffPassword = false;
        this.error = err.error?.message || 'Failed to reset password';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  unlockStaff(staff: any) {
    if (!staff?.id) return;
    this.unlockingStaffId = staff.id;
    this.accountService.unlockUser(staff.id).subscribe({
      next: () => {
        this.unlockingStaffId = null;
        this.success = `Account unlocked for ${staff.role} (${staff.username}).`;
        this.loadStaffUsers();
        setTimeout(() => this.success = '', 6000);
      },
      error: (err: any) => {
        this.unlockingStaffId = null;
        this.error = err.error?.message || 'Failed to unlock account';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  getStaffRoleLabel(role: string): string {
    const r = (role || '').toLowerCase();
    if (r === 'superadmin') return 'Super Admin';
    if (r === 'admin') return 'Administrator';
    if (r === 'accountant') return 'Accountant';
    return role || '—';
  }

  isCurrentUser(userId: string): boolean {
    const user = this.currentUser || this.authService.getCurrentUser();
    return !!user && user.id === userId;
  }

  /** True if the current user can delete this staff account (not self; only Super Admin can delete Super Admin). */
  canDeleteStaffAccount(staff: any): boolean {
    if (!staff?.id || this.isCurrentUser(staff.id)) return false;
    const role = (staff.role || '').toLowerCase();
    if (role === 'superadmin') return this.isSuperAdmin();
    return true; // admin or accountant: both admin and superadmin can delete
  }

  deleteStaffAccount(staff: any) {
    if (!staff?.id) return;
    const label = this.getStaffRoleLabel(staff.role) + ' (' + (staff.username || staff.email) + ')';
    if (!confirm(`Delete the account for ${label}? They will no longer be able to sign in.`)) {
      return;
    }
    this.deletingStaffId = staff.id;
    this.error = '';
    this.accountService.deleteUserAccount(staff.id).subscribe({
      next: () => {
        this.deletingStaffId = null;
        this.success = `Account deleted for ${label}.`;
        this.loadStaffUsers();
        setTimeout(() => this.success = '', 8000);
      },
      error: (err: any) => {
        this.deletingStaffId = null;
        this.error = err.error?.message || 'Failed to delete account';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  /** Whether the current user can edit this staff's role/username/email (Super Admin required for Super Admin target). */
  canEditStaffField(staff: any): boolean {
    if (!staff?.id || this.isCurrentUser(staff.id)) return false;
    const role = (staff.role || '').toLowerCase();
    if (role === 'superadmin') return this.isSuperAdmin();
    return true;
  }

  openStaffProfileModal(staff: any, field?: 'role' | 'username' | 'email'): void {
    if (!staff || !this.canEditStaffField(staff)) return;
    this.staffProfileTarget = staff;
    this.editStaffRoleValue = (staff.role || 'admin').toLowerCase();
    this.editStaffUsernameValue = staff.username || '';
    this.editStaffEmailValue = staff.email || '';
    this.editStaffField = field || null;
    this.error = '';
    this.showStaffProfileModal = true;
  }

  closeStaffProfileModal(): void {
    this.showStaffProfileModal = false;
    this.staffProfileTarget = null;
    this.editStaffField = null;
    this.editStaffRoleValue = '';
    this.editStaffUsernameValue = '';
    this.editStaffEmailValue = '';
    this.error = '';
  }

  startEditStaffField(field: 'role' | 'username' | 'email'): void {
    if (!this.staffProfileTarget || !this.canEditStaffField(this.staffProfileTarget)) return;
    this.editStaffField = field;
    if (field === 'role') this.editStaffRoleValue = (this.staffProfileTarget.role || 'admin').toLowerCase();
    if (field === 'username') this.editStaffUsernameValue = this.staffProfileTarget.username || '';
    if (field === 'email') this.editStaffEmailValue = this.staffProfileTarget.email || '';
    this.error = '';
  }

  cancelEditStaffField(): void {
    this.editStaffField = null;
    this.error = '';
  }

  saveStaffRole(): void {
    if (!this.staffProfileTarget?.id || !this.editStaffRoleValue) return;
    this.updatingStaffField = true;
    this.error = '';
    this.accountService.updateUserRole(this.staffProfileTarget.id, this.editStaffRoleValue).subscribe({
      next: (res: any) => {
        this.updatingStaffField = false;
        if (res?.user) {
          this.staffProfileTarget.role = res.user.role;
          const idx = this.staffUsers.findIndex((u: any) => u.id === this.staffProfileTarget.id);
          if (idx >= 0) this.staffUsers[idx] = { ...this.staffUsers[idx], ...res.user };
        }
        this.success = 'Role updated successfully.';
        this.cancelEditStaffField();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.updatingStaffField = false;
        this.error = err.error?.message || 'Failed to update role';
      }
    });
  }

  saveStaffUsername(): void {
    if (!this.staffProfileTarget?.id || !this.editStaffUsernameValue?.trim()) return;
    this.updatingStaffField = true;
    this.error = '';
    this.accountService.updateStaffProfile(this.staffProfileTarget.id, { username: this.editStaffUsernameValue.trim() }).subscribe({
      next: (res: any) => {
        this.updatingStaffField = false;
        if (res?.user) {
          this.staffProfileTarget.username = res.user.username;
          const idx = this.staffUsers.findIndex((u: any) => u.id === this.staffProfileTarget.id);
          if (idx >= 0) this.staffUsers[idx] = { ...this.staffUsers[idx], username: res.user.username };
        }
        this.success = 'Username updated successfully.';
        this.cancelEditStaffField();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.updatingStaffField = false;
        this.error = err.error?.message || 'Failed to update username';
      }
    });
  }

  saveStaffEmail(): void {
    if (!this.staffProfileTarget?.id) return;
    this.updatingStaffField = true;
    this.error = '';
    const email = (this.editStaffEmailValue ?? '').trim();
    this.accountService.updateStaffProfile(this.staffProfileTarget.id, { email }).subscribe({
      next: (res: any) => {
        this.updatingStaffField = false;
        if (res?.user) {
          this.staffProfileTarget.email = res.user.email;
          const idx = this.staffUsers.findIndex((u: any) => u.id === this.staffProfileTarget.id);
          if (idx >= 0) this.staffUsers[idx] = { ...this.staffUsers[idx], email: res.user.email };
        }
        this.success = 'Email updated successfully.';
        this.cancelEditStaffField();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.updatingStaffField = false;
        this.error = err.error?.message || 'Failed to update email';
      }
    });
  }

  // Password change methods
  togglePasswordChangeSection() {
    this.showPasswordChangeSection = !this.showPasswordChangeSection;
    if (!this.showPasswordChangeSection) {
      this.resetPasswordForm();
    }
  }

  resetPasswordForm() {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.showCurrentPassword = false;
    this.showNewPassword = false;
    this.showConfirmPassword = false;
    this.error = '';
    this.success = '';
  }

  changePassword() {
    // Validation
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.error = 'Please fill in all password fields';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    if (this.newPassword.length < 8) {
      this.error = 'New password must be at least 8 characters long';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'New password and confirm password do not match';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.changingPassword = true;
    this.error = '';
    this.success = '';

    const updateData = {
      currentPassword: this.currentPassword,
      newPassword: this.newPassword
    };

    this.accountService.updateAccount(updateData).subscribe({
      next: (response: any) => {
        this.changingPassword = false;
        this.success = 'Password changed successfully!';
        this.resetPasswordForm();
        setTimeout(() => {
          this.success = '';
          this.showPasswordChangeSection = false;
        }, 3000);
      },
      error: (err: any) => {
        this.changingPassword = false;
        this.error = err.error?.message || 'Failed to change password';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  toggleCurrentPasswordVisibility() {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  toggleNewPasswordVisibility() {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  getCurrentAdminInfo() {
    // Use currentUser from subscription or get fresh from service
    const user = this.currentUser || this.authService.getCurrentUser();
    // Only return info if user exists and is admin or superadmin
    if (user && (user.role === 'admin' || user.role === 'superadmin')) {
      return {
        email: user.email,
        username: user.username || user.email,
        role: user.role,
        isDemo: user.isDemo || false
      };
    }
    return null;
  }

  getRoleLabel(role: string | undefined): string {
    if (!role) return '—';
    const r = role.toLowerCase();
    if (r === 'superadmin') return 'Super Admin';
    if (r === 'admin') return 'Administrator';
    return role;
  }

  canEditOwnRole(): boolean {
    return this.isSuperAdmin();
  }

  openEditRoleModal(): void {
    const info = this.getCurrentAdminInfo();
    if (!info) return;
    this.editRoleValue = (info.role || 'admin').toLowerCase();
    this.error = '';
    this.showEditRoleModal = true;
  }

  closeEditRoleModal(): void {
    this.showEditRoleModal = false;
    this.editRoleValue = '';
    this.error = '';
  }

  saveOwnRole(): void {
    const user = this.currentUser || this.authService.getCurrentUser();
    if (!user?.id || !this.editRoleValue) return;
    this.updatingOwnRole = true;
    this.error = '';
    this.accountService.updateUserRole(user.id, this.editRoleValue).subscribe({
      next: (res: any) => {
        this.updatingOwnRole = false;
        if (res?.user) this.authService.setCurrentUser({ ...user, ...res.user });
        this.currentUser = this.authService.getCurrentUser();
        this.success = 'Role updated successfully.';
        this.closeEditRoleModal();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.updatingOwnRole = false;
        this.error = err.error?.message || 'Failed to update role';
      }
    });
  }

  openEditUsernameModal(): void {
    const info = this.getCurrentAdminInfo();
    if (!info) return;
    this.editUsernameValue = info.username || '';
    this.editUsernamePassword = '';
    this.error = '';
    this.showEditUsernameModal = true;
  }

  closeEditUsernameModal(): void {
    this.showEditUsernameModal = false;
    this.editUsernameValue = '';
    this.editUsernamePassword = '';
    this.showEditUsernamePassword = false;
    this.error = '';
  }

  toggleEditUsernamePasswordVisibility(): void {
    this.showEditUsernamePassword = !this.showEditUsernamePassword;
  }

  saveOwnUsername(): void {
    if (!this.editUsernameValue?.trim() || !this.editUsernamePassword) return;
    this.updatingOwnUsername = true;
    this.error = '';
    this.accountService.updateAccount({
      currentPassword: this.editUsernamePassword,
      newUsername: this.editUsernameValue.trim()
    }).subscribe({
      next: (res: any) => {
        this.updatingOwnUsername = false;
        if (res?.user) this.authService.setCurrentUser(res.user);
        this.currentUser = this.authService.getCurrentUser();
        this.success = 'Username updated successfully.';
        this.closeEditUsernameModal();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.updatingOwnUsername = false;
        this.error = err.error?.message || 'Failed to update username';
      }
    });
  }

  openEditEmailModal(): void {
    const info = this.getCurrentAdminInfo();
    if (!info) return;
    this.editEmailValue = info.email || '';
    this.editEmailPassword = '';
    this.error = '';
    this.showEditEmailModal = true;
  }

  closeEditEmailModal(): void {
    this.showEditEmailModal = false;
    this.editEmailValue = '';
    this.editEmailPassword = '';
    this.showEditEmailPassword = false;
    this.error = '';
  }

  toggleEditEmailPasswordVisibility(): void {
    this.showEditEmailPassword = !this.showEditEmailPassword;
  }

  saveOwnEmail(): void {
    if (!this.editEmailValue?.trim() || !this.editEmailPassword) return;
    this.updatingOwnEmail = true;
    this.error = '';
    this.accountService.updateAccount({
      currentPassword: this.editEmailPassword,
      newEmail: this.editEmailValue.trim()
    }).subscribe({
      next: (res: any) => {
        this.updatingOwnEmail = false;
        if (res?.user) this.authService.setCurrentUser(res.user);
        this.currentUser = this.authService.getCurrentUser();
        this.success = 'Email updated successfully.';
        this.closeEditEmailModal();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.updatingOwnEmail = false;
        this.error = err.error?.message || 'Failed to update email';
      }
    });
  }

  isDemoUser(): boolean {
    // Use currentUser from subscription or get fresh from service
    const user = this.currentUser || this.authService.getCurrentUser();
    // Safely check if user is demo (handle undefined isDemo field)
    return user?.isDemo === true;
  }

  isAdmin(): boolean {
    // Use currentUser from subscription or get fresh from service
    const user = this.currentUser || this.authService.getCurrentUser();
    return user?.role === 'admin' || user?.role === 'superadmin';
  }

  isSuperAdmin(): boolean {
    const user = this.currentUser || this.authService.getCurrentUser();
    return user?.role === 'superadmin';
  }

  canCreateManualAccounts(): boolean {
    return this.isAdmin();
  }

  toggleManualPasswordVisibility() {
    this.showManualPassword = !this.showManualPassword;
  }

  resetManualAccountForm() {
    this.manualAccount = this.getDefaultManualAccountForm();
    this.showManualPassword = false;
  }

  onRoleChange() {
    // Clear email when switching to teacher role (teacher accounts use TeacherID as username)
    if (this.manualAccount.role === 'teacher') {
      this.manualAccount.email = '';
    }
    // Force change detection to update the view when role changes
    this.cdr.detectChanges();
  }

  private getDefaultManualAccountForm() {
    return {
      email: '',
      username: '',
      role: 'accountant',
      generatePassword: true,
      password: '',
      isDemo: false
    };
  }

  createManualAccount() {
    const role = (this.manualAccount.role || '').trim();

    // Validation for teacher accounts: username (Employee Number) is mandatory, email optional
    if (role === 'teacher') {
      if (!this.manualAccount.username || !this.manualAccount.username.trim()) {
        this.error = 'Username (Teacher ID) is required for teacher accounts';
        setTimeout(() => this.error = '', 5000);
        return;
      }
    } else {
      // For other roles, email and role are required
      if (!this.manualAccount.email || !role) {
        this.error = 'Email and role are required to create an account';
        setTimeout(() => this.error = '', 5000);
        return;
      }
    }

    if (!this.manualAccount.generatePassword) {
      if (!this.manualAccount.password || !this.manualAccount.password.trim()) {
        this.error = 'Please provide a password';
        setTimeout(() => this.error = '', 5000);
        return;
      }
    }

    const isDemoRole = role === 'demo-user';
    const resolvedRole = isDemoRole ? 'admin' : role;

    this.creatingUserAccount = true;
    this.error = '';
    this.success = '';

    const payload: any = {
      role: resolvedRole,
      username: this.manualAccount.username?.trim() || undefined,
      generatePassword: this.manualAccount.generatePassword
    };

    // Email is required for non-teacher roles; omit email for teacher so it is username-only
    if (resolvedRole !== 'teacher') {
      payload.email = (this.manualAccount.email || '').trim();
    }

    if (!this.manualAccount.generatePassword) {
      payload.password = this.manualAccount.password.trim();
    }

    if (isDemoRole || (this.manualAccount.isDemo && this.isSuperAdmin())) {
      payload.isDemo = true;
    }

    this.accountService.createUserAccount(payload).subscribe({
      next: (response: any) => {
        this.creatingUserAccount = false;
        const password = response.temporaryCredentials?.password || payload.password;
        const displayName = response.user?.email || payload.email || response.user?.username || payload.username || 'N/A';
        const messageParts = [
          `Account created for <strong>${displayName}</strong>.`,
          `<strong>Role:</strong> ${response.user?.role || payload.role}`
        ];
        if (password) {
          messageParts.push(`<strong>Temporary Password:</strong> ${password}`);
        }
        this.success = messageParts.join('<br>');
        this.resetManualAccountForm();
        // If a teacher account was created, refresh the teacher list so it appears in the table
        if (resolvedRole === 'teacher') {
          this.loadTeachers();
        }
        setTimeout(() => this.success = '', 12000);
      },
      error: (err: any) => {
        this.creatingUserAccount = false;
        this.error = err.error?.message || 'Failed to create user account';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}

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
    { value: 'parent', label: 'Parent' },
    { value: 'student', label: 'Student' },
    { value: 'demo-user', label: 'Demo User' }
  ];
  manualAccount = this.getDefaultManualAccountForm();
  
  // Search and filter
  searchQuery = '';
  filterStatus: 'all' | 'with-account' | 'without-account' = 'all';
  
  // Modals
  showCreateModal = false;
  showDetailsModal = false;
  showResetPasswordModal = false;
  sendCredentials = false;
  
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

  constructor(
    private teacherService: TeacherService,
    private accountService: AccountService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadTeachers();
    this.loadUniversalTeacherStatus();

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
    
    this.teacherService.getTeachers().subscribe({
      next: (data: any) => {
        this.teachers = Array.isArray(data) ? data : (data.teachers || []);
        
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
    if (this.isSuperAdmin()) return all;
    return all.filter(o => o.value !== 'superadmin');
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

  resetPassword() {
    if (!this.selectedTeacher || !this.selectedTeacher.userId) {
      this.error = 'Teacher account not found';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    // Validation
    if (!this.resetPasswordNewPassword || this.resetPasswordNewPassword.trim().length < 8) {
      this.error = 'Password must be at least 8 characters long';
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
        this.success = `Password reset successfully for ${this.selectedTeacher.firstName} ${this.selectedTeacher.lastName}. ` +
                      `The teacher will be required to change it on next login.`;
        this.closeResetPasswordModal();
        setTimeout(() => this.success = '', 10000);
      },
      error: (err: any) => {
        this.resettingPassword = false;
        this.error = err.error?.message || 'Failed to reset password';
        setTimeout(() => this.error = '', 5000);
      }
    });
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
    // Clear email when switching to teacher role
    if (this.manualAccount.role === 'teacher') {
      this.manualAccount.email = '';
      // Ensure username is required for teachers
      if (!this.manualAccount.username || !this.manualAccount.username.trim()) {
        // Username will be required by the form validation
      }
    }
    // Force change detection to update the view
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
    // For teachers, username is mandatory, email is not required
    if (this.manualAccount.role === 'teacher') {
      if (!this.manualAccount.username || !this.manualAccount.username.trim()) {
        this.error = 'Username is mandatory for teacher accounts';
        setTimeout(() => this.error = '', 5000);
        return;
      }
      if (!this.manualAccount.role) {
        this.error = 'Role is required';
        setTimeout(() => this.error = '', 5000);
        return;
      }
    } else {
      // For other roles, email is required
      if (!this.manualAccount.email || !this.manualAccount.role) {
        this.error = 'Email and role are required to create an account';
        setTimeout(() => this.error = '', 5000);
        return;
      }
    }

    if (!this.manualAccount.generatePassword) {
      if (!this.manualAccount.password || this.manualAccount.password.trim().length < 8) {
        this.error = 'Please provide a password with at least 8 characters';
        setTimeout(() => this.error = '', 5000);
        return;
      }
    }

    const isDemoRole = this.manualAccount.role === 'demo-user';
    const resolvedRole = isDemoRole ? 'admin' : this.manualAccount.role;

    this.creatingUserAccount = true;
    this.error = '';
    this.success = '';

    const payload: any = {
      role: resolvedRole,
      username: this.manualAccount.username?.trim() || undefined,
      generatePassword: this.manualAccount.generatePassword
    };
    
    // Email is not required for teachers, required for other roles
    if (resolvedRole !== 'teacher') {
      payload.email = this.manualAccount.email.trim();
    }
    // Do not include email for teachers - teachers login with username and password only

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
        if (resolvedRole === 'teacher') {
          messageParts.push(`<small>Account linked to existing teacher. Share the credentials with the teacher.</small>`);
        }
        this.success = messageParts.join('<br>');
        this.resetManualAccountForm();
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

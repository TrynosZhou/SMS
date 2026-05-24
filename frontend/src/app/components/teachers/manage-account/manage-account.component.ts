import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { timeout, finalize } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { AccountService } from '../../../services/account.service';

@Component({
  standalone: false,  selector: 'app-manage-account',
templateUrl: './manage-account.component.html',
  styleUrls: ['./manage-account.component.css']
})
export class ManageAccountComponent implements OnInit {
  accountInfo: any = null;
  currentUsername = '';
  currentEmail = '';
  newUsername = '';
  newEmail = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  loadingProfile = false;
  saving = false;
  error = '';
  success = '';
  isTeacher = false;
  isAccountant = false;
  isDemo = false;
  mustChangePassword = false;
  canChangeUsername = true;
  roleLabel = 'User';
  
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  constructor(
    private accountService: AccountService,
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
    this.hydrateFromSession();
    this.loadAccountInfo();
  }

  /** Show the form immediately from login session; refresh from API in background. */
  private hydrateFromSession(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return;
    }
    this.applyAccountData({
      username: currentUser.username || currentUser.email || '',
      email: currentUser.email || '',
      role: currentUser.role || '',
      isDemo: currentUser.isDemo === true,
      mustChangePassword: currentUser.mustChangePassword === true,
    });
  }

  private applyAccountData(data: {
    username?: string;
    email?: string;
    role?: string;
    isDemo?: boolean;
    mustChangePassword?: boolean;
  }): void {
    this.accountInfo = { ...this.accountInfo, ...data };
    this.currentUsername = data.username || '';
    this.currentEmail = data.email || '';
    this.newUsername = this.currentUsername;
    this.newEmail = this.currentEmail;
    const role = (data.role || '').toLowerCase();
    this.isTeacher = role === 'teacher';
    this.isAccountant = role === 'accountant';
    this.isDemo = data.isDemo === true;
    this.roleLabel = this.formatRoleLabel(role);
    this.mustChangePassword = data.mustChangePassword === true;
    this.canChangeUsername = !this.isTeacher || !this.mustChangePassword;
  }

  loadAccountInfo() {
    this.loadingProfile = true;
    this.accountService
      .getAccountInfo()
      .pipe(
        timeout(20000),
        finalize(() => {
          this.loadingProfile = false;
        })
      )
      .subscribe({
        next: (data: any) => {
          if (!data) {
            return;
          }
          this.applyAccountData({
            username: data.username || '',
            email: data.email || '',
            role: data.role || '',
            isDemo: data.isDemo === true,
            mustChangePassword: data.mustChangePassword === true,
          });
          this.accountInfo = { ...this.accountInfo, ...data };
        },
        error: (err: any) => {
          if (!this.accountInfo) {
            this.hydrateFromSession();
          }
          const msg =
            err?.name === 'TimeoutError'
              ? 'Could not reach the server in time. You can still change your password below.'
              : err?.error?.message || 'Could not refresh account details. You can still change your password.';
          this.error = msg;
          setTimeout(() => (this.error = ''), 8000);
        },
      });
  }

  get requiresMinPasswordLength(): boolean {
    const role = (this.accountInfo?.role || this.authService.getCurrentUser()?.role || '').toLowerCase();
    return [
      'admin',
      'superadmin',
      'director',
      'accountant',
      'headmaster',
      'deputy_headmaster',
    ].includes(role);
  }

  get passwordLengthOk(): boolean {
    const min = this.requiresMinPasswordLength ? 8 : 1;
    return (this.newPassword || '').length >= min;
  }

  get hasUpper(): boolean {
    return /[A-Z]/.test(this.newPassword || '');
  }

  get hasLower(): boolean {
    return /[a-z]/.test(this.newPassword || '');
  }

  get hasNumber(): boolean {
    return /\d/.test(this.newPassword || '');
  }

  get hasSpecial(): boolean {
    return /[^A-Za-z0-9]/.test(this.newPassword || '');
  }

  get passwordsMatch(): boolean {
    return !!this.newPassword && this.newPassword === this.confirmPassword;
  }

  get strengthScore(): number {
    let score = 0;
    if (this.passwordLengthOk) score++;
    if (this.hasUpper) score++;
    if (this.hasLower) score++;
    if (this.hasNumber) score++;
    if (this.hasSpecial) score++;
    return score;
  }

  get strengthLabel(): string {
    const s = this.strengthScore;
    if (s <= 1) return 'Very Weak';
    if (s === 2) return 'Weak';
    if (s === 3) return 'Medium';
    if (s === 4) return 'Strong';
    return 'Very Strong';
  }

  get strengthClass(): string {
    const s = this.strengthScore;
    if (s <= 1) return 'very-weak';
    if (s === 2) return 'weak';
    if (s === 3) return 'medium';
    if (s === 4) return 'strong';
    return 'very-strong';
  }

  get canSubmit(): boolean {
    if (this.isDemo || this.saving || !this.accountInfo) return false;
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword || !this.passwordsMatch) {
      return false;
    }
    if (this.requiresMinPasswordLength && this.newPassword.length < 8) {
      return false;
    }
    return true;
  }

  updateAccount() {
    if (this.isDemo) {
      this.error = 'Demo accounts cannot change password.';
      return;
    }

    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.error = 'Please fill in all password fields';
      return;
    }

    if (this.requiresMinPasswordLength && this.newPassword.length < 8) {
      this.error = 'New password must be at least 8 characters long';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'New password and confirm password do not match';
      return;
    }

    this.saving = true;
    this.error = '';
    this.success = '';

    const updateData: any = {
      currentPassword: this.currentPassword,
      newPassword: this.newPassword
    };
    
    // For teachers, username (TeacherID) cannot be changed
    if (this.canChangeUsername && this.newUsername && this.newUsername !== this.currentUsername) {
      updateData.newUsername = this.newUsername;
    }
    
    // Email is not used for teachers
    if (!this.isTeacher && !this.isAccountant && this.newEmail && this.newEmail !== this.currentEmail) {
      updateData.newEmail = this.newEmail;
    }

    this.accountService.updateAccount(updateData).subscribe({
      next: (response: any) => {
        this.saving = false;
        this.success = 'Account updated successfully! Redirecting to dashboard...';
        
        const currentUser = this.authService.getCurrentUser();
        if (currentUser && response.user) {
          currentUser.username = response.user.username || response.user.email;
          currentUser.mustChangePassword = false;
          this.authService.setCurrentUser(currentUser);
        }
        
        setTimeout(() => {
          this.navigateToDashboard();
        }, 2000);
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err.error?.message || 'Failed to update account';
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

  goToDashboard() {
    this.navigateToDashboard();
  }

  private navigateToDashboard(): void {
    this.router.navigate([this.authService.getDashboardRoute()]);
  }

  private formatRoleLabel(role: string): string {
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
    return role || 'User';
  }
}

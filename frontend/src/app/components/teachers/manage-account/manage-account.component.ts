import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { AccountService } from '../../../services/account.service';

@Component({
  selector: 'app-manage-account',
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
  loading = false;
  error = '';
  success = '';
  isTeacher = false;
  isAccountant = false;
  mustChangePassword = false;
  canChangeUsername = true;
  
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  constructor(
    private accountService: AccountService,
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadAccountInfo();
  }

  loadAccountInfo() {
    this.loading = true;
    this.accountService.getAccountInfo().subscribe({
      next: (data: any) => {
        this.accountInfo = data;
        this.currentUsername = data.username || '';
        this.currentEmail = data.email || '';
        this.newUsername = this.currentUsername;
        this.newEmail = this.currentEmail;
        this.isTeacher = (data.role || '').toLowerCase() === 'teacher';
        this.isAccountant = (data.role || '').toLowerCase() === 'accountant';
        this.mustChangePassword = data.mustChangePassword === true;
        // For teachers, username (TeacherID) cannot be changed, especially on first login
        this.canChangeUsername = !this.isTeacher || !this.mustChangePassword;
        this.loading = false;
      },
      error: (err: any) => {
        const currentUser = this.authService.getCurrentUser();
        this.accountInfo = {
          username: currentUser?.username || currentUser?.email || '',
          email: currentUser?.email || '',
          role: currentUser?.role || ''
        };
        this.currentUsername = this.accountInfo.username;
        this.currentEmail = this.accountInfo.email;
        this.newUsername = this.currentUsername;
        this.newEmail = this.currentEmail;
        this.isTeacher = this.accountInfo.role?.toLowerCase() === 'teacher';
        this.isAccountant = this.accountInfo.role?.toLowerCase() === 'accountant';
        this.mustChangePassword = currentUser?.mustChangePassword === true;
        this.canChangeUsername = !this.isTeacher || !this.mustChangePassword;
        this.loading = false;
        this.error = err.error?.message || 'Failed to load account information. You can still change your password below.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  get passwordLengthOk(): boolean {
    return (this.newPassword || '').length >= 8;
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
    return !!this.currentPassword && this.passwordLengthOk && this.hasUpper && this.hasLower && this.hasNumber && this.hasSpecial && this.passwordsMatch && !this.loading;
  }

  updateAccount() {
    // Validation - password fields are required, username/email are optional
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.error = 'Please fill in all password fields';
      return;
    }

    if (this.newPassword.length < 8) {
      this.error = 'New password must be at least 8 characters long';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'New password and confirm password do not match';
      return;
    }

    this.loading = true;
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
        this.loading = false;
        this.success = 'Account updated successfully! Redirecting to dashboard...';
        
        // Update local storage with new user info
        const currentUser = this.authService.getCurrentUser();
        if (currentUser && response.user) {
          currentUser.username = response.user.username || response.user.email;
          localStorage.setItem('user', JSON.stringify(currentUser));
        }
        
        setTimeout(() => {
          // Redirect based on user role
          const currentUser = this.authService.getCurrentUser();
          if (currentUser?.role === 'PARENT') {
            this.router.navigate(['/parent/dashboard']);
          } else {
            this.router.navigate(['/dashboard']);
          }
        }, 2000);
      },
      error: (err: any) => {
        this.loading = false;
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
    // Redirect based on user role
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.role === 'PARENT') {
      this.router.navigate(['/parent/dashboard']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}

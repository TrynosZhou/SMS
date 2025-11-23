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
        this.isTeacher = data.role === 'teacher';
        this.mustChangePassword = data.mustChangePassword === true;
        // For teachers, username (TeacherID) cannot be changed, especially on first login
        this.canChangeUsername = !this.isTeacher || !this.mustChangePassword;
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to load account information';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
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
    if (!this.isTeacher && this.newEmail && this.newEmail !== this.currentEmail) {
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

import { Component, OnInit } from '@angular/core';
import { TeacherService } from '../../../services/teacher.service';
import { AccountService } from '../../../services/account.service';
import { AuthService } from '../../../services/auth.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

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
export class ManageAccountsComponent implements OnInit {
  teachers: any[] = [];
  filteredTeachers: any[] = [];
  loading = false;
  error = '';
  success = '';
  creatingAccount = false;
  selectedTeacher: any = null;
  
  // Search and filter
  searchQuery = '';
  filterStatus: 'all' | 'with-account' | 'without-account' = 'all';
  
  // Modals
  showCreateModal = false;
  showDetailsModal = false;
  sendCredentials = false;

  // Password change
  showPasswordChangeSection = false;
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  changingPassword = false;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  constructor(
    private teacherService: TeacherService,
    private accountService: AccountService,
    private authService: AuthService
  ) { }

  ngOnInit() {
    this.loadTeachers();
  }

  loadTeachers() {
    this.loading = true;
    this.error = '';
    
    this.teacherService.getTeachers().subscribe({
      next: (data: any) => {
        this.teachers = Array.isArray(data) ? data : (data.teachers || []);
        
        // Load account info for each teacher
        this.teachers.forEach((teacher: any) => {
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
    let filtered = [...this.teachers];

    // Apply status filter
    if (this.filterStatus === 'with-account') {
      filtered = filtered.filter(t => t.hasAccount);
    } else if (this.filterStatus === 'without-account') {
      filtered = filtered.filter(t => !t.hasAccount);
    }

    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(teacher => 
        teacher.firstName?.toLowerCase().includes(query) ||
        teacher.lastName?.toLowerCase().includes(query) ||
        teacher.employeeNumber?.toLowerCase().includes(query) ||
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
    return this.teachers.filter(t => t.hasAccount).length;
  }

  getAccountsWithoutAccount(): number {
    return this.teachers.filter(t => !t.hasAccount).length;
  }

  getAccountPercentage(): number {
    if (this.teachers.length === 0) return 0;
    return Math.round((this.getAccountsWithAccount() / this.teachers.length) * 100);
  }

  // Modal Management
  openCreateAccountModal(teacher: any) {
    this.selectedTeacher = teacher;
    this.showCreateModal = true;
    this.sendCredentials = false;
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
    this.showDetailsModal = true;
  }

  closeDetailsModal() {
    this.showDetailsModal = false;
    this.selectedTeacher = null;
  }

  resetPassword(teacher: any) {
    if (!confirm(`Reset password for ${teacher.firstName} ${teacher.lastName}? A new temporary password will be generated.`)) {
      return;
    }

    this.error = '';
    this.success = '';

    // Note: This feature requires a backend endpoint for password reset
    // For now, we'll show a message that this feature needs to be implemented
    // You can implement the endpoint and update this method accordingly
    this.error = 'Password reset feature is not yet implemented. Please contact the system administrator.';
    setTimeout(() => this.error = '', 5000);
    
    // Uncomment and update when backend endpoint is available:
    /*
    this.accountService.resetPassword(teacher.userId).subscribe({
      next: (response: any) => {
        const newPassword = response.temporaryPassword || 'N/A';
        this.success = `Password reset successfully for ${teacher.firstName} ${teacher.lastName}. ` +
                      `<strong>New Temporary Password:</strong> ${newPassword}`;
        setTimeout(() => this.success = '', 10000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to reset password';
        setTimeout(() => this.error = '', 5000);
      }
    });
    */
  }

  createAccountForTeacher(teacher: any) {
    // Legacy method - redirects to modal
    this.openCreateAccountModal(teacher);
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
    const user = this.authService.getCurrentUser();
    return user ? {
      email: user.email,
      username: user.username || user.email,
      role: user.role
    } : null;
  }
}

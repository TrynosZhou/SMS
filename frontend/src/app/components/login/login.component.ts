import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  // Tab management
  activeTab: 'signin' | 'signup' | 'reset' = 'signin';
  
  // Sign In fields
  email = '';
  password = '';
  
  // Sign Up fields
  signupRole = '';
  signupUsername = '';
  signupPassword = '';
  signupConfirmPassword = '';
  signupFirstName = '';
  signupLastName = '';
  signupContactNumber = '';
  signupEmail = '';
  
  // Password Reset fields
  resetEmail = '';
  
  error = '';
  success = '';
  loading = false;
  
  // Password visibility toggles
  showPassword = false;
  showSignupPassword = false;
  showSignupConfirmPassword = false;

  constructor(private authService: AuthService, private router: Router) { }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  toggleSignupPasswordVisibility() {
    this.showSignupPassword = !this.showSignupPassword;
  }

  toggleSignupConfirmPasswordVisibility() {
    this.showSignupConfirmPassword = !this.showSignupConfirmPassword;
  }

  setTab(tab: 'signin' | 'signup' | 'reset') {
    this.activeTab = tab;
    this.error = '';
    this.success = '';
    // Clear all fields when switching tabs
    this.email = '';
    this.password = '';
    this.signupRole = '';
    this.signupUsername = '';
    this.signupPassword = '';
    this.signupConfirmPassword = '';
    this.signupFirstName = '';
    this.signupLastName = '';
    this.signupContactNumber = '';
    this.signupEmail = '';
    this.resetEmail = '';
    this.password = '';
  }

  onSignIn() {
    if (!this.email || !this.password) {
      this.error = 'Please enter username/email and password';
      return;
    }

    this.loading = true;
    this.error = '';
    this.authService.login(this.email, this.password).subscribe({
      next: (response: any) => {
        this.loading = false;
        const user = response.user;
        
        // Check if teacher must change password
        if (user.role === 'teacher' && user.mustChangePassword) {
          // Navigate to manage account page
          this.router.navigate(['/teacher/manage-account']);
        }
        // Check if parent needs to link students
        else if (user.role === 'parent' && user.parent) {
          // Check if parent has linked students
          this.authService.getParentStudents().subscribe({
            next: (students: any[]) => {
              if (students.length === 0) {
                // Navigate to student linking page
                this.router.navigate(['/parent/link-students']);
              } else {
                // Navigate to parent dashboard
                this.router.navigate(['/parent/dashboard']);
              }
            },
            error: () => {
              // Navigate to student linking page if error
              this.router.navigate(['/parent/link-students']);
            }
          });
        } else {
          // Navigate to regular dashboard for other roles
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Login failed';
        this.loading = false;
      }
    });
  }

  onSignUp() {
    // Validation
    if (!this.signupRole || !this.signupUsername || !this.signupPassword || !this.signupConfirmPassword || 
        !this.signupFirstName || !this.signupLastName || !this.signupContactNumber) {
      this.error = 'Please fill in all fields';
      return;
    }

    if (this.signupRole === 'PARENT') {
      if (!this.signupEmail) {
        this.error = 'Please provide an email address for parent accounts';
        return;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(this.signupEmail)) {
        this.error = 'Please enter a valid email address';
        return;
      }
    }

    if (this.signupPassword.length < 8) {
      this.error = 'Password must be at least 8 characters long';
      return;
    }

    if (this.signupPassword !== this.signupConfirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }

    // Validate role
    const validRoles = ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'PARENT'];
    if (!validRoles.includes(this.signupRole)) {
      this.error = 'Please select a valid role';
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Convert role to lowercase for backend enum
    const roleLower = this.signupRole.toLowerCase();
    
    // Determine email per role
    let generatedEmail = '';
    switch (this.signupRole) {
      case 'PARENT':
        generatedEmail = this.signupEmail.trim();
        break;
      case 'ACCOUNTANT':
        generatedEmail = `${this.signupUsername}@accountant.local`;
        break;
      case 'SUPERADMIN':
        generatedEmail = `${this.signupUsername}@superadmin.local`;
        break;
      case 'ADMIN':
      default:
        generatedEmail = `${this.signupUsername}@admin.local`;
        break;
    }

    const registerData: any = {
      username: this.signupUsername,
      password: this.signupPassword,
      email: generatedEmail,
      role: roleLower,
      firstName: this.signupFirstName,
      lastName: this.signupLastName,
      phoneNumber: this.signupContactNumber
    };

    // Only add contact number for parents
    if (this.signupRole === 'PARENT') {
      registerData.contactNumber = this.signupContactNumber;
    }

    this.authService.register(registerData).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'Account created successfully! Please sign in.';
        setTimeout(() => {
          this.setTab('signin');
        }, 2000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Registration failed';
        this.loading = false;
      }
    });
  }

  onResetPassword() {
    if (!this.resetEmail) {
      this.error = 'Please enter your email';
      return;
    }

    this.loading = true;
    this.error = '';
    
    this.authService.requestPasswordReset(this.resetEmail).subscribe({
      next: () => {
        this.loading = false;
        this.success = 'Password reset instructions have been sent to your email.';
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to send reset email';
        this.loading = false;
      }
    });
  }
}


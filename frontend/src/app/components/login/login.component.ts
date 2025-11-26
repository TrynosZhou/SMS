import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, LogoutReason } from '../../services/auth.service';
import { validatePhoneNumber } from '../../utils/phone-validator';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
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
  infoMessage = '';
  loading = false;
  
  // Password visibility toggles
  showPassword = false;
  showSignupPassword = false;
  showSignupConfirmPassword = false;
  
  // Phone validation error
  signupContactNumberError = '';

  constructor(private authService: AuthService, private router: Router) { }

  ngOnInit(): void {
    const logoutReason = this.authService.consumeLogoutReason();
    if (logoutReason) {
      this.infoMessage = this.getLogoutMessage(logoutReason);
    }
  }

  private getLogoutMessage(reason: LogoutReason): string {
    switch (reason) {
      case 'session-timeout':
        return 'Your session has expired due to inactivity. Please log in again.';
      case 'unauthorized':
        return 'Your session is no longer valid. Please log in again.';
      default:
        return '';
    }
  }

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
    if (tab !== 'signin') {
      this.infoMessage = '';
    }
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
  }

  onSignIn() {
    if (!this.email || !this.password) {
      this.error = 'Please enter username and password';
      return;
    }

    this.loading = true;
    this.error = '';
    this.authService.login(this.email, this.password).subscribe({
      next: (response: any) => {
        this.loading = false;
        this.infoMessage = '';
        
        if (!response || !response.user) {
          this.error = 'Invalid response from server';
          return;
        }
        
        const user = response.user;
        
        // Ensure token is stored before navigation
        if (!response.token) {
          this.error = 'Authentication token not received';
          return;
        }
        
        // Verify authentication is complete before navigation
        // The tap operator in authService.login() already stored token and user
        if (!this.authService.isAuthenticated()) {
          console.error('Authentication not complete after login');
          this.error = 'Authentication failed. Please try again.';
          return;
        }
        
        // Navigate immediately - token and user are already stored
        // Check if teacher must change password
        if (user.role === 'teacher' && user.mustChangePassword) {
          // Navigate to manage account page
          this.router.navigate(['/teacher/manage-account']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        }
        // Check if teacher login - redirect to teacher dashboard
        else if (user.role === 'teacher') {
          // Navigate to teacher dashboard
          this.router.navigate(['/teacher/dashboard']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        }
        // Check if parent needs to link students
        else if (user.role === 'parent' && user.parent) {
          // Check if parent has linked students
          this.authService.getParentStudents().subscribe({
            next: (students: any[]) => {
              if (students.length === 0) {
                // Navigate to student linking page
                this.router.navigate(['/parent/link-students']).catch(err => {
                  console.error('Navigation error:', err);
                  this.error = 'Failed to navigate. Please try again.';
                });
              } else {
                // Navigate to parent dashboard
                this.router.navigate(['/parent/dashboard']).catch(err => {
                  console.error('Navigation error:', err);
                  this.error = 'Failed to navigate. Please try again.';
                });
              }
            },
            error: (err) => {
              console.error('Error fetching parent students:', err);
              // Navigate to student linking page if error
              this.router.navigate(['/parent/link-students']).catch(navErr => {
                console.error('Navigation error:', navErr);
                this.error = 'Failed to navigate. Please try again.';
              });
            }
          });
        } else {
          // Navigate to regular dashboard for other roles
          this.router.navigate(['/dashboard']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        }
      },
      error: (err: any) => {
        console.error('Login error:', err);
        console.error('Error status:', err.status);
        console.error('Error message:', err.error?.message || err.message);
        
        if (err.status === 0) {
          // Connection error - server not reachable
          this.error = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.status === 401) {
          // Unauthorized - invalid credentials
          this.error = err.error?.message || 'Invalid username or password. Please try again.';
        } else if (err.status === 500) {
          // Server error
          this.error = 'Server error. Please try again later.';
        } else {
          // Other errors
          this.error = err.error?.message || err.message || 'Login failed. Please check your credentials.';
        }
        
        this.loading = false;
      }
    });
  }

  validateSignupContactNumber(): void {
    const result = validatePhoneNumber(this.signupContactNumber, true);
    this.signupContactNumberError = result.isValid ? '' : (result.error || '');
    if (result.isValid && result.normalized) {
      this.signupContactNumber = result.normalized;
    }
  }

  onSignUp() {
    this.error = '';
    this.signupContactNumberError = '';
    
    // Validation
    if (!this.signupRole || !this.signupUsername || !this.signupPassword || !this.signupConfirmPassword || 
        !this.signupFirstName || !this.signupLastName || !this.signupContactNumber) {
      this.error = 'Please fill in all fields';
      return;
    }

    // Validate phone number
    const phoneResult = validatePhoneNumber(this.signupContactNumber, true);
    if (!phoneResult.isValid) {
      this.signupContactNumberError = phoneResult.error || 'Invalid phone number';
      this.error = phoneResult.error || 'Please enter a valid phone number';
      return;
    }
    if (phoneResult.normalized) {
      this.signupContactNumber = phoneResult.normalized;
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


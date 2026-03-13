import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, LogoutReason } from '../../services/auth.service';
import { validatePhoneNumber } from '../../utils/phone-validator';
import { ActivatedRoute } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';

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
  signupGender = '';
  signupContactNumber = '';
  signupEmail = '';
  signupAddress = '';
  
  // Password Reset fields
  resetEmail = '';
  resetToken = '';
  resetNewPassword = '';
  resetConfirmPassword = '';

  // Role-aware forgot password modal
  showForgotPasswordModal = false;
  forgotStep: 'verify' | 'set' = 'verify';
  forgotRole: 'PARENT' | 'TEACHER' | 'STUDENT' | '' = '';
  forgotUsername = '';
  forgotEmail = '';
  forgotPhoneNumber = '';
  forgotStudentId = '';
  forgotDob = '';
  forgotVerifyToken = '';
  forgotNewPassword = '';
  forgotConfirmPassword = '';
  forgotSubmitting = false;
  showForgotNewPassword = false;
  showForgotConfirmPassword = false;
  
  error = '';
  success = '';
  infoMessage = '';
  loading = false;
  
  // Password visibility toggles
  showPassword = false;
  showSignupPassword = false;
  showSignupConfirmPassword = false;
  showResetPassword = false;
  
  // Phone validation error
  signupContactNumberError = '';

  signinHelpTooltip =
    'Teachers: Use your EmployeeID as username and your password. ' +
    'Students: Use your StudentID as username and the password you created during sign up.';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    const logoutReason = this.authService.consumeLogoutReason();
    if (logoutReason) {
      this.infoMessage = this.getLogoutMessage(logoutReason);
    }

    // If user landed on the dedicated reset password URL, open reset tab.
    // The token (if present) will be captured via query params below.
    try {
      const currentUrl = (this.router.url || '').toString();
      if (currentUrl.startsWith('/reset-password')) {
        this.activeTab = 'reset';
        this.error = '';
        this.success = '';
        this.infoMessage = '';
      }
    } catch {
      // ignore
    }

    this.route.queryParamMap.subscribe(params => {
      const token = params.get('token');
      if (token && token.trim()) {
        this.resetToken = token.trim();
        this.activeTab = 'reset';
        this.error = '';
        this.success = '';
        this.infoMessage = '';
      }
    });
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

  toggleResetPasswordVisibility() {
    this.showResetPassword = !this.showResetPassword;
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
    this.signupGender = '';
    this.signupContactNumber = '';
    this.signupEmail = '';
    this.signupAddress = '';
    this.resetEmail = '';
    this.resetToken = '';
    this.resetNewPassword = '';
    this.resetConfirmPassword = '';

    this.closeForgotPasswordModal();
  }

  openForgotPasswordModal() {
    this.error = '';
    this.success = '';
    this.infoMessage = '';
    this.showForgotPasswordModal = true;
    this.forgotStep = 'verify';
    this.forgotRole = '';
    this.forgotUsername = '';
    this.forgotEmail = '';
    this.forgotPhoneNumber = '';
    this.forgotStudentId = '';
    this.forgotDob = '';
    this.forgotVerifyToken = '';
    this.forgotNewPassword = '';
    this.forgotConfirmPassword = '';
    this.forgotSubmitting = false;
  }

  closeForgotPasswordModal() {
    this.showForgotPasswordModal = false;
    this.forgotSubmitting = false;
  }

  toggleForgotNewPasswordVisibility() {
    this.showForgotNewPassword = !this.showForgotNewPassword;
  }

  toggleForgotConfirmPasswordVisibility() {
    this.showForgotConfirmPassword = !this.showForgotConfirmPassword;
  }

  submitForgotVerify() {
    this.error = '';
    this.success = '';

    if (!this.forgotRole) {
      this.error = 'Please select your role';
      return;
    }

    if (this.forgotRole !== 'PARENT' && this.forgotRole !== 'TEACHER' && this.forgotRole !== 'STUDENT') {
      this.error = 'Only Parents, Teachers, and Students can reset password here.';
      return;
    }

    const roleLower = this.forgotRole.toLowerCase();
    const payload: any = { role: roleLower };

    if (this.forgotRole === 'PARENT') {
      if (!this.forgotEmail || !this.forgotPhoneNumber) {
        this.error = 'Email and phone number are required';
        return;
      }
      payload.email = this.forgotEmail.trim();
      payload.phoneNumber = this.forgotPhoneNumber.trim();
    } else if (this.forgotRole === 'TEACHER') {
      if (!this.forgotUsername || !this.forgotPhoneNumber) {
        this.error = 'EmployeeID and phone number are required';
        return;
      }
      payload.username = this.forgotUsername.trim();
      payload.phoneNumber = this.forgotPhoneNumber.trim();
    } else if (this.forgotRole === 'STUDENT') {
      if (!this.forgotStudentId || !this.forgotDob) {
        this.error = 'StudentID and Date of Birth are required';
        return;
      }
      payload.studentId = this.forgotStudentId.trim();
      payload.dateOfBirth = this.forgotDob.trim();
    }

    this.forgotSubmitting = true;
    this.authService.verifyForgotPasswordDetails(payload).subscribe({
      next: (res: any) => {
        this.forgotSubmitting = false;
        this.forgotVerifyToken = res?.token || '';
        this.forgotStep = 'set';
        this.success = 'Verified. Please set your new password.';
      },
      error: (err: any) => {
        this.forgotSubmitting = false;
        this.error = err.error?.message || 'Verification failed';
      }
    });
  }

  submitForgotSetPassword() {
    this.error = '';
    this.success = '';

    const token = (this.forgotVerifyToken || '').trim();
    const pw = (this.forgotNewPassword || '').trim();
    const confirm = (this.forgotConfirmPassword || '').trim();

    if (!token) {
      this.error = 'Verification token missing. Please verify again.';
      this.forgotStep = 'verify';
      return;
    }
    if (!pw || !confirm) {
      this.error = 'New password and confirmation are required';
      return;
    }
    // Relaxed policy: allow any non-empty string, only check match
    if (pw !== confirm) {
      this.error = 'Passwords do not match';
      return;
    }

    this.forgotSubmitting = true;
    this.authService.setForgotPasswordNewPassword({
      token,
      newPassword: pw,
      confirmPassword: confirm
    }).subscribe({
      next: () => {
        this.forgotSubmitting = false;
        this.success = 'Password updated successfully. Please sign in.';
        this.closeForgotPasswordModal();
        this.setTab('signin');
      },
      error: (err: any) => {
        this.forgotSubmitting = false;
        this.error = err.error?.message || 'Failed to update password';
      }
    });
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
            next: (res: any) => {
              const students = Array.isArray(res) ? res : (res?.students || []);
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
        } else if ((user.role === 'admin' || user.role === 'superadmin' || user.role === 'accountant') && user.mustChangePassword) {
          // Staff must change temporary password on first login
          this.router.navigate(['/admin/manage-accounts'], { queryParams: { changePassword: '1' } }).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
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
        } else if (err.status === 423) {
          // Account locked (too many failed attempts)
          this.error = err.error?.message || 'Your account has been locked. Please contact the administrator or superadmin to unlock it.';
        } else if (err.status === 401) {
          // Unauthorized - invalid credentials
          const errorMessage = err.error?.message || 'Invalid username or password. Please try again.';
          const hint = err.error?.hint;
          this.error = hint ? `${errorMessage} ${hint}` : errorMessage;
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
    if (!this.signupRole || !this.signupUsername || !this.signupPassword || !this.signupConfirmPassword) {
      this.error = 'Please fill in all required fields';
      return;
    }

    if (this.signupRole === 'PARENT') {
      if (!this.signupFirstName || !this.signupLastName || !this.signupContactNumber || !this.signupGender) {
        this.error = 'Please fill in all required fields including gender';
        return;
      }
    }

    // Validate phone number (parents only)
    if (this.signupRole === 'PARENT') {
      const phoneResult = validatePhoneNumber(this.signupContactNumber, true);
      if (!phoneResult.isValid) {
        this.signupContactNumberError = phoneResult.error || 'Invalid phone number';
        this.error = phoneResult.error || 'Please enter a valid phone number';
        return;
      }
      if (phoneResult.normalized) {
        this.signupContactNumber = phoneResult.normalized;
      }
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
      if (!this.signupAddress || !this.signupAddress.trim()) {
        this.error = 'Please provide your physical address for parent accounts';
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
    const validRoles = ['PARENT', 'STUDENT'];
    if (!validRoles.includes(this.signupRole)) {
      this.error = 'Please select a valid role';
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Convert role to lowercase for backend enum
    const roleLower = this.signupRole.toLowerCase();
    
    // Determine email per role
    const registerData: any = {
      username: this.signupUsername,
      password: this.signupPassword,
      role: roleLower,
    };

    // Only add parent-specific fields for parents
    if (this.signupRole === 'PARENT') {
      registerData.email = this.signupEmail.trim();
      registerData.firstName = this.signupFirstName;
      registerData.lastName = this.signupLastName;
      registerData.gender = this.signupGender;
      registerData.phoneNumber = this.signupContactNumber;
      registerData.contactNumber = this.signupContactNumber;
      registerData.address = this.signupAddress.trim();
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
    if (this.resetToken && this.resetToken.trim()) {
      const newPassword = (this.resetNewPassword || '').trim();
      const confirmPassword = (this.resetConfirmPassword || '').trim();
      if (!newPassword || !confirmPassword) {
        this.error = 'Please enter and confirm your new password';
        return;
      }
      if (newPassword.length < 8) {
        this.error = 'Password must be at least 8 characters long';
        return;
      }
      if (newPassword !== confirmPassword) {
        this.error = 'Passwords do not match';
        return;
      }

      this.loading = true;
      this.error = '';
      this.authService.resetPassword(this.resetToken.trim(), newPassword)
        .pipe(
          timeout(20000),
          finalize(() => {
            this.loading = false;
          })
        )
        .subscribe({
        next: () => {
          this.success = 'Password reset successfully. Please sign in with your new password.';
          this.resetToken = '';
          this.resetNewPassword = '';
          this.resetConfirmPassword = '';
          setTimeout(() => this.setTab('signin'), 1500);
        },
        error: (err: any) => {
          if (err?.name === 'TimeoutError') {
            this.error = 'Request timed out. Please try again.';
          } else {
            this.error = err.error?.message || 'Failed to reset password';
          }
        }
      });
      return;
    }

    const email = (this.resetEmail || '').trim();
    if (!email) {
      this.error = 'Please enter your email';
      return;
    }

    this.loading = true;
    this.error = '';

    this.authService.requestPasswordReset(email)
      .pipe(
        timeout(20000),
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
      next: (res: any) => {
        this.success = 'If the email exists, a password reset link has been sent.';

        // Development convenience: backend may return token
        const token = res?.token;
        if (token && typeof token === 'string' && token.trim()) {
          this.resetToken = token.trim();
          this.resetNewPassword = '';
          this.resetConfirmPassword = '';
        }
      },
      error: (err: any) => {
        if (err?.name === 'TimeoutError') {
          this.error = 'Request timed out. Please try again.';
        } else {
          this.error = err.error?.message || 'Failed to send reset email';
        }
      }
    });
  }
}

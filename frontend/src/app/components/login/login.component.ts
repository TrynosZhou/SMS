import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, LogoutReason } from '../../services/auth.service';
import { validatePhoneNumber } from '../../utils/phone-validator';
import { ActivatedRoute } from '@angular/router';
import { finalize, timeout, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Title } from '@angular/platform-browser';

@Component({
  standalone: false,
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
  forgotError = '';
  forgotSuccess = '';
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
    'Enter your Username in the field above. You may also use: Email (parents), Student ID (students), or Employee ID (teachers), depending on your role. ' +
    'Teachers: Employee ID and password. ' +
    'Students: Student ID and the password you created during sign up. ' +
    'Parents: Email address and password.';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private title: Title
  ) { }

  ngOnInit(): void {
    this.title.setTitle('Sign In – Junior Primary School Management System');

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
    this.forgotError = '';
    this.forgotSuccess = '';
    this.showForgotPasswordModal = true;
    this.forgotStep = 'verify';
    this.forgotRole = '';
    this.forgotUsername = '';
    this.forgotEmail = (this.email || '').includes('@') ? this.email.trim() : '';
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
    this.forgotError = '';
    this.forgotSuccess = '';
  }

  toggleForgotNewPasswordVisibility() {
    this.showForgotNewPassword = !this.showForgotNewPassword;
  }

  toggleForgotConfirmPasswordVisibility() {
    this.showForgotConfirmPassword = !this.showForgotConfirmPassword;
  }

  submitForgotVerify() {
    this.forgotError = '';
    this.forgotSuccess = '';
    this.error = '';
    this.success = '';

    if (!this.forgotRole) {
      this.forgotError = 'Please select your role';
      return;
    }

    if (this.forgotRole !== 'PARENT' && this.forgotRole !== 'TEACHER' && this.forgotRole !== 'STUDENT') {
      this.forgotError = 'Only Parents, Teachers, and Students can reset password here.';
      return;
    }

    const roleLower = this.forgotRole.toLowerCase();
    const payload: any = { role: roleLower };

    if (this.forgotRole === 'PARENT') {
      if (!this.forgotEmail?.trim() || !this.forgotPhoneNumber?.trim()) {
        this.forgotError = 'Email/username and phone number are required';
        return;
      }
      const phoneResult = validatePhoneNumber(this.forgotPhoneNumber.trim(), true);
      if (!phoneResult.isValid) {
        this.forgotError = phoneResult.error || 'Please enter a valid phone number (e.g. 07XXXXXXXX or +2637XXXXXXXX)';
        return;
      }
      const identifier = this.forgotEmail.trim();
      payload.email = identifier.includes('@') ? identifier.toLowerCase() : identifier;
      payload.username = identifier;
      payload.phoneNumber = phoneResult.normalized || this.forgotPhoneNumber.trim();
    } else if (this.forgotRole === 'STUDENT') {
      if (!this.forgotStudentId?.trim() || !this.forgotDob?.trim()) {
        this.forgotError = 'Student ID and date of birth are required';
        return;
      }
      payload.studentId = this.forgotStudentId.trim();
      payload.dateOfBirth = this.forgotDob.trim();
    } else if (this.forgotRole === 'TEACHER') {
      if (!this.forgotUsername || !this.forgotPhoneNumber) {
        this.forgotError = 'EmployeeID and phone number are required';
        return;
      }
      const phoneResult = validatePhoneNumber(this.forgotPhoneNumber.trim(), true);
      if (!phoneResult.isValid) {
        this.forgotError = phoneResult.error || 'Please enter a valid phone number';
        return;
      }
      payload.username = this.forgotUsername.trim();
      payload.phoneNumber = phoneResult.normalized || this.forgotPhoneNumber.trim();
    }

    this.forgotSubmitting = true;
    this.authService.verifyForgotPasswordDetails(payload).pipe(
      timeout(30000),
      catchError((err: any) => {
        if (err?.name === 'TimeoutError') {
          return throwError(() => ({
            error: { message: 'Verification timed out. Check that the backend server is running and try again.' }
          }));
        }
        return throwError(() => err);
      }),
      finalize(() => {
        this.forgotSubmitting = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (res: any) => {
        this.forgotVerifyToken = res?.token || '';
        if (!this.forgotVerifyToken) {
          this.forgotError = 'Verification failed. Please try again.';
          return;
        }
        this.forgotStep = 'set';
        this.forgotSuccess = 'Verified. Please set your new password.';
        this.forgotError = '';
      },
      error: (err: any) => {
        this.forgotError = err.error?.message || 'Verification failed. Check your details and try again.';
      }
    });
  }

  submitForgotSetPassword() {
    this.forgotError = '';
    this.forgotSuccess = '';

    const token = (this.forgotVerifyToken || '').trim();
    const pw = (this.forgotNewPassword || '').trim();
    const confirm = (this.forgotConfirmPassword || '').trim();

    if (!token) {
      this.forgotError = 'Verification token missing. Please verify again.';
      this.forgotStep = 'verify';
      return;
    }
    if (!pw || !confirm) {
      this.forgotError = 'New password and confirmation are required';
      return;
    }
    if (pw.length < 8) {
      this.forgotError = 'Password must be at least 8 characters long';
      return;
    }
    if (pw !== confirm) {
      this.forgotError = 'Passwords do not match';
      return;
    }

    this.forgotSubmitting = true;
    this.authService.setForgotPasswordNewPassword({
      token,
      newPassword: pw,
      confirmPassword: confirm
    }).pipe(
      timeout(30000),
      catchError((err: any) => {
        if (err?.name === 'TimeoutError') {
          return throwError(() => ({
            error: { message: 'Request timed out. Please try again.' }
          }));
        }
        return throwError(() => err);
      }),
      finalize(() => {
        this.forgotSubmitting = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: () => {
        const studentHint =
          this.forgotRole === 'STUDENT' && this.forgotStudentId?.trim()
            ? ` Sign in with Student ID "${this.forgotStudentId.trim()}" and your new password.`
            : '';
        this.success = `Password updated successfully.${studentHint || ' Please sign in with your new password.'}`;
        this.closeForgotPasswordModal();
        this.setTab('signin');
      },
      error: (err: any) => {
        this.forgotError = err.error?.message || 'Failed to update password';
      }
    });
  }

  onSignIn() {
    const identifier = (this.email || '').trim();
    const password = (this.password || '').trim();
    if (!identifier || !password) {
      this.error = 'Please enter username and password';
      return;
    }

    this.loading = true;
    this.error = '';
    this.authService.login(identifier, password).pipe(
      timeout(30000),
      catchError((err: any) => {
        if (err?.name === 'TimeoutError') {
          return throwError(() => ({
            error: { message: 'Login timed out. Check that the backend server is running and try again.' }
          }));
        }
        return throwError(() => err);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (response: any) => {
        this.infoMessage = '';
        
        if (!response || !response.user) {
          this.error = 'Invalid response from server';
          return;
        }
        
        const user = response.user;
        
        if (!response.token) {
          this.error = 'Authentication token not received';
          return;
        }
        
        const role = String(user.role || '').toLowerCase();

        if (role === 'teacher') {
          this.router.navigate(['/teacher/dashboard']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        } else if (role === 'parent') {
          this.authService.getParentStudents().subscribe({
            next: (res: any) => {
              const students = Array.isArray(res) ? res : (res?.students || []);
              const target =
                students.length === 0 ? '/parent/link-students' : '/parent/dashboard';
              this.router.navigate([target]).catch(err => {
                console.error('Navigation error:', err);
                this.error = 'Failed to navigate. Please try again.';
              });
            },
            error: () => {
              this.router.navigate(['/parent/dashboard']).catch(navErr => {
                console.error('Navigation error:', navErr);
                this.error = 'Failed to navigate. Please try again.';
              });
            }
          });
        } else if (user.mustChangePassword) {
          const changePasswordRoute =
            role === 'parent'
              ? '/parent/manage-account'
              : role === 'accountant'
                ? '/accountant/manage-account'
                : '/account/change-password';
          this.router.navigate([changePasswordRoute]).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        } else {
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
          this.error = 'Cannot connect to server. Ensure the SMS backend is running (npm run dev in the backend folder on port 3001).';
        } else if (err.status === 400) {
          const details = err.error?.details;
          if (Array.isArray(details) && details.length) {
            this.error = details.map((d: any) => d.msg).filter(Boolean).join('. ');
          } else {
            this.error = err.error?.message || err.error?.error || 'Login failed. Please check your credentials.';
          }
        } else if (err.status === 423) {
          this.error = err.error?.message || 'Your account has been locked. Please contact the administrator or superadmin to unlock it.';
        } else if (err.status === 401) {
          const errorMessage = err.error?.message || 'Invalid username or password. Please try again.';
          const hint = err.error?.hint;
          if (hint) {
            this.error = `${errorMessage} ${hint}`;
          } else if (err.error?.code === 'INVALID_CREDENTIALS') {
            this.error = 'Invalid username or password. If your account was created by the school, use the temporary password from the administrator or Reset Password.';
          } else {
            this.error = errorMessage;
          }
        } else if (err.status === 500) {
          this.error = 'Server error. Please try again later.';
        } else {
          this.error = err.error?.message || err.message || 'Login failed. Please check your credentials.';
        }
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

    const validRoles = ['PARENT', 'STUDENT'];
    if (!validRoles.includes(this.signupRole)) {
      this.error = 'Please select a valid role';
      return;
    }

    this.loading = true;
    this.error = '';
    
    const roleLower = this.signupRole.toLowerCase();
    const trimmedUsername = this.signupUsername.trim();
    
    const registerData: any = {
      username: trimmedUsername,
      password: this.signupPassword.trim(),
      role: roleLower,
    };

    if (this.signupRole === 'PARENT') {
      registerData.email = this.signupEmail.trim();
      registerData.firstName = this.signupFirstName.trim();
      registerData.lastName = this.signupLastName.trim();
      registerData.gender = this.signupGender;
      registerData.phoneNumber = this.signupContactNumber;
      registerData.contactNumber = this.signupContactNumber;
      registerData.address = this.signupAddress.trim();
    }

    this.authService.register(registerData).pipe(
      timeout(30000),
      catchError((err: any) => {
        if (err?.name === 'TimeoutError') {
          return throwError(() => ({
            error: { message: 'Registration timed out. Check that the backend server is running and try again.' }
          }));
        }
        return throwError(() => err);
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: () => {
        const signInHint =
          this.signupRole === 'STUDENT'
            ? ` Sign in with Student ID "${trimmedUsername}" and your password.`
            : '';
        this.success = `Account created successfully!${signInHint || ' Please sign in.'}`;
        const studentIdForSignIn = this.signupRole === 'STUDENT' ? trimmedUsername : '';
        setTimeout(() => {
          this.setTab('signin');
          if (studentIdForSignIn) {
            this.email = studentIdForSignIn;
          }
        }, 2000);
      },
      error: (err: any) => {
        this.error = this.getRegistrationErrorMessage(err);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  private getRegistrationErrorMessage(err: any): string {
    const code = String(err?.error?.code || '').trim();
    const backendMessage = String(err?.error?.message || '').trim();
    if (backendMessage) {
      return backendMessage;
    }
    if (code === 'INVALID_STUDENT_ID') {
      return 'Invalid Student ID. Use the exact ID issued by the school (e.g. JPS5072026).';
    }
    if (code === 'STUDENT_ALREADY_REGISTERED') {
      return 'This Student ID already has an account. Please sign in or use Forgot Password.';
    }
    if (err?.status === 0) {
      return 'Cannot connect to server. Ensure the backend is running on port 3000 and try again.';
    }
    return 'Registration failed. Please check your details and try again.';
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
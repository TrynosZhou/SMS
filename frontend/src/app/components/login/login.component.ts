import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, LogoutReason } from '../../services/auth.service';
import { validatePhoneNumber } from '../../utils/phone-validator';
import { ActivatedRoute } from '@angular/router';
import { finalize, timeout, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { AdmissionClassOption, AdmissionService } from '../../services/admission.service';
import { SettingsService } from '../../services/settings.service';

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

  /** Admissions apply panel (outside login card) */
  admissionApplyMode: 'applicant' | 'parent' | null = null;
  admissionApplyLoading = false;
  admissionApplyError = '';
  admissionApplySuccess = '';
  admissionApplySubmitAfterAuth = false;
  admFirstName = '';
  admLastName = '';
  admDateOfBirth = '';
  admAddress = '';
  admGender = '';
  admGradeApplyingFor = '';
  admPhone = '';
  admGuardianName = '';
  admGuardianPhone = '';
  admBirthCertificate: File | null = null;
  admReportCard: File | null = null;
  admClasses: AdmissionClassOption[] = [];
  readonly admMaxFileSize = 5 * 1024 * 1024;
  readonly admAllowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  signinHelpTooltip =
    'Enter your Username in the field above. You may also use: Email (parents), Student ID (students), or Employee ID (teachers), depending on your role. ' +
    'Teachers: Employee ID and password. ' +
    'Students: Student ID and the password you created during sign up. ' +
    'Parents: Email address and password.';

  private static readonly SCHOOL_NAME_CACHE_KEY = 'sms_schoolDisplayName';
  private static readonly SCHOOL_LOGO_CACHE_KEY = 'sms_schoolDisplayLogo';

  /** Full school name from Settings (login hero). */
  schoolName = '';
  schoolLogo: string | null = null;

  get schoolDisplayName(): string {
    const n = this.schoolName.trim();
    return n || 'School Management';
  }

  get showGenericTagline(): boolean {
    return !this.schoolName.trim();
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private title: Title,
    private admissionService: AdmissionService,
    private settingsService: SettingsService,
    public authService: AuthService
  ) { }

  ngOnInit(): void {
    this.applyBrandingFromCache();
    this.loadPublicSchoolBranding();
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
      const applyAs = params.get('apply');
      if (applyAs === 'applicant' || applyAs === 'parent') {
        this.openAdmissionsApply(applyAs);
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

  /** Show online admission application form (prospective student or parent). */
  openAdmissionsApply(mode: 'applicant' | 'parent'): void {
    this.admissionApplyMode = mode;
    this.admissionApplyError = '';
    this.admissionApplySuccess = '';
    this.error = '';
    this.success = '';
    if (!this.admClasses.length) {
      this.admissionService.getClasses().subscribe({
        next: (c) => (this.admClasses = Array.isArray(c) ? c : []),
        error: () => (this.admClasses = []),
      });
    }
    this.closeForgotPasswordModal();
    setTimeout(() => {
      const el = document.getElementById('login-admissions-apply');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  closeAdmissionsApply(): void {
    this.admissionApplyMode = null;
    this.admissionApplyError = '';
    this.admissionApplySuccess = '';
    this.admissionApplySubmitAfterAuth = false;
    this.clearAdmissionApplyFields();
  }

  private clearAdmissionApplyFields(): void {
    this.admFirstName = '';
    this.admLastName = '';
    this.admDateOfBirth = '';
    this.admAddress = '';
    this.admGender = '';
    this.admGradeApplyingFor = '';
    this.admPhone = '';
    this.admGuardianName = '';
    this.admGuardianPhone = '';
    this.admBirthCertificate = null;
    this.admReportCard = null;
  }

  onAdmissionFile(selected: File | null, kind: 'birth' | 'report'): void {
    if (!selected) return;
    if (!this.admAllowedTypes.includes(selected.type)) {
      this.admissionApplyError = 'Only PDF, JPEG, PNG, or WebP files are allowed';
      return;
    }
    if (selected.size > this.admMaxFileSize) {
      this.admissionApplyError = 'Each file must be 5 MB or smaller';
      return;
    }
    this.admissionApplyError = '';
    if (kind === 'birth') this.admBirthCertificate = selected;
    else this.admReportCard = selected;
  }

  validateAdmissionApply(): string | null {
    if (!this.admFirstName.trim() || !this.admLastName.trim()) {
      return 'First name and last name are required';
    }
    if (!this.admDateOfBirth) return 'Date of birth is required';
    if (!this.admAddress.trim()) return 'Address is required';
    if (!this.admGender) return 'Gender is required';
    if (!this.admGradeApplyingFor.trim()) return 'Grade / level applying for is required';
    const phoneCheck = validatePhoneNumber(this.admPhone, true);
    if (!phoneCheck.isValid) return phoneCheck.error || 'Valid contact phone is required';
    if (!this.admGuardianName.trim() || !this.admGuardianPhone.trim()) {
      return 'Guardian name and phone are required';
    }
    const guardianPhoneCheck = validatePhoneNumber(this.admGuardianPhone, true);
    if (!guardianPhoneCheck.isValid) {
      return guardianPhoneCheck.error || 'Valid guardian phone is required';
    }
    if (!this.admBirthCertificate) return 'Birth certificate upload is required';
    if (!this.admReportCard) return 'Report card for the previous term is required';
    return null;
  }

  submitAdmissionApplication(fromAuthCallback = false): void {
    this.admissionApplyError = '';
    this.admissionApplySuccess = '';
    const validation = this.validateAdmissionApply();
    if (validation) {
      this.admissionApplyError = validation;
      return;
    }

    if (!this.authService.getToken()) {
      this.admissionApplySubmitAfterAuth = true;
      this.infoMessage =
        'Sign in or create an admissions account above, then your application will be submitted automatically.';
      this.openAdmissionsSignup(this.admissionApplyMode === 'parent' ? 'parent' : 'applicant');
      this.prefillSignupFromAdmissionForm();
      return;
    }

    const role = String(this.authService.getCurrentUser()?.role || '').toLowerCase();
    if (role !== 'applicant' && role !== 'parent') {
      this.admissionApplyError = 'Only prospective students and parents can submit admission applications.';
      return;
    }

    const fd = new FormData();
    fd.append('applicationType', 'new_admission');
    fd.append('firstName', this.admFirstName.trim());
    fd.append('lastName', this.admLastName.trim());
    fd.append('dateOfBirth', this.admDateOfBirth);
    fd.append('gender', this.admGender);
    fd.append('address', this.admAddress.trim());
    fd.append('phone', this.admPhone.trim());
    fd.append('gradeApplyingFor', this.admGradeApplyingFor.trim());
    fd.append('guardianName', this.admGuardianName.trim());
    fd.append('guardianPhone', this.admGuardianPhone.trim());
    if (this.admBirthCertificate) fd.append('birthCertificate', this.admBirthCertificate);
    if (this.admReportCard) fd.append('reportCard', this.admReportCard);

    this.admissionApplyLoading = true;
    this.admissionService.submitApplication(fd).subscribe({
      next: (res) => {
        this.admissionApplyLoading = false;
        this.admissionApplySubmitAfterAuth = false;
        this.admissionApplySuccess = res.message || 'Application submitted successfully';
        const id = res.application?.id;
        setTimeout(() => {
          if (id) {
            sessionStorage.setItem('admissionFocusApplicationId', id);
            this.router.navigate(['/admissions/status', id], { replaceUrl: true });
          } else {
            this.router.navigate(['/admissions/portal'], { replaceUrl: true });
          }
        }, fromAuthCallback ? 400 : 800);
      },
      error: (err) => {
        this.admissionApplyLoading = false;
        this.admissionApplyError = err.error?.message || 'Failed to submit application';
      },
    });
  }

  private prefillSignupFromAdmissionForm(): void {
    if (this.admissionApplyMode === 'applicant') {
      if (!this.signupFirstName.trim()) this.signupFirstName = this.admFirstName.trim();
      if (!this.signupLastName.trim()) this.signupLastName = this.admLastName.trim();
    }
    if (this.admissionApplyMode === 'parent') {
      if (!this.signupFirstName.trim()) this.signupFirstName = this.admGuardianName.trim().split(/\s+/)[0] || '';
      if (!this.signupLastName.trim()) {
        const parts = this.admGuardianName.trim().split(/\s+/);
        this.signupLastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
      }
      if (!this.signupContactNumber.trim()) this.signupContactNumber = this.admGuardianPhone.trim();
      if (!this.signupAddress.trim()) this.signupAddress = this.admAddress.trim();
    }
  }

  private handlePostLoginAdmission(role: string): boolean {
    if (!this.admissionApplySubmitAfterAuth && !this.admissionApplyMode) {
      return false;
    }
    if (role !== 'applicant' && role !== 'parent') {
      return false;
    }
    if (!this.admissionApplySubmitAfterAuth) {
      return false;
    }
    this.submitAdmissionApplication(true);
    return true;
  }

  /** Open Sign Up for online admission (prospective student or parent on behalf of a child). */
  openAdmissionsSignup(mode: 'applicant' | 'parent'): void {
    this.activeTab = 'signup';
    this.error = '';
    this.success = '';
    this.infoMessage =
      mode === 'parent'
        ? 'Sign up as a parent or guardian, then sign in to submit your child’s admission application.'
        : 'Sign up as a prospective student, then sign in to submit your admission application.';

    if (!this.admissionApplyMode) {
      this.email = '';
      this.password = '';
      this.signupUsername = '';
      this.signupPassword = '';
      this.signupConfirmPassword = '';
      this.signupFirstName = '';
      this.signupLastName = '';
      this.signupGender = '';
      this.signupContactNumber = '';
      this.signupEmail = '';
      this.signupAddress = '';
      this.signupContactNumberError = '';
    }
    this.signupRole = mode === 'parent' ? 'PARENT_ADMISSION' : 'APPLICANT';
    this.closeForgotPasswordModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

        if (this.handlePostLoginAdmission(role)) {
          return;
        }

        if (role === 'applicant') {
          const focusId = sessionStorage.getItem('admissionFocusApplicationId');
          if (focusId) {
            this.router.navigate(['/admissions/status', focusId], { replaceUrl: true }).catch(err => {
              console.error('Navigation error:', err);
              this.error = 'Failed to navigate. Please try again.';
            });
          } else {
            this.router.navigate(['/admissions/portal']).catch(err => {
              console.error('Navigation error:', err);
              this.error = 'Failed to navigate. Please try again.';
            });
          }
          return;
        }

        if (role === 'teacher') {
          this.router.navigate(['/teacher/dashboard']).catch(err => {
            console.error('Navigation error:', err);
            this.error = 'Failed to navigate. Please try again.';
          });
        } else if (role === 'parent') {
          const goAdmissions = sessionStorage.getItem('admissionsPortalAfterLogin') === '1';
          if (goAdmissions) {
            sessionStorage.removeItem('admissionsPortalAfterLogin');
            this.router.navigate(['/admissions/portal']);
            return;
          }
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

    if (this.signupRole === 'PARENT' || this.signupRole === 'PARENT_ADMISSION') {
      if (!this.signupFirstName || !this.signupLastName || !this.signupContactNumber || !this.signupGender) {
        this.error = 'Please fill in all required fields including gender';
        return;
      }
    }

    if (this.signupRole === 'APPLICANT') {
      if (!this.signupFirstName || !this.signupLastName || !this.signupEmail) {
        this.error = 'First name, last name, and email are required for applicant accounts';
        return;
      }
    }

    if (this.signupRole === 'PARENT' || this.signupRole === 'PARENT_ADMISSION') {
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

    if (this.signupRole === 'PARENT' || this.signupRole === 'PARENT_ADMISSION') {
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

    if (this.signupRole === 'APPLICANT') {
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

    const validRoles = ['PARENT', 'PARENT_ADMISSION', 'STUDENT', 'APPLICANT'];
    if (!validRoles.includes(this.signupRole)) {
      this.error = 'Please select a valid role';
      return;
    }

    this.loading = true;
    this.error = '';
    
    const roleLower =
      this.signupRole === 'PARENT_ADMISSION' ? 'parent' : this.signupRole.toLowerCase();
    const trimmedUsername = this.signupUsername.trim();
    
    const registerData: any = {
      username: trimmedUsername,
      password: this.signupPassword.trim(),
      role: roleLower,
    };

    if (this.signupRole === 'PARENT' || this.signupRole === 'PARENT_ADMISSION') {
      registerData.email = this.signupEmail.trim();
      registerData.firstName = this.signupFirstName.trim();
      registerData.lastName = this.signupLastName.trim();
      registerData.gender = this.signupGender;
      registerData.phoneNumber = this.signupContactNumber;
      registerData.contactNumber = this.signupContactNumber;
      registerData.address = this.signupAddress.trim();
    }

    if (this.signupRole === 'APPLICANT') {
      registerData.email = this.signupEmail.trim();
      registerData.firstName = this.signupFirstName.trim();
      registerData.lastName = this.signupLastName.trim();
      registerData.role = 'applicant';
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
        if (this.signupRole === 'PARENT_ADMISSION' || this.signupRole === 'APPLICANT') {
          sessionStorage.setItem('admissionsPortalAfterLogin', '1');
        }
        const signInHint =
          this.signupRole === 'STUDENT'
            ? ` Sign in with Student ID "${trimmedUsername}" and your password.`
            : this.signupRole === 'APPLICANT'
              ? ' Sign in with your username or email to complete your application.'
              : this.signupRole === 'PARENT_ADMISSION'
                ? ' Sign in to start your child\'s admission application.'
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

  private applyBrandingFromCache(): void {
    try {
      const cachedName = sessionStorage.getItem(LoginComponent.SCHOOL_NAME_CACHE_KEY);
      const cachedLogo = sessionStorage.getItem(LoginComponent.SCHOOL_LOGO_CACHE_KEY);
      if (cachedName?.trim()) {
        this.schoolName = cachedName.trim();
      }
      if (cachedLogo) {
        this.schoolLogo = this.normalizeSchoolLogoSrc(cachedLogo);
      }
    } catch {
      // ignore sessionStorage errors
    }
  }

  private loadPublicSchoolBranding(): void {
    this.settingsService.getPublicBranding().subscribe({
      next: (branding) => {
        if (!branding || typeof branding !== 'object') return;

        const name = String(branding.schoolName || '').trim();
        const logo = this.normalizeSchoolLogoSrc(branding.schoolLogo ?? null);

        if (name) {
          this.schoolName = name;
          try {
            sessionStorage.setItem(LoginComponent.SCHOOL_NAME_CACHE_KEY, name);
          } catch {
            // ignore
          }
          this.title.setTitle(`Sign In – ${name}`);
        }
        if (logo) {
          this.schoolLogo = logo;
          try {
            if (logo.length < 500_000) {
              sessionStorage.setItem(LoginComponent.SCHOOL_LOGO_CACHE_KEY, logo);
            }
          } catch {
            // ignore
          }
        }

        this.cdr.detectChanges();
      }
    });
  }

  private normalizeSchoolLogoSrc(value: string | null): string | null {
    if (!value) return null;

    let v = String(value).trim();
    if (!v) return null;

    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }

    v = v.replace(/\\n/g, '').replace(/\\r/g, '').replace(/\\t/g, '').replace(/\\"/g, '"');

    if (v.startsWith('data:image')) {
      const commaIndex = v.indexOf(',');
      if (commaIndex > -1) {
        const header = v.slice(0, commaIndex + 1);
        const payload = v.slice(commaIndex + 1).replace(/\s/g, '');
        return `${header}${payload}`;
      }
      return v;
    }

    if (/^https?:\/\//i.test(v)) {
      return v;
    }

    if (/^[A-Za-z0-9+/=\r\n]+$/.test(v) && v.length > 64) {
      return `data:image/png;base64,${v.replace(/\s/g, '')}`;
    }

    return v;
  }
}
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { AccountService } from '../../../services/account.service';
import { TeacherService } from '../../../services/teacher.service';
import { SettingsService } from '../../../services/settings.service';
import { activatePageLoad } from '../../../utils/route-activation';

type AccountTab = 'overview' | 'security';

@Component({
  standalone: false,
  selector: 'app-manage-account',
  templateUrl: './manage-account.component.html',
  styleUrls: ['./manage-account.component.css']
})
export class ManageAccountComponent implements OnInit, OnDestroy {
  accountInfo: any = null;
  currentUsername = '';
  currentEmail = '';
  displayName = '';
  newUsername = '';
  newEmail = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  loadingProfile = false;
  loadingTeacher = false;
  saving = false;
  error = '';
  success = '';
  isTeacher = false;
  isAccountant = false;
  isDemo = false;
  mustChangePassword = false;
  canChangeUsername = true;
  roleLabel = 'User';
  schoolName = '';
  activeTab: AccountTab = 'overview';

  teacherProfile: any = null;
  teacherClasses: any[] = [];
  teacherSubjects: string[] = [];
  profileLastSynced: Date | null = null;

  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  private readonly destroy$ = new Subject<void>();
  private readonly requestTimeoutMs = 25000;
  private accountRoute = '';

  constructor(
    private accountService: AccountService,
    private authService: AuthService,
    private teacherService: TeacherService,
    private settingsService: SettingsService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.accountRoute = this.authService.getManageAccountRoute();
    activatePageLoad(this.router, this.destroy$, this.accountRoute, () => this.bootstrapPage());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapPage(): void {
    this.hydrateFromSession();
    this.loadSettings();
    this.loadAccountInfo();
    if (this.isTeacher) {
      this.loadTeacherContext();
    }
    if (this.mustChangePassword) {
      this.activeTab = 'security';
    }
  }

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
      fullName: currentUser.fullName,
      teacher: currentUser.teacher,
    });

    const sessionClasses = Array.isArray((currentUser as any).classes) ? (currentUser as any).classes : [];
    if (sessionClasses.length > 0) {
      this.teacherClasses = sessionClasses;
    }
    if (currentUser.teacher) {
      this.teacherProfile = currentUser.teacher;
      this.applyTeacherDisplayName(currentUser.teacher, currentUser.fullName);
    }
  }

  private applyAccountData(data: {
    username?: string;
    email?: string;
    role?: string;
    isDemo?: boolean;
    mustChangePassword?: boolean;
    fullName?: string;
    teacher?: any;
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

    if (data.fullName?.trim()) {
      this.displayName = data.fullName.trim();
    } else if (!this.displayName) {
      this.displayName = this.currentUsername || 'User';
    }
  }

  loadSettings(): void {
    this.settingsService
      .getSettings()
      .pipe(
        timeout(this.requestTimeoutMs),
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      )
      .subscribe((data: any) => {
        if (data?.schoolName) {
          this.schoolName = data.schoolName;
          this.cdr.markForCheck();
        }
      });
  }

  loadAccountInfo(): void {
    this.loadingProfile = true;
    this.accountService
      .getAccountInfo()
      .pipe(
        timeout(this.requestTimeoutMs),
        finalize(() => {
          this.loadingProfile = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
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
            fullName: data.fullName,
            teacher: data.teacher,
          });
          this.accountInfo = { ...this.accountInfo, ...data };
          if (data.teacher) {
            this.teacherProfile = data.teacher;
            this.applyTeacherDisplayName(data.teacher, data.fullName);
            const subjects = Array.isArray(data.teacher.subjects) ? data.teacher.subjects : [];
            this.teacherSubjects = subjects
              .map((s: any) => (typeof s === 'string' ? s : s?.name))
              .filter(Boolean);
          }
          this.profileLastSynced = new Date();
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          if (!this.accountInfo) {
            this.hydrateFromSession();
          }
          const msg =
            err?.name === 'TimeoutError'
              ? 'Could not reach the server in time. You can still update your password below.'
              : err?.error?.message || 'Could not refresh account details. You can still change your password.';
          this.error = msg;
          setTimeout(() => (this.error = ''), 8000);
        },
      });
  }

  private loadTeacherContext(): void {
    this.loadingTeacher = true;
    this.teacherService
      .getCurrentTeacher()
      .pipe(
        timeout(this.requestTimeoutMs),
        catchError(() => of(null)),
        finalize(() => {
          this.loadingTeacher = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((teacher: any) => {
        if (!teacher) {
          return;
        }
        this.teacherProfile = teacher;
        this.applyTeacherDisplayName(teacher);
        const subjects = Array.isArray(teacher.subjects) ? teacher.subjects : [];
        this.teacherSubjects = subjects
          .map((s: any) => (typeof s === 'string' ? s : s?.name))
          .filter(Boolean);

        if (teacher.id) {
          this.teacherService
            .getTeacherClasses(teacher.id)
            .pipe(
              timeout(this.requestTimeoutMs),
              catchError(() => of({ classes: teacher.classes || this.teacherClasses })),
              takeUntil(this.destroy$)
            )
            .subscribe((res: any) => {
              const classes = res?.classes;
              if (Array.isArray(classes) && classes.length > 0) {
                this.teacherClasses = classes;
              } else if (Array.isArray(teacher.classes) && teacher.classes.length > 0) {
                this.teacherClasses = teacher.classes;
              }
              this.cdr.markForCheck();
            });
        } else if (Array.isArray(teacher.classes) && teacher.classes.length > 0) {
          this.teacherClasses = teacher.classes;
        }
        this.cdr.markForCheck();
      });
  }

  private applyTeacherDisplayName(teacher: any, fullNameOverride?: string): void {
    if (fullNameOverride?.trim()) {
      this.displayName = fullNameOverride.trim();
      return;
    }
    const built = [teacher?.lastName, teacher?.firstName].filter(Boolean).join(' ').trim();
    if (built) {
      this.displayName = built;
    } else if (teacher?.fullName?.trim()) {
      this.displayName = teacher.fullName.trim();
    }
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

  get minPasswordLength(): number {
    return this.requiresMinPasswordLength ? 8 : 1;
  }

  get passwordLengthOk(): boolean {
    return (this.newPassword || '').length >= this.minPasswordLength;
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

  get accountStatusLabel(): string {
    if (this.isDemo) return 'Demo account';
    if (this.mustChangePassword) return 'Password update required';
    return 'Active';
  }

  get accountStatusClass(): string {
    if (this.isDemo) return 'status-demo';
    if (this.mustChangePassword) return 'status-warn';
    return 'status-ok';
  }

  get pageSubtitle(): string {
    if (this.isTeacher) {
      return 'Manage your profile, teaching assignments, and account security.';
    }
    if (this.isAccountant) {
      return 'Review your account details and update your login password.';
    }
    return 'Review your profile and keep your login credentials secure.';
  }

  get quickLinks(): Array<{ route: string; icon: string; label: string }> {
    if (this.isTeacher) {
      return [
        { route: '/teacher/dashboard', icon: '🏠', label: 'Dashboard' },
        { route: '/teacher/record-book', icon: '📖', label: 'Record Book' },
        { route: '/teacher/my-classes', icon: '🏫', label: 'My Classes' },
        { route: '/exams', icon: '📝', label: 'Enter Marks' },
      ];
    }
    if (this.authService.hasRole('parent')) {
      return [
        { route: '/parent/dashboard', icon: '🏠', label: 'Dashboard' },
        { route: '/parent/inbox', icon: '📧', label: 'Inbox' },
      ];
    }
    return [{ route: this.authService.getDashboardRoute(), icon: '🏠', label: 'Dashboard' }];
  }

  setTab(tab: AccountTab): void {
    this.activeTab = tab;
  }

  getProfileInitials(): string {
    const source = this.displayName || this.currentUsername || '?';
    const parts = source.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  formatSyncedAt(): string {
    if (!this.profileLastSynced) return '';
    return this.profileLastSynced.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  clearPasswordFields(): void {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.showCurrentPassword = false;
    this.showNewPassword = false;
    this.showConfirmPassword = false;
  }

  updateAccount(): void {
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
      newPassword: this.newPassword,
    };

    if (this.canChangeUsername && this.newUsername && this.newUsername !== this.currentUsername) {
      updateData.newUsername = this.newUsername;
    }

    if (!this.isTeacher && !this.isAccountant && this.newEmail && this.newEmail !== this.currentEmail) {
      updateData.newEmail = this.newEmail;
    }

    this.accountService.updateAccount(updateData).subscribe({
      next: (response: any) => {
        this.saving = false;
        this.success = 'Password updated successfully.';
        this.clearPasswordFields();
        this.mustChangePassword = false;

        const currentUser = this.authService.getCurrentUser();
        if (currentUser && response.user) {
          currentUser.username = response.user.username || response.user.email;
          currentUser.mustChangePassword = false;
          this.authService.setCurrentUser(currentUser);
        }

        this.activeTab = 'overview';
        this.cdr.markForCheck();
        setTimeout(() => {
          this.success = '';
          this.cdr.markForCheck();
        }, 6000);
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err.error?.message || 'Failed to update account';
        setTimeout(() => (this.error = ''), 5000);
      },
    });
  }

  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  goToDashboard(): void {
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

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { LogoutConfirmService } from './logout-confirm.service';

export interface User {
  id: string;
  email: string;
  username?: string;
  role: string;
  /** Full name from database (teacher/student/parent); set by login for dashboard display */
  fullName?: string;
  /** First name on the User account itself (admin, accountant, etc.) */
  firstName?: string | null;
  /** Last name on the User account itself (admin, accountant, etc.) */
  lastName?: string | null;
  /** Optional honorific for dashboard greeting (e.g. Mr, Mrs); director defaults to Mr in UI */
  namePrefix?: string;
  mustChangePassword?: boolean;
  isTemporaryAccount?: boolean;
  isDemo?: boolean;
  isUniversalTeacher?: boolean;
  student?: any;
  teacher?: any;
  parent?: any;
  classes?: any[]; // Classes assigned to teacher (for teacher role)
  permissions?: Record<string, boolean>;
  rbacRoles?: string[];
}

export type LogoutReason = 'manual' | 'session-timeout' | 'unauthorized';

export interface LogoutOptions {
  /** Skip the confirmation dialog (e.g. after user already confirmed, or forced logout). */
  skipConfirm?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private logoutReasonKey = 'logoutReason';
  private readonly studentPortalKey = 'studentPortalStudent';
  private readonly parentPortalKey = 'parentPortalParent';
  private readonly viewAsRoleKey = 'viewAsRole';
  private inactivityTimeoutMs = 30 * 60 * 1000;
  private inactivityTimerId: any = null;
  private lastActivityKey = 'lastActivityTimestamp';

  constructor(
    private http: HttpClient,
    private router: Router,
    private logoutConfirm: LogoutConfirmService
  ) {
    const token = sessionStorage.getItem('token');
    const user = sessionStorage.getItem('user');
    if (token && user) {
      this.currentUserSubject.next(JSON.parse(user));
    }
    this.initInactivityTracking();
  }

  login(identifier: string, password: string, teacherId?: string): Observable<any> {
    const trimmedIdentifier = String(identifier || '').trim();
    const trimmedPassword = String(password || '').trim();
    const loginData: any = { username: trimmedIdentifier, password: trimmedPassword };

    if (trimmedIdentifier.includes('@')) {
      loginData.email = trimmedIdentifier;
    }
    
    // Note: teacherId is no longer required for teacher login
    // Only add it if explicitly provided (for optional verification)
    if (teacherId && teacherId.trim()) {
      loginData.teacherId = teacherId.trim();
    }
    
    return this.http.post(`${this.apiUrl}/auth/login`, loginData).pipe(
      tap((response: any) => {
        if (response && response.token && response.user) {
          // Store token and user synchronously
          sessionStorage.setItem('token', response.token);
          sessionStorage.setItem('user', JSON.stringify(response.user));
          if (response.sessionId) {
            sessionStorage.setItem('sessionId', response.sessionId);
          } else {
            sessionStorage.removeItem('sessionId');
          }
          // Update BehaviorSubject immediately
          this.currentUserSubject.next(response.user);
        } else {
          console.error('Invalid login response:', response);
          throw new Error('Invalid response from server');
        }
      })
    );
  }

  register(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, data);
  }

  verifyForgotPasswordDetails(payload: {
    role: string;
    email?: string;
    phoneNumber?: string;
    username?: string;
    studentId?: string;
    dateOfBirth?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/forgot-password/verify`, payload);
  }

  setForgotPasswordNewPassword(payload: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/forgot-password/set`, payload);
  }

  /** Show the modern logout confirmation modal (manual logout only). */
  confirmLogout(): Promise<boolean> {
    return this.logoutConfirm.open();
  }

  logout(reason: LogoutReason = 'manual', options?: LogoutOptions): void {
    if (reason === 'manual' && !options?.skipConfirm) {
      this.logoutConfirm.open().then((confirmed) => {
        if (confirmed) {
          this.completeLogout(reason);
        }
      });
      return;
    }

    this.completeLogout(reason);
  }

  private completeLogout(reason: LogoutReason): void {
    if (reason && reason !== 'manual') {
      sessionStorage.setItem(this.logoutReasonKey, reason);
    } else {
      sessionStorage.removeItem(this.logoutReasonKey);
    }
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('sessionId');
    sessionStorage.removeItem(this.studentPortalKey);
    sessionStorage.removeItem(this.parentPortalKey);
    sessionStorage.removeItem(this.viewAsRoleKey);
    sessionStorage.removeItem('viewAsRoleId');
    this.currentUserSubject.next(null);
    this.clearInactivityTimer();
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return sessionStorage.getItem('token');
  }

  /**
   * Decode a JWT token payload.
   */
  private decodeToken(token: string): any | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) {
        return null;
      }
      return JSON.parse(atob(payload));
    } catch (error) {
      console.warn('Failed to decode token payload:', error);
      return null;
    }
  }

  /**
   * Checks whether the provided token has expired.
   */
  isTokenExpired(token: string): boolean {
    const payload = this.decodeToken(token);
    if (!payload || !payload.exp) {
      return false;
    }
    const expiry = Number(payload.exp) * 1000;
    return Number.isFinite(expiry) && Date.now() >= expiry;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isStudentPortalActive(): boolean {
    return !!this.getStudentPortalStudentId();
  }

  /** Student id to impersonate (parent-only feature). */
  getStudentPortalStudentId(): string | null {
    try {
      const raw = sessionStorage.getItem(this.studentPortalKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const id = String(parsed?.id || '').trim();
      return id || null;
    } catch {
      return null;
    }
  }

  getStudentPortalStudent(): any | null {
    try {
      const raw = sessionStorage.getItem(this.studentPortalKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Enter "Act as student" mode for a linked student. */
  enterStudentPortal(student: any): void {
    if (!student?.id) return;
    sessionStorage.setItem(this.studentPortalKey, JSON.stringify(student));
  }

  exitStudentPortal(): void {
    sessionStorage.removeItem(this.studentPortalKey);
  }

  isParentPortalActive(): boolean {
    return !!this.getParentPortalParentId();
  }

  getParentPortalParentId(): string | null {
    try {
      const raw = sessionStorage.getItem(this.parentPortalKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const id = String(parsed?.id || '').trim();
      return id || null;
    } catch {
      return null;
    }
  }

  getParentPortalParent(): any | null {
    try {
      const raw = sessionStorage.getItem(this.parentPortalKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  enterParentPortal(parent: any): void {
    if (!parent?.id) return;
    sessionStorage.setItem(this.parentPortalKey, JSON.stringify(parent));
  }

  exitParentPortal(): void {
    sessionStorage.removeItem(this.parentPortalKey);
  }

  setCurrentUser(user: User): void {
    sessionStorage.setItem('user', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  consumeLogoutReason(): LogoutReason | null {
    const reason = sessionStorage.getItem(this.logoutReasonKey) as LogoutReason | null;
    if (reason) {
      sessionStorage.removeItem(this.logoutReasonKey);
      return reason;
    }
    return null;
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const user = this.getCurrentUser();
  
    if (!token || !user) {
      return false;
    }

    const payload = this.decodeToken(token);
    if (!payload || !payload.exp) {
      this.logout('unauthorized');
      return false;
    }
  
    if (this.isTokenExpired(token)) {
      this.logout('session-timeout');
      return false;
    }
  
    return true;
  }
  /** Login role from the database (ignores “View as role” preview). */
  getActualRole(): string {
    return String(this.getCurrentUser()?.role || '').toLowerCase();
  }

  /** Active role for UI checks — preview role when administrator is viewing as another role. */
  getEffectiveRole(): string {
    const preview = this.getViewAsRole();
    if (preview) {
      return preview.toLowerCase();
    }
    return this.getActualRole();
  }

  getViewAsRole(): string | null {
    const raw = sessionStorage.getItem(this.viewAsRoleKey);
    return raw ? String(raw).toLowerCase() : null;
  }

  setViewAsRole(role: string | null, roleId?: string | null): void {
    if (role) {
      sessionStorage.setItem(this.viewAsRoleKey, role.toLowerCase());
      if (roleId) {
        sessionStorage.setItem('viewAsRoleId', roleId);
      } else {
        sessionStorage.removeItem('viewAsRoleId');
      }
    } else {
      sessionStorage.removeItem(this.viewAsRoleKey);
      sessionStorage.removeItem('viewAsRoleId');
    }
    const user = this.getCurrentUser();
    if (user) {
      this.currentUserSubject.next({ ...user });
    }
  }

  getViewAsRoleId(): string | null {
    return sessionStorage.getItem('viewAsRoleId');
  }

  isViewAsRoleActive(): boolean {
    return !!this.getViewAsRole();
  }

  /** Administrators previewing another role — send role hint to the API. */
  canSendViewAsRoleHeader(): boolean {
    const actual = this.getActualRole();
    return actual === 'admin' || actual === 'superadmin' || actual === 'director';
  }

  hasRole(role: string): boolean {
    const effective = this.getEffectiveRole();
    if (!effective) return false;
    return effective === role.toLowerCase();
  }

  isAccountant(): boolean {
    return this.hasRole('accountant');
  }

  isDirector(): boolean {
    return this.hasRole('director');
  }

  /** Director or Super Administrator — unrestricted system access */
  isFullAccess(): boolean {
    return this.isSuperAdmin() || this.isDirector();
  }

  isHeadmaster(): boolean {
    return this.hasRole('headmaster');
  }

  isDeputyHeadmaster(): boolean {
    return this.hasRole('deputy_headmaster');
  }

  /** School Admin leadership (permissions controlled via RBAC) */
  isSchoolLeadership(): boolean {
    return this.isHeadmaster() || this.isDeputyHeadmaster();
  }

  isAdmin(): boolean {
    return this.hasRole('admin') || this.isFullAccess();
  }

  isTeacher(): boolean {
    return this.hasRole('teacher');
  }

  isStudent(): boolean {
    return this.hasRole('student');
  }

  isParent(): boolean {
    return this.hasRole('parent');
  }

  isSuperAdmin(): boolean {
    return this.hasRole('superadmin');
  }

  /** Demo accounts cannot change password (backend enforces the same). */
  canChangeOwnPassword(): boolean {
    const user = this.getCurrentUser();
    return !!user && !user.isDemo;
  }

  /** Route to the change-password / manage-account page for the current role. */
  getChangePasswordRoute(): string {
    return this.getManageAccountRoute();
  }

  /** My Profile / manage account page for the current role. */
  getManageAccountRoute(): string {
    const role = (
      this.isViewAsRoleActive() ? this.getEffectiveRole() : String(this.getCurrentUser()?.role || '')
    ).toLowerCase();
    switch (role) {
      case 'teacher':
        return '/teacher/manage-account';
      case 'parent':
        return '/parent/manage-account';
      case 'accountant':
        return '/accountant/manage-account';
      case 'admin':
      case 'superadmin':
        return '/admin/manage-account';
      default:
        return '/account/change-password';
    }
  }

  getDashboardRoute(): string {
    return this.getDashboardRouteForRole(this.getEffectiveRole());
  }

  /** Dashboard home path for a login role (used by “View as role”). */
  getDashboardRouteForRole(role?: string | null): string {
    const normalized = String(role || this.getEffectiveRole() || '').toLowerCase();
    if (normalized === 'teacher') {
      return '/teacher/dashboard';
    }
    if (normalized === 'parent') {
      return '/parent/dashboard';
    }
    if (normalized === 'student') {
      return '/dashboard';
    }
    return '/dashboard';
  }

  requestPasswordReset(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password/confirm`, { token, newPassword });
  }

  getParentStudents(): Observable<any> {
    return this.http.get(`${this.apiUrl}/parent/students`);
  }

  linkStudent(studentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/parent/link-student`, { studentId });
  }

  unlinkStudent(studentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/parent/unlink-student/${studentId}`);
  }

  private initInactivityTracking(): void {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, () => this.handleActivity(), true);
    });
    if (this.isAuthenticated()) {
      this.handleActivity();
    }
  }

  private handleActivity(): void {
    if (!this.isAuthenticated()) {
      this.clearInactivityTimer();
      return;
    }
    localStorage.setItem(this.lastActivityKey, Date.now().toString());
    this.resetInactivityTimer();
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimerId) {
      clearTimeout(this.inactivityTimerId);
    }
    if (!this.isAuthenticated()) {
      return;
    }
    this.inactivityTimerId = setTimeout(() => this.handleInactivityTimeout(), this.inactivityTimeoutMs);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimerId) {
      clearTimeout(this.inactivityTimerId);
      this.inactivityTimerId = null;
    }
  }

  private handleInactivityTimeout(): void {
    if (!this.isAuthenticated()) {
      this.clearInactivityTimer();
      return;
    }
    this.logout('session-timeout');
    alert('You have been logged out due to inactivity. Please sign in again.');
  }
}


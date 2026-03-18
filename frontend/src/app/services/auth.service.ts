import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

export interface User {
  id: string;
  email: string;
  username?: string;
  role: string;
  /** Full name from database (teacher/student/parent); set by login for dashboard display */
  fullName?: string;
  mustChangePassword?: boolean;
  isTemporaryAccount?: boolean;
  isDemo?: boolean;
  isUniversalTeacher?: boolean;
  student?: any;
  teacher?: any;
  parent?: any;
  classes?: any[]; // Classes assigned to teacher (for teacher role)
}

export type LogoutReason = 'manual' | 'session-timeout' | 'unauthorized';

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
  private inactivityTimeoutMs = 30 * 60 * 1000;
  private inactivityTimerId: any = null;
  private lastActivityKey = 'lastActivityTimestamp';

  constructor(private http: HttpClient, private router: Router) {
    const token = sessionStorage.getItem('token');
    const user = sessionStorage.getItem('user');
    if (token && user) {
      this.currentUserSubject.next(JSON.parse(user));
    }
    this.initInactivityTracking();
  }

  login(identifier: string, password: string, teacherId?: string): Observable<any> {
    // Use username for login (email is optional for non-teachers)
    // For teachers, only username is used
    const loginData: any = { username: identifier, password };
    
    // Only add email if it's actually an email (contains @) and not a teacher login
    // This maintains backward compatibility for non-teacher accounts
    if (identifier.includes('@')) {
      loginData.email = identifier;
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

  logout(reason: LogoutReason = 'manual'): void {
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
  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    if (!user || !user.role) return false;
    // Case-insensitive comparison for role checking
    return user.role.toLowerCase() === role.toLowerCase();
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


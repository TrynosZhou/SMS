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
  mustChangePassword?: boolean;
  isTemporaryAccount?: boolean;
  isDemo?: boolean;
  student?: any;
  teacher?: any;
  parent?: any;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient, private router: Router) {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      this.currentUserSubject.next(JSON.parse(user));
    }
  }

  login(email: string, password: string): Observable<any> {
    // Support both username and email login
    const loginData = email.includes('@') 
      ? { email, password } 
      : { username: email, password };
    return this.http.post(`${this.apiUrl}/auth/login`, loginData).pipe(
      tap((response: any) => {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        this.currentUserSubject.next(response.user);
      })
    );
  }

  register(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, data);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return user?.role === role;
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
}


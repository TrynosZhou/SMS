import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<any> {
    const token = this.authService.getToken();
    
    // Clone the request and add the authorization header if token exists
    let authReq = req;
    if (token) {
      authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }
    
    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        // Handle 401 errors
        if (error.status === 401) {
          // Skip auto-logout for auth endpoints (login, register, reset-password)
          const isAuthEndpoint = req.url.includes('/auth/login') || 
                                 req.url.includes('/auth/register') || 
                                 req.url.includes('/auth/reset-password');
          
          if (!isAuthEndpoint && token) {
            // Token is invalid or expired - clear it and redirect to login
            console.warn('Authentication failed - token may be expired or invalid');
            this.authService.logout();
          }
        }
        
        // Handle 400 errors related to school context (indicates old token format)
        if (error.status === 400) {
          const errorMessage = error.error?.message || '';
          const isSchoolContextError = errorMessage.toLowerCase().includes('school context') ||
                                       errorMessage.toLowerCase().includes('school context not found');
          
          if (isSchoolContextError && token) {
            console.warn('School context missing - token may be outdated. Please log out and log back in.');
            // Don't auto-logout, but log the warning - user should manually re-login
            // This allows them to see the error and understand they need to refresh their session
          }
        }
        
        return throwError(() => error);
      })
    );
  }
}


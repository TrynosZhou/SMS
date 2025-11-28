import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly publicEndpoints = [
    '/auth/login',
    '/auth/register',
    '/auth/reset-password'
  ];

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  private isPublicEndpoint(url: string): boolean {
    return this.publicEndpoints.some(endpoint => url.includes(endpoint));
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<any> {
    const token = this.authService.getToken();
    
    // Clean URL to remove any :1 or similar suffixes from IDs in the path
    // This fixes issues where class IDs or other UUIDs have :1 appended
    let cleanedUrl = req.url;
    // Match UUIDs in the path (not in the domain/port) and remove trailing :number or :text
    // Pattern: /api/classes/{uuid}:1 or /api/settings/reminders:1
    // Only match after /api/ to avoid matching port numbers like :3001
    if (cleanedUrl.includes('/api/')) {
      const apiIndex = cleanedUrl.indexOf('/api/');
      const beforeApi = cleanedUrl.substring(0, apiIndex);
      const afterApi = cleanedUrl.substring(apiIndex);
      // Clean the path part (after /api/) to remove :suffix from UUIDs
      const cleanedPath = afterApi.replace(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):[^/\s?&#]+/gi, '$1');
      cleanedUrl = beforeApi + cleanedPath;
      
      if (cleanedUrl !== req.url) {
        console.log('AuthInterceptor: Cleaned URL from', req.url, 'to', cleanedUrl);
      }
    }
    
    const requiresAuth = !this.isPublicEndpoint(cleanedUrl);

    if (requiresAuth) {
      if (!token) {
        console.warn('No authentication token found for secure request. Redirecting to login.');
        this.authService.logout('unauthorized');
        return throwError(() => new Error('Authentication required'));
      }

      if (this.authService.isTokenExpired(token)) {
        console.warn('Authentication token has expired. Redirecting to login.');
        this.authService.logout('session-timeout');
        return throwError(() => new Error('Session expired'));
      }
    }

    // Clone the request with cleaned URL and add the authorization header if token exists
    let authReq = req;
    if (cleanedUrl !== req.url || (requiresAuth && token)) {
      const update: any = {};
      if (cleanedUrl !== req.url) {
        update.url = cleanedUrl;
      }
      if (requiresAuth && token) {
        update.setHeaders = {
          Authorization: `Bearer ${token}`
        };
      }
      authReq = req.clone(update);
    }
    
    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        // Handle 401 errors
        if (error.status === 401) {
          // Skip auto-logout for auth endpoints (login, register, reset-password)
          const isAuthEndpoint = this.isPublicEndpoint(req.url);
          
          if (!isAuthEndpoint) {
            console.warn('Authentication failed with 401 - redirecting to login.');
            this.authService.logout('unauthorized');
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


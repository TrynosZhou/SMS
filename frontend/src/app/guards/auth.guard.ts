import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }

    const role = this.authService.getEffectiveRole();
    const url = state.url.split('?')[0];

    if (role === 'parent') {
      if (url === '/dashboard') {
        this.router.navigate(['/parent/dashboard']);
        return false;
      }
    }

    if (role === 'teacher') {
      if (url === '/dashboard') {
        this.router.navigate(['/teacher/dashboard']);
        return false;
      }
    }

    if (role === 'accountant') {
      const allowedPrefixes = [
        '/dashboard',
        '/account/change-password',
        '/students',
        '/classes/lists',
        '/invoices',
        '/invoices/statements',
        '/payments/record',
        '/balance-enquiry',
        '/outstanding-balance',
        '/accountant/change_password',
        '/accountant/manage-account',
        '/messages',
        '/logistics',
        '/inventory',
        '/financial-reports',
        '/finance/',
      ];
      const isAllowed = allowedPrefixes.some((prefix) => url === prefix || url.startsWith(prefix + '/'));
      if (!isAllowed) {
        this.router.navigate(['/dashboard']);
        return false;
      }
    }

    if (role === 'parent') {
      const allowedPrefixes = [
        '/parent/',
        '/report-cards',
        '/account/change-password',
      ];
      const isAllowed = allowedPrefixes.some(
        (prefix) => url === prefix || url.startsWith(prefix + '/') || url.startsWith(prefix)
      );
      if (!isAllowed) {
        this.router.navigate(['/parent/dashboard']);
        return false;
      }
    }

    if (role === 'student') {
      const allowedPrefixes = [
        '/dashboard',
        '/student/',
        '/account/change-password',
      ];
      const isAllowed = allowedPrefixes.some((prefix) => url === prefix || url.startsWith(prefix));
      if (!isAllowed) {
        this.router.navigate(['/dashboard']);
        return false;
      }
    }

    if (role === 'teacher') {
      const blockedPrefixes = [
        '/admin/',
        '/user-management',
        '/system-settings',
        '/settings/payment-receipt-manager',
        '/admin/manage-accounts',
        '/user-log',
        '/admin/license-config',
        '/system/integrations',
      ];
      if (blockedPrefixes.some((prefix) => url === prefix || url.startsWith(prefix))) {
        this.router.navigate(['/teacher/dashboard']);
        return false;
      }
    }

    return true;
  }
}


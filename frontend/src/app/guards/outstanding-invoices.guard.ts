import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Restricts Outstanding Invoices (view_balances) to SuperAdmin, Administrator, and Accountant only.
 * Teachers and other roles are redirected to dashboard.
 */
@Injectable({
  providedIn: 'root'
})
export class OutstandingInvoicesGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/sign-in']);
      return false;
    }
    const allowed =
      this.authService.hasRole('superadmin') ||
      this.authService.hasRole('admin') ||
      this.authService.hasRole('accountant');
    if (!allowed) {
      this.router.navigate(['/dashboard']);
      return false;
    }
    return true;
  }
}

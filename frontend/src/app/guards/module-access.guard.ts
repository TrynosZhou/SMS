import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { PermissionService } from '../services/permission.service';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private permissionService: PermissionService,
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const moduleName = route.data['module'] as string;
    const financePage = route.data['financePage'] as string;

    if (financePage) {
      const hasFinancePage = this.permissionService.canAccessFinancePage(financePage, 'view');
      if (!hasFinancePage) {
        if (!this.authService.getCurrentUser()) {
          this.router.navigate(['/login']);
        } else {
          this.router.navigate(['/access-denied'], {
            queryParams: { from: state.url, module: moduleName || 'finance', financePage },
          });
        }
        return false;
      }
    }

    if (!moduleName) {
      return true;
    }

    const hasAccess = this.permissionService.canAccessModule(moduleName);

    if (!hasAccess) {
      if (!this.authService.getCurrentUser()) {
        this.router.navigate(['/login']);
      } else {
        this.router.navigate(['/access-denied'], {
          queryParams: { from: state.url, module: moduleName, financePage: financePage || undefined },
        });
      }
      return false;
    }

    return true;
  }
}


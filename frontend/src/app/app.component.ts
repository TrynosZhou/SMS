import { Component, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { ModuleAccessService } from './services/module-access.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  schoolName = 'School Management System';
  mobileMenuOpen = false;

  constructor(
    public authService: AuthService, 
    private settingsService: SettingsService,
    public moduleAccessService: ModuleAccessService
  ) { }

  ngOnInit(): void {
    // Load school name from settings if authenticated
    if (this.authService.isAuthenticated()) {
      this.settingsService.getSettings().subscribe({
        next: (settings: any) => {
          this.schoolName = settings?.schoolName || 'School Management System';
        },
        error: () => {
          // ignore settings fetch errors to avoid blocking UI
        }
      });
      
      // Load module access settings
      this.moduleAccessService.loadModuleAccess();
    }
  }

  isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  isParent(): boolean {
    return this.authService.hasRole('parent');
  }

  isTeacher(): boolean {
    return this.authService.hasRole('teacher');
  }

  isSuperAdmin(): boolean {
    return this.authService.hasRole('superadmin');
  }

  isDemoUser(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.isDemo === true || user?.email === 'demo@school.com' || user?.username === 'demo@school.com';
  }

  canAccessModule(moduleName: string): boolean {
    return this.moduleAccessService.canAccessModule(moduleName);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    // Prevent body scroll when menu is open
    if (this.mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
    document.body.style.overflow = '';
  }

  logout(): void {
    this.closeMobileMenu();
    this.authService.logout();
  }
}


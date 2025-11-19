import { Component, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  schoolName = 'School Management System';

  constructor(public authService: AuthService, private settingsService: SettingsService) { }

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
    }
  }

  isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  isParent(): boolean {
    return this.authService.hasRole('parent');
  }

  isSuperAdmin(): boolean {
    return this.authService.hasRole('superadmin');
  }

  isDemoUser(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.isDemo === true || user?.email === 'demo@school.com' || user?.username === 'demo@school.com';
  }

  logout(): void {
    this.authService.logout();
  }
}


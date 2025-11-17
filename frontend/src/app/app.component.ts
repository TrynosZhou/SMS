import { Component, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { SchoolService } from './services/school.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  schoolName = 'School Management System';

  constructor(public authService: AuthService, private schoolService: SchoolService) { }

  ngOnInit(): void {
    this.authService.currentSchool$.subscribe(school => {
      this.schoolName = school?.name || 'School Management System';
    });

    if (this.authService.isAuthenticated() && !this.authService.getCurrentSchool()) {
      this.schoolService.getCurrentSchoolProfile().subscribe({
        next: (school) => this.authService.setCurrentSchool(school),
        error: () => {
          // ignore profile fetch errors to avoid blocking UI
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


import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-access-denied',
  templateUrl: './access-denied.component.html',
  styleUrls: ['./access-denied.component.css'],
})
export class AccessDeniedComponent {
  constructor(private router: Router, private authService: AuthService) {}

  goBack(): void {
    const user = this.authService.getCurrentUser();
    const role = user?.role?.toLowerCase();
    if (role === 'parent') {
      this.router.navigate(['/parent/dashboard']);
    } else if (role === 'teacher') {
      this.router.navigate(['/teacher/dashboard']);
    } else if (role === 'student') {
      this.router.navigate(['/dashboard']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  logout(): void {
    this.authService.logout();
  }
}

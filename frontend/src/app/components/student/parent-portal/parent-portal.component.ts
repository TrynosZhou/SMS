import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { StudentService } from '../../../services/student.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-parent-portal',
  templateUrl: './parent-portal.component.html',
  styleUrls: ['./parent-portal.component.css']
})
export class ParentPortalComponent implements OnInit {
  parents: any[] = [];
  loading = false;
  error = '';

  constructor(
    private studentService: StudentService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.studentService.getLinkedParentsForStudent().subscribe({
      next: (res: any) => {
        this.parents = res?.parents || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load linked parents.';
      }
    });
  }

  parentName(p: any): string {
    return (p?.fullName || `${p?.lastName || ''} ${p?.firstName || ''}`.trim() || 'Parent').trim();
  }

  openParentDashboard(parent: any): void {
    if (!parent?.id) return;
    this.authService.enterParentPortal(parent);
    this.router.navigate(['/parent/dashboard']);
  }
}


import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-link-students',
  templateUrl: './link-students.component.html',
  styleUrls: ['./link-students.component.css']
})
export class LinkStudentsComponent implements OnInit {
  studentId = '';
  linkedStudents: any[] = [];
  linking = false;
  loading = false;
  error = '';
  success = '';
  parentName = '';

  /** ID of the student currently awaiting unlink confirmation */
  confirmUnlinkId: string | null = null;

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim()
        || user.fullName?.trim() || 'Parent';
    } else {
      this.parentName = user?.fullName?.trim() || 'Parent';
    }
  }

  ngOnInit() {
    this.loadLinkedStudents();
  }

  loadLinkedStudents() {
    this.loading = true;
    this.parentService.getLinkedStudents().subscribe({
      next: (response: any) => {
        this.linkedStudents = response.students || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to load linked students';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  linkStudent() {
    this.error = '';
    this.success = '';

    if (!this.studentId || !this.studentId.trim()) {
      this.error = 'Please enter a Student ID';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.linking = true;

    this.parentService.linkStudentByIdAndDob(this.studentId.trim()).subscribe({
      next: (response: any) => {
        this.linking = false;
        const name = [response.student?.firstName, response.student?.lastName].filter(Boolean).join(' ');
        this.success = `✅ Successfully linked${name ? ': ' + name : ' student'}`;
        this.studentId = '';
        this.loadLinkedStudents();
        setTimeout(() => this.success = '', 6000);
      },
      error: (err: any) => {
        this.linking = false;
        this.error = err.error?.message || 'Failed to link student. Please verify the Student ID.';
        setTimeout(() => this.error = '', 6000);
      }
    });
  }

  requestUnlink(studentId: string) {
    this.confirmUnlinkId = studentId;
  }

  cancelUnlink() {
    this.confirmUnlinkId = null;
  }

  confirmUnlink() {
    if (!this.confirmUnlinkId) return;
    const id = this.confirmUnlinkId;
    this.confirmUnlinkId = null;

    this.parentService.unlinkStudent(id).subscribe({
      next: () => {
        this.success = 'Student unlinked successfully.';
        this.loadLinkedStudents();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to unlink student';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  studentInitials(student: any): string {
    const f = (student.firstName || '').charAt(0).toUpperCase();
    const l = (student.lastName || '').charAt(0).toUpperCase();
    return (f + l) || '?';
  }

  goToDashboard() {
    this.router.navigate(['/parent/dashboard']);
  }

  logout() {
    this.authService.logout();
  }
}

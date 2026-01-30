import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';

@Component({
  selector: 'app-link-account',
  templateUrl: './link-account.component.html',
  styleUrls: ['./link-account.component.css']
})
export class LinkAccountComponent implements OnInit {
  linkForm: FormGroup;
  loading = false;
  error = '';
  success = '';
  foundTeacher: any = null;
  currentUser: any = null;
  linking = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private teacherService: TeacherService,
    private router: Router
  ) {
    this.linkForm = this.fb.group({
      teacherId: ['', [Validators.required]]
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    
    // Pre-fill the form with the current username (EmployeeID)
    if (this.currentUser?.username) {
      this.linkForm.patchValue({
        teacherId: this.currentUser.username
      });
    }
  }

  searchTeacher(): void {
    if (this.linkForm.invalid) {
      this.error = 'Please enter your EmployeeID';
      return;
    }

    this.loading = true;
    this.error = '';
    this.foundTeacher = null;

    const teacherId = this.linkForm.get('teacherId')?.value.trim();

    this.teacherService.searchTeacherByEmployeeId(teacherId).subscribe({
      next: (response) => {
        this.loading = false;
        this.foundTeacher = response.teacher;
        this.success = response.message;
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to find teacher profile';
        
        if (err.error?.alreadyLinked) {
          this.error += ' This profile is already linked to another account.';
        }
      }
    });
  }

  linkAccount(): void {
    if (!this.foundTeacher) {
      this.error = 'Please search and confirm your teacher profile first';
      return;
    }

    this.linking = true;
    this.error = '';
    this.success = '';

    const teacherIdToLink = this.foundTeacher?.teacherId || this.linkForm.get('teacherId')?.value?.trim();
    this.teacherService.linkTeacherAccount(teacherIdToLink).subscribe({
      next: (response) => {
        this.linking = false;
        
        if (response.alreadyLinked) {
          this.success = response.message;
          const updatedUser = {
            ...this.currentUser,
            teacher: response.teacher,
            classes: response.teacher?.classes || []
          };
          this.authService.setCurrentUser(updatedUser);
          setTimeout(() => this.router.navigate(['/teacher/dashboard']), 2000);
        } else {
          this.success = response.message;
          const updatedUser = {
            ...this.currentUser,
            teacher: response.teacher,
            classes: response.teacher?.classes || []
          };
          this.authService.setCurrentUser(updatedUser);
          setTimeout(() => this.router.navigate(['/teacher/dashboard']), 2000);
        }
      },
      error: (err) => {
        this.linking = false;
        this.error = err.error?.message || 'Failed to link account';
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/teacher/dashboard']);
  }

  clearSearch(): void {
    this.foundTeacher = null;
    this.success = '';
    this.error = '';
  }
}

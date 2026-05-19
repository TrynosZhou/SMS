<<<<<<< HEAD
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
=======
import { Component, OnInit } from '@angular/core';
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
<<<<<<< HEAD
  standalone: false,  selector: 'app-publish-results',
  templateUrl: './publish-results.component.html',
  styleUrls: ['./publish-results.component.css']
})
export class PublishResultsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
=======
  selector: 'app-publish-results',
  templateUrl: './publish-results.component.html',
  styleUrls: ['./publish-results.component.css']
})
export class PublishResultsComponent implements OnInit {
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  publishExamType: string = '';
  publishTerm: string = '';
  publishing = false;
  unpublishing = false;
  loading = false;
  
  error = '';
  success = '';
  
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];
  
  isAdmin = false;
  isSuperAdmin = false;

  constructor(
    private examService: ExamService,
    private settingsService: SettingsService,
<<<<<<< HEAD
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
=======
    private authService: AuthService
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin') : false;
    this.isSuperAdmin = user ? (user.role === 'superadmin') : false;
  }

  ngOnInit() {
<<<<<<< HEAD
    activatePageLoad(this.router, this.destroy$, '/publish-results', () => this.loadActiveTerm());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
=======
    this.loadActiveTerm();
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  }

  loadActiveTerm() {
    this.loading = true;
<<<<<<< HEAD
    this.cdr.markForCheck();
    this.settingsService
      .getActiveTerm()
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          if (data.activeTerm) {
            this.publishTerm = data.activeTerm;
          } else if (data.currentTerm) {
            this.publishTerm = data.currentTerm;
          }
        },
        error: (err) => {
          console.error('Error loading active term:', err);
        }
      });
=======
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        if (data.activeTerm) {
          this.publishTerm = data.activeTerm;
        } else if (data.currentTerm) {
          this.publishTerm = data.currentTerm;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading active term:', err);
        this.loading = false;
      }
    });
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  }

  publishResults() {
    // For publishing, only exam type and term are required
    if (!this.publishExamType) {
      this.error = 'Please select an exam type to publish results.';
      return;
    }

    if (!this.publishTerm) {
      this.error = 'Term is required. Please ensure the active term is set in settings.';
      return;
    }

    if (!confirm(`Are you sure you want to publish all ${this.examTypes.find(t => t.value === this.publishExamType)?.label || this.publishExamType} results for ${this.publishTerm}? Once published, results will be visible to all users (students, parents, and teachers) and marks/comments cannot be edited.`)) {
      return;
    }

    this.publishing = true;
    this.error = '';
    this.success = '';

    // Publish by exam type and term (all classes)
    this.examService.publishExamByType(this.publishExamType, this.publishTerm).subscribe({
      next: (response: any) => {
        this.success = `Results published successfully! ${response.publishedCount || 0} exam(s) published. All users (students, parents, and teachers) can now view the results.`;
        this.publishing = false;
        setTimeout(() => this.success = '', 8000);
      },
      error: (err: any) => {
        console.error('Error publishing exam:', err);
        this.error = err.error?.message || 'Failed to publish results. Please try again.';
        this.publishing = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  unpublishResults() {
    // For unpublishing, only exam type and term are required
    if (!this.publishExamType) {
      this.error = 'Please select an exam type to unpublish results.';
      return;
    }

    if (!this.publishTerm) {
      this.error = 'Term is required. Please ensure the active term is set in settings.';
      return;
    }

    if (!confirm(`Are you sure you want to unpublish all ${this.examTypes.find(t => t.value === this.publishExamType)?.label || this.publishExamType} results for ${this.publishTerm}? Once unpublished, results will no longer be visible to students, parents, and teachers. Marks and comments can be edited again.`)) {
      return;
    }

    this.unpublishing = true;
    this.error = '';
    this.success = '';

    // Unpublish by exam type and term (all classes)
    this.examService.unpublishExamByType(this.publishExamType, this.publishTerm).subscribe({
      next: (response: any) => {
        this.success = `Results unpublished successfully! ${response.unpublishedCount || 0} exam(s) unpublished. Results are no longer visible to students, parents, and teachers. Marks and comments can now be edited.`;
        this.unpublishing = false;
        setTimeout(() => this.success = '', 8000);
      },
      error: (err: any) => {
        console.error('Error unpublishing exam:', err);
        this.error = err.error?.message || 'Failed to unpublish results. Please try again.';
        this.unpublishing = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}


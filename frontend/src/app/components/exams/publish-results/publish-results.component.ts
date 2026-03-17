import { Component, OnInit } from '@angular/core';
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-publish-results',
  templateUrl: './publish-results.component.html',
  styleUrls: ['./publish-results.component.css']
})
export class PublishResultsComponent implements OnInit {
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
    private authService: AuthService
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin') : false;
    this.isSuperAdmin = user ? (user.role === 'superadmin') : false;
  }

  ngOnInit() {
    this.loadActiveTerm();
  }

  loadActiveTerm() {
    this.loading = true;
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


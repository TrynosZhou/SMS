import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SubjectService } from '../../../services/subject.service';

@Component({
  selector: 'app-subject-list',
  templateUrl: './subject-list.component.html',
  styleUrls: ['./subject-list.component.css']
})
export class SubjectListComponent implements OnInit {
  subjects: any[] = [];
  loading = false;
  error = '';
  success = '';

  constructor(
    private subjectService: SubjectService,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadSubjects();
  }

  loadSubjects() {
    this.loading = true;
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.subjects = data;
        this.loading = false;
      },
      error: (err: any) => {
        console.error(err);
        this.loading = false;
      }
    });
  }

  editSubject(id: string) {
    this.router.navigate([`/subjects/${id}/edit`]);
  }

  deleteSubject(id: string, subjectName: string, subjectCode: string) {
    if (!confirm(`Are you sure you want to delete subject "${subjectName}" (${subjectCode})? This action cannot be undone.`)) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    this.subjectService.deleteSubject(id).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Subject deleted successfully';
        this.loading = false;
        this.loadSubjects();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error deleting subject:', err);
        let errorMessage = 'Failed to delete subject';
        if (err.status === 0 || err.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running.';
        } else if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        this.error = errorMessage;
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}


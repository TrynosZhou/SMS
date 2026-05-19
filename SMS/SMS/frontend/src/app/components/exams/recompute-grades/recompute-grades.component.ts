import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ExamService } from '../../../services/exam.service';

@Component({
  selector: 'app-recompute-grades',
  templateUrl: './recompute-grades.component.html',
  styleUrls: ['./recompute-grades.component.css']
})
export class RecomputeGradesComponent {
  loading = false;
  success = '';
  error = '';
  summary: { term?: string; classesProcessed?: number; examsProcessed?: number; marksProcessed?: number } | null = null;

  constructor(private examService: ExamService, private router: Router) {}

  recompute() {
    if (this.loading) return;
    this.loading = true;
    this.error = '';
    this.success = '';
    this.summary = null;
    this.examService.recomputeGrades().subscribe({
      next: (res: any) => {
        this.loading = false;
        this.success = res?.message || 'Recomputed grades successfully';
        this.summary = {
          term: res?.term,
          classesProcessed: res?.classesProcessed || 0,
          examsProcessed: res?.examsProcessed || 0,
          marksProcessed: res?.marksProcessed || 0
        };
        setTimeout(() => { if (this.success) this.success = ''; }, 6000);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to recompute grades';
        setTimeout(() => { if (this.error) this.error = ''; }, 6000);
      }
    });
  }

  cancel() {
    this.router.navigate(['/exams']);
  }
}


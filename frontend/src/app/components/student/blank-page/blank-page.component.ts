import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ElearningService } from '../../../services/elearning.service';

@Component({
  selector: 'app-blank-page',
  templateUrl: './blank-page.component.html',
  styleUrls: ['./blank-page.component.css'],
})
export class BlankPageComponent implements OnInit {
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  taskId = '';
  task: any | null = null;

  loading = false;
  submitting = false;
  error: string | null = null;
  success: string | null = null;

  answerText = '';
  selectedFile: File | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private elearningService: ElearningService
  ) {}

  ngOnInit(): void {
    this.taskId = String(this.route.snapshot.paramMap.get('taskId') || '').trim();
    if (!this.taskId) {
      this.error = 'Task id is missing.';
      return;
    }
    this.loadTask();
  }

  backToTasks(): void {
    this.router.navigate(['/eweb']);
  }

  onPickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      this.selectedFile = null;
      return;
    }
    this.selectedFile = input.files[0];
  }

  removeFile(): void {
    this.selectedFile = null;
    const el = this.fileInputRef?.nativeElement;
    if (el) {
      el.value = '';
    }
  }

  submit(): void {
    if (!this.taskId) return;

    const trimmed = (this.answerText || '').trim();
    if (!trimmed && !this.selectedFile) {
      this.error = 'Please type your answer or attach a file before submitting.';
      this.success = null;
      return;
    }

    this.submitting = true;
    this.error = null;
    this.success = null;

    const formData = new FormData();
    if (trimmed) {
      formData.append('text', trimmed);
    }
    if (this.selectedFile) {
      formData.append('file', this.selectedFile);
    }

    this.elearningService.submitResponse(this.taskId, formData).subscribe({
      next: () => {
        this.submitting = false;
        this.success = 'Submitted successfully. Your teacher will mark it.';
        this.answerText = '';
        this.removeFile();
      },
      error: (err: any) => {
        this.submitting = false;
        const msg = err?.error?.message || 'Failed to submit. Please try again.';
        this.error = msg;
      },
    });
  }

  private loadTask(): void {
    this.loading = true;
    this.error = null;
    this.task = null;

    this.elearningService.getStudentTaskById(this.taskId).subscribe({
      next: (task: any) => {
        this.loading = false;
        this.task = task || null;
      },
      error: (err: any) => {
        this.loading = false;
        const msg = err?.error?.message || 'Failed to load task.';
        this.error = msg;
      },
    });
  }
}


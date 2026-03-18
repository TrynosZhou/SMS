import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ElearningService } from '../../../services/elearning.service';

@Component({
  selector: 'app-mark-response',
  templateUrl: './mark-response.component.html',
  styleUrls: ['./mark-response.component.css'],
})
export class MarkResponseComponent implements OnInit {
  responseId = '';
  response: any | null = null;

  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  score: number | null = null;
  feedbackText = '';
  feedbackFile: File | null = null;

  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private elearningService: ElearningService
  ) {}

  ngOnInit(): void {
    this.responseId = String(this.route.snapshot.paramMap.get('responseId') || '').trim();
    if (!this.responseId) {
      this.error = 'Response id is missing.';
      return;
    }
    this.load();
  }

  back(): void {
    this.router.navigate(['/teacher/student-responses']);
  }

  onPickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.feedbackFile = input.files && input.files.length ? input.files[0] : null;
  }

  removeFile(): void {
    this.feedbackFile = null;
    const el = this.fileInputRef?.nativeElement;
    if (el) el.value = '';
  }

  save(): void {
    if (!this.responseId) return;
    this.error = null;
    this.success = null;

    const form = new FormData();
    if (this.score !== null && this.score !== undefined && String(this.score).trim() !== '') {
      form.append('score', String(this.score));
    }
    if ((this.feedbackText || '').trim()) {
      form.append('feedbackText', this.feedbackText.trim());
    }
    if (this.feedbackFile) {
      form.append('file', this.feedbackFile);
    }

    this.saving = true;
    this.elearningService.markResponse(this.responseId, form).subscribe({
      next: (saved: any) => {
        this.saving = false;
        this.success = 'Marked and sent back to the student.';
        this.response = saved;
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err?.error?.message || 'Failed to save marking.';
      },
    });
  }

  private load(): void {
    this.loading = true;
    this.error = null;
    this.elearningService.getResponseById(this.responseId).subscribe({
      next: (r: any) => {
        this.loading = false;
        this.response = r || null;
        this.score = r?.score ?? null;
        this.feedbackText = r?.feedbackText || '';
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load response.';
      },
    });
  }
}


import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ElearningService } from '../../../services/elearning.service';

@Component({
  selector: 'app-esubmit',
  templateUrl: './esubmit.component.html',
  styleUrls: ['./esubmit.component.css']
})
export class EsubmitComponent implements OnInit {
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  tasks: any[] = [];
  selectedTaskId = '';
  text = '';
  file: File | null = null;
  maxChars = 20000;

  loadingTasks = false;
  submitting = false;
  success: string | null = null;
  error: string | null = null;

  constructor(private elearningService: ElearningService) {}

  ngOnInit(): void {
    this.loadTasks();
  }

  get selectedTask(): any | null {
    return (this.tasks || []).find(t => String(t.id) === String(this.selectedTaskId)) || null;
  }

  get charCount(): number {
    return (this.text || '').length;
  }

  loadTasks(): void {
    this.loadingTasks = true;
    this.elearningService.getStudentTasks().subscribe({
      next: tasks => {
        this.loadingTasks = false;
        this.tasks = Array.isArray(tasks) ? tasks : [];
        // Reload draft for current selection if any
        if (this.selectedTaskId) {
          this.loadDraft(this.selectedTaskId);
        }
      },
      error: () => {
        this.loadingTasks = false;
        this.error = 'Failed to load assigned tasks.';
      }
    });
  }

  onTaskChange(): void {
    // When task changes, pull draft text (if present)
    this.loadDraft(this.selectedTaskId);
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files && input.files.length > 0 ? input.files[0] : null;
  }

  /** Remove attached file so student can choose a different document. */
  removeFile(): void {
    this.file = null;
    const el = this.fileInputRef?.nativeElement;
    if (el) {
      el.value = '';
    }
  }

  onTextChange(): void {
    // Persist lightweight draft locally per task
    if (!this.selectedTaskId) return;
    try {
      localStorage.setItem(this.draftKey(this.selectedTaskId), this.text || '');
    } catch {
      // ignore storage quota errors
    }
  }

  clearAnswer(): void {
    this.text = '';
    if (this.selectedTaskId) {
      try {
        localStorage.removeItem(this.draftKey(this.selectedTaskId));
      } catch {}
    }
  }

  submit(): void {
    this.success = null;
    this.error = null;

    if (!this.selectedTaskId) {
      this.error = 'Please choose a task/assignment.';
      return;
    }
    if (!this.text.trim() && !this.file) {
      this.error = 'Please type your answer or attach a file.';
      return;
    }

    const form = new FormData();
    if (this.text.trim()) {
      form.append('text', this.text.trim());
    }
    if (this.file) {
      form.append('file', this.file);
    }

    this.submitting = true;
    this.elearningService.submitResponse(this.selectedTaskId, form).subscribe({
      next: () => {
        this.submitting = false;
        this.success = 'Your work was submitted successfully.';
        this.text = '';
        this.removeFile();
        // clear draft on success
        if (this.selectedTaskId) {
          try {
            localStorage.removeItem(this.draftKey(this.selectedTaskId));
          } catch {}
        }
      },
      error: () => {
        this.submitting = false;
        this.error = 'Failed to submit your work. Please try again.';
      }
    });
  }

  private draftKey(taskId: string): string {
    return `esubmit_draft_${taskId}`;
  }

  private loadDraft(taskId: string): void {
    if (!taskId) {
      this.text = '';
      return;
    }
    try {
      const saved = localStorage.getItem(this.draftKey(taskId));
      this.text = saved ?? '';
    } catch {
      this.text = '';
    }
  }
}


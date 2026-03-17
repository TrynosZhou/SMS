import { Component, OnInit } from '@angular/core';
import { ElearningService } from '../../../services/elearning.service';

@Component({
  selector: 'app-esubmit',
  templateUrl: './esubmit.component.html',
  styleUrls: ['./esubmit.component.css']
})
export class EsubmitComponent implements OnInit {
  tasks: any[] = [];
  selectedTaskId = '';
  text = '';
  file: File | null = null;

  loadingTasks = false;
  submitting = false;
  success: string | null = null;
  error: string | null = null;

  constructor(private elearningService: ElearningService) {}

  ngOnInit(): void {
    this.loadTasks();
  }

  loadTasks(): void {
    this.loadingTasks = true;
    this.elearningService.getStudentTasks().subscribe({
      next: tasks => {
        this.loadingTasks = false;
        this.tasks = Array.isArray(tasks) ? tasks : [];
      },
      error: () => {
        this.loadingTasks = false;
        this.error = 'Failed to load assigned tasks.';
      }
    });
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files && input.files.length > 0 ? input.files[0] : null;
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
        this.file = null;
      },
      error: () => {
        this.submitting = false;
        this.error = 'Failed to submit your work. Please try again.';
      }
    });
  }
}


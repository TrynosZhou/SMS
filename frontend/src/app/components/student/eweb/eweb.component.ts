import { Component, OnInit } from '@angular/core';
import { ElearningService } from '../../../services/elearning.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-eweb',
  templateUrl: './eweb.component.html',
  styleUrls: ['./eweb.component.css']
})
export class EwebComponent implements OnInit {
  tasks: any[] = [];
  marked: any[] = [];
  activeTab: 'assigned' | 'marked' = 'assigned';
  loading = false;
  loadingMarked = false;
  error: string | null = null;
  markedError: string | null = null;

  constructor(
    private elearningService: ElearningService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadTasks();
    this.loadMarked();
  }

  loadTasks(): void {
    this.loading = true;
    this.error = null;
    this.elearningService.getStudentTasks().subscribe({
      next: tasks => {
        this.loading = false;
        this.tasks = Array.isArray(tasks) ? tasks : [];
      },
      error: () => {
        this.loading = false;
        this.error = 'Failed to load assigned work.';
      }
    });
  }

  loadMarked(): void {
    this.loadingMarked = true;
    this.markedError = null;
    this.elearningService.getStudentResponses(true).subscribe({
      next: rows => {
        this.loadingMarked = false;
        this.marked = Array.isArray(rows) ? rows : [];
      },
      error: () => {
        this.loadingMarked = false;
        this.markedError = 'Failed to load marked scripts.';
      },
    });
  }

  setTab(tab: 'assigned' | 'marked'): void {
    this.activeTab = tab;
  }

  openTask(t: any): void {
    if (!t || !t.id) {
      return;
    }
    const type = (t.type || '').toString().toLowerCase();
    if (type === 'assignment' || type === 'test' || type === 'quiz') {
      this.router.navigate(['/student/blank_page', t.id]);
      return;
    }
    if (t.fileUrl) {
      window.open(t.fileUrl, '_blank', 'noopener,noreferrer');
    }
  }

  openMarkedScript(r: any): void {
    const url = r?.feedbackFileUrl;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}


import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { ElearningService } from '../../../services/elearning.service';
import { activatePageLoad } from '../../../utils/route-activation';

@Component({
  standalone: false,  selector: 'app-student-responses',
templateUrl: './student-responses.component.html',
  styleUrls: ['./student-responses.component.css']
})
export class StudentResponsesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  tasks: any[] = [];
  selectedTaskId = '';
  responses: any[] = [];
  loadingTasks = false;
  loadingResponses = false;
  error: string | null = null;

  constructor(
    private elearningService: ElearningService,
    private router: Router
  ) {}

  ngOnInit(): void {
    activatePageLoad(this.router, this.destroy$, '/teacher/student-responses', () => this.loadTasks());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTasks(): void {
    this.loadingTasks = true;
    this.elearningService.getMyTasks().subscribe({
      next: tasks => {
        this.loadingTasks = false;
        this.tasks = Array.isArray(tasks) ? tasks : [];
      },
      error: () => {
        this.loadingTasks = false;
        this.error = 'Failed to load tasks.';
      }
    });
  }

  onTaskChange(): void {
    this.responses = [];
    this.error = null;
    if (!this.selectedTaskId) {
      return;
    }
    this.loadingResponses = true;
    this.elearningService.getTaskResponses(this.selectedTaskId).subscribe({
      next: responses => {
        this.loadingResponses = false;
        this.responses = Array.isArray(responses) ? responses : [];
      },
      error: () => {
        this.loadingResponses = false;
        this.error = 'Failed to load student responses.';
      }
    });
  }
}


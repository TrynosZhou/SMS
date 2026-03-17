import { Component, OnInit } from '@angular/core';
import { ElearningService } from '../../../services/elearning.service';

@Component({
  selector: 'app-student-responses',
  templateUrl: './student-responses.component.html',
  styleUrls: ['./student-responses.component.css']
})
export class StudentResponsesComponent implements OnInit {
  tasks: any[] = [];
  selectedTaskId = '';
  responses: any[] = [];
  loadingTasks = false;
  loadingResponses = false;
  error: string | null = null;

  constructor(private elearningService: ElearningService) {}

  ngOnInit(): void {
    this.loadTasks();
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


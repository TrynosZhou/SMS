import { Component, OnInit } from '@angular/core';
import { ElearningService } from '../../../services/elearning.service';

@Component({
  selector: 'app-eweb',
  templateUrl: './eweb.component.html',
  styleUrls: ['./eweb.component.css']
})
export class EwebComponent implements OnInit {
  tasks: any[] = [];
  loading = false;
  error: string | null = null;

  constructor(private elearningService: ElearningService) {}

  ngOnInit(): void {
    this.loadTasks();
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
}


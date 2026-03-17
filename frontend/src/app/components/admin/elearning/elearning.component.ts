import { Component, OnInit } from '@angular/core';
import { ClassService } from '../../../services/class.service';
import { ExamService } from '../../../services/exam.service';

@Component({
  selector: 'app-elearning',
  templateUrl: './elearning.component.html',
  styleUrls: ['./elearning.component.css']
})
export class ElearningComponent implements OnInit {
  classes: any[] = [];
  selectedClass: any | null = null;
  loadingClasses = false;
  loadingContent = false;
  error: string | null = null;

  // Exams / assignments / tests for selected class
  activities: any[] = [];

  constructor(
    private classService: ClassService,
    private examService: ExamService
  ) {}

  ngOnInit(): void {
    this.loadClasses();
  }

  loadClasses(): void {
    this.loadingClasses = true;
    this.error = null;

    this.classService.getClasses().subscribe({
      next: (classes: any[]) => {
        this.loadingClasses = false;
        this.classes = Array.isArray(classes)
          ? classes.filter(c => c && c.isActive !== false)
          : [];

        if (!this.selectedClass && this.classes.length > 0) {
          this.onSelectClass(this.classes[0]);
        }
      },
      error: () => {
        this.loadingClasses = false;
        this.error = 'Failed to load classes. Please try again.';
      }
    });
  }

  onSelectClass(cls: any): void {
    if (!cls || !cls.id) {
      return;
    }

    this.selectedClass = cls;
    this.loadClassActivities(cls.id);
  }

  private loadClassActivities(classId: string): void {
    this.loadingContent = true;
    this.error = null;
    this.activities = [];

    this.examService.getExams(classId).subscribe({
      next: (exams: any[]) => {
        this.loadingContent = false;
        const list = Array.isArray(exams) ? exams : [];

        // Treat assignments, quizzes and other continuous assessment items
        // as "E‑Learning" activities for this view.
        this.activities = list.filter(item => {
          const type = (item.examType || item.type || '').toString().toLowerCase();
          return type === 'assignment' || type === 'quiz' || type === 'test';
        });
      },
      error: () => {
        this.loadingContent = false;
        this.error = 'Failed to load e‑learning activities for this class.';
      }
    });
  }
}


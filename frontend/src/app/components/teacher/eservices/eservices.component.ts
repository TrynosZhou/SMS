import { Component, OnInit } from '@angular/core';
import { ClassService } from '../../../services/class.service';
import { StudentService } from '../../../services/student.service';
import { ElearningService } from '../../../services/elearning.service';

@Component({
  selector: 'app-eservices',
  templateUrl: './eservices.component.html',
  styleUrls: ['./eservices.component.css']
})
export class EservicesComponent implements OnInit {
  classes: any[] = [];
  students: any[] = [];

  selectedClassId = '';
  selectedStudentId = '';

  taskType: 'assignment' | 'test' | 'notes' | '' = '';
  title = '';
  description = '';
  dueDate = '';
  attachment: File | null = null;

  loadingClasses = false;
  loadingStudents = false;
  submitting = false;
  success: string | null = null;
  error: string | null = null;

  tasks: any[] = [];
  loadingTasks = false;

  constructor(
    private classService: ClassService,
    private studentService: StudentService,
    private elearningService: ElearningService
  ) {}

  ngOnInit(): void {
    this.loadClasses();
    this.loadMyTasks();
  }

  loadClasses(): void {
    this.loadingClasses = true;
    this.classService.getClasses().subscribe({
      next: classes => {
        this.loadingClasses = false;
        this.classes = Array.isArray(classes) ? classes : [];
      },
      error: () => {
        this.loadingClasses = false;
        this.error = 'Failed to load classes.';
      }
    });
  }

  onClassChange(): void {
    this.selectedStudentId = '';
    if (!this.selectedClassId) {
      this.students = [];
      return;
    }
    this.loadingStudents = true;
    this.studentService.getStudents(this.selectedClassId).subscribe({
      next: list => {
        this.loadingStudents = false;
        this.students = Array.isArray(list) ? list : [];
      },
      error: () => {
        this.loadingStudents = false;
        this.error = 'Failed to load students for selected class.';
      }
    });
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.attachment = input.files[0];
    } else {
      this.attachment = null;
    }
  }

  createTask(): void {
    this.success = null;
    this.error = null;

    if (!this.selectedClassId) {
      this.error = 'Please select a class.';
      return;
    }
    if (!this.taskType) {
      this.error = 'Please select a task type.';
      return;
    }
    if (!this.title.trim() && !this.description.trim() && !this.attachment) {
      this.error = 'Please enter a title/description or attach a file.';
      return;
    }

    const form = new FormData();
    form.append('classId', this.selectedClassId);
    if (this.selectedStudentId) {
      form.append('studentId', this.selectedStudentId);
    }
    form.append('type', this.taskType);
    if (this.title.trim()) {
      form.append('title', this.title.trim());
    }
    if (this.description.trim()) {
      form.append('description', this.description.trim());
    }
    if (this.dueDate) {
      form.append('dueDate', this.dueDate);
    }
    if (this.attachment) {
      form.append('file', this.attachment);
    }

    this.submitting = true;
    this.elearningService.createTask(form).subscribe({
      next: () => {
        this.submitting = false;
        this.success = 'Task created and sent successfully.';
        this.resetForm();
        this.loadMyTasks();
      },
      error: () => {
        this.submitting = false;
        this.error = 'Failed to create task. Please try again.';
      }
    });
  }

  loadMyTasks(): void {
    this.loadingTasks = true;
    this.elearningService.getMyTasks().subscribe({
      next: tasks => {
        this.loadingTasks = false;
        this.tasks = Array.isArray(tasks) ? tasks : [];
      },
      error: () => {
        this.loadingTasks = false;
        // keep silent error, main focus is creation
      }
    });
  }

  private resetForm(): void {
    this.taskType = '';
    this.title = '';
    this.description = '';
    this.dueDate = '';
    this.attachment = null;
    this.selectedStudentId = '';
  }
}


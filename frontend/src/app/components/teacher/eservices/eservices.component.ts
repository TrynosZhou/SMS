import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
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
  maxScore: number | null = null;
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  loadingClasses = false;
  loadingStudents = false;
  submitting = false;
  success: string | null = null;
  error: string | null = null;

  tasks: any[] = [];
  loadingTasks = false;
  deletingTaskId: string | null = null;

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

  removeAttachment(): void {
    this.attachment = null;
    const el = this.fileInputRef?.nativeElement;
    if (el) el.value = '';
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
    if (this.maxScore !== null && this.maxScore !== undefined && String(this.maxScore).trim() !== '') {
      form.append('maxScore', String(this.maxScore));
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

  deleteTask(task: any): void {
    const taskId = String(task?.id || '').trim();
    if (!taskId) return;
    const title = (task?.title || 'this task').toString();
    const ok = confirm(`Delete "${title}"?\n\nThis will remove the task and its student responses.`);
    if (!ok) return;

    this.error = null;
    this.success = null;
    this.deletingTaskId = taskId;
    this.elearningService.deleteTask(taskId).subscribe({
      next: () => {
        this.deletingTaskId = null;
        this.success = 'Task deleted successfully.';
        this.tasks = this.tasks.filter(t => String(t?.id) !== taskId);
      },
      error: (err: any) => {
        this.deletingTaskId = null;
        this.error = err?.error?.message || 'Failed to delete task.';
      }
    });
  }

  private resetForm(): void {
    this.taskType = '';
    this.title = '';
    this.description = '';
    this.dueDate = '';
    this.attachment = null;
    // Also clear native file input so the same file can be re-selected.
    const el = this.fileInputRef?.nativeElement;
    if (el) el.value = '';
    this.selectedStudentId = '';
    this.maxScore = null;
  }
}


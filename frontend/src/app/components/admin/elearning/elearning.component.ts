import { Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ClassService } from '../../../services/class.service';
import { ExamService } from '../../../services/exam.service';
import { ElearningService } from '../../../services/elearning.service';
import { ThemeService } from '../../../services/theme.service';

export interface ElearningActivityRow {
  id: string;
  source: 'exam' | 'task';
  kind: string;
  title: string;
  subjectName?: string;
  teacherName?: string;
  audience?: string;
  date: string | Date | null;
  dueDate?: string | Date | null;
  term?: string;
  fileUrl?: string | null;
  description?: string | null;
}

@Component({
  selector: 'app-elearning',
  templateUrl: './elearning.component.html',
  styleUrls: ['./elearning.component.css']
})
export class ElearningComponent implements OnInit {
  classes: any[] = [];
  filteredClasses: any[] = [];
  classSearch = '';
  selectedClass: any | null = null;
  loadingClasses = false;
  loadingContent = false;
  error: string | null = null;

  /** Merged exam + teacher portal activities */
  activities: ElearningActivityRow[] = [];
  activitySearch = '';
  typeFilter: 'all' | 'assignment' | 'quiz' | 'test' | 'notes' = 'all';
  sourceFilter: 'all' | 'exam' | 'task' = 'all';
  sortOrder: 'newest' | 'oldest' = 'newest';
  copyFeedback = '';

  constructor(
    private classService: ClassService,
    private examService: ExamService,
    private elearningService: ElearningService,
    public themeService: ThemeService
  ) {}

  ngOnInit(): void {
    this.loadClasses();
  }

  get examCount(): number {
    return this.activities.filter(a => a.source === 'exam').length;
  }

  get taskCount(): number {
    return this.activities.filter(a => a.source === 'task').length;
  }

  get filteredActivities(): ElearningActivityRow[] {
    let list = [...this.activities];
    const q = (this.activitySearch || '').trim().toLowerCase();
    if (q) {
      list = list.filter(
        a =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.subjectName || '').toLowerCase().includes(q) ||
          (a.teacherName || '').toLowerCase().includes(q) ||
          (a.description || '').toLowerCase().includes(q)
      );
    }
    if (this.typeFilter !== 'all') {
      list = list.filter(a => (a.kind || '').toLowerCase() === this.typeFilter);
    }
    if (this.sourceFilter !== 'all') {
      list = list.filter(a => a.source === this.sourceFilter);
    }
    const t = (d: string | Date | null | undefined) =>
      d ? new Date(d as string).getTime() : 0;
    list.sort((a, b) =>
      this.sortOrder === 'newest' ? t(b.date) - t(a.date) : t(a.date) - t(b.date)
    );
    return list;
  }

  onClassSearchChange(): void {
    const q = (this.classSearch || '').trim().toLowerCase();
    this.filteredClasses = !q
      ? [...this.classes]
      : this.classes.filter(c => {
          const name = (c.name || c.className || '').toLowerCase();
          const meta = `${c.form || ''} ${c.level || ''}`.toLowerCase();
          return name.includes(q) || meta.includes(q);
        });
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
        this.onClassSearchChange();
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
    if (!cls || !cls.id) return;
    this.selectedClass = cls;
    this.loadClassActivities(cls.id);
  }

  refresh(): void {
    if (this.selectedClass?.id) {
      this.loadClassActivities(this.selectedClass.id);
    } else {
      this.loadClasses();
    }
  }

  copySummary(): void {
    if (!this.selectedClass || !this.filteredActivities.length) return;
    const lines = [
      `E-Learning summary — ${this.selectedClass.name || this.selectedClass.className}`,
      `Generated ${new Date().toLocaleString()}`,
      '',
      ...this.filteredActivities.map((a, i) => {
        const src = a.source === 'exam' ? 'Exam' : 'Portal';
        return `${i + 1}. [${src}] ${a.kind} — ${a.title}${a.teacherName ? ` (${a.teacherName})` : ''}`;
      })
    ];
    const text = lines.join('\n');
    navigator.clipboard?.writeText(text).then(
      () => {
        this.copyFeedback = 'Copied to clipboard';
        setTimeout(() => (this.copyFeedback = ''), 2500);
      },
      () => {
        this.copyFeedback = 'Copy failed';
        setTimeout(() => (this.copyFeedback = ''), 2500);
      }
    );
  }

  kindIcon(kind: string): string {
    const k = (kind || '').toLowerCase();
    if (k === 'assignment') return '📝';
    if (k === 'quiz') return '❓';
    if (k === 'test') return '📋';
    if (k === 'notes') return '📎';
    return '📌';
  }

  kindClass(kind: string): string {
    const k = (kind || '').toLowerCase();
    if (k === 'assignment') return 'kind-assignment';
    if (k === 'quiz') return 'kind-quiz';
    if (k === 'test') return 'kind-test';
    if (k === 'notes') return 'kind-notes';
    return 'kind-default';
  }

  fileHref(url: string | null | undefined): string {
    if (!url) return '#';
    return url.startsWith('http') ? url : url;
  }

  private loadClassActivities(classId: string): void {
    this.loadingContent = true;
    this.error = null;
    this.activities = [];

    forkJoin({
      exams: this.examService.getExams(classId).pipe(catchError(() => of([]))),
      tasks: this.elearningService.getAdminClassTasks(classId).pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ exams, tasks }) => {
        this.loadingContent = false;
        const rows: ElearningActivityRow[] = [];

        const examList = Array.isArray(exams) ? exams : [];
        for (const item of examList) {
          const type = (item.examType || item.type || '').toString().toLowerCase();
          if (!['assignment', 'quiz', 'test'].includes(type)) continue;
          rows.push({
            id: `exam-${item.id}`,
            source: 'exam',
            kind: type,
            title: item.name || item.title || 'Untitled',
            subjectName: item.subject?.name || item.subjectName,
            date: item.date || item.createdAt || null,
            dueDate: item.dueDate,
            term: item.term
          });
        }

        const taskList = Array.isArray(tasks) ? tasks : [];
        for (const t of taskList) {
          const teacher = t.teacher;
          const teacherName = teacher
            ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()
            : '';
          const student = t.student;
          const audience = t.studentId && student
            ? `Student: ${student.firstName || ''} ${student.lastName || ''}`.trim()
            : 'Whole class';
          rows.push({
            id: `task-${t.id}`,
            source: 'task',
            kind: (t.type || 'assignment').toString().toLowerCase(),
            title: t.title || 'Untitled task',
            teacherName: teacherName || undefined,
            audience,
            date: t.createdAt,
            dueDate: t.dueDate,
            fileUrl: t.fileUrl || null,
            description: t.description || null
          });
        }

        rows.sort(
          (a, b) =>
            new Date(b.date as string).getTime() - new Date(a.date as string).getTime()
        );
        this.activities = rows;
      },
      error: () => {
        this.loadingContent = false;
        this.error = 'Failed to load e-learning data for this class.';
      }
    });
  }
}

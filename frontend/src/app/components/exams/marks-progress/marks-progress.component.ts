<<<<<<< HEAD
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
=======
import { Component, OnInit } from '@angular/core';
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
<<<<<<< HEAD
  standalone: false,  selector: 'app-marks-progress',
  templateUrl: './marks-progress.component.html',
  styleUrls: ['./marks-progress.component.css']
})
export class MarksProgressComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
=======
  selector: 'app-marks-progress',
  templateUrl: './marks-progress.component.html',
  styleUrls: ['./marks-progress.component.css']
})
export class MarksProgressComponent implements OnInit {
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  classes: any[] = [];
  progressData: any[] = [];
  viewData: any[] = []; // Cached view data to prevent flickering
  loading = false;
<<<<<<< HEAD
  loadingClasses = false;
  loadingTerm = false;
=======
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  error = '';
  selectedExamType = '';
  selectedTerm = '';
  selectedClassId = '';
  searchQuery = '';
  sortColumn: 'class' | 'avgProgress' | 'subjectsComplete' = 'avgProgress';
  sortDirection: 'asc' | 'desc' = 'desc';
  showIncompleteOnly = false;
  minProgress = 0;
  collapsed: { [classId: string]: boolean } = {};
  stats = {
    totalClasses: 0,
    totalSubjects: 0,
    subjectsComplete: 0,
    subjectsIncomplete: 0,
    averageProgress: 0
  };

  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End Term' }
  ];

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private settingsService: SettingsService,
<<<<<<< HEAD
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    activatePageLoad(this.router, this.destroy$, '/check_mark_progess', () => this.bootstrapPage());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapPage(): void {
    this.loadActiveTerm();
    this.loadClasses();
  }

  loadActiveTerm() {
    this.loadingTerm = true;
    this.cdr.markForCheck();
    this.settingsService
      .getActiveTerm()
      .pipe(
        finalize(() => {
          this.loadingTerm = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res: any) => {
          this.selectedTerm = res?.activeTerm || res?.currentTerm || '';
        },
        error: () => {}
      });
  }

  loadClasses() {
    this.loadingClasses = true;
    this.cdr.markForCheck();
    this.classService
      .getClassesPaginated(1, 200)
      .pipe(
        finalize(() => {
          this.loadingClasses = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res: any) => {
          this.classes = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        },
        error: (err: any) => {
          console.error('Error loading classes:', err);
          this.classes = [];
        }
      });
=======
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadDefaults();
    this.loadClasses();
  }

  loadDefaults() {
    this.settingsService.getActiveTerm().subscribe({
      next: (res: any) => {
        this.selectedTerm = res?.activeTerm || '';
      },
      error: () => {}
    });
  }

  loadClasses() {
    this.classService.getClassesPaginated(1, 200).subscribe({
      next: (res: any) => {
        this.classes = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      },
      error: (err: any) => console.error('Error loading classes:', err)
    });
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  }

  fetchProgress() {
    if (!this.selectedExamType) {
      this.progressData = [];
      this.viewData = [];
      this.computeStats();
      this.updateViewData();
      this.loading = false;
<<<<<<< HEAD
      this.cdr.markForCheck();
=======
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
      return;
    }
    this.loading = true;
    this.error = '';
<<<<<<< HEAD
    this.cdr.markForCheck();
    this.examService
      .getMarksProgress(this.selectedExamType, this.selectedTerm, this.selectedClassId)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          this.progressData = Array.isArray(data?.classes) ? data.classes : [];
          this.collapsed = {};
          this.progressData.forEach((c: any) => (this.collapsed[c.classId] = false));
          this.computeStats();
          this.updateViewData();
        },
        error: () => {
          this.error = 'Failed to load marks entry progress';
        }
      });
=======
    this.examService.getMarksProgress(this.selectedExamType, this.selectedTerm, this.selectedClassId).subscribe({
      next: (data: any) => {
        this.progressData = Array.isArray(data?.classes) ? data.classes : [];
        this.collapsed = {};
        this.progressData.forEach((c: any) => this.collapsed[c.classId] = false);
        this.computeStats();
        this.updateViewData();
        this.loading = false;
      },
      error: (err: any) => {
        this.error = 'Failed to load marks entry progress';
        this.loading = false;
      }
    });
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  }

  computeStats() {
    const allSubjects = this.progressData.flatMap((c: any) => c.subjects || []);
    const complete = allSubjects.filter((s: any) => s.progressPercent >= 100).length;
    const incomplete = allSubjects.length - complete;
    const avg = allSubjects.length
      ? Math.round(allSubjects.reduce((sum, s) => sum + (s.progressPercent || 0), 0) / allSubjects.length)
      : 0;
    this.stats = {
      totalClasses: this.progressData.length,
      totalSubjects: allSubjects.length,
      subjectsComplete: complete,
      subjectsIncomplete: incomplete,
      averageProgress: avg
    };
  }

  getAverageProgressForClass(cls: any): number {
    const subs = (cls.subjects || []);
    if (!subs.length) return 0;
    const avg = subs.reduce((sum: number, s: any) => sum + (s.progressPercent || 0), 0) / subs.length;
    return Math.round(avg);
  }

  getSubjectsCompleteCount(cls: any): number {
    return (cls.subjects || []).filter((s: any) => s.progressPercent >= 100).length;
  }

  updateViewData(): void {
    // Filter subjects by search/incomplete/minProgress
    const query = this.searchQuery.trim().toLowerCase();
    const filteredClasses = this.progressData
      .map((cls: any) => {
        let subjects = (cls.subjects || []);
        if (query) {
          subjects = subjects.filter((s: any) =>
            s.subjectName?.toLowerCase().includes(query) || cls.className?.toLowerCase().includes(query)
          );
        }
        if (this.showIncompleteOnly) {
          subjects = subjects.filter((s: any) => s.progressPercent < 100);
        }
        if (this.minProgress > 0) {
          subjects = subjects.filter((s: any) => s.progressPercent >= this.minProgress);
        }
        return {
          ...cls,
          subjects
        };
      })
      .filter((c: any) => c.subjects && c.subjects.length > 0);

    // Sort
    const sorted = filteredClasses.sort((a: any, b: any) => {
      let aKey = 0;
      let bKey = 0;
      if (this.sortColumn === 'class') {
        aKey = (a.className || '').localeCompare(b.className || '');
        bKey = 0; // not used
        return this.sortDirection === 'asc' ? aKey : -aKey;
      } else if (this.sortColumn === 'avgProgress') {
        aKey = this.getAverageProgressForClass(a);
        bKey = this.getAverageProgressForClass(b);
      } else if (this.sortColumn === 'subjectsComplete') {
        aKey = this.getSubjectsCompleteCount(a);
        bKey = this.getSubjectsCompleteCount(b);
      }
      return this.sortDirection === 'asc' ? aKey - bKey : bKey - aKey;
    });

    this.viewData = sorted;
  }

  // Keep for backward compatibility but now just returns cached data
  getViewData(): any[] {
    return this.viewData;
  }

  toggleCollapse(classId: string) {
    this.collapsed[classId] = !this.collapsed[classId];
  }

  expandAll() {
    Object.keys(this.collapsed).forEach(k => this.collapsed[k] = false);
  }

  collapseAll() {
    Object.keys(this.collapsed).forEach(k => this.collapsed[k] = true);
  }

  refresh() {
    this.fetchProgress();
  }

  exportToCsv() {
    const rows: string[] = [];
    rows.push(['Class', 'Subject', 'Progress (%)', 'Entered', 'Expected', 'Term', 'Exam Type'].join(','));
    this.viewData.forEach((cls: any) => {
      (cls.subjects || []).forEach((s: any) => {
        const vals = [
          cls.className || '',
          s.subjectName || '',
          String(s.progressPercent ?? 0),
          String(s.enteredCount ?? 0),
          String(s.expectedCount ?? 0),
          String(s.term ?? ''),
          String(s.examType ?? '')
        ];
        rows.push(vals.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      });
    });
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marks-entry-progress.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getProgressColor(percent: number): string {
    if (percent >= 80) return '#10b981'; // green
    if (percent >= 50) return '#f59e0b'; // amber
    return '#ef4444'; // red
  }

  getClassInitial(className: string): string {
    if (!className) return '?';
    const parts = className.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return className.substring(0, 2).toUpperCase();
  }

  resetFilters() {
    this.selectedExamType = '';
    this.selectedClassId = '';
    this.searchQuery = '';
    this.sortColumn = 'avgProgress';
    this.sortDirection = 'desc';
    this.showIncompleteOnly = false;
    this.minProgress = 0;
    this.fetchProgress();
  }

  trackByClassId(index: number, cls: any): string {
    return cls.classId;
  }

  trackBySubjectId(index: number, subject: any): string {
    return subject.subjectId || subject.subjectName;
  }
}

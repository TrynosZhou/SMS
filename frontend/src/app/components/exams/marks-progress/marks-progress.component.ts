import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-marks-progress',
  templateUrl: './marks-progress.component.html',
  styleUrls: ['./marks-progress.component.css']
})
export class MarksProgressComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  classes: any[] = [];
  progressData: any[] = [];
  viewData: any[] = [];
  loading = false;
  loadingClasses = false;
  loadingTerm = false;
  error = '';
  success = '';
  lastLoadedAt: Date | null = null;

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
    public authService: AuthService,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.searchQuery = q;
        this.updateViewData();
        this.cdr.markForCheck();
      });

    activatePageLoad(this.router, this.destroy$, '/check_mark_progess', () => this.bootstrapPage());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasData(): boolean {
    return this.progressData.length > 0 || (!this.loading && this.lastLoadedAt !== null);
  }

  get filterSummary(): string {
    const parts: string[] = [];
    if (this.selectedExamType) {
      const label = this.examTypes.find((t) => t.value === this.selectedExamType)?.label || this.selectedExamType;
      parts.push(`Exam: ${label}`);
    }
    if (this.selectedTerm) parts.push(`Term: ${this.selectedTerm}`);
    if (this.selectedClassId) {
      const cls = this.classes.find((c) => c.id === this.selectedClassId);
      parts.push(`Class: ${cls?.name || 'Selected'}`);
    }
    if (this.showIncompleteOnly) parts.push('Incomplete only');
    if (this.minProgress > 0) parts.push(`Min ${this.minProgress}%`);
    if (this.searchQuery) parts.push(`Search: "${this.searchQuery}"`);
    parts.push(`${this.viewData.length} class(es) shown`);
    return parts.join(' · ');
  }

  get completionRate(): number {
    if (!this.stats.totalSubjects) return 0;
    return Math.round((this.stats.subjectsComplete / this.stats.totalSubjects) * 100);
  }

  private bootstrapPage(): void {
    this.loadActiveTerm();
    this.loadClasses();
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  onSearchInput(value: string): void {
    this.searchInput$.next((value || '').trim());
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchInput$.next('');
    this.updateViewData();
  }

  selectExamType(value: string): void {
    this.selectedExamType = value;
    this.fetchProgress();
  }

  hasActiveFilters(): boolean {
    return (
      !!this.searchQuery ||
      this.showIncompleteOnly ||
      this.minProgress > 0 ||
      !!this.selectedClassId ||
      this.sortColumn !== 'avgProgress' ||
      this.sortDirection !== 'desc'
    );
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.searchInput$.next('');
    this.selectedClassId = '';
    this.sortColumn = 'avgProgress';
    this.sortDirection = 'desc';
    this.showIncompleteOnly = false;
    this.minProgress = 0;
    this.updateViewData();
    if (this.selectedExamType) {
      this.fetchProgress();
    }
  }

  loadActiveTerm(): void {
    this.loadingTerm = true;
    this.cdr.markForCheck();
    this.settingsService
      .getActiveTerm()
      .pipe(
        takeUntil(this.destroy$),
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

  loadClasses(): void {
    this.loadingClasses = true;
    this.cdr.markForCheck();
    this.classService
      .getClassesPaginated(1, 200)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingClasses = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res: any) => {
          const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          this.classes = data.map((c: any) => ({
            ...c,
            id: this.classService.cleanClassId(c.id) || c.id
          }));
        },
        error: (err: any) => {
          console.error('Error loading classes:', err);
          this.classes = [];
        }
      });
  }

  fetchProgress(): void {
    if (!this.selectedExamType) {
      this.progressData = [];
      this.viewData = [];
      this.computeStats();
      this.updateViewData();
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    const classId = this.selectedClassId
      ? this.classService.cleanClassId(this.selectedClassId)
      : '';

    this.examService
      .getMarksProgress(this.selectedExamType, this.selectedTerm, classId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data: any) => {
          this.progressData = Array.isArray(data?.classes) ? data.classes : [];
          this.collapsed = {};
          this.progressData.forEach((c: any) => (this.collapsed[c.classId] = false));
          this.lastLoadedAt = new Date();
          this.computeStats();
          this.updateViewData();
        },
        error: () => {
          this.error = 'Failed to load marks entry progress. Check filters and try again.';
          this.progressData = [];
          this.viewData = [];
          this.computeStats();
        }
      });
  }

  computeStats(): void {
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
    const subs = cls.subjects || [];
    if (!subs.length) return 0;
    return Math.round(subs.reduce((sum: number, s: any) => sum + (s.progressPercent || 0), 0) / subs.length);
  }

  getSubjectsCompleteCount(cls: any): number {
    return (cls.subjects || []).filter((s: any) => s.progressPercent >= 100).length;
  }

  updateViewData(): void {
    const query = this.searchQuery.trim().toLowerCase();
    const filteredClasses = this.progressData
      .map((cls: any) => {
        let subjects = cls.subjects || [];
        if (query) {
          subjects = subjects.filter(
            (s: any) =>
              s.subjectName?.toLowerCase().includes(query) ||
              cls.className?.toLowerCase().includes(query)
          );
        }
        if (this.showIncompleteOnly) {
          subjects = subjects.filter((s: any) => s.progressPercent < 100);
        }
        if (this.minProgress > 0) {
          subjects = subjects.filter((s: any) => s.progressPercent >= this.minProgress);
        }
        return { ...cls, subjects };
      })
      .filter((c: any) => c.subjects && c.subjects.length > 0);

    const dir = this.sortDirection === 'asc' ? 1 : -1;
    const sorted = [...filteredClasses].sort((a: any, b: any) => {
      if (this.sortColumn === 'class') {
        return dir * (a.className || '').localeCompare(b.className || '', undefined, { sensitivity: 'base' });
      }
      if (this.sortColumn === 'subjectsComplete') {
        return dir * (this.getSubjectsCompleteCount(a) - this.getSubjectsCompleteCount(b));
      }
      return dir * (this.getAverageProgressForClass(a) - this.getAverageProgressForClass(b));
    });

    this.viewData = sorted;
  }

  getViewData(): any[] {
    return this.viewData;
  }

  toggleCollapse(classId: string): void {
    this.collapsed[classId] = !this.collapsed[classId];
  }

  expandAll(): void {
    Object.keys(this.collapsed).forEach((k) => (this.collapsed[k] = false));
  }

  collapseAll(): void {
    Object.keys(this.collapsed).forEach((k) => (this.collapsed[k] = true));
  }

  refresh(): void {
    this.fetchProgress();
  }

  exportToCsv(): void {
    if (!this.viewData.length) {
      this.success = 'Nothing to export';
      setTimeout(() => {
        if (this.success === 'Nothing to export') this.success = '';
        this.cdr.markForCheck();
      }, 3000);
      return;
    }
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
        rows.push(vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
      });
    });
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marks-entry-progress_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.success = `Exported ${this.viewData.length} class(es) to CSV`;
    this.cdr.markForCheck();
  }

  printReport(): void {
    if (!this.viewData.length) return;
    const examLabel = this.examTypes.find((t) => t.value === this.selectedExamType)?.label || '';
    const rows = this.viewData
      .flatMap((cls: any) =>
        (cls.subjects || []).map(
          (s: any) => `
      <tr>
        <td>${this.escapeHtml(cls.className || '')}</td>
        <td>${this.escapeHtml(s.subjectName || '')}</td>
        <td>${s.progressPercent ?? 0}%</td>
        <td>${s.enteredCount ?? 0}/${s.expectedCount ?? 0}</td>
        <td>${s.progressPercent >= 100 ? 'Complete' : s.progressPercent > 0 ? 'In progress' : 'Not started'}</td>
      </tr>`
        )
      )
      .join('');
    const html = `<!DOCTYPE html><html><head><title>Marks Entry Progress</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px}h1{font-size:1.2rem}
      p.meta{color:#64748b;font-size:.85rem}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:.85rem}
      th,td{border:1px solid #e2e8f0;padding:8px;text-align:left}th{background:#f8fafc}</style></head><body>
      <h1>Marks Entry Progress</h1>
      <p class="meta">${this.escapeHtml(examLabel)} · ${this.escapeHtml(this.selectedTerm || '')} · ${this.stats.averageProgress}% avg · Printed ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>Class</th><th>Subject</th><th>Progress</th><th>Entered</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  private escapeHtml(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  getClassInitial(className: string): string {
    if (!className) return '?';
    const parts = className.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return className.substring(0, 2).toUpperCase();
  }

  trackByClassId(_index: number, cls: any): string {
    return cls.classId || _index;
  }

  trackBySubjectId(_index: number, subject: any): string {
    return subject.subjectId || subject.subjectName || String(_index);
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { ExamService } from '../../../services/exam.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

export interface PublishClassRow {
  classId: string;
  className: string;
  status: 'published' | 'draft';
  examId: string;
}

@Component({
  standalone: false,
  selector: 'app-publish-results',
  templateUrl: './publish-results.component.html',
  styleUrls: ['./publish-results.component.css']
})
export class PublishResultsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  publishExamType = '';
  publishTerm = '';
  publishing = false;
  unpublishing = false;
  loadingTerm = false;
  loadingPreview = false;

  error = '';
  success = '';
  lastLoadedAt: Date | null = null;
  lastActionAt: Date | null = null;

  searchQuery = '';
  viewRows: PublishClassRow[] = [];
  confirmAction: 'publish' | 'unpublish' | null = null;

  stats = {
    totalExams: 0,
    published: 0,
    draft: 0,
    classes: 0
  };

  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];

  isAdmin = false;
  isSuperAdmin = false;

  private allExams: any[] = [];

  constructor(
    private examService: ExamService,
    private settingsService: SettingsService,
    private authService: AuthService,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? user.role === 'admin' : false;
    this.isSuperAdmin = user ? user.role === 'superadmin' : false;
  }

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.searchQuery = q;
        this.updateViewRows();
        this.cdr.markForCheck();
      });

    activatePageLoad(this.router, this.destroy$, '/publish-results', () => this.loadActiveTerm());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get canManage(): boolean {
    return this.isAdmin || this.isSuperAdmin;
  }

  get hasSelection(): boolean {
    return !!this.publishExamType && !!this.publishTerm?.trim();
  }

  get publishRate(): number {
    if (!this.stats.totalExams) return 0;
    return Math.round((this.stats.published / this.stats.totalExams) * 100);
  }

  get filterSummary(): string {
    if (!this.hasSelection) return '';
    const label = this.examTypes.find((t) => t.value === this.publishExamType)?.label || this.publishExamType;
    const parts = [`${label}`, this.publishTerm.trim()];
    if (this.searchQuery) parts.push(`Search: "${this.searchQuery}"`);
    parts.push(`${this.viewRows.length} class(es) shown`);
    return parts.join(' · ');
  }

  get selectedExamLabel(): string {
    return this.examTypes.find((t) => t.value === this.publishExamType)?.label || '';
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  selectExamType(value: string): void {
    this.publishExamType = value;
    this.confirmAction = null;
    this.loadPreview();
  }

  onSearchInput(value: string): void {
    this.searchInput$.next((value || '').trim());
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchInput$.next('');
    this.updateViewRows();
  }

  onTermChange(): void {
    this.confirmAction = null;
    if (this.hasSelection) this.loadPreview();
    else {
      this.allExams = [];
      this.viewRows = [];
      this.computeStats([]);
    }
  }

  refresh(): void {
    this.loadActiveTerm(true);
    if (this.hasSelection) this.loadPreview();
  }

  loadActiveTerm(refreshPreviewAfter = false): void {
    this.loadingTerm = true;
    this.cdr.markForCheck();
    this.settingsService
      .getActiveTerm()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingTerm = false;
          this.cdr.markForCheck();
          if (refreshPreviewAfter && this.hasSelection) this.loadPreview();
        })
      )
      .subscribe({
        next: (data: any) => {
          this.publishTerm = data?.activeTerm || data?.currentTerm || '';
        },
        error: () => {}
      });
  }

  loadPreview(): void {
    if (!this.hasSelection) {
      this.allExams = [];
      this.viewRows = [];
      this.computeStats([]);
      return;
    }

    this.loadingPreview = true;
    this.error = '';
    this.cdr.markForCheck();

    this.examService
      .getExams()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingPreview = false;
          this.lastLoadedAt = new Date();
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (exams: any) => {
          const list = Array.isArray(exams) ? exams : [];
          const term = this.publishTerm.trim();
          this.allExams = list.filter(
            (e: any) =>
              e.type === this.publishExamType &&
              (e.term || '').trim() === term
          );
          this.computeStats(this.allExams);
          this.updateViewRows();
        },
        error: () => {
          this.error = 'Failed to load exam status preview.';
          this.allExams = [];
          this.viewRows = [];
          this.computeStats([]);
        }
      });
  }

  private computeStats(exams: any[]): void {
    const published = exams.filter((e) => e.status === 'published').length;
    const classIds = new Set(exams.map((e) => e.classId).filter(Boolean));
    this.stats = {
      totalExams: exams.length,
      published,
      draft: exams.length - published,
      classes: classIds.size
    };
  }

  private updateViewRows(): void {
    const q = this.searchQuery.trim().toLowerCase();
    const rows: PublishClassRow[] = this.allExams.map((e: any) => ({
      classId: e.classId,
      className: e.classEntity?.name || e.className || 'Unknown class',
      status: e.status === 'published' ? 'published' : 'draft',
      examId: e.id
    }));

    rows.sort((a, b) => a.className.localeCompare(b.className, undefined, { sensitivity: 'base' }));

    this.viewRows = q
      ? rows.filter((r) => r.className.toLowerCase().includes(q))
      : rows;
  }

  openConfirm(action: 'publish' | 'unpublish'): void {
    if (!this.canManage) {
      this.error = 'You do not have permission to publish or unpublish results.';
      return;
    }
    if (!this.publishExamType) {
      this.error = 'Please select an exam type.';
      return;
    }
    if (!this.publishTerm?.trim()) {
      this.error = 'Term is required. Set the active term in Academic Settings.';
      return;
    }
    if (this.stats.totalExams === 0 && !this.loadingPreview) {
      this.error = `No exams found for ${this.selectedExamLabel} in ${this.publishTerm.trim()}.`;
      return;
    }
    this.confirmAction = action;
    this.error = '';
    this.cdr.markForCheck();
  }

  cancelConfirm(): void {
    this.confirmAction = null;
  }

  confirmAndExecute(): void {
    if (this.confirmAction === 'publish') this.publishResults();
    else if (this.confirmAction === 'unpublish') this.unpublishResults();
  }

  publishResults(): void {
    if (!this.hasSelection || this.publishing) return;

    this.publishing = true;
    this.error = '';
    this.success = '';
    this.cdr.markForCheck();

    this.examService
      .publishExamByType(this.publishExamType, this.publishTerm.trim())
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.publishing = false;
          this.confirmAction = null;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (response: any) => {
          const count = response?.publishedCount ?? 0;
          this.success = `Published ${count} exam(s). Results are now visible to students, parents, and teachers.`;
          this.lastActionAt = new Date();
          this.loadPreview();
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to publish results. Please try again.';
        }
      });
  }

  unpublishResults(): void {
    if (!this.hasSelection || this.unpublishing) return;

    this.unpublishing = true;
    this.error = '';
    this.success = '';
    this.cdr.markForCheck();

    this.examService
      .unpublishExamByType(this.publishExamType, this.publishTerm.trim())
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.unpublishing = false;
          this.confirmAction = null;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (response: any) => {
          const count = response?.unpublishedCount ?? 0;
          this.success = `Unpublished ${count} exam(s). Marks and comments can be edited again.`;
          this.lastActionAt = new Date();
          this.loadPreview();
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to unpublish results. Please try again.';
        }
      });
  }

  trackByClassId(_index: number, row: PublishClassRow): string {
    return row.classId || row.examId || String(_index);
  }
}

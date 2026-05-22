import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { SubjectService } from '../../../services/subject.service';
import { TimetableService } from '../../../services/timetable.service';
import { ClassService } from '../../../services/class.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-teaching-load',
  templateUrl: './teaching-load.component.html',
  styleUrls: ['./teaching-load.component.css']
})
export class TeachingLoadComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  private loadSeq = 0;

  subjects: any[] = [];
  teachingLoads: any[] = [];
  filteredTeachingLoads: any[] = [];
  loading = false;
  saving = false;
  error = '';
  success = '';
  searchQuery = '';
  isAdmin = false;
  isSuperAdmin = false;
  hasUnsavedChanges = false;
  lastLoadedAt: Date | null = null;

  readonly skeletonRows = [0, 1, 2, 3, 4, 5, 6, 7];

  constructor(
    private subjectService: SubjectService,
    private timetableService: TimetableService,
    private classService: ClassService,
    private authService: AuthService,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user?.role === 'admin';
    this.isSuperAdmin = user?.role === 'superadmin';
  }

  get canEdit(): boolean {
    return this.isAdmin || this.isSuperAdmin;
  }

  get heroStats(): {
    subjects: number;
    totalPeriods: number;
    withClasses: number;
    pending: number;
  } {
    const totalPeriods = this.teachingLoads.reduce((sum, item) => sum + (item.periods || 0), 0);
    const withClasses = this.teachingLoads.filter(item => item.classes?.length).length;
    const pending = this.teachingLoads.filter(item => this.itemHasChanges(item)).length;
    return {
      subjects: this.teachingLoads.length,
      totalPeriods,
      withClasses,
      pending
    };
  }

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.searchQuery = q;
        this.applyFilters();
        this.cdr.markForCheck();
      });

    this.bootstrapPage();
    activatePageLoad(this.router, this.destroy$, '/subjects/teaching-load', () => this.bootstrapPage());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapPage(): void {
    this.loadTeachingLoads();
  }

  private normalizeList(data: unknown): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && data !== null && Array.isArray((data as { data?: unknown }).data)) {
      return (data as { data: any[] }).data;
    }
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj['subjects'])) return obj['subjects'] as any[];
      if (Array.isArray(obj['timetables'])) return obj['timetables'] as any[];
      if (Array.isArray(obj['classes'])) return obj['classes'] as any[];
    }
    return [];
  }

  loadTeachingLoads(): void {
    const seq = ++this.loadSeq;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    forkJoin({
      subjects: this.subjectService.getSubjects().pipe(catchError(() => of([]))),
      timetables: this.timetableService.getTimetables().pipe(catchError(() => of([]))),
      classes: this.classService.getClasses().pipe(catchError(() => of([])))
    })
      .pipe(
        switchMap(({ subjects, timetables, classes }) => {
          const subjectsArr = this.normalizeList(subjects).filter((s: any) => s.isActive !== false);
          const timetablesArr = this.normalizeList(timetables);
          const classesArr = this.normalizeList(classes);

          if (!timetablesArr.length) {
            return of({ subjectsArr, classesArr, entries: [] as any[] });
          }

          const entryRequests = timetablesArr.map((t: any) =>
            this.timetableService.getTimetableById(t.id).pipe(
              map((data: any) => (Array.isArray(data?.entries) ? data.entries : [])),
              catchError(() => of([]))
            )
          );

          return forkJoin(entryRequests).pipe(
            map((entryGroups) => ({
              subjectsArr,
              classesArr,
              entries: entryGroups.flat()
            }))
          );
        }),
        takeUntil(this.destroy$),
        finalize(() => {
          if (seq !== this.loadSeq) return;
          this.loading = false;
          this.lastLoadedAt = new Date();
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ subjectsArr, classesArr, entries }) => {
          if (seq !== this.loadSeq) return;
          this.subjects = subjectsArr;
          this.buildTeachingLoads(subjectsArr, classesArr, entries);
          this.hasUnsavedChanges = false;
        },
        error: () => {
          if (seq !== this.loadSeq) return;
          this.error = 'Failed to load teaching loads. Check your connection and try again.';
        }
      });
  }

  private buildTeachingLoads(subjectsArr: any[], classesArr: any[], entries: any[]): void {
    const classMap = new Map<string, any>();
    classesArr.forEach((c: any) => classMap.set(c.id, c));

    const subjectPeriodCount: Record<
      string,
      { subject: any; periods: number; classes: Set<string> }
    > = {};

    subjectsArr.forEach((subject: any) => {
      const savedPeriods =
        subject.teachingPeriods !== null && subject.teachingPeriods !== undefined
          ? subject.teachingPeriods
          : null;

      subjectPeriodCount[subject.id] = {
        subject,
        periods: savedPeriods !== null ? savedPeriods : 0,
        classes: new Set<string>()
      };
    });

    entries.forEach((entry: any) => {
      if (!entry.subjectId || !subjectPeriodCount[entry.subjectId]) return;
      const bucket = subjectPeriodCount[entry.subjectId];
      if (
        bucket.subject.teachingPeriods === null ||
        bucket.subject.teachingPeriods === undefined
      ) {
        bucket.periods++;
      }
      if (entry.classId) {
        bucket.classes.add(entry.classId);
      }
    });

    this.teachingLoads = Object.values(subjectPeriodCount)
      .map((item) => {
        const classNames = Array.from(item.classes)
          .map((classId) => classMap.get(classId)?.name || '')
          .filter(Boolean)
          .sort();

        return {
          subject: item.subject,
          periods: item.periods,
          originalPeriods: item.periods,
          storedPeriods: item.subject.teachingPeriods,
          classes: classNames,
          displayText: `${item.subject.name} ${item.periods}`,
          isEditable: this.canEdit
        };
      })
      .sort((a, b) => a.subject.name.localeCompare(b.subject.name));

    this.applyFilters();
  }

  applyFilters(): void {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.filteredTeachingLoads = [...this.teachingLoads];
      return;
    }

    this.filteredTeachingLoads = this.teachingLoads.filter(
      (item: any) =>
        item.subject.name.toLowerCase().includes(q) ||
        item.subject.code?.toLowerCase().includes(q) ||
        item.displayText.toLowerCase().includes(q)
    );
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyFilters();
    this.cdr.markForCheck();
  }

  clearAlert(type: 'success' | 'error'): void {
    if (type === 'success') this.success = '';
    if (type === 'error') this.error = '';
    this.cdr.markForCheck();
  }

  itemHasChanges(item: any): boolean {
    const stored =
      item.storedPeriods !== null && item.storedPeriods !== undefined
        ? item.storedPeriods
        : null;
    if (stored === null) {
      return item.periods !== item.originalPeriods;
    }
    return item.periods !== stored;
  }

  increasePeriods(item: any): void {
    if (!item.isEditable) return;
    item.periods = (item.periods || 0) + 1;
    item.displayText = `${item.subject.name} ${item.periods}`;
    this.hasUnsavedChanges = this.teachingLoads.some((tl) => this.itemHasChanges(tl));
    this.cdr.markForCheck();
  }

  decreasePeriods(item: any): void {
    if (!item.isEditable || item.periods <= 0) return;
    item.periods -= 1;
    item.displayText = `${item.subject.name} ${item.periods}`;
    this.hasUnsavedChanges = this.teachingLoads.some((tl) => this.itemHasChanges(tl));
    this.cdr.markForCheck();
  }

  saveTeachingLoads(): void {
    if (!this.hasUnsavedChanges) {
      this.error = 'No changes to save';
      this.cdr.markForCheck();
      return;
    }

    const updates = this.teachingLoads
      .filter((item) => this.itemHasChanges(item))
      .map((item) => ({
        id: item.subject.id,
        teachingPeriods: item.periods
      }));

    if (!updates.length) {
      this.error = 'No changes to save';
      this.cdr.markForCheck();
      return;
    }

    this.saving = true;
    this.error = '';
    this.success = '';
    this.cdr.markForCheck();

    forkJoin(
      updates.map((update) =>
        this.subjectService.updateSubject(update.id, { teachingPeriods: update.teachingPeriods }).pipe(
          catchError(() => of(null))
        )
      )
    )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe((results) => {
        const failed = results.filter((r) => r === null).length;
        const saved = updates.length - failed;

        if (saved === 0) {
          this.error = 'Failed to save teaching loads';
          return;
        }

        updates.forEach((update) => {
          const item = this.teachingLoads.find((tl) => tl.subject.id === update.id);
          if (!item) return;
          item.subject.teachingPeriods = update.teachingPeriods;
          item.storedPeriods = update.teachingPeriods;
          item.originalPeriods = update.teachingPeriods;
          item.periods = update.teachingPeriods;
          item.displayText = `${item.subject.name} ${update.teachingPeriods}`;
        });

        this.applyFilters();
        this.hasUnsavedChanges = false;

        if (failed > 0) {
          this.error = `Saved ${saved} subject(s); ${failed} failed`;
        } else {
          this.success = `Teaching loads saved for ${saved} subject(s)`;
        }
      });
  }

  formatLoadedAt(): string {
    if (!this.lastLoadedAt) return '';
    return this.lastLoadedAt.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }
}

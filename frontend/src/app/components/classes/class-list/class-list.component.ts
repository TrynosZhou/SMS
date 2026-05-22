import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { ClassService } from '../../../services/class.service';

type ClassViewMode = 'table' | 'cards';
type StatusFilter = 'all' | 'active' | 'inactive';

@Component({
  standalone: false,
  selector: 'app-class-list',
  templateUrl: './class-list.component.html',
  styleUrls: ['./class-list.component.css']
})
export class ClassListComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  classes: any[] = [];
  filteredClasses: any[] = [];
  loading = false;
  error = '';
  success = '';
  lastLoadedAt: Date | null = null;

  searchTerm = '';
  statusFilter: StatusFilter = 'all';
  sortBy = 'name';
  sortColumn = 'name';
  sortDirection: 'asc' | 'desc' = 'asc';
  viewMode: ClassViewMode = 'table';

  pagination = {
    page: 1,
    limit: 1000,
    total: 0,
    totalPages: 1
  };
  pageSizeOptions = [10, 20, 50, 100, 500, 1000];

  constructor(
    private classService: ClassService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.searchTerm = q;
        this.filterClasses();
        this.cdr.markForCheck();
      });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (params['success']) {
        this.success = params['success'];
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true
        });
        setTimeout(() => {
          if (this.success === params['success']) this.success = '';
          this.cdr.markForCheck();
        }, 5000);
      }
    });

    activatePageLoad(this.router, this.destroy$, '/classes', () => {
      this.loadClasses(this.pagination.page);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasData(): boolean {
    return this.classes.length > 0 || (!this.loading && this.lastLoadedAt !== null);
  }

  get dashboardStats(): {
    total: number;
    showing: number;
    active: number;
    inactive: number;
    totalStudents: number;
    totalTeachers: number;
    totalSubjects: number;
  } {
    const active = this.classes.filter((c) => c.isActive).length;
    return {
      total: this.classes.length,
      showing: this.filteredClasses.length,
      active,
      inactive: this.classes.length - active,
      totalStudents: this.classes.reduce((s, c) => s + (c.students?.length || 0), 0),
      totalTeachers: this.classes.reduce((s, c) => s + (c.teachers?.length || 0), 0),
      totalSubjects: this.classes.reduce((s, c) => s + this.getSubjectCount(c), 0)
    };
  }

  getSubjectCount(classItem: any): number {
    if (!classItem) return 0;
    if (Array.isArray(classItem.subjects)) {
      return classItem.subjects.length;
    }
    const n = Number(classItem.subjectCount);
    return Number.isFinite(n) ? n : 0;
  }

  get statusChips(): Array<{ id: StatusFilter; label: string; count: number }> {
    const active = this.classes.filter((c) => c.isActive).length;
    return [
      { id: 'all', label: 'All', count: this.classes.length },
      { id: 'active', label: 'Active', count: active },
      { id: 'inactive', label: 'Inactive', count: this.classes.length - active }
    ];
  }

  get filterSummary(): string {
    const parts: string[] = [];
    if (this.statusFilter !== 'all') parts.push(`Status: ${this.statusFilter}`);
    if (this.searchTerm) parts.push(`Search: "${this.searchTerm}"`);
    parts.push(`${this.filteredClasses.length} of ${this.classes.length} classes`);
    return parts.join(' · ');
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  onSearchInput(value: string): void {
    this.searchInput$.next((value || '').trim());
  }

  onStatusChange(value: StatusFilter): void {
    this.statusFilter = value;
    this.filterClasses();
    this.cdr.markForCheck();
  }

  hasActiveFilters(): boolean {
    return !!this.searchTerm || this.statusFilter !== 'all';
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'table' ? 'cards' : 'table';
  }

  sortIndicator(column: string): string {
    if (this.sortColumn !== column) return '';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  trackByClass(_index: number, item: any): string {
    return String(item?.id || item?.name || _index);
  }

  loadClasses(page = this.pagination.page): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    this.classService
      .getClassesPaginated(page, this.pagination.limit)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          const data = response?.data || response || [];
          const cleanedData = (Array.isArray(data) ? data : []).map((classItem: any) => {
            if (classItem.id) {
              let cleanId = String(classItem.id).trim();
              if (cleanId.includes(':')) {
                cleanId = cleanId.split(':')[0].trim();
              }
              classItem.id = cleanId;
            }
            classItem.students = Array.isArray(classItem.students) ? classItem.students : [];
            classItem.teachers = Array.isArray(classItem.teachers) ? classItem.teachers : [];
            classItem.subjects = Array.isArray(classItem.subjects) ? classItem.subjects : [];
            return classItem;
          });

          const uniqueClassesMap = new Map<string, any>();
          cleanedData.forEach((classItem: any) => {
            const id = classItem.id || '';
            if (id) {
              if (!uniqueClassesMap.has(id)) {
                uniqueClassesMap.set(id, classItem);
              }
            } else {
              const name = classItem.name || '';
              const existingByName = Array.from(uniqueClassesMap.values()).find(
                (c: any) => !c.id && c.name === name
              );
              if (!existingByName) {
                uniqueClassesMap.set(`no-id-${uniqueClassesMap.size}`, classItem);
              }
            }
          });

          this.classes = Array.from(uniqueClassesMap.values());

          if (response?.page !== undefined) {
            this.pagination = {
              page: response.page,
              limit: response.limit,
              total: this.classes.length,
              totalPages: response.totalPages
            };
          } else {
            this.pagination.total = this.classes.length;
            this.pagination.totalPages = Math.max(1, Math.ceil(this.pagination.total / this.pagination.limit));
            this.pagination.page = page;
          }

          this.lastLoadedAt = new Date();
          this.filterClasses();
        },
        error: (err: any) => {
          let errorMessage = 'Failed to load classes';
          if (err.status === 0 || err.status === undefined) {
            errorMessage = 'Cannot connect to server. Please ensure the backend server is running.';
          } else if (err.error?.message) {
            errorMessage = err.error.message;
          } else if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.message) {
            errorMessage = err.message;
          }
          this.error = errorMessage;
          this.classes = [];
          this.filteredClasses = [];
        }
      });
  }

  filterClasses(): void {
    const q = this.searchTerm.toLowerCase();
    this.filteredClasses = this.classes.filter((classItem) => {
      const matchesSearch =
        !q ||
        classItem.name?.toLowerCase().includes(q) ||
        classItem.form?.toLowerCase().includes(q) ||
        classItem.description?.toLowerCase().includes(q);
      const matchesStatus =
        this.statusFilter === 'all' ||
        (this.statusFilter === 'active' && classItem.isActive) ||
        (this.statusFilter === 'inactive' && !classItem.isActive);
      return matchesSearch && matchesStatus;
    });
    this.sortClasses();
  }

  sortClasses(): void {
    if (!this.sortBy) return;
    this.sortColumn = this.sortBy;
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    this.filteredClasses.sort((a, b) => {
      let aValue: string | number = '';
      let bValue: string | number = '';
      switch (this.sortBy) {
        case 'form':
          aValue = (a.form || '').toLowerCase();
          bValue = (b.form || '').toLowerCase();
          break;
        case 'students':
          aValue = a.students?.length || 0;
          bValue = b.students?.length || 0;
          break;
        case 'teachers':
          aValue = a.teachers?.length || 0;
          bValue = b.teachers?.length || 0;
          break;
        case 'subjects':
          aValue = this.getSubjectCount(a);
          bValue = this.getSubjectCount(b);
          break;
        case 'name':
        default:
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
      }
      if (aValue < bValue) return -dir;
      if (aValue > bValue) return dir;
      return 0;
    });
  }

  sortByColumn(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection =
        column === 'students' || column === 'teachers' || column === 'subjects' ? 'desc' : 'asc';
    }
    this.sortBy = column;
    this.sortClasses();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.searchInput$.next('');
    this.filterClasses();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.searchInput$.next('');
    this.statusFilter = 'all';
    this.filterClasses();
  }

  getCleanId(id: any): string {
    if (!id) return '';
    let cleanId = String(id).trim();
    if (cleanId.includes(':')) {
      cleanId = cleanId.split(':')[0].trim();
    }
    return cleanId;
  }

  editClass(id: string): void {
    this.router.navigate([`/classes/${this.getCleanId(id)}/edit`]);
  }

  deleteClass(id: string, className: string): void {
    if (!confirm(`Are you sure you want to delete the class "${className}"? This action cannot be undone.`)) {
      return;
    }
    const cleanId = this.getCleanId(id);
    if (!cleanId) {
      this.error = 'Invalid class ID. Cannot delete class.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.classService.deleteClass(cleanId).subscribe({
      next: (data: any) => {
        this.success = data.message || 'Class deleted successfully';
        this.loading = false;
        this.loadClasses();
      },
      error: (err: any) => {
        let errorMessage = 'Failed to delete class';
        if (err.status === 0 || err.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running.';
        } else if (err.status === 400 && err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
            const details = err.error.details;
            if (details) {
              const detailParts: string[] = [];
              if (details.students > 0) detailParts.push(`${details.students} student(s)`);
              if (details.teachers > 0) detailParts.push(`${details.teachers} teacher(s)`);
              if (details.exams > 0) detailParts.push(`${details.exams} exam(s)`);
              if (detailParts.length > 0) {
                errorMessage = `Cannot delete "${className}". This class has: ${detailParts.join(', ')}. Remove associations first.`;
              }
            }
          }
        } else if (err.error?.message) {
          errorMessage = err.error.message;
        }
        this.error = errorMessage;
        this.loading = false;
        setTimeout(() => {
          if (this.error === errorMessage) this.error = '';
          this.cdr.markForCheck();
        }, 8000);
      }
    });
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) {
      return;
    }
    this.loadClasses(page);
  }

  onPageSizeChange(limit: number | string): void {
    const parsedLimit = Number(limit);
    this.pagination.limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : this.pagination.limit;
    this.pagination.page = 1;
    this.loadClasses(1);
  }

  exportCsv(): void {
    const items = this.filteredClasses;
    if (!items.length) {
      this.success = 'Nothing to export';
      setTimeout(() => {
        if (this.success === 'Nothing to export') this.success = '';
        this.cdr.markForCheck();
      }, 3000);
      return;
    }
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Class Name', 'Grade', 'Students', 'Teachers', 'Subjects', 'Status', 'Description'];
    const lines = [header.join(',')];
    for (const c of items) {
      lines.push(
        [
          esc(c.name),
          esc(c.form),
          esc(c.students?.length || 0),
          esc(c.teachers?.length || 0),
          esc(this.getSubjectCount(c)),
          esc(c.isActive ? 'Active' : 'Inactive'),
          esc(c.description)
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Classes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.success = `Exported ${items.length} class(es) to CSV`;
    this.cdr.markForCheck();
  }

  printReport(): void {
    if (!this.filteredClasses.length) return;
    const stats = this.dashboardStats;
    const rows = this.filteredClasses
      .map(
        (c) => `
      <tr>
        <td>${this.escapeHtml(c.name || '')}</td>
        <td>${this.escapeHtml(c.form || '')}</td>
        <td>${c.students?.length || 0}</td>
        <td>${c.teachers?.length || 0}</td>
        <td>${this.getSubjectCount(c)}</td>
        <td>${c.isActive ? 'Active' : 'Inactive'}</td>
      </tr>`
      )
      .join('');
    const html = `
      <!DOCTYPE html><html><head><title>Classes Report</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; }
        h1 { font-size: 1.2rem; }
        p.meta { color: #64748b; font-size: 0.85rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.85rem; }
        th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
        th { background: #f8fafc; }
      </style></head><body>
      <h1>Class Management Report</h1>
      <p class="meta">${this.escapeHtml(this.filterSummary)} · ${stats.totalStudents} students · Printed ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>Class</th><th>Grade</th><th>Students</th><th>Teachers</th><th>Subjects</th><th>Status</th></tr></thead>
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
}

import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';

export type ExemptionSortColumn =
  | 'studentNumber'
  | 'lastName'
  | 'firstName'
  | 'gender'
  | 'className'
  | 'exemptionType'
  | 'amountExempted';

@Component({
  standalone: false,
  selector: 'app-exemption-report',
  templateUrl: './exemption-report.component.html',
  styleUrls: ['./exemption-report.component.css']
})
export class ExemptionReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();

  readonly skeletonPlaceholders = [0, 1, 2, 3, 4, 5];

  rows: any[] = [];
  /** Filtered + sorted view of `rows` */
  displayedRows: any[] = [];
  loading = false;
  loadingPdf = false;
  downloadingPdf = false;
  error = '';
  currencySymbol = '';

  searchQuery = '';
  sortColumn: ExemptionSortColumn = 'amountExempted';
  sortDir: 'asc' | 'desc' = 'desc';
  lastLoadedAt: Date | null = null;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || '';
        this.cdr.markForCheck();
      }
    });

    this.searchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.searchQuery = q;
        this.applyFiltersAndSort();
        this.cdr.markForCheck();
      });

    activatePageLoad(this.router, this.destroy$, '/financial-reports/exemption-report', () =>
      this.loadReport()
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadReport(): void {
    this.loading = true;
    this.error = '';
    this.financeService
      .getExemptionReport()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data) => {
          this.rows = Array.isArray(data) ? data : [];
          this.lastLoadedAt = new Date();
          this.applyFiltersAndSort();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load exemption report';
          this.rows = [];
          this.displayedRows = [];
        }
      });
  }

  getTotalExempted(): number {
    return this.rows.reduce(
      (sum, r) => sum + (parseFloat(String(r.amountExempted || 0)) || 0),
      0
    );
  }

  getDisplayedTotalExempted(): number {
    return this.displayedRows.reduce(
      (sum, r) => sum + (parseFloat(String(r.amountExempted || 0)) || 0),
      0
    );
  }

  getAverageExempted(): number {
    if (this.rows.length === 0) return 0;
    return this.getTotalExempted() / this.rows.length;
  }

  onSearchInput(value: string): void {
    this.searchInput$.next((value || '').trim());
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchInput$.next('');
    this.applyFiltersAndSort();
    this.cdr.markForCheck();
  }

  setSort(column: ExemptionSortColumn): void {
    if (this.sortColumn === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDir = column === 'amountExempted' ? 'desc' : 'asc';
    }
    this.applyFiltersAndSort();
    this.cdr.markForCheck();
  }

  sortIndicator(column: ExemptionSortColumn): string {
    if (this.sortColumn !== column) return '';
    return this.sortDir === 'asc' ? '▲' : '▼';
  }

  formatExemptionType(raw: string | null | undefined): string {
    if (!raw) return '—';
    const t = String(raw).toLowerCase();
    if (t === 'staff_sibling' || t === 'staff sibling') return 'Staff sibling';
    if (t === 'fixed') return 'Fixed amount';
    if (t === 'percentage') return 'Percentage';
    return raw;
  }

  applyFiltersAndSort(): void {
    const q = (this.searchQuery || '').toLowerCase();
    let list = [...this.rows];
    if (q) {
      list = list.filter((r) => {
        const blob = [
          r.studentNumber,
          r.firstName,
          r.lastName,
          r.className,
          r.gender,
          r.exemptionType,
          this.formatExemptionType(r.exemptionType)
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }

    const col = this.sortColumn;
    const dir = this.sortDir === 'asc' ? 1 : -1;
    const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
    const str = (v: unknown) => String(v ?? '').toLowerCase();

    list.sort((a, b) => {
      if (col === 'amountExempted') {
        return (num(a.amountExempted) - num(b.amountExempted)) * dir;
      }
      const cmp = str(a[col]).localeCompare(str(b[col]), undefined, { sensitivity: 'base' });
      return cmp * dir;
    });

    this.displayedRows = list;
  }

  exportCsv(): void {
    const rows = this.displayedRows;
    if (rows.length === 0) return;

    const headers = [
      'Student ID',
      'Last name',
      'First name',
      'Sex',
      'Class',
      'Exemption type',
      `Amount exempted (${this.currencySymbol})`
    ];
    const escape = (cell: string) => {
      const s = String(cell ?? '');
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.studentNumber,
          r.lastName,
          r.firstName,
          r.gender,
          r.className || 'Unassigned',
          this.formatExemptionType(r.exemptionType),
          (parseFloat(String(r.amountExempted || 0)) || 0).toFixed(2)
        ]
          .map((c) => escape(String(c)))
          .join(',')
      )
    ];

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Exemption_Report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  formatAmount(n: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n || 0);
  }

  previewPdf(): void {
    this.loadingPdf = true;
    this.error = '';
    this.financeService
      .getExemptionReportPDF(false)
      .pipe(
        finalize(() => {
          this.loadingPdf = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        },
        error: (err) => {
          this.error = err?.error?.message || err?.message || 'Failed to preview PDF';
        }
      });
  }

  downloadPdf(): void {
    this.downloadingPdf = true;
    this.error = '';
    this.financeService
      .getExemptionReportPDF(true)
      .pipe(
        finalize(() => {
          this.downloadingPdf = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (blob) => {
          if (!blob?.size) {
            this.error = 'Received empty PDF file';
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Exemption_Report_${new Date().toISOString().split('T')[0]}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        },
        error: (err) => {
          this.error = err?.error?.message || err?.message || 'Failed to download PDF';
        }
      });
  }
}

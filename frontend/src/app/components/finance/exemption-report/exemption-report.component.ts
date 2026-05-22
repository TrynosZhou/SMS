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

type ExemptionViewMode = 'table' | 'cards';

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
  displayedRows: any[] = [];
  classChips: { className: string; count: number }[] = [];
  typeChips: { typeKey: string; label: string; count: number }[] = [];
  loading = false;
  loadingPdf = false;
  downloadingPdf = false;
  error = '';
  success = '';
  currencySymbol = '';
  searchQuery = '';
  selectedClass = 'all';
  selectedType = 'all';
  viewMode: ExemptionViewMode = 'table';
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

    this.loadReport();
    activatePageLoad(this.router, this.destroy$, '/financial-reports/exemption-report', () => this.loadReport());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasData(): boolean {
    return this.rows.length > 0;
  }

  get dashboardStats(): {
    students: number;
    totalExempted: number;
    average: number;
    classes: number;
    types: number;
  } {
    const amounts = this.displayedRows.map((r) => parseFloat(String(r.amountExempted || 0)) || 0);
    const total = amounts.reduce((s, n) => s + n, 0);
    const classSet = new Set(this.displayedRows.map((r) => this.normalizeClass(r)));
    const typeSet = new Set(this.displayedRows.map((r) => this.normalizeTypeKey(r.exemptionType)));
    return {
      students: this.displayedRows.length,
      totalExempted: total,
      average: amounts.length ? total / amounts.length : 0,
      classes: classSet.size,
      types: typeSet.size
    };
  }

  get filterSummary(): string {
    if (!this.hasData) return '';
    const parts: string[] = [];
    if (this.selectedClass !== 'all') parts.push(`Class: ${this.selectedClass}`);
    if (this.selectedType !== 'all') {
      const label = this.typeChips.find((t) => t.typeKey === this.selectedType)?.label || this.selectedType;
      parts.push(`Type: ${label}`);
    }
    if (this.searchQuery) parts.push(`Search: "${this.searchQuery}"`);
    parts.push(`${this.displayedRows.length} of ${this.rows.length} shown`);
    return parts.join(' · ');
  }

  loadReport(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
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
          this.rebuildChips();
          this.applyFiltersAndSort();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load exemption report';
          this.rows = [];
          this.displayedRows = [];
          this.classChips = [];
          this.typeChips = [];
        }
      });
  }

  private normalizeClass(r: any): string {
    return (r.className || 'Unassigned').toString().trim() || 'Unassigned';
  }

  private normalizeTypeKey(raw: string | null | undefined): string {
    return String(raw || '').toLowerCase().trim().replace(/\s+/g, '_');
  }

  private rebuildChips(): void {
    const classCounts = new Map<string, number>();
    const typeCounts = new Map<string, { label: string; count: number }>();

    for (const r of this.rows) {
      const cls = this.normalizeClass(r);
      classCounts.set(cls, (classCounts.get(cls) || 0) + 1);

      const key = this.normalizeTypeKey(r.exemptionType) || 'unknown';
      const label = this.formatExemptionType(r.exemptionType);
      const existing = typeCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        typeCounts.set(key, { label, count: 1 });
      }
    }

    this.classChips = Array.from(classCounts.entries())
      .map(([className, count]) => ({ className, count }))
      .sort((a, b) => b.count - a.count || a.className.localeCompare(b.className));

    this.typeChips = Array.from(typeCounts.entries())
      .map(([typeKey, v]) => ({ typeKey, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  getTotalExempted(): number {
    return this.rows.reduce((sum, r) => sum + (parseFloat(String(r.amountExempted || 0)) || 0), 0);
  }

  getDisplayedTotalExempted(): number {
    return this.displayedRows.reduce((sum, r) => sum + (parseFloat(String(r.amountExempted || 0)) || 0), 0);
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

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedClass = 'all';
    this.selectedType = 'all';
    this.searchInput$.next('');
    this.applyFiltersAndSort();
    this.cdr.markForCheck();
  }

  hasActiveFilters(): boolean {
    return (
      !!(this.searchQuery && this.searchQuery.trim()) ||
      this.selectedClass !== 'all' ||
      this.selectedType !== 'all'
    );
  }

  onClassChange(value: string): void {
    this.selectedClass = value || 'all';
    this.applyFiltersAndSort();
    this.cdr.markForCheck();
  }

  onTypeChange(value: string): void {
    this.selectedType = value || 'all';
    this.applyFiltersAndSort();
    this.cdr.markForCheck();
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'table' ? 'cards' : 'table';
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  private showToast(msg: string): void {
    this.success = msg;
    setTimeout(() => {
      if (this.success === msg) this.success = '';
      this.cdr.markForCheck();
    }, 4000);
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

  getTypePillClass(raw: string | null | undefined): string {
    const t = this.normalizeTypeKey(raw);
    if (t === 'staff_sibling') return 'er-type-pill--staff';
    if (t === 'fixed') return 'er-type-pill--fixed';
    if (t === 'percentage') return 'er-type-pill--pct';
    return '';
  }

  applyFiltersAndSort(): void {
    const q = (this.searchQuery || '').toLowerCase();
    let list = [...this.rows];

    if (this.selectedClass !== 'all') {
      list = list.filter((r) => this.normalizeClass(r) === this.selectedClass);
    }
    if (this.selectedType !== 'all') {
      list = list.filter((r) => this.normalizeTypeKey(r.exemptionType) === this.selectedType);
    }
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

  trackByStudent(_index: number, r: any): string {
    return String(r?.studentId || r?.studentNumber || _index);
  }

  exportCsv(): void {
    const rows = this.displayedRows;
    if (rows.length === 0) {
      this.showToast('Nothing to export');
      return;
    }

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
          this.normalizeClass(r),
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
    this.showToast(`Exported ${rows.length} student(s) to CSV`);
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
    this.cdr.markForCheck();
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
          this.showToast('PDF opened in new tab');
        },
        error: (err) => {
          this.error = err?.error?.message || err?.message || 'Failed to preview PDF';
        }
      });
  }

  downloadPdf(): void {
    this.downloadingPdf = true;
    this.error = '';
    this.cdr.markForCheck();
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
          this.showToast('PDF downloaded successfully');
        },
        error: (err) => {
          this.error = err?.error?.message || err?.message || 'Failed to download PDF';
        }
      });
  }

  printReport(): void {
    if (!this.displayedRows.length) return;
    const escape = (s: string) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const tableRows = this.displayedRows
      .map(
        (r) => `<tr>
        <td>${escape(r.studentNumber)}</td>
        <td>${escape(r.lastName)} ${escape(r.firstName)}</td>
        <td>${escape(this.normalizeClass(r))}</td>
        <td>${escape(this.formatExemptionType(r.exemptionType))}</td>
        <td style="text-align:right">${escape(this.currencySymbol)} ${this.formatAmount(r.amountExempted)}</td>
      </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html><html><head><title>Exemption Report</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px}table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #e2e8f0;padding:8px}th{background:#f8fafc;text-align:left}</style></head><body>
      <h1>Exemption Report</h1>
      <p style="color:#64748b">${this.displayedRows.length} students · Total ${escape(this.currencySymbol)} ${this.formatAmount(this.getDisplayedTotalExempted())} · ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>ID</th><th>Student</th><th>Class</th><th>Type</th><th>Amount</th></tr></thead><tbody>${tableRows}</tbody></table>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }
}

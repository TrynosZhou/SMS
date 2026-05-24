import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

export type AgedRow = {
  studentNumber: string;
  lastName: string;
  firstName: string;
  invoiceNumber: string;
  dueDate: string;
  daysOverdue: number;
  balance: number;
  bucket: string;
};

type AgedViewMode = 'table' | 'cards';
type AgedSortColumn = 'daysOverdue' | 'balance' | 'dueDate' | 'studentName' | 'invoiceNumber';

const BUCKET_LABELS = ['Current', '1–30 days', '31–60 days', '61–90 days', '90+ days'] as const;

@Component({
  standalone: false,
  selector: 'app-aged-debtors-report',
  templateUrl: './aged-debtors-report.component.html',
  styleUrls: ['./aged-debtors-report.component.css']
})
export class AgedDebtorsReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  loading = false;
  error = '';
  success = '';
  currencySymbol = '';
  lastLoadedAt: Date | null = null;

  allRows: AgedRow[] = [];
  displayedRows: AgedRow[] = [];
  bucketChips: Array<{ label: string; count: number; total: number }> = [];
  bucketBars: Array<{ label: string; count: number; total: number; pct: number }> = [];

  searchQuery = '';
  selectedBucket = 'all';
  viewMode: AgedViewMode = 'table';
  sortColumn: AgedSortColumn = 'daysOverdue';
  sortDir: 'asc' | 'desc' = 'desc';

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.searchQuery = q;
        this.applyView();
        this.cdr.markForCheck();
      });
    this.bootstrap();
    activatePageLoad(this.router, this.destroy$, '/financial-reports/aged-debtors', () => this.bootstrap());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasData(): boolean {
    return this.allRows.length > 0 || (!this.loading && this.lastLoadedAt !== null);
  }

  get dashboardStats(): {
    totalOutstanding: number;
    displayedOutstanding: number;
    invoiceCount: number;
    studentCount: number;
    oldestDays: number;
    severeCount: number;
    severeTotal: number;
  } {
    const severeBuckets = new Set(['61–90 days', '90+ days']);
    const severe = this.allRows.filter((r) => severeBuckets.has(r.bucket));
    const studentKeys = new Set(this.displayedRows.map((r) => r.studentNumber));
    return {
      totalOutstanding: this.allRows.reduce((s, r) => s + r.balance, 0),
      displayedOutstanding: this.displayedRows.reduce((s, r) => s + r.balance, 0),
      invoiceCount: this.displayedRows.length,
      studentCount: studentKeys.size,
      oldestDays: this.allRows.length ? Math.max(...this.allRows.map((r) => r.daysOverdue)) : 0,
      severeCount: severe.length,
      severeTotal: severe.reduce((s, r) => s + r.balance, 0)
    };
  }

  get filterSummary(): string {
    const parts: string[] = [];
    if (this.selectedBucket !== 'all') parts.push(`Bucket: ${this.selectedBucket}`);
    if (this.searchQuery) parts.push(`Search: "${this.searchQuery}"`);
    parts.push(`${this.displayedRows.length} of ${this.allRows.length} invoices`);
    return parts.join(' · ');
  }

  private bootstrap(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || '';
        this.cdr.markForCheck();
      }
    });
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.financeService
      .getInvoices(undefined, undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (invoices) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const rows: AgedRow[] = [];
          for (const inv of invoices || []) {
            if (inv.isVoided) continue;
            const bal = parseFloat(String(inv.balance || 0)) || 0;
            if (bal <= 0.005) continue;
            const due = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.createdAt);
            due.setHours(0, 0, 0, 0);
            const days = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
            let bucket = 'Current';
            if (days > 90) bucket = '90+ days';
            else if (days > 60) bucket = '61–90 days';
            else if (days > 30) bucket = '31–60 days';
            else if (days > 0) bucket = '1–30 days';
            const st = inv.student || {};
            rows.push({
              studentNumber: st.studentNumber || inv.studentNumber || '—',
              lastName: (st.lastName && String(st.lastName).trim()) || '—',
              firstName: (st.firstName && String(st.firstName).trim()) || '—',
              invoiceNumber: inv.invoiceNumber || '—',
              dueDate: due.toISOString().slice(0, 10),
              daysOverdue: days,
              balance: bal,
              bucket
            });
          }
          rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
          this.allRows = rows;
          this.lastLoadedAt = new Date();
          this.applyView();
        },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to load aged debtors';
          this.allRows = [];
          this.displayedRows = [];
          this.bucketChips = [];
          this.bucketBars = [];
        }
      });
  }

  formatAmount(n: number): string {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  }

  onSearchInput(value: string): void {
    this.searchInput$.next((value || '').trim());
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchInput$.next('');
    this.applyView();
  }

  onBucketChange(value: string): void {
    this.selectedBucket = value || 'all';
    this.applyView();
    this.cdr.markForCheck();
  }

  hasActiveFilters(): boolean {
    return this.selectedBucket !== 'all' || !!this.searchQuery;
  }

  resetFilters(): void {
    this.selectedBucket = 'all';
    this.clearSearch();
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

  setSort(column: AgedSortColumn): void {
    if (this.sortColumn === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDir = column === 'balance' || column === 'daysOverdue' ? 'desc' : 'asc';
    }
    this.applyView();
  }

  sortIndicator(column: AgedSortColumn): string {
    if (this.sortColumn !== column) return '';
    return this.sortDir === 'asc' ? '▲' : '▼';
  }

  trackByRow(_index: number, row: AgedRow): string {
    return `${row.invoiceNumber}|${row.studentNumber}|${_index}`;
  }

  bucketClass(bucket: string): string {
    if (bucket === 'Current') return 'ad-bucket-pill--current';
    if (bucket === '1–30 days') return 'ad-bucket-pill--d30';
    if (bucket === '31–60 days') return 'ad-bucket-pill--d60';
    if (bucket === '61–90 days') return 'ad-bucket-pill--d90';
    return 'ad-bucket-pill--d90p';
  }

  barFillClass(label: string): string {
    if (label === 'Current') return 'ad-bucket-row__fill--current';
    if (label === '1–30 days') return 'ad-bucket-row__fill--d30';
    if (label === '31–60 days') return 'ad-bucket-row__fill--d60';
    if (label === '61–90 days') return 'ad-bucket-row__fill--d90';
    return 'ad-bucket-row__fill--d90p';
  }

  daysClass(days: number): string {
    if (days > 90) return 'ad-days--danger';
    if (days > 30) return 'ad-days--warn';
    return '';
  }

  canManageFinance(): boolean {
    return this.authService.isAdmin() || this.authService.hasRole('accountant');
  }

  recordPayment(row: AgedRow): void {
    if (!this.canManageFinance()) {
      this.error = 'You do not have permission to record payments';
      return;
    }
    this.router.navigate(['/payments/record'], {
      queryParams: {
        studentId: row.studentNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        balance: row.balance
      }
    });
  }

  private applyView(): void {
    const q = this.searchQuery.toLowerCase();
    let list = [...this.allRows];
    if (this.selectedBucket !== 'all') {
      list = list.filter((row) => row.bucket === this.selectedBucket);
    }
    if (q) {
      list = list.filter((row) =>
        [row.studentNumber, row.lastName, row.firstName, row.invoiceNumber, row.bucket]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }

    const dir = this.sortDir === 'asc' ? 1 : -1;
    const str = (v: unknown) => String(v || '').toLowerCase();
    list.sort((a, b) => {
      switch (this.sortColumn) {
        case 'balance':
          return (a.balance - b.balance) * dir;
        case 'dueDate':
          return a.dueDate.localeCompare(b.dueDate) * dir;
        case 'invoiceNumber':
          return str(a.invoiceNumber).localeCompare(str(b.invoiceNumber)) * dir;
        case 'studentName':
          return str(`${a.lastName} ${a.firstName}`).localeCompare(str(`${b.lastName} ${b.firstName}`)) * dir;
        case 'daysOverdue':
        default:
          return (a.daysOverdue - b.daysOverdue) * dir;
      }
    });

    this.displayedRows = list;
    this.bucketChips = this.buildBucketChips(this.allRows);
    const totalAll = this.allRows.reduce((s, r) => s + r.balance, 0) || 1;
    this.bucketBars = BUCKET_LABELS.map((label) => {
      const inBucket = this.allRows.filter((r) => r.bucket === label);
      const total = inBucket.reduce((s, r) => s + r.balance, 0);
      return {
        label,
        count: inBucket.length,
        total,
        pct: Math.round((total / totalAll) * 100)
      };
    });
  }

  private buildBucketChips(rows: AgedRow[]): Array<{ label: string; count: number; total: number }> {
    return BUCKET_LABELS.map((label) => {
      const inBucket = rows.filter((r) => r.bucket === label);
      return {
        label,
        count: inBucket.length,
        total: inBucket.reduce((s, r) => s + r.balance, 0)
      };
    });
  }

  exportCsv(): void {
    const items = this.displayedRows;
    if (!items.length) {
      this.showToast('Nothing to export');
      return;
    }
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Student ID', 'Last name', 'First name', 'Invoice', 'Due', 'Days overdue', 'Bucket', 'Balance'];
    const lines = [header.join(',')];
    for (const r of items) {
      lines.push(
        [
          esc(r.studentNumber),
          esc(r.lastName),
          esc(r.firstName),
          esc(r.invoiceNumber),
          esc(r.dueDate),
          esc(r.daysOverdue),
          esc(r.bucket),
          esc(r.balance.toFixed(2))
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Aged_Debtors_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.showToast(`Exported ${items.length} invoice(s) to CSV`);
  }

  printReport(): void {
    if (!this.displayedRows.length) return;
    const rows = this.displayedRows
      .map(
        (r) => `
      <tr>
        <td>${this.escapeHtml(r.studentNumber)}</td>
        <td>${this.escapeHtml(r.lastName)}</td>
        <td>${this.escapeHtml(r.firstName)}</td>
        <td>${this.escapeHtml(r.invoiceNumber)}</td>
        <td>${this.escapeHtml(r.dueDate)}</td>
        <td>${r.daysOverdue}</td>
        <td>${this.escapeHtml(r.bucket)}</td>
        <td style="text-align:right">${this.escapeHtml(this.currencySymbol)} ${this.formatAmount(r.balance)}</td>
      </tr>`
      )
      .join('');
    const stats = this.dashboardStats;
    const html = `
      <!DOCTYPE html><html><head><title>Aged Debtors Report</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; color: #0f172a; }
        h1 { font-size: 1.25rem; margin-bottom: 4px; }
        p.meta { color: #64748b; font-size: 0.85rem; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.85rem; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
        th { background: #f8fafc; text-transform: uppercase; font-size: 0.7rem; }
      </style></head><body>
      <h1>Aged Debtors Report</h1>
      <p class="meta">Total outstanding: ${this.escapeHtml(this.currencySymbol)} ${this.formatAmount(stats.totalOutstanding)} ·
      ${this.displayedRows.length} invoices shown · Printed ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>Student ID</th><th>Last</th><th>First</th><th>Invoice</th><th>Due</th><th>Days</th><th>Bucket</th><th>Balance</th></tr></thead>
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

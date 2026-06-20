import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';

type RevenueViewMode = 'table' | 'cards';
type RevenueSortColumn =
  | 'paymentDate'
  | 'amountPaid'
  | 'studentName'
  | 'invoiceNumber'
  | 'paymentMethod'
  | 'receiptNumber';

export type RevenueReceiptItem = {
  receiptNumber?: string;
  paymentDate?: string;
  studentName?: string;
  studentNumber?: string;
  invoiceNumber?: string;
  invoiceTerm?: string;
  amountPaid?: number;
  paymentMethod?: string;
};

@Component({
  standalone: false,
  selector: 'app-revenue-recognition-report',
  templateUrl: './revenue-recognition-report.component.html',
  styleUrls: ['./revenue-recognition-report.component.css']
})
export class RevenueRecognitionReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  loading = false;
  downloadingPdf = false;
  error = '';
  success = '';
  currencySymbol = '';
  term = '';
  availableTerms: string[] = [];
  methodChips: { method: string; count: number }[] = [];
  selectedMethod = 'all';
  searchQuery = '';
  lastLoadedAt: Date | null = null;
  displayedItems: RevenueReceiptItem[] = [];
  viewMode: RevenueViewMode = 'table';
  sortColumn: RevenueSortColumn = 'paymentDate';
  sortDir: 'asc' | 'desc' = 'desc';
  data: any = null;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
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
    activatePageLoad(this.router, this.destroy$, '/financial-reports/revenue-recognition', () => this.bootstrap());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasData(): boolean {
    return !!this.data;
  }

  get dashboardStats(): {
    totalInvoiced: number;
    totalCollected: number;
    totalOutstanding: number;
    collectionRate: number;
    collectedSharePct: number;
    outstandingSharePct: number;
    invoicesCount: number;
    studentsWithInvoices: number;
    studentsFullyPaid: number;
    studentsPartiallyPaid: number;
    studentsUnpaid: number;
    displayedCollected: number;
    receiptCount: number;
  } {
    const invoiced = parseFloat(String(this.data?.totalInvoiced ?? 0)) || 0;
    const collected = parseFloat(String(this.data?.totalCollected ?? this.data?.totalPayments ?? 0)) || 0;
    const outstanding = parseFloat(String(this.data?.totalOutstanding ?? 0)) || 0;
    const collectionRate =
      invoiced > 0 ? Math.round((collected / invoiced) * 1000) / 10 : 0;
    return {
      totalInvoiced: invoiced,
      totalCollected: collected,
      totalOutstanding: outstanding,
      collectionRate,
      collectedSharePct: invoiced > 0 ? Math.min(100, Math.round((collected / invoiced) * 1000) / 10) : 0,
      outstandingSharePct: invoiced > 0 ? Math.min(100, Math.round((outstanding / invoiced) * 1000) / 10) : 0,
      invoicesCount: Number(this.data?.invoicesCount) || 0,
      studentsWithInvoices: Number(this.data?.studentsWithInvoices) || 0,
      studentsFullyPaid: Number(this.data?.studentsFullyPaid) || 0,
      studentsPartiallyPaid: Number(this.data?.studentsPartiallyPaid) || 0,
      studentsUnpaid: Number(this.data?.studentsUnpaid) || 0,
      displayedCollected: this.getDisplayedTotalPaid(),
      receiptCount: this.displayedItems.length
    };
  }

  get filterSummary(): string {
    if (!this.data) return '';
    const parts: string[] = [];
    if (this.term) parts.push(`Term: ${this.term}`);
    if (this.selectedMethod !== 'all') parts.push(`Method: ${this.selectedMethod}`);
    if (this.searchQuery) parts.push(`Search: "${this.searchQuery}"`);
    parts.push(`${this.displayedItems.length} of ${this.data?.items?.length || 0} receipts`);
    return parts.join(' · ');
  }

  private bootstrap(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || '';
        this.cdr.markForCheck();
      }
    });
    this.settingsService.getActiveTerm().subscribe({
      next: (r: any) => {
        if (!this.term && r?.activeTerm) {
          this.term = r.activeTerm;
        }
        this.load();
      },
      error: () => this.load()
    });
  }

  onTermChange(val: string): void {
    this.term = val;
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.financeService
      .getCashReceipts(this.term || undefined, 'all', 1, 100, undefined, undefined, { fetchAll: true })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res) => {
          this.data = res;
          this.availableTerms = Array.isArray(res?.availableTerms) ? res.availableTerms : [];
          if (!this.term && res?.term) {
            this.term = res.term;
          }
          this.methodChips = this.buildMethodChips(this.data?.items);
          this.lastLoadedAt = new Date();
          this.applyView();
        },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to load revenue recognition';
          this.data = null;
          this.displayedItems = [];
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

  onMethodChange(value: string): void {
    this.selectedMethod = value || 'all';
    this.applyView();
    this.cdr.markForCheck();
  }

  hasActiveFilters(): boolean {
    return this.selectedMethod !== 'all' || !!this.searchQuery;
  }

  resetFilters(): void {
    this.selectedMethod = 'all';
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

  setSort(column: RevenueSortColumn): void {
    if (this.sortColumn === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDir = column === 'amountPaid' || column === 'paymentDate' ? 'desc' : 'asc';
    }
    this.applyView();
  }

  sortIndicator(column: RevenueSortColumn): string {
    if (this.sortColumn !== column) return '';
    return this.sortDir === 'asc' ? '▲' : '▼';
  }

  trackByReceipt(_index: number, item: RevenueReceiptItem): string {
    return String(item?.receiptNumber || item?.invoiceNumber || _index);
  }

  getDisplayedTotalPaid(): number {
    return this.displayedItems.reduce((sum, item) => sum + (parseFloat(String(item?.amountPaid || 0)) || 0), 0);
  }

  private buildMethodChips(items: RevenueReceiptItem[]): { method: string; count: number }[] {
    if (!Array.isArray(items)) return [];
    const counts = new Map<string, number>();
    for (const item of items) {
      const m = String(item?.paymentMethod || '').trim();
      if (!m) continue;
      counts.set(m, (counts.get(m) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count || a.method.localeCompare(b.method));
  }

  private applyView(): void {
    const raw = Array.isArray(this.data?.items) ? [...this.data.items] : [];
    const query = this.searchQuery.toLowerCase();

    let list = raw.filter((item) => {
      const method = String(item?.paymentMethod || '').trim();
      if (this.selectedMethod !== 'all' && method !== this.selectedMethod) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        item?.receiptNumber,
        item?.studentName,
        item?.studentNumber,
        item?.invoiceNumber,
        item?.invoiceTerm,
        item?.paymentMethod
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return haystack.includes(query);
    });

    const dir = this.sortDir === 'asc' ? 1 : -1;
    const dateVal = (v: unknown) => new Date(String(v || 0)).getTime() || 0;
    const numVal = (v: unknown) => parseFloat(String(v || 0)) || 0;
    const strVal = (v: unknown) => String(v || '').toLowerCase();

    list.sort((a, b) => {
      switch (this.sortColumn) {
        case 'amountPaid':
          return (numVal(a?.amountPaid) - numVal(b?.amountPaid)) * dir;
        case 'paymentDate':
          return (dateVal(a?.paymentDate) - dateVal(b?.paymentDate)) * dir;
        case 'paymentMethod':
          return strVal(a?.paymentMethod).localeCompare(strVal(b?.paymentMethod)) * dir;
        case 'invoiceNumber':
          return strVal(a?.invoiceNumber).localeCompare(strVal(b?.invoiceNumber)) * dir;
        case 'receiptNumber':
          return strVal(a?.receiptNumber).localeCompare(strVal(b?.receiptNumber)) * dir;
        case 'studentName':
        default:
          return strVal(a?.studentName).localeCompare(strVal(b?.studentName)) * dir;
      }
    });

    this.displayedItems = list;
  }

  exportCsv(): void {
    const items = this.displayedItems;
    if (!items.length) {
      this.showToast('Nothing to export');
      return;
    }
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Receipt', 'Date', 'Student #', 'Student', 'Invoice', 'Term', 'Amount', 'Method'];
    const lines = [header.join(',')];
    for (const r of items) {
      lines.push(
        [
          esc(r.receiptNumber),
          esc(r.paymentDate),
          esc(r.studentNumber),
          esc(r.studentName),
          esc(r.invoiceNumber),
          esc(r.invoiceTerm),
          esc((r.amountPaid ?? 0).toFixed(2)),
          esc(r.paymentMethod)
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Revenue_Recognition_${(this.term || 'term').replace(/\s+/g, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.showToast(`Exported ${items.length} receipt(s) to CSV`);
  }

  downloadPdf(): void {
    this.downloadingPdf = true;
    this.cdr.markForCheck();
    this.financeService.getCashReceiptsPDF(this.term?.trim() || undefined, false).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safe = (this.term || 'term').replace(/\s+/g, '_');
        a.download = `Revenue_Recognition_${safe}.html`;
        a.click();
        URL.revokeObjectURL(url);
        this.downloadingPdf = false;
        this.showToast('PDF downloaded successfully');
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'Could not download PDF.';
        this.downloadingPdf = false;
        this.cdr.markForCheck();
      }
    });
  }

  printReport(): void {
    if (!this.displayedItems.length) return;
    const stats = this.dashboardStats;
    const rows = this.displayedItems
      .map(
        (r) => `
      <tr>
        <td>${this.escapeHtml(r.receiptNumber || '—')}</td>
        <td>${this.escapeHtml(r.paymentDate ? new Date(r.paymentDate).toLocaleDateString() : '—')}</td>
        <td>${this.escapeHtml(r.studentNumber || '')} — ${this.escapeHtml(r.studentName || '')}</td>
        <td>${this.escapeHtml(r.invoiceNumber || '—')}</td>
        <td>${this.escapeHtml(r.invoiceTerm || '—')}</td>
        <td style="text-align:right">${this.escapeHtml(this.currencySymbol)} ${this.formatAmount(r.amountPaid || 0)}</td>
        <td>${this.escapeHtml(r.paymentMethod || '—')}</td>
      </tr>`
      )
      .join('');
    const html = `
      <!DOCTYPE html><html><head><title>Revenue Recognition — ${this.escapeHtml(this.term)}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; color: #0f172a; }
        h1 { font-size: 1.25rem; margin-bottom: 4px; }
        p.meta { color: #64748b; font-size: 0.85rem; margin-top: 0; }
        .kpis { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0; font-size: 0.9rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.85rem; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
        th { background: #f8fafc; text-transform: uppercase; font-size: 0.7rem; }
      </style></head><body>
      <h1>Revenue Recognition Report</h1>
      <p class="meta">Term: ${this.escapeHtml(this.term)} · Printed ${new Date().toLocaleString()}</p>
      <div class="kpis">
        <span>Invoiced: ${this.escapeHtml(this.currencySymbol)} ${this.formatAmount(stats.totalInvoiced)}</span>
        <span>Collected: ${this.escapeHtml(this.currencySymbol)} ${this.formatAmount(stats.totalCollected)}</span>
        <span>Outstanding: ${this.escapeHtml(this.currencySymbol)} ${this.formatAmount(stats.totalOutstanding)}</span>
        <span>Collection rate: ${stats.collectionRate}%</span>
      </div>
      <table><thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th>Invoice</th><th>Term</th><th>Amount</th><th>Method</th></tr></thead>
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

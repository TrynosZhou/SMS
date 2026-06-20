import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';

type FeesViewMode = 'table' | 'cards';

@Component({
  standalone: false,
  selector: 'app-fees-collection-report',
  templateUrl: './fees-collection-report.component.html',
  styleUrls: ['./fees-collection-report.component.css']
})
export class FeesCollectionReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  loading = false;
  loadingPdf = false;
  downloadingPdf = false;
  error = '';
  success = '';
  currencySymbol = '';
  term = '';
  availableTerms: string[] = [];
  availableMethods: string[] = [];
  methodChips: { method: string; count: number }[] = [];
  selectedMethod = 'all';
  searchQuery = '';
  lastLoadedAt: Date | null = null;
  displayedItems: any[] = [];
  viewMode: FeesViewMode = 'table';
  sortColumn: 'paymentDate' | 'studentName' | 'invoiceNumber' | 'amountPaid' | 'paymentMethod' = 'paymentDate';
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
    activatePageLoad(this.router, this.destroy$, '/financial-reports/fees-collection', () => this.bootstrap());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasData(): boolean {
    return !!this.data;
  }

  get dashboardStats(): {
    totalCollected: number;
    displayedTotal: number;
    transactions: number;
    average: number;
    collectionRate: number;
    outstanding: number;
    totalInvoiced: number;
    studentsFullyPaid: number;
    studentsWithInvoices: number;
    studentsPartiallyPaid: number;
    studentsUnpaid: number;
  } {
    const studentsWithInvoices = Number(this.data?.studentsWithInvoices) || 0;
    const studentsFullyPaid = Number(this.data?.studentsFullyPaid) || 0;
    const collectionRate =
      studentsWithInvoices > 0 ? Math.round((studentsFullyPaid / studentsWithInvoices) * 100) : 0;
    return {
      totalCollected: parseFloat(String(this.data?.totalCollected ?? this.data?.totalCashReceived ?? 0)) || 0,
      displayedTotal: this.getDisplayedTotalPaid(),
      transactions: this.displayedItems.length,
      average: this.getAverageTransaction(),
      collectionRate,
      outstanding: parseFloat(String(this.data?.totalOutstanding ?? 0)) || 0,
      totalInvoiced: parseFloat(String(this.data?.totalInvoiced ?? 0)) || 0,
      studentsFullyPaid,
      studentsWithInvoices,
      studentsPartiallyPaid: Number(this.data?.studentsPartiallyPaid) || 0,
      studentsUnpaid: Number(this.data?.studentsUnpaid) || 0
    };
  }

  get filterSummary(): string {
    if (!this.data) return '';
    const parts: string[] = [];
    if (this.term) parts.push(`Term: ${this.term}`);
    if (this.selectedMethod !== 'all') parts.push(`Method: ${this.selectedMethod}`);
    if (this.searchQuery) parts.push(`Search: "${this.searchQuery}"`);
    parts.push(`${this.displayedItems.length} of ${this.data?.items?.length || 0} shown`);
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
          this.availableMethods = this.buildAvailableMethods(this.data?.items);
          this.methodChips = this.buildMethodChips(this.data?.items);
          this.lastLoadedAt = new Date();
          this.applyView();
        },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to load fees collection';
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

  setSort(column: 'paymentDate' | 'studentName' | 'invoiceNumber' | 'amountPaid' | 'paymentMethod'): void {
    if (this.sortColumn === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDir = column === 'amountPaid' || column === 'paymentDate' ? 'desc' : 'asc';
    }
    this.applyView();
  }

  sortIndicator(column: 'paymentDate' | 'studentName' | 'invoiceNumber' | 'amountPaid' | 'paymentMethod'): string {
    if (this.sortColumn !== column) return '';
    return this.sortDir === 'asc' ? '▲' : '▼';
  }

  trackByReceipt(_index: number, item: any): string {
    return String(item?.id || item?.receiptNumber || _index);
  }

  getDisplayedTotalPaid(): number {
    return this.displayedItems.reduce((sum, item) => sum + (parseFloat(String(item?.amountPaid || 0)) || 0), 0);
  }

  getAverageTransaction(): number {
    if (!this.displayedItems.length) return 0;
    return this.getDisplayedTotalPaid() / this.displayedItems.length;
  }

  private buildAvailableMethods(items: any[]): string[] {
    if (!Array.isArray(items)) return [];
    const all = items
      .map((item) => String(item?.paymentMethod || '').trim())
      .filter((m) => m.length > 0);
    return [...new Set(all)].sort((a, b) => a.localeCompare(b));
  }

  private buildMethodChips(items: any[]): { method: string; count: number }[] {
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
        case 'studentName':
        default:
          return strVal(a?.studentName).localeCompare(strVal(b?.studentName)) * dir;
      }
    });

    this.displayedItems = list;
  }

  exportCsv(): void {
    const items = Array.isArray(this.displayedItems) ? this.displayedItems : [];
    if (!items.length) {
      this.showToast('Nothing to export');
      return;
    }
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Receipt', 'Date', 'Student', 'Student #', 'Invoice', 'Term', 'Amount', 'Method'];
    const lines = [header.join(',')];
    for (const r of items) {
      lines.push([
        esc(r.receiptNumber),
        esc(r.paymentDate),
        esc(r.studentName),
        esc(r.studentNumber),
        esc(r.invoiceNumber),
        esc(r.invoiceTerm),
        esc((r.amountPaid ?? 0).toFixed(2)),
        esc(r.paymentMethod)
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fees_Collection_${(this.term || 'term').replace(/\s+/g, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.showToast(`Exported ${items.length} transaction(s) to CSV`);
  }

  private mapRowsForReport(): Array<{
    paymentDate: string;
    receiptNumber: string;
    invoiceNumber: string;
    studentName: string;
    studentNumber: string;
    amountPaid: number;
    paymentMethod: string;
  }> {
    return this.displayedItems.map((r) => ({
      paymentDate: r.paymentDate || '',
      receiptNumber: r.receiptNumber || '',
      invoiceNumber: r.invoiceNumber || '',
      studentName: r.studentName || '',
      studentNumber: r.studentNumber || '',
      amountPaid: parseFloat(String(r.amountPaid ?? 0)) || 0,
      paymentMethod: r.paymentMethod || '',
    }));
  }

  previewStatement(): void {
    if (!this.displayedItems.length) return;
    this.loadingPdf = true;
    this.error = '';
    this.cdr.markForCheck();
    this.financeService
      .postCashReceiptsReportHtml({ term: this.term, rows: this.mapRowsForReport() }, true)
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
          this.showToast('Report opened in new tab. Use Print → Save as PDF to export.');
        },
        error: () => {
          this.error = 'Could not generate report.';
        },
      });
  }

  downloadStatement(): void {
    if (!this.displayedItems.length) return;
    this.downloadingPdf = true;
    this.error = '';
    this.cdr.markForCheck();
    this.financeService
      .postCashReceiptsReportHtml({ term: this.term, rows: this.mapRowsForReport() }, false)
      .pipe(
        finalize(() => {
          this.downloadingPdf = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const safe = (this.term || 'term').replace(/\s+/g, '_');
          a.download = `Fees_Collection_${safe}.html`;
          a.click();
          URL.revokeObjectURL(url);
          this.showToast('Report downloaded successfully');
        },
        error: () => {
          this.error = 'Could not download report.';
        },
      });
  }

  /** @deprecated */
  downloadPdf(): void {
    this.downloadStatement();
  }

  printReport(): void {
    if (!this.displayedItems.length) return;
    this.loadingPdf = true;
    this.error = '';
    this.cdr.markForCheck();
    this.financeService
      .postCashReceiptsReportHtml({ term: this.term, rows: this.mapRowsForReport() }, true)
      .pipe(
        finalize(() => {
          this.loadingPdf = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const w = window.open(url, '_blank');
          if (w) {
            w.addEventListener('load', () => {
              w.focus();
              w.print();
            });
          }
          setTimeout(() => URL.revokeObjectURL(url), 120000);
        },
        error: () => {
          this.error = 'Could not open print view.';
        },
      });
  }
}

import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  standalone: false,
  selector: 'app-fees-collection-report',
  templateUrl: './fees-collection-report.component.html',
  styleUrls: ['./financial-report.component.css']
})
export class FeesCollectionReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  loading = false;
  error = '';
  currencySymbol = '';
  term = '';
  availableTerms: string[] = [];
  availableMethods: string[] = [];
  selectedMethod = 'all';
  searchQuery = '';
  lastLoadedAt: Date | null = null;
  displayedItems: any[] = [];
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
    activatePageLoad(this.router, this.destroy$, '/financial-reports/fees-collection', () => this.bootstrap());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrap(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || '';
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
    if (!items.length) return;
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
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  standalone: false,  selector: 'app-outstanding-balance',
  templateUrl: './outstanding-balance.component.html',
  styleUrls: ['./outstanding-balance.component.css']
})
export class OutstandingBalanceComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];
  outstandingBalances: any[] = [];
  filteredBalances: any[] = [];
  groupedBalances: Array<{ className: string; items: any[] }> = [];
  availableClasses: string[] = [];
  loading = false;
  loadingPdf = false;
  downloadingPdf = false;
  error = '';
  searchQuery = '';
  selectedClass = 'all';
  sortDirection: 'desc' | 'asc' = 'desc';
  currencySymbol = '';
  lastLoadedAt: Date | null = null;
  private _cachedTotalOutstanding = 0;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  private readonly outstandingRoutePaths = [
    '/outstanding-balance',
    '/financial-reports/outstanding-fees'
  ];

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((query) => {
        this.searchQuery = query;
        this.applyFiltersAndGrouping();
        this.cdr.markForCheck();
      });

    const reload = () => this.bootstrapPage();
    reload();
    for (const path of this.outstandingRoutePaths) {
      activatePageLoad(this.router, this.destroy$, path, reload);
    }
  }

  private bootstrapPage(): void {
    this.loadSettings();
    this.loadOutstandingBalances();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings) {
          this.currencySymbol = settings.currencySymbol || '';
        }
      },
      error: (error) => {
        console.error('Error loading settings:', error);
      }
    });
  }

  /** Sort by invoice balance descending (largest amounts first). */
  private sortByBalance(balances: any[]): any[] {
    const dir = this.sortDirection === 'desc' ? -1 : 1;
    return [...balances].sort((a, b) => {
      const balA = parseFloat(String(a.invoiceBalance ?? 0));
      const balB = parseFloat(String(b.invoiceBalance ?? 0));
      return (balA - balB) * dir;
    });
  }

  loadOutstandingBalances(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    this.financeService
      .getOutstandingBalances()
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          const balancesArray = Array.isArray(data) ? data : [];
          const sorted = this.sortByBalance(balancesArray);
          this.outstandingBalances = sorted;
          this.availableClasses = this.extractClasses(sorted);
          this.lastLoadedAt = new Date();
          this.applyFiltersAndGrouping();
        },
        error: (error: any) => {
          this.error = error.error?.message || 'Failed to load outstanding balances';
          this.outstandingBalances = [];
          this.filteredBalances = [];
          this.groupedBalances = [];
          this.availableClasses = [];
          this.updateCachedTotal();
        }
      });
  }

  filterBalances(): void {
    this.applyFiltersAndGrouping();
  }

  private getClassName(balance: any): string {
    const cls = balance?.class || balance?.classEntity || {};
    const name = (cls?.name || balance?.className || '').toString().trim();
    return name || 'Unassigned';
  }

  private buildGroups(list: any[]): Array<{ className: string; items: any[] }> {
    const map = new Map<string, any[]>();
    list.forEach(item => {
      const name = this.getClassName(item);
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(item);
    });
    const groups = Array.from(map.entries()).map(([className, items]) => ({
      className,
      items: this.sortByBalance(items)
    }));
    return groups.sort((a, b) => a.className.localeCompare(b.className));
  }

  private extractClasses(list: any[]): string[] {
    const classes = new Set<string>();
    list.forEach((item) => classes.add(this.getClassName(item)));
    return Array.from(classes).sort((a, b) => a.localeCompare(b));
  }

  private applyFiltersAndGrouping(): void {
    const query = (this.searchQuery || '').toLowerCase().trim();
    let list = this.outstandingBalances.filter((balance) => {
      if (this.selectedClass !== 'all' && this.getClassName(balance) !== this.selectedClass) {
        return false;
      }
      if (!query) return true;
      return (
        balance.studentNumber?.toLowerCase().includes(query) ||
        balance.firstName?.toLowerCase().includes(query) ||
        balance.lastName?.toLowerCase().includes(query) ||
        balance.studentId?.toLowerCase().includes(query) ||
        balance.phoneNumber?.toLowerCase().includes(query)
      );
    });

    list = this.sortByBalance(list);
    this.filteredBalances = list;
    this.groupedBalances = this.buildGroups(list);
    this.updateCachedTotal();
  }

  private updateCachedTotal(): void {
    const balancesArray = Array.isArray(this.filteredBalances) ? this.filteredBalances : [];
    this._cachedTotalOutstanding = balancesArray.reduce((sum, balance) => {
      return sum + parseFloat(String(balance.invoiceBalance || 0));
    }, 0);
  }

  getTotalOutstanding(): number {
    return this._cachedTotalOutstanding;
  }

  previewPdf(): void {
    this.loadingPdf = true;
    this.error = '';
    this.financeService.getOutstandingBalancePDF().subscribe({
      next: (blob: Blob) => {
        this.loadingPdf = false;
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (err: any) => {
        this.loadingPdf = false;
        this.error = err?.error?.message || err?.message || 'Failed to load PDF.';
      }
    });
  }

  downloadPdf(): void {
    this.downloadingPdf = true;
    this.error = '';
    this.financeService.getOutstandingBalancePDF().subscribe({
      next: (blob: Blob) => {
        this.downloadingPdf = false;
        if (!blob || blob.size === 0) {
          this.error = 'Received empty PDF file';
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        link.download = `Outstanding_Balances_${dateStr}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (err: any) => {
        this.downloadingPdf = false;
        this.error = err?.error?.message || err?.message || 'Failed to download PDF.';
      }
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  canManageFinance(): boolean {
    return this.authService.hasRole('admin') ||
           this.authService.hasRole('superadmin') ||
           this.authService.hasRole('accountant');
  }

  payInvoice(balance: any): void {
    if (!this.canManageFinance()) {
      this.error = 'You do not have permission to record payments';
      return;
    }

    this.router.navigate(['/payments/record'], {
      queryParams: {
        studentId: balance.studentNumber || balance.studentId,
        firstName: balance.firstName,
        lastName: balance.lastName,
        balance: balance.invoiceBalance
      }
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchInput$.next('');
    this.applyFiltersAndGrouping();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedClass = 'all';
    this.sortDirection = 'desc';
    this.searchInput$.next('');
    this.applyFiltersAndGrouping();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchQuery && this.searchQuery.trim() !== '') || this.selectedClass !== 'all' || this.sortDirection !== 'desc';
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value || '');
  }

  onClassChange(value: string): void {
    this.selectedClass = value || 'all';
    this.applyFiltersAndGrouping();
  }

  onSortDirectionChange(value: string): void {
    this.sortDirection = value === 'asc' ? 'asc' : 'desc';
    this.applyFiltersAndGrouping();
  }

  exportCsv(): void {
    const items = Array.isArray(this.filteredBalances) ? this.filteredBalances : [];
    if (!items.length) return;
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Student ID', 'Last Name', 'First Name', 'Sex', 'Class', 'Phone Number', 'Student Type', 'Invoice Balance'];
    const lines = [header.join(',')];
    for (const r of items) {
      lines.push([
        esc(r.studentNumber || r.studentId),
        esc(r.lastName || ''),
        esc(r.firstName || ''),
        esc(r.gender || ''),
        esc(this.getClassName(r)),
        esc(r.phoneNumber || ''),
        esc(r.studentType || 'Day Scholar'),
        esc((parseFloat(String(r.invoiceBalance || 0)) || 0).toFixed(2))
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Outstanding_Fees_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

type OutstandingViewMode = 'table' | 'cards';

@Component({
  standalone: false,
  selector: 'app-outstanding-balance',
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
  classChips: { className: string; count: number }[] = [];
  availableClasses: string[] = [];
  loading = false;
  loadingPdf = false;
  downloadingPdf = false;
  error = '';
  success = '';
  searchQuery = '';
  selectedClass = 'all';
  sortDirection: 'desc' | 'asc' = 'desc';
  viewMode: OutstandingViewMode = 'table';
  currencySymbol = '';
  lastLoadedAt: Date | null = null;
  private _cachedTotalOutstanding = 0;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasData(): boolean {
    return this.outstandingBalances.length > 0;
  }

  get dashboardStats(): {
    totalOutstanding: number;
    students: number;
    classes: number;
    largest: number;
    average: number;
  } {
    const balances = this.filteredBalances;
    const amounts = balances.map((b) => parseFloat(String(b.invoiceBalance || 0)) || 0);
    const total = amounts.reduce((s, n) => s + n, 0);
    return {
      totalOutstanding: total,
      students: balances.length,
      classes: this.groupedBalances.length,
      largest: amounts.length ? Math.max(...amounts) : 0,
      average: amounts.length ? total / amounts.length : 0
    };
  }

  get filterSummary(): string {
    if (!this.hasData) return '';
    const parts: string[] = [];
    if (this.selectedClass !== 'all') parts.push(`Class: ${this.selectedClass}`);
    if (this.searchQuery) parts.push(`Search: "${this.searchQuery}"`);
    parts.push(`Sort: ${this.sortDirection === 'desc' ? 'highest first' : 'lowest first'}`);
    parts.push(`${this.filteredBalances.length} of ${this.outstandingBalances.length} shown`);
    return parts.join(' · ');
  }

  private bootstrapPage(): void {
    this.loadSettings();
    this.loadOutstandingBalances();
  }

  loadSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings) {
          this.currencySymbol = settings.currencySymbol || '';
          this.cdr.markForCheck();
        }
      },
      error: (err) => console.error('Error loading settings:', err)
    });
  }

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
          this.classChips = this.buildClassChips(sorted);
          this.lastLoadedAt = new Date();
          this.applyFiltersAndGrouping();
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to load outstanding balances';
          this.outstandingBalances = [];
          this.filteredBalances = [];
          this.groupedBalances = [];
          this.availableClasses = [];
          this.classChips = [];
          this.updateCachedTotal();
        }
      });
  }

  private getClassName(balance: any): string {
    const cls = balance?.class || balance?.classEntity || {};
    const name = (cls?.name || balance?.className || '').toString().trim();
    return name || 'Unassigned';
  }

  private buildGroups(list: any[]): Array<{ className: string; items: any[] }> {
    const map = new Map<string, any[]>();
    list.forEach((item) => {
      const name = this.getClassName(item);
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(item);
    });
    return Array.from(map.entries())
      .map(([className, items]) => ({
        className,
        items: this.sortByBalance(items)
      }))
      .sort((a, b) => a.className.localeCompare(b.className));
  }

  private extractClasses(list: any[]): string[] {
    const classes = new Set<string>();
    list.forEach((item) => classes.add(this.getClassName(item)));
    return Array.from(classes).sort((a, b) => a.localeCompare(b));
  }

  private buildClassChips(list: any[]): { className: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const item of list) {
      const name = this.getClassName(item);
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([className, count]) => ({ className, count }))
      .sort((a, b) => b.count - a.count || a.className.localeCompare(b.className));
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
    this._cachedTotalOutstanding = this.filteredBalances.reduce((sum, balance) => {
      return sum + (parseFloat(String(balance.invoiceBalance || 0)) || 0);
    }, 0);
  }

  getTotalOutstanding(): number {
    return this._cachedTotalOutstanding;
  }

  getGroupSubtotal(group: { items: any[] }): number {
    return group.items.reduce((sum, b) => sum + (parseFloat(String(b.invoiceBalance || 0)) || 0), 0);
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

  previewStatement(): void {
    this.loadingPdf = true;
    this.error = '';
    this.cdr.markForCheck();
    this.financeService.getOutstandingBalancePDF(true).subscribe({
      next: (blob: Blob) => {
        this.loadingPdf = false;
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.showToast('Statement opened in new tab. Use Print → Save as PDF to export.');
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.loadingPdf = false;
        this.error = err?.error?.message || err?.message || 'Failed to load statement.';
        this.cdr.markForCheck();
      }
    });
  }

  downloadStatement(): void {
    this.downloadingPdf = true;
    this.error = '';
    this.cdr.markForCheck();
    this.financeService.getOutstandingBalancePDF(false).subscribe({
      next: (blob: Blob) => {
        this.downloadingPdf = false;
        if (!blob || blob.size === 0) {
          this.error = 'Received empty statement file';
          this.cdr.markForCheck();
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Outstanding_Balances_${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.showToast('Statement downloaded successfully');
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.downloadingPdf = false;
        this.error = err?.error?.message || err?.message || 'Failed to download statement.';
        this.cdr.markForCheck();
      }
    });
  }

  /** @deprecated */
  previewPdf(): void {
    this.previewStatement();
  }

  /** @deprecated */
  downloadPdf(): void {
    this.downloadStatement();
  }

  printReport(): void {
    if (!this.filteredBalances.length) return;
    const groups = this.groupedBalances
      .map(
        (g) => `
      <h3 style="margin:16px 0 8px;color:#5b21b6">${this.escapeHtml(g.className)} (${g.items.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">
        <thead><tr style="background:#f8fafc">
          <th style="border:1px solid #e2e8f0;padding:8px">ID</th>
          <th style="border:1px solid #e2e8f0;padding:8px">Name</th>
          <th style="border:1px solid #e2e8f0;padding:8px;text-align:right">Balance</th>
        </tr></thead>
        <tbody>
          ${g.items
            .map(
              (b) => `<tr>
            <td style="border:1px solid #e2e8f0;padding:8px">${this.escapeHtml(b.studentNumber || b.studentId)}</td>
            <td style="border:1px solid #e2e8f0;padding:8px">${this.escapeHtml(b.firstName)} ${this.escapeHtml(b.lastName)}</td>
            <td style="border:1px solid #e2e8f0;padding:8px;text-align:right">${this.escapeHtml(this.currencySymbol)} ${this.formatCurrency(b.invoiceBalance)}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>`
      )
      .join('');
    const html = `<!DOCTYPE html><html><head><title>Outstanding Fees</title></head><body style="font-family:system-ui,sans-serif;padding:24px">
      <h1>Outstanding Fees</h1>
      <p style="color:#64748b">${this.filteredBalances.length} students · Total ${this.escapeHtml(this.currencySymbol)} ${this.formatCurrency(this.getTotalOutstanding())} · ${new Date().toLocaleString()}</p>
      ${groups}
    </body></html>`;
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

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  }

  canManageFinance(): boolean {
    return this.authService.isAdmin() || this.authService.hasRole('accountant');
  }

  payInvoice(balance: any): void {
    if (!this.canManageFinance()) {
      this.error = 'You do not have permission to record payments';
      return;
    }
    const params: Record<string, string> = {
      studentId: balance.studentNumber || balance.studentId,
      firstName: balance.firstName,
      lastName: balance.lastName,
      balance: String(balance.invoiceBalance ?? 0)
    };
    if (balance.invoiceId) {
      params['paymentInvoiceId'] = balance.invoiceId;
    }
    this.router.navigate(['/payments/record'], { queryParams: params });
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
    this.cdr.markForCheck();
  }

  hasActiveFilters(): boolean {
    return (
      !!(this.searchQuery && this.searchQuery.trim() !== '') ||
      this.selectedClass !== 'all' ||
      this.sortDirection !== 'desc'
    );
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value || '');
  }

  onClassChange(value: string): void {
    this.selectedClass = value || 'all';
    this.applyFiltersAndGrouping();
    this.cdr.markForCheck();
  }

  onSortDirectionChange(value: string): void {
    this.sortDirection = value === 'asc' ? 'asc' : 'desc';
    this.applyFiltersAndGrouping();
    this.cdr.markForCheck();
  }

  trackByClass(_index: number, group: { className: string }): string {
    return group.className;
  }

  trackByStudent(_index: number, balance: any): string {
    return String(
      balance?.invoiceId || balance?.id || balance?.studentId || balance?.studentNumber || _index
    );
  }

  exportCsv(): void {
    const items = Array.isArray(this.filteredBalances) ? this.filteredBalances : [];
    if (!items.length) {
      this.showToast('Nothing to export');
      return;
    }
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Student ID',
      'Last Name',
      'First Name',
      'Term',
      'Invoice #',
      'Sex',
      'Class',
      'Phone Number',
      'Student Type',
      'Invoice Balance'
    ];
    const lines = [header.join(',')];
    for (const r of items) {
      lines.push([
        esc(r.studentNumber || r.studentId),
        esc(r.lastName || ''),
        esc(r.firstName || ''),
        esc(r.term || ''),
        esc(r.invoiceNumber || ''),
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
    this.showToast(`Exported ${items.length} student(s) to CSV`);
  }
}

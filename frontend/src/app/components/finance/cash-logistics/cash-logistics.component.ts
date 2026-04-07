import { Component, OnInit, OnDestroy } from '@angular/core';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-cash-logistics',
  templateUrl: './cash-logistics.component.html',
  styleUrls: ['./cash-logistics.component.css']
})
export class CashLogisticsComponent implements OnInit, OnDestroy {
  serviceTab: 'transport' | 'dh' = 'transport';

  term = '';
  startDate = '';
  endDate = '';

  loading = false;
  error = '';
  downloadingPdf = false;

  currencySymbol = '$';
  transportRate = 0;
  dhRate = 0;

  data: any = null;
  items: any[] = [];
  availableTerms: string[] = [];

  /** Client-side filter on loaded rows */
  searchQuery = '';

  lastRefreshed: Date | null = null;
  toastMessage = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private finance: FinanceService,
    private settings: SettingsService
  ) {}

  ngOnInit(): void {
    this.settings.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || '$';
        this.transportRate = Math.round(Number(s?.feesSettings?.transportCost) || 0);
        this.dhRate = Math.round(Number(s?.feesSettings?.diningHallCost) || 0);
      }
    });
    this.load();
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  get feeType(): 'transport' | 'dh' {
    return this.serviceTab;
  }

  get tabTitle(): string {
    return this.serviceTab === 'transport'
      ? 'Transport services (day scholars)'
      : 'DH services (dining hall — day scholars; staff children / exempt 50% where applicable)';
  }

  /** Total for the active tab (all matching payment lines, settings flat amounts) */
  get totalCurrentTab(): number {
    if (!this.data) return 0;
    if (this.serviceTab === 'transport') {
      return Number(this.data.allRecordsTransportTotal ?? this.data.totalPayments ?? 0) || 0;
    }
    return Number(this.data.allRecordsDHTotal ?? this.data.totalPayments ?? 0) || 0;
  }

  get allTransportTotal(): number {
    return Number(this.data?.allRecordsTransportTotal ?? 0) || 0;
  }

  get allDHTotal(): number {
    return Number(this.data?.allRecordsDHTotal ?? 0) || 0;
  }

  get transportLineCount(): number {
    return Number(this.data?.allRecordsTransportLineCount ?? 0) || 0;
  }

  get dhLineCount(): number {
    return Number(this.data?.allRecordsDHLineCount ?? 0) || 0;
  }

  get currentTabLineCount(): number {
    return this.serviceTab === 'transport' ? this.transportLineCount : this.dhLineCount;
  }

  get filteredItems(): any[] {
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (!q) return this.items;
    return this.items.filter((row: any) => {
      const name = String(row.studentName || '').toLowerCase();
      const num = String(row.studentNumber || '').toLowerCase();
      const inv = String(row.invoiceNumber || '').toLowerCase();
      const rcpt = String(row.receiptNumber || '').toLowerCase();
      return name.includes(q) || num.includes(q) || inv.includes(q) || rcpt.includes(q);
    });
  }

  get activeTermBadge(): string {
    return this.data?.activeTerm && this.term === this.data.activeTerm ? 'Current term' : '';
  }

  get truncated(): boolean {
    return !!this.data?.cashLogisticsTruncated;
  }

  private showToast(msg: string, ms = 3200): void {
    this.toastMessage = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
      this.toastTimer = null;
    }, ms);
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const termArg = this.term?.trim() || undefined;
    this.finance
      .getCashReceipts(
        termArg,
        this.feeType,
        undefined,
        undefined,
        this.startDate?.trim() || undefined,
        this.endDate?.trim() || undefined,
        { fetchAll: true }
      )
      .subscribe({
        next: (res: any) => {
          this.data = res;
          this.items = res.items || [];
          this.availableTerms = res.availableTerms || [];
          if (!this.term && res.term) {
            this.term = res.term;
          }
          this.lastRefreshed = new Date();
          this.loading = false;
          if (this.truncated) {
            this.showToast(
              `Showing first ${res.cashLogisticsReturnedCount} of ${res.total} rows (server limit). Export or narrow dates if needed.`,
              6000
            );
          }
        },
        error: (e: any) => {
          this.error = e.error?.message || 'Failed to load logistics receipts';
          this.loading = false;
        }
      });
  }

  setTab(t: 'transport' | 'dh'): void {
    if (this.serviceTab === t) return;
    this.serviceTab = t;
    this.searchQuery = '';
    this.load();
  }

  onTermChange(): void {
    this.load();
  }

  applyFilters(): void {
    this.load();
  }

  clearDates(): void {
    this.startDate = '';
    this.endDate = '';
    this.load();
  }

  applyPreset(preset: 'month' | '30d'): void {
    const end = new Date();
    const start = new Date();
    if (preset === 'month') {
      start.setDate(1);
    } else {
      start.setDate(start.getDate() - 30);
    }
    this.startDate = start.toISOString().slice(0, 10);
    this.endDate = end.toISOString().slice(0, 10);
    this.load();
    this.showToast(`Date filter: ${preset === 'month' ? 'This month' : 'Last 30 days'}`);
  }

  downloadFullPdf(): void {
    this.downloadingPdf = true;
    this.finance.getCashReceiptsPDF(this.term?.trim() || undefined, true).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safe = (this.term || 'term').replace(/\s+/g, '_');
        a.download = `Cash_Receipts_${safe}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        this.downloadingPdf = false;
        this.showToast('PDF downloaded successfully');
      },
      error: () => {
        this.error = 'Could not download PDF.';
        this.downloadingPdf = false;
      }
    });
  }

  exportCsv(): void {
    const rows = this.filteredItems;
    if (!rows.length) {
      this.showToast('Nothing to export');
      return;
    }
    const svc = this.serviceTab === 'transport' ? 'Transport' : 'DH';
    const headers = ['#', 'Date', 'Student', 'Student No.', 'Invoice', 'Receipt', 'Method', `${svc} amount`];
    const lines = [headers.join(',')];
    rows.forEach((row: any) => {
      const idx = this.items.indexOf(row) + 1;
      const line = [
        idx,
        this.formatDate(row.paymentDate),
        `"${String(row.studentName || '').replace(/"/g, '""')}"`,
        row.studentNumber || '',
        row.invoiceNumber || '',
        row.receiptNumber || '',
        `"${String(row.paymentMethod || '').replace(/"/g, '""')}"`,
        row.amountPaid ?? 0
      ];
      lines.push(line.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logistics_${this.serviceTab}_${(this.term || 'term').replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast(`Exported ${rows.length} row(s)`);
  }

  async copyText(label: string, text: string): Promise<void> {
    const t = (text || '').trim();
    if (!t || t === '—') return;
    try {
      await navigator.clipboard.writeText(t);
      this.showToast(`${label} copied`);
    } catch {
      this.showToast('Copy not supported in this browser');
    }
  }

  formatMoney(n: number | string | undefined | null): string {
    const v = Number(n);
    if (!Number.isFinite(v)) return '0';
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  formatDate(d: string | Date | undefined): string {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString();
    } catch {
      return '—';
    }
  }

  formatTime(d: Date | null): string {
    if (!d) return '';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  paymentMethodClass(method: string | undefined): string {
    const m = (method || '').toLowerCase();
    if (m.includes('cash')) return 'cl-pill cl-pill--cash';
    if (m.includes('eco')) return 'cl-pill cl-pill--eco';
    if (m.includes('bank') || m.includes('transfer')) return 'cl-pill cl-pill--bank';
    return 'cl-pill';
  }
}

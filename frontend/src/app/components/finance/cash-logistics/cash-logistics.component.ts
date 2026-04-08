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
  page = 1;
  readonly limit = 100;

  loading = false;
  error = '';
  downloadingPdf = false;

  currencySymbol = '$';
  transportRate = 0;
  dhRate = 0;

  data: any = null;
  items: any[] = [];
  availableTerms: string[] = [];

  searchQuery = '';

  /** Drill-down: per-student attributed cash (from API). */
  showTransportBreakdown = false;
  showDhBreakdown = false;
  transportBreakdownSearch = '';
  dhBreakdownSearch = '';

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

  /** Term total from invoices or eligible students × settings (full cohort). */
  get termTransportTotal(): number {
    return Number(this.data?.logisticsTermTransportTotal ?? 0) || 0;
  }

  get termDHTotal(): number {
    return Number(this.data?.logisticsTermDHTotal ?? 0) || 0;
  }

  get transportEligibleCount(): number {
    return Number(this.data?.logisticsTransportEligibleCount ?? 0) || 0;
  }

  get dhEligibleCount(): number {
    return Number(this.data?.logisticsDHEligibleCount ?? 0) || 0;
  }

  /** Unpaid transport after sequential payment application (see API). */
  get transportUnpaidCount(): number {
    return Number(this.data?.logisticsTransportUnpaidCount ?? 0) || 0;
  }

  get dhUnpaidCount(): number {
    return Number(this.data?.logisticsDHUnpaidCount ?? 0) || 0;
  }

  get transportUnpaidAmount(): number {
    return Number(this.data?.logisticsTransportUnpaidAmount ?? 0) || 0;
  }

  get dhUnpaidAmount(): number {
    return Number(this.data?.logisticsDHUnpaidAmount ?? 0) || 0;
  }

  /** Cash payment lines attributed (flat per payment row) — for reconciliation. */
  get cashLinesTransport(): number {
    return Number(this.data?.allRecordsTransportTotal ?? 0) || 0;
  }

  get cashLinesDH(): number {
    return Number(this.data?.allRecordsDHTotal ?? 0) || 0;
  }

  get cashLineCountTransport(): number {
    return Number(this.data?.allRecordsTransportLineCount ?? 0) || 0;
  }

  get cashLineCountDH(): number {
    return Number(this.data?.allRecordsDHLineCount ?? 0) || 0;
  }

  get totalTransportReceipts(): number {
    return Number(this.data?.totalTransportReceipts ?? this.data?.allRecordsTransportTotal ?? 0) || 0;
  }

  get totalDHReceipts(): number {
    return Number(this.data?.totalDHReceipts ?? this.data?.allRecordsDHTotal ?? 0) || 0;
  }

  get transportReceiptsByStudent(): Array<{
    studentId: string;
    studentNumber: string;
    studentName: string;
    totalAttributed: number;
  }> {
    return Array.isArray(this.data?.logisticsTransportReceiptsByStudent)
      ? this.data.logisticsTransportReceiptsByStudent
      : [];
  }

  get dhReceiptsByStudent(): Array<{
    studentId: string;
    studentNumber: string;
    studentName: string;
    totalAttributed: number;
  }> {
    return Array.isArray(this.data?.logisticsDHReceiptsByStudent) ? this.data.logisticsDHReceiptsByStudent : [];
  }

  get filteredTransportBreakdown(): Array<{
    studentId: string;
    studentNumber: string;
    studentName: string;
    totalAttributed: number;
  }> {
    const q = (this.transportBreakdownSearch || '').trim().toLowerCase();
    const rows = this.transportReceiptsByStudent;
    if (!q) return rows;
    return rows.filter(
      (r) =>
        String(r.studentName || '')
          .toLowerCase()
          .includes(q) || String(r.studentNumber || '').toLowerCase().includes(q)
    );
  }

  get filteredDhBreakdown(): Array<{
    studentId: string;
    studentNumber: string;
    studentName: string;
    totalAttributed: number;
  }> {
    const q = (this.dhBreakdownSearch || '').trim().toLowerCase();
    const rows = this.dhReceiptsByStudent;
    if (!q) return rows;
    return rows.filter(
      (r) =>
        String(r.studentName || '')
          .toLowerCase()
          .includes(q) || String(r.studentNumber || '').toLowerCase().includes(q)
    );
  }

  get activeTabTermTotal(): number {
    return this.serviceTab === 'transport' ? this.termTransportTotal : this.termDHTotal;
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

  get rangeLabel(): string {
    if (!this.data?.total) return '';
    const start = (this.page - 1) * this.limit + 1;
    const end = Math.min(this.page * this.limit, this.data.total);
    return `${start}–${end}`;
  }

  get activeTermBadge(): string {
    return this.data?.activeTerm && this.term === this.data.activeTerm ? 'Current term' : '';
  }

  get truncated(): boolean {
    return !!this.data?.cashLogisticsTruncated;
  }

  rowDisplayIndex(row: any): number {
    const idx = this.items.indexOf(row);
    if (idx < 0) return 0;
    return this.allRowsMode ? idx + 1 : (this.page - 1) * this.limit + idx + 1;
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
        this.page,
        this.limit,
        this.startDate?.trim() || undefined,
        this.endDate?.trim() || undefined
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
              `List capped at ${res.cashLogisticsReturnedCount} payment line(s) (${res.total} total).`,
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
    this.page = 1;
    this.searchQuery = '';
    this.load();
  }

  onTermChange(): void {
    this.page = 1;
    this.load();
  }

  applyFilters(): void {
    this.page = 1;
    this.load();
  }

  clearDates(): void {
    this.startDate = '';
    this.endDate = '';
    this.page = 1;
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
    this.page = 1;
    this.load();
    this.showToast(`Date filter: ${preset === 'month' ? 'This month' : 'Last 30 days'}`);
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page--;
      this.load();
    }
  }

  nextPage(): void {
    const tp = this.data?.totalPages ?? 1;
    if (this.page < tp) {
      this.page++;
      this.load();
    }
  }

  goFirstPage(): void {
    if (this.page !== 1) {
      this.page = 1;
      this.load();
    }
  }

  goLastPage(): void {
    const tp = this.data?.totalPages ?? 1;
    if (this.page !== tp) {
      this.page = tp;
      this.load();
    }
  }

  /** Fetch every payment line (server cap); totals in KPIs still come from term-wide API fields. */
  loadAllRows(): void {
    this.page = 1;
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
          this.data = { ...res, _allRowsMode: true };
          this.items = res.items || [];
          this.availableTerms = res.availableTerms || [];
          this.loading = false;
          if (res.cashLogisticsTruncated) {
            this.showToast(`Showing first ${res.cashLogisticsReturnedCount} of ${res.total} payment lines.`, 5000);
          } else {
            this.showToast(`Loaded all ${this.items.length} payment line(s).`, 3000);
          }
        },
        error: (e: any) => {
          this.error = e.error?.message || 'Failed to load';
          this.loading = false;
        }
      });
  }

  exitAllRowsMode(): void {
    this.page = 1;
    this.load();
  }

  get allRowsMode(): boolean {
    return !!this.data?._allRowsMode;
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
      const idx = this.rowDisplayIndex(row);
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

  /** Logistics cash-receipt KPIs: always whole dollars (no cents in UI). */
  formatWholeDollars(n: number | string | undefined | null): string {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return '0';
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

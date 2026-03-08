import { Component, OnInit } from '@angular/core';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-cash-receipts',
  templateUrl: './cash-receipts.component.html',
  styleUrls: ['./cash-receipts.component.css']
})
export class CashReceiptsComponent implements OnInit {
  term = '';
  activeTerm: string | null = null;
  feeType = 'all';
  dateFrom = '';
  dateTo = '';
  totalPayments = 0;  // sum of PaymentLog (transaction list)
  totalCollected = 0; // sum of invoice.paidAmount — ledger figure
  totalOutstanding = 0;
  totalInvoiced = 0;
  invoicesCount = 0;
  studentsWithInvoices = 0;
  studentsFullyPaid = 0;
  studentsPartiallyPaid = 0;
  studentsUnpaid = 0;
  // Reconcile summary
  currentOutstandingLatest = 0;
  reconcileOutstandingTerm = 0;
  reconcileDifference = 0;
  reconcileStudents: Array<{
    studentId: string;
    studentNumber: string;
    studentName: string;
    earlierOutstandingTotal: number;
    earlierInvoicesCount: number;
    latestInvoiceNumber: string | null;
    latestInvoiceTerm: string | null;
    latestBalance: number | null;
  }> = [];
  showReconcileStudents = false;
  // Derived indicators
  collectionRate = 0; // %
  // Trend data (payments over time)
  trendPoints: Array<{ date: string; total: number }> = [];
  trendSvg: { points: string; dots: Array<{ cx: number; cy: number; title: string }> } = { points: '', dots: [] };
  count = 0;
  items: any[] = [];
  availableTerms: string[] = [];
  page = 1;
  limit = 50;
  total = 0;
  totalPages = 1;
  readonly limitOptions = [25, 50, 75, 100];
  currencySymbol = 'KES';
  loading = false;
  loadingPdf = false;
  downloadingPdf = false;
  error = '';
  canSelectTerm = false;
  canViewOutstanding = false;
  readonly feeTypeOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'All (Tuition + DH + Transport)' },
    { value: 'tuition', label: 'Tuition' },
    { value: 'dh', label: 'DH fee' },
    { value: 'transport', label: 'Transport fee' }
  ];

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.canSelectTerm = this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
    this.canViewOutstanding = this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
    this.loadSettings();
    this.loadCashReceipts();
  }

  loadSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings) {
          this.currencySymbol = settings.currencySymbol || 'KES';
          if (!this.term && (settings.activeTerm || settings.currentTerm)) {
            this.term = settings.activeTerm || settings.currentTerm || '';
          }
        }
      },
      error: () => {}
    });
  }

  loadCashReceipts(): void {
    this.loading = true;
    this.error = '';
    this.financeService.getCashReceipts(this.term || undefined, this.feeType, this.page, this.limit, this.dateFrom || undefined, this.dateTo || undefined).subscribe({
      next: (data: any) => {
        this.term = data.term || this.term;
        this.activeTerm = data.activeTerm ?? null;
        this.feeType = data.feeType ?? 'all';
        this.totalPayments = data.totalPayments ?? 0;
        this.totalOutstanding = data.totalOutstanding ?? 0;
        this.totalInvoiced = data.totalInvoiced ?? 0;
        // Total Collected must match outstanding-balance: use API value or derive (totalInvoiced - totalOutstanding)
        const fromApi = data.totalCollected;
        const invoiced = this.totalInvoiced;
        const outstanding = this.totalOutstanding;
        this.totalCollected =
          (typeof fromApi === 'number' && !Number.isNaN(fromApi))
            ? fromApi
            : (this.feeType === 'all' && invoiced > 0 ? Math.round((invoiced - outstanding) * 100) / 100 : (data.totalPayments ?? 0));
        this.invoicesCount = data.invoicesCount ?? 0;
        this.studentsWithInvoices = data.studentsWithInvoices ?? 0;
        this.studentsFullyPaid = data.studentsFullyPaid ?? 0;
        this.studentsPartiallyPaid = data.studentsPartiallyPaid ?? 0;
        this.studentsUnpaid = data.studentsUnpaid ?? 0;
        this.count = data.count ?? 0;
        this.items = Array.isArray(data.items) ? data.items : [];
        this.availableTerms = Array.isArray(data.availableTerms) ? data.availableTerms : [];
        this.page = data.page ?? 1;
        this.limit = data.limit ?? 50;
        this.total = data.total ?? this.count;
        this.totalPages = data.totalPages ?? 1;
        // Derived
        this.collectionRate = this.totalInvoiced > 0 ? Math.round((this.totalCollected / this.totalInvoiced) * 1000) / 10 : 0;
        this.trendPoints = this.buildTrend(this.items);
        this.trendSvg = this.buildTrendSvg(this.trendPoints);
        // Reconcile summary: latest-invoice outstanding for comparison
        this.loadReconcileSummary();
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to load cash receipts';
        this.loading = false;
        this.items = [];
        this.totalPayments = 0;
        this.totalCollected = 0;
        this.totalOutstanding = 0;
        this.totalInvoiced = 0;
        this.invoicesCount = 0;
        this.studentsWithInvoices = 0;
        this.studentsFullyPaid = 0;
        this.studentsPartiallyPaid = 0;
        this.studentsUnpaid = 0;
        this.collectionRate = 0;
        this.trendPoints = [];
        this.trendSvg = { points: '', dots: [] };
        this.currentOutstandingLatest = 0;
        this.reconcileOutstandingTerm = 0;
        this.reconcileDifference = 0;
        this.reconcileStudents = [];
        this.showReconcileStudents = false;
        this.count = 0;
        this.page = 1;
        this.total = 0;
        this.totalPages = 1;
      }
    });
  }

  onTermSelect(val: string): void {
    this.term = val;
    this.page = 1;
    this.showReconcileStudents = false;
    this.loadCashReceipts();
  }

  onFeeTypeSelect(val: string): void {
    this.feeType = val;
    this.page = 1;
    this.loadCashReceipts();
  }

  onDateFromChange(val: string): void {
    this.dateFrom = val;
    this.page = 1;
    this.loadCashReceipts();
  }

  onDateToChange(val: string): void {
    this.dateTo = val;
    this.page = 1;
    this.loadCashReceipts();
  }

  clearDateFilter(): void {
    this.dateFrom = '';
    this.dateTo = '';
    this.page = 1;
    this.loadCashReceipts();
  }

  onPageChange(p: number): void {
    if (p >= 1 && p <= this.totalPages) {
      this.page = p;
      this.loadCashReceipts();
    }
  }

  onLimitChange(l: number | string): void {
    const val = typeof l === 'string' ? parseInt(l, 10) : l;
    this.limit = Math.min(100, Math.max(1, Number.isFinite(val) ? val : 50));
    this.page = 1;
    this.loadCashReceipts();
  }

  get paginationRangeText(): string {
    if (this.total <= 0) return '0 records';
    const from = (this.page - 1) * this.limit + 1;
    const to = Math.min(this.page * this.limit, this.total);
    return `Showing ${from}–${to} of ${this.total}`;
  }

  private loadReconcileSummary(): void {
    this.financeService.getReconcileSummary(this.term || undefined).subscribe({
      next: (data: any) => {
        this.currentOutstandingLatest = data?.totalOutstandingLatest ?? 0;
        this.reconcileOutstandingTerm = data?.totalOutstandingTerm ?? this.totalOutstanding ?? 0;
        this.reconcileDifference = data?.difference ?? ((this.reconcileOutstandingTerm || 0) - (this.currentOutstandingLatest || 0));
        this.reconcileStudents = Array.isArray(data?.discrepancyStudents) ? data.discrepancyStudents : [];
      },
      error: () => {
        this.currentOutstandingLatest = 0;
        this.reconcileOutstandingTerm = 0;
        this.reconcileDifference = 0;
        this.reconcileStudents = [];
        this.showReconcileStudents = false;
      }
    });
  }

  toggleReconcileStudents(): void {
    this.showReconcileStudents = !this.showReconcileStudents;
  }

  exportReconcileStudentsCsv(): void {
    const rows = Array.isArray(this.reconcileStudents) ? this.reconcileStudents : [];
    if (rows.length === 0) return;
    const esc = (v: any) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Student Number',
      'Student Name',
      'Earlier Outstanding Total',
      'Earlier Invoices Count',
      'Latest Invoice Number',
      'Latest Invoice Term',
      'Latest Balance'
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        esc(r.studentNumber),
        esc(r.studentName),
        esc((r.earlierOutstandingTotal ?? 0).toFixed(2)),
        esc(r.earlierInvoicesCount ?? 0),
        esc(r.latestInvoiceNumber ?? ''),
        esc(r.latestInvoiceTerm ?? ''),
        esc(((r.latestBalance ?? 0) as number).toFixed(2))
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reconciliation_Students_${(this.term || 'Term').replace(/\s+/g, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  private buildTrend(items: any[]): Array<{ date: string; total: number }> {
    const byDay = new Map<string, number>();
    for (const it of items || []) {
      const d = new Date(it.paymentDate);
      if (isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10);
      const amt = parseFloat(String(it.amountPaid || 0)) || 0;
      byDay.set(key, (byDay.get(key) || 0) + amt);
    }
    const entries = Array.from(byDay.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  }

  private buildTrendSvg(points: Array<{ date: string; total: number }>): { points: string; dots: Array<{ cx: number; cy: number; title: string }> } {
    if (!points || points.length === 0) return { points: '', dots: [] };
    const width = 300;
    const height = 100;
    const pad = 5;
    const n = points.length;
    const max = points.reduce((m, p) => Math.max(m, p.total), 0) || 1;
    const stepX = n > 1 ? width / (n - 1) : 0;
    const toY = (val: number) => height - (val / max) * (height - pad * 2) - pad;
    const toX = (i: number) => n > 1 ? i * stepX : width / 2;
    const pts: string[] = [];
    const dots: Array<{ cx: number; cy: number; title: string }> = [];
    points.forEach((p, i) => {
      const x = toX(i);
      const y = toY(p.total);
      pts.push(`${x},${y}`);
      dots.push({ cx: x, cy: y, title: `${p.date} — ${this.currencySymbol} ${this.formatCurrency(p.total)}` });
    });
    return { points: pts.join(' '), dots };
  }

  clearError(): void {
    this.error = '';
  }

  getFeeTypeFilterLabel(): string {
    if (this.feeType === 'all') return '';
    const opt = this.feeTypeOptions.find(o => o.value === this.feeType);
    return opt ? ' (' + opt.label + ')' : '';
  }

  getFeeTypeStatSuffix(): string {
    if (this.feeType === 'all') return '';
    const opt = this.feeTypeOptions.find(o => o.value === this.feeType);
    return opt ? ' — ' + opt.label : '';
  }

  getCollectedBreakdownText(): string {
    if (this.feeType === 'all') {
      return 'Invoiced − Outstanding · Tuition, DH, Transport';
    }
    return 'Payments via /payments/record' + this.getFeeTypeStatSuffix();
  }

  formatDate(value: any): string {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatCurrency(value: number): string {
    return (value ?? 0).toFixed(2);
  }

  previewPdf(): void {
    if (!this.term || this.loadingPdf) return;
    this.loadingPdf = true;
    this.error = '';
    this.financeService.getCashReceiptsPDF(this.term || undefined, false).subscribe({
      next: (blob: Blob) => {
        this.loadingPdf = false;
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (err: any) => {
        this.loadingPdf = false;
        this.error = err?.error?.message || 'Failed to generate PDF preview';
      }
    });
  }

  downloadPdf(): void {
    if (!this.term || this.downloadingPdf) return;
    this.downloadingPdf = true;
    this.error = '';
    this.financeService.getCashReceiptsPDF(this.term || undefined, true).subscribe({
      next: (blob: Blob) => {
        this.downloadingPdf = false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Cash_Receipts_${(this.term || 'Report').replace(/\s+/g, '_')}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      error: (err: any) => {
        this.downloadingPdf = false;
        this.error = err?.error?.message || 'Failed to download PDF';
      }
    });
  }
}

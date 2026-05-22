import { Component, OnDestroy, OnInit, HostListener, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, interval, Subscription, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-finance-audit',
  templateUrl: './audit.component.html',
  styleUrls: ['./audit.component.css']
})
export class AuditComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly invoiceSearch$ = new Subject<string>();
  private readonly paymentSearch$ = new Subject<string>();
  private loadSeq = 0;
  private initialLoadDone = false;

  readonly skeletonRows = [0, 1, 2, 3, 4, 5];
  readonly statusOptions = [
    { value: '', label: 'All statuses' },
    { value: 'paid', label: 'Paid' },
    { value: 'partial', label: 'Partial' },
    { value: 'pending', label: 'Pending' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'void', label: 'Void' }
  ];

  loading = false;
  error = '';
  success = '';
  lastRefresh: Date | null = null;
  autoRefreshEnabled = true;
  autoRefreshSub: Subscription | null = null;
  refreshPeriodMs = 5000;
  currencySymbol = '$';

  duplicateReceipts: string[] = [];
  showAnomaliesOnly = false;
  confirmDeleteTx: any | null = null;

  mode: 'invoices' | 'payments' = 'payments';
  transactions: any[] = [];
  filtered: any[] = [];
  paged: any[] = [];
  search = '';
  statusFilter = '';
  paymentSearch = '';
  paymentMethod = '';
  paymentStartDate = '';
  paymentEndDate = '';
  page = 1;
  limit = 50;
  total = 0;
  serverTotal = 0;
  pageTotals = { paid: 0, balance: 0 };
  fullTotals = { paid: 0, balance: 0, count: 0 };
  deletingId: string | null = null;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    public authService: AuthService,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.error = '';
    this.confirmDeleteTx = null;
  }

  ngOnInit(): void {
    this.invoiceSearch$
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.mode === 'invoices') this.applyFilters();
        this.cdr.markForCheck();
      });

    this.paymentSearch$
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.mode === 'payments') this.applyPaymentFilters();
        this.cdr.markForCheck();
      });

    activatePageLoad(this.router, this.destroy$, '/finance/audit', () => this.bootstrapPage());
  }

  private bootstrapPage(): void {
    this.loadCurrency();
    this.page = 1;
    this.load(true);
  }

  private loadCurrency(): void {
    this.settingsService
      .getSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any) => {
          this.currencySymbol = data?.currencySymbol || '$';
          this.cdr.markForCheck();
        },
        error: () => {}
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.autoRefreshSub) {
      this.autoRefreshSub.unsubscribe();
      this.autoRefreshSub = null;
    }
  }

  get lastLoadedAt(): Date | null {
    return this.lastRefresh;
  }

  get displayPaged(): any[] {
    if (!this.showAnomaliesOnly) return this.paged;
    return (this.paged || []).filter((tx) => this.hasAnomaly(tx));
  }

  get filterSummary(): string {
    const parts: string[] = [];
    parts.push(this.mode === 'payments' ? 'Payment events' : 'Invoices');
    if (this.mode === 'invoices' && this.search) parts.push(`Search: "${this.search}"`);
    if (this.mode === 'payments' && this.paymentSearch) parts.push(`Search: "${this.paymentSearch}"`);
    if (this.statusFilter) parts.push(`Status: ${this.statusFilter}`);
    if (this.paymentMethod) parts.push(`Method: ${this.paymentMethod}`);
    if (this.paymentStartDate || this.paymentEndDate) {
      parts.push(`Dates: ${this.paymentStartDate || '…'} – ${this.paymentEndDate || '…'}`);
    }
    if (this.showAnomaliesOnly) parts.push('Anomalies only');
    const count = this.mode === 'payments' ? this.serverTotal : this.total;
    parts.push(`${count} record(s)`);
    return parts.join(' · ');
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  hasActiveFilters(): boolean {
    return (
      !!this.search ||
      !!this.paymentSearch ||
      !!this.statusFilter ||
      !!this.paymentMethod ||
      !!this.paymentStartDate ||
      !!this.paymentEndDate ||
      this.showAnomaliesOnly
    );
  }

  clearFilters(): void {
    this.search = '';
    this.paymentSearch = '';
    this.statusFilter = '';
    this.paymentMethod = '';
    this.paymentStartDate = '';
    this.paymentEndDate = '';
    this.showAnomaliesOnly = false;
    this.invoiceSearch$.next('');
    this.paymentSearch$.next('');
    this.page = 1;
    this.load();
  }

  onInvoiceSearchInput(value: string): void {
    this.search = value;
    this.invoiceSearch$.next(value);
  }

  onPaymentSearchInput(value: string): void {
    this.paymentSearch = value;
    this.paymentSearch$.next(value);
  }

  selectStatus(value: string): void {
    this.statusFilter = value;
    this.applyFilters();
  }

  toggleAnomaliesOnly(): void {
    this.showAnomaliesOnly = !this.showAnomaliesOnly;
    if (this.mode === 'invoices') this.applyFilters();
    this.cdr.markForCheck();
  }

  private startAutoRefresh(): void {
    if (this.autoRefreshEnabled && !this.autoRefreshSub) {
      this.autoRefreshSub = interval(this.refreshPeriodMs)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.load(false));
    }
  }

  toggleAutoRefresh(): void {
    this.autoRefreshEnabled = !this.autoRefreshEnabled;
    if (this.autoRefreshEnabled && !this.autoRefreshSub) {
      this.startAutoRefresh();
    } else if (!this.autoRefreshEnabled && this.autoRefreshSub) {
      this.autoRefreshSub.unsubscribe();
      this.autoRefreshSub = null;
    }
  }

  load(showSpinner = true): void {
    const seq = ++this.loadSeq;
    if (showSpinner) {
      this.loading = true;
      this.error = '';
      this.cdr.markForCheck();
    }
    if (this.mode === 'payments') {
      this.loadPayments(seq, showSpinner);
    } else {
      this.loadInvoices(seq, showSpinner);
    }
  }

  private loadPayments(seq: number, showSpinner: boolean): void {
    const filters = {
      search: this.paymentSearch || undefined,
      startDate: this.paymentStartDate || undefined,
      endDate: this.paymentEndDate || undefined,
      paymentMethod: this.paymentMethod || undefined
    };

    forkJoin({
      logs: this.financeService.getPaymentLogs({
        page: this.page,
        limit: this.limit,
        ...filters
      }),
      summary: this.financeService.getPaymentLogsSummary(filters).pipe(
        catchError(() => of({ sumPaid: 0, count: 0 }))
      )
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (seq !== this.loadSeq) return;
          if (showSpinner) this.loading = false;
          this.lastRefresh = new Date();
          if (!this.initialLoadDone) {
            this.initialLoadDone = true;
            this.startAutoRefresh();
          }
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ logs, summary }) => {
          if (seq !== this.loadSeq) return;
          const resp = logs as any;
          const list = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
          this.duplicateReceipts = Array.isArray(resp?.duplicates) ? resp.duplicates : [];
          this.transactions = list.map((log: any) => this.mapPaymentLog(log));
          this.serverTotal = resp?.total ?? this.transactions.length;
          this.total = this.serverTotal;
          this.filtered = this.transactions.slice();
          this.paged = this.filtered.slice(0, this.filtered.length);
          this.pageTotals.paid = (this.paged || []).reduce((sum, t) => sum + (t.paidAmount || 0), 0);
          this.pageTotals.balance = 0;
          this.fullTotals = {
            paid: (summary as any)?.sumPaid || 0,
            balance: 0,
            count: (summary as any)?.count || 0
          };
        },
        error: (err: any) => {
          if (seq !== this.loadSeq) return;
          this.error = err?.error?.message || 'Failed to load payment logs';
        }
      });
  }

  private mapPaymentLog(log: any): any {
    const student = log.student || {};
    const invoice = log.invoice || {};
    return {
      id: log.id,
      invoiceNumber: invoice.invoiceNumber || log.receiptNumber || log.invoiceId,
      status: '',
      amount: Number(invoice.amount || 0),
      paidAmount: Number(log.amountPaid || 0),
      balance: Number(invoice.balance || 0),
      previousBalance: Number(invoice.previousBalance || 0),
      prepaidAmount: 0,
      term: '',
      dueDate: null,
      createdAt: log.createdAt ? new Date(log.createdAt) : null,
      updatedAt: log.paymentDate ? new Date(log.paymentDate) : null,
      recipientName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      recipientId: log.studentId || '',
      studentNumber: student.studentNumber || '',
      paymentMethod: log.paymentMethod || 'Unknown',
      referenceNumber: log.receiptNumber || '',
      invoiceDueDate: invoice.dueDate || null,
      invoiceCreatedAt: invoice.createdAt || null
    };
  }

  private loadInvoices(seq: number, showSpinner: boolean): void {
    this.financeService
      .getInvoices(undefined, undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (seq !== this.loadSeq) return;
          if (showSpinner) this.loading = false;
          this.lastRefresh = new Date();
          if (!this.initialLoadDone) {
            this.initialLoadDone = true;
            this.startAutoRefresh();
          }
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any[]) => {
          if (seq !== this.loadSeq) return;
          const list = Array.isArray(data) ? data : [];
          this.transactions = list.map((inv: any) => {
            const student = inv.student || {};
            return {
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              status: inv.status || '',
              amount: Number(inv.amount || 0),
              paidAmount: Number(inv.paidAmount || 0),
              balance: Number(inv.balance || 0),
              previousBalance: Number(inv.previousBalance || 0),
              prepaidAmount: Number(inv.prepaidAmount || 0),
              term: inv.term || '',
              dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
              createdAt: inv.createdAt ? new Date(inv.createdAt) : null,
              updatedAt: inv.updatedAt ? new Date(inv.updatedAt) : null,
              recipientName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
              recipientId: student.id || inv.studentId || '',
              studentNumber: student.studentNumber || '',
              paymentMethod: 'Unknown',
              referenceNumber: inv.invoiceNumber
            };
          });
          this.applyFilters();
        },
        error: (err: any) => {
          if (seq !== this.loadSeq) return;
          this.error = err?.error?.message || 'Failed to load audit data';
        }
      });
  }

  applyFilters(): void {
    let arr = Array.isArray(this.transactions) ? this.transactions.slice() : [];
    const q = this.search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((t) => {
        const student = (t.recipientName || '').toLowerCase();
        const number = (t.studentNumber || '').toLowerCase();
        const invNo = (t.invoiceNumber || '').toLowerCase();
        return student.includes(q) || number.includes(q) || invNo.includes(q);
      });
    }
    if (this.statusFilter) {
      const s = this.statusFilter.toLowerCase();
      arr = arr.filter((t) => (t.status || '').toLowerCase() === s);
    }
    if (this.showAnomaliesOnly) {
      arr = arr.filter((t) => this.hasAnomaly(t));
    }
    this.filtered = arr;
    this.total = this.filtered.length;
    this.page = Math.max(1, Math.min(this.page, this.getTotalPages()));
    const start = (this.page - 1) * this.limit;
    this.paged = this.filtered.slice(start, start + this.limit);
    this.computePageTotals();
  }

  hasAnomaly(tx: any): boolean {
    if (!tx) return false;
    if (tx.paidAmount < 0 || tx.balance < 0) return true;
    const theoreticalTotal = (tx.previousBalance || 0) + (tx.amount || 0);
    if (tx.paidAmount > theoreticalTotal + 0.01) return true;
    if ((tx.status || '').toLowerCase() === 'void' && (tx.paidAmount || 0) > 0) return true;
    if (this.mode === 'payments') {
      const dupSet = new Set(this.duplicateReceipts || []);
      if (dupSet.has(String(tx.referenceNumber || ''))) return true;
      const invCreated = tx.invoiceCreatedAt ? new Date(tx.invoiceCreatedAt).getTime() : null;
      const invDue = tx.invoiceDueDate ? new Date(tx.invoiceDueDate).getTime() : null;
      const payTime = tx.updatedAt ? new Date(tx.updatedAt).getTime() : null;
      if (invCreated && payTime && payTime < invCreated) return true;
      if (invDue && payTime && payTime > invDue + 30 * 24 * 60 * 60 * 1000) return true;
      if (tx.paidAmount > theoreticalTotal * 1.1) return true;
    }
    return false;
  }

  getTotalPages(): number {
    if (!this.limit || this.limit <= 0) return 1;
    const t = this.mode === 'payments' ? this.serverTotal || 0 : this.total || 0;
    return Math.max(1, Math.ceil(t / this.limit));
  }

  goToPage(p: number): void {
    const tp = this.getTotalPages();
    this.page = Math.max(1, Math.min(p, tp));
    if (this.mode === 'payments') {
      this.load();
    } else {
      this.applyFilters();
    }
  }

  nextPage(): void {
    this.goToPage(this.page + 1);
  }

  prevPage(): void {
    this.goToPage(this.page - 1);
  }

  onChangeLimit(val: string): void {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) {
      this.limit = n;
      this.page = 1;
      if (this.mode === 'payments') {
        this.load();
      } else {
        this.applyFilters();
      }
    }
  }

  setMode(newMode: 'invoices' | 'payments'): void {
    this.mode = newMode;
    this.page = 1;
    this.showAnomaliesOnly = false;
    this.load();
  }

  applyPaymentFilters(): void {
    if (this.mode === 'payments') {
      this.page = 1;
      this.load();
    }
  }

  exportCSV(): void {
    const rows = this.displayPaged.length ? this.displayPaged : this.paged || [];
    const headersInvoices = [
      'Invoice No', 'Recipient', 'Student ID', 'Status', 'Amount', 'Paid', 'Balance',
      'Prev Balance', 'Prepaid', 'Term', 'Payment Date', 'Payment Method', 'Reference', 'Updated', 'Anomaly'
    ];
    const headersPayments = [
      'Invoice/Receipt', 'Recipient', 'Student ID', 'Paid', 'Payment Date',
      'Payment Method', 'Reference', 'Updated', 'Anomaly'
    ];
    const headers = this.mode === 'invoices' ? headersInvoices : headersPayments;
    const csvRows: string[] = [headers.join(',')];
    rows.forEach((tx: any) => {
      const anomaly = this.hasAnomaly(tx) ? 'YES' : 'NO';
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      if (this.mode === 'invoices') {
        csvRows.push(
          [
            tx.invoiceNumber,
            tx.recipientName || '',
            tx.studentNumber,
            tx.status,
            tx.amount,
            tx.paidAmount,
            tx.balance,
            tx.previousBalance,
            tx.prepaidAmount,
            tx.term || '',
            tx.updatedAt ? new Date(tx.updatedAt).toISOString().slice(0, 10) : '',
            tx.paymentMethod || '',
            tx.referenceNumber || '',
            tx.updatedAt ? new Date(tx.updatedAt).toISOString() : '',
            anomaly
          ].map(esc).join(',')
        );
      } else {
        csvRows.push(
          [
            tx.invoiceNumber,
            tx.recipientName || '',
            tx.studentNumber,
            tx.paidAmount,
            tx.updatedAt ? new Date(tx.updatedAt).toISOString().slice(0, 10) : '',
            tx.paymentMethod || '',
            tx.referenceNumber || '',
            tx.updatedAt ? new Date(tx.updatedAt).toISOString() : '',
            anomaly
          ].map(esc).join(',')
        );
      }
    });
    const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.mode === 'invoices' ? 'audit-invoices.csv' : 'audit-payments.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.success = `Exported ${rows.length} row(s) to CSV`;
    this.cdr.markForCheck();
  }

  printReport(): void {
    const rows = this.displayPaged.length ? this.displayPaged : this.paged || [];
    if (!rows.length) return;
    const headers =
      this.mode === 'invoices'
        ? '<tr><th>Invoice</th><th>Recipient</th><th>Paid</th><th>Balance</th><th>Status</th><th>Anomaly</th></tr>'
        : '<tr><th>Receipt</th><th>Recipient</th><th>Paid</th><th>Method</th><th>Anomaly</th></tr>';
    const body = rows
      .map((tx: any) => {
        const anomaly = this.hasAnomaly(tx) ? 'Yes' : 'No';
        if (this.mode === 'invoices') {
          return `<tr><td>${tx.invoiceNumber}</td><td>${tx.recipientName}</td><td>${tx.paidAmount}</td><td>${tx.balance}</td><td>${tx.status}</td><td>${anomaly}</td></tr>`;
        }
        return `<tr><td>${tx.invoiceNumber}</td><td>${tx.recipientName}</td><td>${tx.paidAmount}</td><td>${tx.paymentMethod}</td><td>${anomaly}</td></tr>`;
      })
      .join('');
    const html = `<!DOCTYPE html><html><head><title>Finance Audit</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #e2e8f0;padding:8px;font-size:12px}th{background:#f8fafc}</style></head><body>
      <h1>Finance Audit — ${this.mode}</h1><p>${this.filterSummary}</p>
      <table><thead>${headers}</thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  computePageTotals(): void {
    if (this.mode === 'payments') {
      this.pageTotals.paid = (this.paged || []).reduce((sum, t) => sum + (t.paidAmount || 0), 0);
      this.pageTotals.balance = 0;
      return;
    }
    this.pageTotals.paid = (this.paged || []).reduce((sum, t) => sum + (t.paidAmount || 0), 0);
    this.pageTotals.balance = (this.paged || []).reduce((sum, t) => sum + (t.balance || 0), 0);
    this.financeService
      .getInvoicesSummary({ status: this.statusFilter || undefined, search: this.search || undefined })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (sumResp) => {
          this.fullTotals = {
            paid: sumResp.sumPaid || 0,
            balance: sumResp.sumBalance || 0,
            count: sumResp.count || 0
          };
          this.cdr.markForCheck();
        },
        error: () => {}
      });
  }

  viewInvoicePDF(invoiceId: string): void {
    this.financeService.getInvoicePDF(invoiceId).subscribe(({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'Invoice.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  }

  viewReceiptPDF(invoiceId: string): void {
    this.financeService.getReceiptPDF(invoiceId).subscribe((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Receipt.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  }

  exportPaymentsFullCSV(): void {
    this.financeService
      .exportPaymentLogsCSV({
        search: this.paymentSearch || undefined,
        startDate: this.paymentStartDate || undefined,
        endDate: this.paymentEndDate || undefined,
        paymentMethod: this.paymentMethod || undefined
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob: Blob) => this.downloadBlob(blob, 'audit-payments-full.csv'),
        error: () => {
          this.error = 'Failed to export payment logs';
        }
      });
  }

  exportInvoicesFullCSV(): void {
    this.financeService
      .exportInvoicesCSV({
        status: this.statusFilter || undefined,
        search: this.search || undefined
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob: Blob) => this.downloadBlob(blob, 'audit-invoices-full.csv'),
        error: () => {
          this.error = 'Failed to export invoices';
        }
      });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.success = `Downloaded ${filename}`;
    this.cdr.markForCheck();
  }

  canDeletePayment(tx: any): boolean {
    if (!tx) return false;
    const methodTxt = String(tx.paymentMethod || '').trim().toLowerCase();
    const refTxt = String(tx.referenceNumber || '').trim().toLowerCase();
    if (methodTxt === 'adjustment') return false;
    if (refTxt.startsWith('adj-')) return false;
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  openDeleteConfirm(tx: any): void {
    if (!this.canDeletePayment(tx)) {
      this.error = 'This payment entry cannot be deleted.';
      return;
    }
    this.confirmDeleteTx = tx;
    this.cdr.markForCheck();
  }

  cancelDeleteConfirm(): void {
    this.confirmDeleteTx = null;
  }

  confirmDeletePayment(): void {
    const tx = this.confirmDeleteTx;
    if (!tx?.id) return;
    this.deletingId = tx.id;
    this.confirmDeleteTx = null;
    this.financeService
      .deletePaymentLog(tx.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.deletingId = null;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.success = 'Payment entry deleted.';
          this.load();
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to delete payment log';
        }
      });
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter((p) => p.length > 0);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  getAnomalyCount(): number {
    return (this.paged || []).filter((tx) => this.hasAnomaly(tx)).length;
  }

  get duplicateReceiptCount(): number {
    return this.duplicateReceipts?.length || 0;
  }

  isMethodCash(method: string): boolean {
    return (method || '').toLowerCase().includes('cash');
  }

  isMethodEcocash(method: string): boolean {
    return (method || '').toLowerCase().includes('ecocash');
  }

  isMethodBank(method: string): boolean {
    return (method || '').toLowerCase().includes('bank');
  }

  trackByTransaction(_index: number, tx: any): string {
    return tx.id || String(_index);
  }
}

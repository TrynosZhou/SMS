import { Component, OnDestroy, OnInit } from '@angular/core';
import { FinanceService } from '../../../services/finance.service';
import { AuthService } from '../../../services/auth.service';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-finance-audit',
  templateUrl: './audit.component.html',
  styleUrls: ['./audit.component.css']
})
export class AuditComponent implements OnInit, OnDestroy {
  loading = false;
  error = '';
  lastRefresh: Date | null = null;
  autoRefreshEnabled = true;
  autoRefreshSub: Subscription | null = null;
  refreshPeriodMs = 5000;

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
    public authService: AuthService
  ) {}

  canDeletePayment(tx: any): boolean {
    if (!tx) return false;
    const methodTxt = String(tx.paymentMethod || '').trim().toLowerCase();
    const refTxt = String(tx.referenceNumber || '').trim().toLowerCase();
    if (methodTxt === 'adjustment') return false;
    if (refTxt.startsWith('adj-')) return false;
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  deletePayment(tx: any) {
    if (!tx?.id) return;
    if (!this.canDeletePayment(tx)) {
      this.error = 'This payment entry cannot be deleted.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }
    if (!confirm('Delete this payment entry? This cannot be undone.')) {
      return;
    }
    this.deletingId = tx.id;
    this.financeService.deletePaymentLog(tx.id).subscribe({
      next: (resp: any) => {
        this.deletingId = null;
        this.load();
      },
      error: (err: any) => {
        this.deletingId = null;
        this.error = err?.error?.message || 'Failed to delete payment log';
        setTimeout(() => (this.error = ''), 6000);
      }
    });
  }

  ngOnInit() {
    this.load();
    if (this.autoRefreshEnabled) {
      this.autoRefreshSub = interval(this.refreshPeriodMs).subscribe(() => this.load(false));
    }
  }

  ngOnDestroy() {
    if (this.autoRefreshSub) {
      this.autoRefreshSub.unsubscribe();
      this.autoRefreshSub = null;
    }
  }

  toggleAutoRefresh() {
    this.autoRefreshEnabled = !this.autoRefreshEnabled;
    if (this.autoRefreshEnabled && !this.autoRefreshSub) {
      this.autoRefreshSub = interval(this.refreshPeriodMs).subscribe(() => this.load(false));
    } else if (!this.autoRefreshEnabled && this.autoRefreshSub) {
      this.autoRefreshSub.unsubscribe();
      this.autoRefreshSub = null;
    }
  }

  load(showSpinner: boolean = true) {
    if (showSpinner) {
      this.loading = true;
      this.error = '';
    }
    if (this.mode === 'payments') {
      this.financeService.getPaymentLogs({
        page: this.page,
        limit: this.limit,
        search: this.paymentSearch || undefined,
        startDate: this.paymentStartDate || undefined,
        endDate: this.paymentEndDate || undefined,
        paymentMethod: this.paymentMethod || undefined
      }).subscribe({
        next: (resp: any) => {
          const list = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
          const dupReceipts = Array.isArray(resp?.duplicates) ? resp.duplicates : [];
          (this as any).duplicateReceipts = dupReceipts;
          this.transactions = list.map((log: any) => {
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
          });
          this.serverTotal = resp?.total ?? this.transactions.length;
          this.total = this.serverTotal;
          this.filtered = this.transactions.slice();
          this.paged = this.filtered.slice(0, this.filtered.length);
          this.computePageTotals();
          this.financeService.getPaymentLogsSummary({
            search: this.paymentSearch || undefined,
            startDate: this.paymentStartDate || undefined,
            endDate: this.paymentEndDate || undefined,
            paymentMethod: this.paymentMethod || undefined
          }).subscribe((sumResp) => {
            this.fullTotals = { paid: sumResp.sumPaid || 0, balance: 0, count: sumResp.count || 0 };
          });
          this.lastRefresh = new Date();
          this.loading = false;
        },
        error: (err: any) => {
          this.loading = false;
          this.error = err?.error?.message || 'Failed to load payment logs';
          setTimeout(() => (this.error = ''), 5000);
        }
      });
      return;
    }
    this.financeService.getInvoices(undefined, undefined).subscribe({
      next: (data: any[]) => {
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
            // Payment method/reference are not persisted on invoice; default display
            paymentMethod: 'Unknown',
            referenceNumber: inv.invoiceNumber
          };
        });
        this.applyFilters();
        this.lastRefresh = new Date();
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load audit data';
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  applyFilters() {
    let arr = Array.isArray(this.transactions) ? this.transactions.slice() : [];
    const q = this.search.trim().toLowerCase();
    if (q) {
      arr = arr.filter(t => {
        const student = (t.recipientName || '').toLowerCase();
        const number = (t.studentNumber || '').toLowerCase();
        const invNo = (t.invoiceNumber || '').toLowerCase();
        return student.includes(q) || number.includes(q) || invNo.includes(q);
      });
    }
    if (this.statusFilter) {
      const s = this.statusFilter.toLowerCase();
      arr = arr.filter(t => (t.status || '').toLowerCase() === s);
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
    // Advanced rules for payments:
    if (this.mode === 'payments') {
      // Duplicate receipt flag if server provided duplicates
      const dupSet = new Set<string>((this as any).duplicateReceipts || []);
      if (dupSet.has(String(tx.referenceNumber || ''))) return true;
      // Payment date outside invoice window (heuristic)
      const invCreated = (tx.invoiceCreatedAt ? new Date(tx.invoiceCreatedAt).getTime() : null);
      const invDue = (tx.invoiceDueDate ? new Date(tx.invoiceDueDate).getTime() : null);
      const payTime = (tx.updatedAt ? new Date(tx.updatedAt).getTime() : null);
      if (invCreated && payTime && payTime < invCreated) return true;
      if (invDue && payTime && payTime > invDue + (30 * 24 * 60 * 60 * 1000)) return true; // 30 days after due
      // Unusually large payments vs invoice theoretical total
      if (tx.paidAmount > theoreticalTotal * 1.1) return true;
    }
    return false;
  }

  getTotalPages(): number {
    if (!this.limit || this.limit <= 0) return 1;
    const t = this.mode === 'payments' ? (this.serverTotal || 0) : (this.total || 0);
    return Math.max(1, Math.ceil(t / this.limit));
  }

  goToPage(p: number) {
    const tp = this.getTotalPages();
    this.page = Math.max(1, Math.min(p, tp));
    if (this.mode === 'payments') {
      this.load();
    } else {
      this.applyFilters();
    }
  }

  nextPage() {
    this.goToPage(this.page + 1);
  }

  prevPage() {
    this.goToPage(this.page - 1);
  }

  onChangeLimit(val: string) {
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

  setMode(newMode: 'invoices' | 'payments') {
    this.mode = newMode;
    this.page = 1;
    this.load();
  }

  applyPaymentFilters() {
    if (this.mode === 'payments') {
      this.page = 1;
      this.load();
    }
  }

  exportCSV() {
    const rows = this.paged || [];
    const headersInvoices = ['Invoice No','Recipient','Student ID','Status','Amount','Paid','Balance','Prev Balance','Prepaid','Term','Payment Date','Payment Method','Reference','Updated','Anomaly'];
    const headersPayments = ['Invoice/Receipt','Recipient','Student ID','Paid','Payment Date','Payment Method','Reference','Updated','Anomaly'];
    const headers = this.mode === 'invoices' ? headersInvoices : headersPayments;
    const csvRows: string[] = [];
    csvRows.push(headers.join(','));
    rows.forEach((tx: any) => {
      const anomaly = this.hasAnomaly(tx) ? 'YES' : 'NO';
      if (this.mode === 'invoices') {
        csvRows.push([
          tx.invoiceNumber,
          (tx.recipientName || '').replace(/,/g,' '),
          tx.studentNumber,
          tx.status,
          String(tx.amount ?? 0),
          String(tx.paidAmount ?? 0),
          String(tx.balance ?? 0),
          String(tx.previousBalance ?? 0),
          String(tx.prepaidAmount ?? 0),
          tx.term || '',
          tx.updatedAt ? new Date(tx.updatedAt).toISOString().slice(0,10) : '',
          tx.paymentMethod || '',
          tx.referenceNumber || '',
          tx.updatedAt ? new Date(tx.updatedAt).toISOString() : '',
          anomaly
        ].join(','));
      } else {
        csvRows.push([
          tx.invoiceNumber,
          (tx.recipientName || '').replace(/,/g,' '),
          tx.studentNumber,
          String(tx.paidAmount ?? 0),
          tx.updatedAt ? new Date(tx.updatedAt).toISOString().slice(0,10) : '',
          tx.paymentMethod || '',
          tx.referenceNumber || '',
          tx.updatedAt ? new Date(tx.updatedAt).toISOString() : '',
          anomaly
        ].join(','));
      }
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.mode === 'invoices' ? 'audit-invoices.csv' : 'audit-payments.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  computePageTotals() {
    if (this.mode === 'payments') {
      this.pageTotals.paid = (this.paged || []).reduce((sum, t) => sum + (t.paidAmount || 0), 0);
      this.pageTotals.balance = 0;
      return;
    }
    this.pageTotals.paid = (this.paged || []).reduce((sum, t) => sum + (t.paidAmount || 0), 0);
    this.pageTotals.balance = (this.paged || []).reduce((sum, t) => sum + (t.balance || 0), 0);
    // Fetch full totals for invoices
    this.financeService.getInvoicesSummary({ status: this.statusFilter || undefined, search: this.search || undefined }).subscribe((sumResp) => {
      this.fullTotals = { paid: sumResp.sumPaid || 0, balance: sumResp.sumBalance || 0, count: sumResp.count || 0 };
    });
  }

  viewInvoicePDF(invoiceId: string) {
    this.financeService.getInvoicePDF(invoiceId).subscribe(({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'Invoice.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    });
  }

  viewReceiptPDF(invoiceId: string) {
    this.financeService.getReceiptPDF(invoiceId).subscribe((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Receipt.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    });
  }

  exportPaymentsFullCSV() {
    this.financeService.exportPaymentLogsCSV({
      search: this.paymentSearch || undefined,
      startDate: this.paymentStartDate || undefined,
      endDate: this.paymentEndDate || undefined,
      paymentMethod: this.paymentMethod || undefined
    }).subscribe((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-payments.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    });
  }

  exportInvoicesFullCSV() {
    this.financeService.exportInvoicesCSV({
      status: this.statusFilter || undefined,
      search: this.search || undefined
    }).subscribe((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-invoices.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    });
  }
}

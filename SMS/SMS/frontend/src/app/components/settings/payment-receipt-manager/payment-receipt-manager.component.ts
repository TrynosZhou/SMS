import { Component, OnInit } from '@angular/core';
import { FinanceService } from '../../../services/finance.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-payment-receipt-manager',
  templateUrl: './payment-receipt-manager.component.html',
  styleUrls: ['./payment-receipt-manager.component.css']
})
export class PaymentReceiptManagerComponent implements OnInit {
  loading = false;
  error = '';

  paymentLogs: any[] = [];
  page = 1;
  limit = 50;
  total = 0;

  search = '';
  paymentMethod = '';
  startDate = '';
  endDate = '';

  deletingId: string | null = null;

  constructor(
    private financeService: FinanceService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.financeService.getPaymentLogs({
      page: this.page,
      limit: this.limit,
      search: this.search || undefined,
      startDate: this.startDate || undefined,
      endDate: this.endDate || undefined,
      paymentMethod: this.paymentMethod || undefined
    }).subscribe({
      next: (resp: any) => {
        this.paymentLogs = Array.isArray(resp?.data) ? resp.data : [];
        this.total = Number(resp?.total ?? this.paymentLogs.length);
        this.loading = false;
      },
      error: (err: any) => {
        this.paymentLogs = [];
        this.total = 0;
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load payment logs';
      }
    });
  }

  onApplyFilters(): void {
    this.page = 1;
    this.load();
  }

  onChangeLimit(newLimit: number): void {
    this.limit = Number(newLimit || 50);
    this.page = 1;
    this.load();
  }

  getTotalPages(): number {
    return Math.max(1, Math.ceil((this.total || 0) / (this.limit || 1)));
  }

  prevPage(): void {
    if (this.page <= 1) return;
    this.page -= 1;
    this.load();
  }

  nextPage(): void {
    const totalPages = this.getTotalPages();
    if (this.page >= totalPages) return;
    this.page += 1;
    this.load();
  }

  canDeleteLog(log: any): boolean {
    if (!log) return false;
    if (!(this.authService.hasRole('admin') || this.authService.hasRole('superadmin'))) return false;
    const methodTxt = String(log.paymentMethod || '').trim().toLowerCase();
    const notesTxt = String(log.notes || '').trim().toLowerCase();
    if (methodTxt === 'adjustment') return false;
    if (notesTxt.includes('desk fee') || notesTxt.includes('status correction') || notesTxt.includes('reversal')) return false;
    return true;
  }

  deleteLog(log: any): void {
    if (!log?.id) return;
    if (!this.canDeleteLog(log)) {
      this.error = 'This payment entry cannot be deleted.';
      setTimeout(() => (this.error = ''), 6000);
      return;
    }
    if (!confirm('Delete this payment entry? This cannot be undone.')) return;

    this.deletingId = log.id;
    this.financeService.deletePaymentLog(log.id).subscribe({
      next: () => {
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
}

import { Component, OnInit, HostListener } from '@angular/core';
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
  success = '';

  paymentLogs: any[] = [];
  page = 1;
  limit = 50;
  total = 0;

  search = '';
  paymentMethod = '';
  startDate = '';
  endDate = '';

  deletingId: string | null = null;
  
  // Modal states
  showDetailsModal = false;
  selectedLog: any = null;
  showDeleteModal = false;
  logToDelete: any = null;

  constructor(
    private financeService: FinanceService,
    public authService: AuthService
  ) {}

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.showDeleteModal) {
      this.cancelDelete();
    } else if (this.showDetailsModal) {
      this.closeDetailsModal();
    }
  }

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

  hasActiveFilters(): boolean {
    return !!(this.search || this.paymentMethod || this.startDate || this.endDate);
  }

  clearFilters(): void {
    this.search = '';
    this.paymentMethod = '';
    this.startDate = '';
    this.endDate = '';
    this.page = 1;
    this.load();
  }

  // Stats helpers
  getTotalAmount(): number {
    return this.paymentLogs.reduce((sum, log) => sum + (Number(log.amountPaid) || 0), 0);
  }

  getCashCount(): number {
    return this.paymentLogs.filter(log => this.isMethodCash(log)).length;
  }

  getEcocashCount(): number {
    return this.paymentLogs.filter(log => this.isMethodEcocash(log)).length;
  }

  // Method helpers
  isMethodCash(log: any): boolean {
    return String(log.paymentMethod || '').toLowerCase().includes('cash');
  }

  isMethodEcocash(log: any): boolean {
    return String(log.paymentMethod || '').toLowerCase().includes('ecocash');
  }

  isMethodBank(log: any): boolean {
    return String(log.paymentMethod || '').toLowerCase().includes('bank');
  }

  isMethodAdjustment(log: any): boolean {
    return String(log.paymentMethod || '').toLowerCase() === 'adjustment';
  }

  getMethodIcon(log: any): string {
    if (this.isMethodCash(log)) return '💵';
    if (this.isMethodEcocash(log)) return '📱';
    if (this.isMethodBank(log)) return '🏦';
    if (this.isMethodAdjustment(log)) return '⚙️';
    return '💳';
  }

  getStudentInitial(log: any): string {
    const first = (log.student?.firstName || '').charAt(0).toUpperCase();
    const last = (log.student?.lastName || '').charAt(0).toUpperCase();
    return first + last || '?';
  }

  // Pagination
  getTotalPages(): number {
    return Math.max(1, Math.ceil((this.total || 0) / (this.limit || 1)));
  }

  getStartRecord(): number {
    return Math.min((this.page - 1) * this.limit + 1, this.total);
  }

  getEndRecord(): number {
    return Math.min(this.page * this.limit, this.total);
  }

  getPageNumbers(): number[] {
    const totalPages = this.getTotalPages();
    const pages: number[] = [];
    const maxVisible = 5;
    
    let start = Math.max(1, this.page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
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

  goToPage(p: number): void {
    if (p < 1 || p > this.getTotalPages() || p === this.page) return;
    this.page = p;
    this.load();
  }

  goToFirstPage(): void {
    if (this.page === 1) return;
    this.page = 1;
    this.load();
  }

  goToLastPage(): void {
    const totalPages = this.getTotalPages();
    if (this.page === totalPages) return;
    this.page = totalPages;
    this.load();
  }

  // Delete functionality
  canDeleteLog(log: any): boolean {
    if (!log) return false;
    if (!(this.authService.hasRole('admin') || this.authService.hasRole('superadmin'))) return false;
    const methodTxt = String(log.paymentMethod || '').trim().toLowerCase();
    const notesTxt = String(log.notes || '').trim().toLowerCase();
    if (methodTxt === 'adjustment') return false;
    if (notesTxt.includes('desk fee') || notesTxt.includes('status correction') || notesTxt.includes('reversal')) return false;
    return true;
  }

  confirmDelete(log: any): void {
    if (!log?.id || !this.canDeleteLog(log)) {
      this.error = 'This payment entry cannot be deleted.';
      setTimeout(() => this.error = '', 5000);
      return;
    }
    this.logToDelete = log;
    this.showDeleteModal = true;
  }

  cancelDelete(): void {
    this.showDeleteModal = false;
    this.logToDelete = null;
  }

  deleteLog(): void {
    if (!this.logToDelete?.id) return;

    this.deletingId = this.logToDelete.id;
    this.financeService.deletePaymentLog(this.logToDelete.id).subscribe({
      next: () => {
        this.success = 'Payment entry deleted successfully.';
        this.deletingId = null;
        this.showDeleteModal = false;
        this.logToDelete = null;
        this.load();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.deletingId = null;
        this.error = err?.error?.message || 'Failed to delete payment log';
        setTimeout(() => this.error = '', 6000);
      }
    });
  }

  // View details
  viewDetails(log: any): void {
    this.selectedLog = log;
    this.showDetailsModal = true;
  }

  closeDetailsModal(): void {
    this.showDetailsModal = false;
    this.selectedLog = null;
  }

  viewNotes(log: any): void {
    this.viewDetails(log);
  }

  // Export
  exportToCSV(): void {
    if (this.paymentLogs.length === 0) return;

    const headers = ['Student Name', 'Student ID', 'Amount', 'Payment Date', 'Method', 'Receipt #', 'Notes'];
    const rows = this.paymentLogs.map(log => [
      `${log.student?.firstName || ''} ${log.student?.lastName || ''}`.trim(),
      log.student?.studentNumber || '',
      (log.amountPaid || 0).toFixed(2),
      log.paymentDate ? new Date(log.paymentDate).toLocaleDateString() : '',
      log.paymentMethod || '',
      log.receiptNumber || '',
      (log.notes || '').replace(/"/g, '""')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `payment-logs-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.success = 'CSV exported successfully!';
    setTimeout(() => this.success = '', 3000);
  }
}

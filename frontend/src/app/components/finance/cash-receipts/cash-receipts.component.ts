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
  totalCashReceived = 0;
  totalCharged = 0;
  totalUnpaid = 0;
  totalPrepaid = 0;
  collectedTowardInvoices = 0;
  receiptVsCollectedDiff = 0;
  count = 0;
  items: any[] = [];
  availableTerms: string[] = [];
  currencySymbol = 'KES';
  loading = false;
  loadingPdf = false;
  downloadingPdf = false;
  error = '';
  canSelectTerm = false;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.canSelectTerm = this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
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
    this.financeService.getCashReceipts(this.term || undefined).subscribe({
      next: (data: any) => {
        this.term = data.term || this.term;
        this.activeTerm = data.activeTerm ?? null;
        this.totalCashReceived = data.totalCashReceived ?? 0;
        this.totalCharged = data.totalCharged ?? 0;
        this.totalUnpaid = data.totalUnpaid ?? 0;
        this.totalPrepaid = data.totalPrepaid ?? 0;
        this.collectedTowardInvoices = data.collectedTowardInvoices ?? 0;
        this.receiptVsCollectedDiff = data.receiptVsCollectedDiff ?? 0;
        this.count = data.count ?? 0;
        this.items = Array.isArray(data.items) ? data.items : [];
        this.availableTerms = Array.isArray(data.availableTerms) ? data.availableTerms : [];
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to load cash receipts';
        this.loading = false;
        this.items = [];
        this.totalCashReceived = 0;
        this.totalCharged = 0;
        this.totalUnpaid = 0;
        this.totalPrepaid = 0;
        this.collectedTowardInvoices = 0;
        this.receiptVsCollectedDiff = 0;
        this.count = 0;
      }
    });
  }

  onTermChange(): void {
    this.loadCashReceipts();
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

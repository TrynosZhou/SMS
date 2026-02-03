import { Component, OnInit } from '@angular/core';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-view-balances',
  templateUrl: './view-balances.component.html',
  styleUrls: ['./view-balances.component.css']
})
export class ViewBalancesComponent implements OnInit {
  balances: any[] = [];
  loading = false;
  error = '';
  currencySymbol = 'KES';
  loadingPdf = false;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService
  ) { }

  ngOnInit(): void {
    this.loadSettings();
    this.loadBalances();
  }

  loadSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings) {
          this.currencySymbol = settings.currencySymbol || 'KES';
        }
      },
      error: () => {}
    });
  }

  loadBalances(): void {
    this.loading = true;
    this.error = '';
    this.financeService.getOutstandingBalances().subscribe({
      next: (data: any) => {
        const arr = Array.isArray(data) ? data : [];
        this.balances = [...arr].sort((a, b) => {
          const balA = parseFloat(String(a.invoiceBalance ?? 0));
          const balB = parseFloat(String(b.invoiceBalance ?? 0));
          return balB - balA;
        });
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to load outstanding invoices';
        this.loading = false;
        this.balances = [];
      }
    });
  }

  getFullName(row: any): string {
    const last = (row.lastName || '').trim();
    const first = (row.firstName || '').trim();
    return [last, first].filter(Boolean).join(', ') || '—';
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  getTotalOutstanding(): number {
    if (!this.balances || this.balances.length === 0) return 0;
    return this.balances.reduce((s, r) => s + parseFloat(String(r.invoiceBalance || 0)), 0);
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
}

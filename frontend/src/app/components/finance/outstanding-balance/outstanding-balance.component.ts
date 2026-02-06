import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-outstanding-balance',
  templateUrl: './outstanding-balance.component.html',
  styleUrls: ['./outstanding-balance.component.css']
})
export class OutstandingBalanceComponent implements OnInit {
  outstandingBalances: any[] = [];
  filteredBalances: any[] = [];
  loading = false;
  loadingPdf = false;
  downloadingPdf = false;
  error = '';
  searchQuery = '';
  currencySymbol = 'KES';
  private _cachedTotalOutstanding = 0;

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private router: Router,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.loadSettings();
    this.loadOutstandingBalances();
  }

  loadSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (settings) {
          this.currencySymbol = settings.currencySymbol || 'KES';
        }
      },
      error: (error) => {
        console.error('Error loading settings:', error);
      }
    });
  }

  /** Sort by invoice balance descending (largest amounts first). */
  private sortByBalanceDesc(balances: any[]): any[] {
    return [...balances].sort((a, b) => {
      const balA = parseFloat(String(a.invoiceBalance ?? 0));
      const balB = parseFloat(String(b.invoiceBalance ?? 0));
      return balB - balA;
    });
  }

  loadOutstandingBalances(): void {
    this.loading = true;
    this.error = '';
    
    this.financeService.getOutstandingBalances().subscribe({
      next: (data: any) => {
        const balancesArray = Array.isArray(data) ? data : [];
        const sorted = this.sortByBalanceDesc(balancesArray);
        this.outstandingBalances = sorted;
        this.filteredBalances = sorted;
        this.updateCachedTotal();
        this.loading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load outstanding balances';
        this.loading = false;
        this.outstandingBalances = [];
        this.filteredBalances = [];
        this.updateCachedTotal();
      }
    });
  }

  filterBalances(): void {
    let list: any[];
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      list = this.outstandingBalances;
    } else {
      const query = this.searchQuery.toLowerCase().trim();
      list = this.outstandingBalances.filter(balance => {
        return (
          balance.studentNumber?.toLowerCase().includes(query) ||
          balance.firstName?.toLowerCase().includes(query) ||
          balance.lastName?.toLowerCase().includes(query) ||
          balance.studentId?.toLowerCase().includes(query) ||
          balance.phoneNumber?.toLowerCase().includes(query)
        );
      });
    }
    this.filteredBalances = this.sortByBalanceDesc(list);
    this.updateCachedTotal();
  }
  
  private updateCachedTotal(): void {
    const balancesArray = Array.isArray(this.filteredBalances) ? this.filteredBalances : [];
    this._cachedTotalOutstanding = balancesArray.reduce((sum, balance) => {
      return sum + parseFloat(String(balance.invoiceBalance || 0));
    }, 0);
  }

  getTotalOutstanding(): number {
    return this._cachedTotalOutstanding;
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

  downloadPdf(): void {
    this.downloadingPdf = true;
    this.error = '';
    this.financeService.getOutstandingBalancePDF().subscribe({
      next: (blob: Blob) => {
        this.downloadingPdf = false;
        if (!blob || blob.size === 0) {
          this.error = 'Received empty PDF file';
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        link.download = `Outstanding_Balances_${dateStr}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (err: any) => {
        this.downloadingPdf = false;
        this.error = err?.error?.message || err?.message || 'Failed to download PDF.';
      }
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  canManageFinance(): boolean {
    return this.authService.hasRole('admin') || 
           this.authService.hasRole('superadmin') || 
           this.authService.hasRole('accountant');
  }

  payInvoice(balance: any): void {
    if (!this.canManageFinance()) {
      this.error = 'You do not have permission to record payments';
      return;
    }

    // Navigate to payments/record page with student ID as query parameter
    this.router.navigate(['/payments/record'], {
      queryParams: {
        studentId: balance.studentNumber || balance.studentId,
        firstName: balance.firstName,
        lastName: balance.lastName,
        balance: balance.invoiceBalance
      }
    });
  }

  getAverageBalance(): string {
    if (this.filteredBalances.length === 0) {
      return this.currencySymbol + ' 0.00';
    }
    const average = this.getTotalOutstanding() / this.filteredBalances.length;
    return this.currencySymbol + ' ' + this.formatCurrency(average);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filterBalances();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.filterBalances();
  }

  hasActiveFilters(): boolean {
    return !!(this.searchQuery && this.searchQuery.trim() !== '');
  }
}


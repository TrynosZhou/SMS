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
  error = '';
  searchQuery = '';
  currencySymbol = 'KES';

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

  loadOutstandingBalances(): void {
    this.loading = true;
    this.error = '';
    
    this.financeService.getOutstandingBalances().subscribe({
      next: (data: any) => {
        this.outstandingBalances = data;
        this.filteredBalances = data;
        this.loading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load outstanding balances';
        this.loading = false;
        this.outstandingBalances = [];
        this.filteredBalances = [];
      }
    });
  }

  filterBalances(): void {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      this.filteredBalances = this.outstandingBalances;
      return;
    }

    const query = this.searchQuery.toLowerCase().trim();
    this.filteredBalances = this.outstandingBalances.filter(balance => {
      return (
        balance.studentNumber?.toLowerCase().includes(query) ||
        balance.firstName?.toLowerCase().includes(query) ||
        balance.lastName?.toLowerCase().includes(query) ||
        balance.studentId?.toLowerCase().includes(query) ||
        balance.phoneNumber?.toLowerCase().includes(query)
      );
    });
  }

  getTotalOutstanding(): number {
    return this.filteredBalances.reduce((sum, balance) => {
      return sum + parseFloat(String(balance.invoiceBalance || 0));
    }, 0);
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
}


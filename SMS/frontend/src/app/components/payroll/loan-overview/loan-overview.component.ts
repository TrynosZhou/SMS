import { Component } from '@angular/core';
import { PayrollService } from '../../../services/payroll.service';

@Component({
  selector: 'app-loan-overview',
  templateUrl: './loan-overview.component.html',
  styleUrls: ['./loan-overview.component.css']
})
export class LoanOverviewComponent {
  error = '';
  success = '';

  /** Create loan modal (same as dashboard) */
  createLoanModalOpen = false;
  createSearchQuery = '';
  createSearchResults: any[] = [];
  createSearching = false;
  createSelectedEmployee: { type: 'teacher' | 'ancillary'; id: string; name: string; employeeId: string } | null = null;
  createPrincipal: number | null = null;
  createTenure: 1 | 2 | 3 = 1;
  createSubmitting = false;

  /** Balance lookup */
  balanceSearchQuery = '';
  balanceSearchResults: any[] = [];
  balanceSearching = false;
  balanceSelectedEmployee: { type: string; id: string; name: string; employeeId: string } | null = null;
  balanceLoading = false;
  balanceValue: number | null = null;

  /** Loan history */
  historySearchQuery = '';
  historySearchResults: any[] = [];
  historySearching = false;
  historySelectedEmployee: { type: string; id: string; name: string; employeeId: string } | null = null;
  historyLoading = false;
  historyData: { schedules: any[]; deductions: any[] } | null = null;

  monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  constructor(private payrollService: PayrollService) {}

  openCreateLoanModal(): void {
    this.createLoanModalOpen = true;
    this.createSearchQuery = '';
    this.createSearchResults = [];
    this.createSelectedEmployee = null;
    this.createPrincipal = null;
    this.createTenure = 1;
    this.createSubmitting = false;
    this.error = '';
    this.success = '';
  }

  closeCreateLoanModal(): void {
    this.createLoanModalOpen = false;
  }

  searchCreateEmployee(): void {
    const q = (this.createSearchQuery || '').trim();
    if (!q) {
      this.createSearchResults = [];
      return;
    }
    this.createSearching = true;
    this.createSearchResults = [];
    this.createSelectedEmployee = null;
    this.payrollService.searchPayrollEmployees(q).subscribe({
      next: (list) => {
        this.createSearchResults = (list || []).map((e: any) => ({
          type: e.type,
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          employeeId: e.teacherId || e.employeeId
        }));
        this.createSearching = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Search failed';
        this.createSearching = false;
      }
    });
  }

  selectCreateEmployee(emp: any): void {
    const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
    this.createSelectedEmployee = {
      type: emp.type,
      id: emp.id,
      name: name || emp.employeeId || '—',
      employeeId: emp.employeeId
    };
  }

  clearCreateSelection(): void {
    this.createSelectedEmployee = null;
    this.createPrincipal = null;
  }

  submitCreateLoan(): void {
    if (!this.createSelectedEmployee || this.createPrincipal == null || this.createPrincipal <= 0) {
      this.error = 'Select an employee and enter principal amount';
      return;
    }
    this.createSubmitting = true;
    this.error = '';
    const payload: any = {
      principal: Number(this.createPrincipal),
      repaymentMonths: this.createTenure
    };
    if (this.createSelectedEmployee.type === 'teacher') {
      payload.teacherId = this.createSelectedEmployee.id;
    } else {
      payload.ancillaryStaffId = this.createSelectedEmployee.id;
    }
    this.payrollService.createLoan(payload).subscribe({
      next: () => {
        this.success = 'Loan added to employee account.';
        this.createSubmitting = false;
        this.clearCreateSelection();
        setTimeout(() => { this.success = ''; }, 4000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to add loan';
        this.createSubmitting = false;
      }
    });
  }

  /** Balance: search */
  searchBalance(): void {
    const q = (this.balanceSearchQuery || '').trim();
    if (!q) {
      this.balanceSearchResults = [];
      this.balanceValue = null;
      this.balanceSelectedEmployee = null;
      return;
    }
    this.balanceSearching = true;
    this.balanceSearchResults = [];
    this.balanceSelectedEmployee = null;
    this.balanceValue = null;
    this.payrollService.searchPayrollEmployees(q).subscribe({
      next: (list) => {
        this.balanceSearchResults = (list || []).map((e: any) => ({
          type: e.type,
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          employeeId: e.teacherId || e.employeeId
        }));
        this.balanceSearching = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Search failed';
        this.balanceSearching = false;
      }
    });
  }

  selectBalanceEmployee(emp: any): void {
    const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
    this.balanceSelectedEmployee = {
      type: emp.type,
      id: emp.id,
      name: name || emp.employeeId || '—',
      employeeId: emp.employeeId
    };
    this.balanceValue = null;
    this.fetchBalance();
  }

  fetchBalance(): void {
    if (!this.balanceSelectedEmployee) return;
    this.balanceLoading = true;
    const params = this.balanceSelectedEmployee.type === 'teacher'
      ? { teacherId: this.balanceSelectedEmployee.id }
      : { ancillaryStaffId: this.balanceSelectedEmployee.id };
    this.payrollService.getLoanBalance(
      this.balanceSelectedEmployee.type === 'teacher' ? this.balanceSelectedEmployee.id : undefined,
      this.balanceSelectedEmployee.type === 'ancillary' ? this.balanceSelectedEmployee.id : undefined
    ).subscribe({
      next: (res) => {
        this.balanceValue = res.balance ?? 0;
        this.balanceLoading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load balance';
        this.balanceLoading = false;
      }
    });
  }

  clearBalanceSelection(): void {
    this.balanceSelectedEmployee = null;
    this.balanceValue = null;
  }

  /** History: search */
  searchHistory(): void {
    const q = (this.historySearchQuery || '').trim();
    if (!q) {
      this.historySearchResults = [];
      this.historySelectedEmployee = null;
      this.historyData = null;
      return;
    }
    this.historySearching = true;
    this.historySearchResults = [];
    this.historySelectedEmployee = null;
    this.historyData = null;
    this.payrollService.searchPayrollEmployees(q).subscribe({
      next: (list) => {
        this.historySearchResults = (list || []).map((e: any) => ({
          type: e.type,
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          employeeId: e.teacherId || e.employeeId
        }));
        this.historySearching = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Search failed';
        this.historySearching = false;
      }
    });
  }

  selectHistoryEmployee(emp: any): void {
    const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
    this.historySelectedEmployee = {
      type: emp.type,
      id: emp.id,
      name: name || emp.employeeId || '—',
      employeeId: emp.employeeId
    };
    this.historyData = null;
    this.fetchHistory();
  }

  fetchHistory(): void {
    if (!this.historySelectedEmployee) return;
    this.historyLoading = true;
    this.payrollService.getLoanHistory(
      this.historySelectedEmployee.type === 'teacher' ? this.historySelectedEmployee.id : undefined,
      this.historySelectedEmployee.type === 'ancillary' ? this.historySelectedEmployee.id : undefined
    ).subscribe({
      next: (data) => {
        this.historyData = data;
        this.historyLoading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load history';
        this.historyLoading = false;
      }
    });
  }

  clearHistorySelection(): void {
    this.historySelectedEmployee = null;
    this.historyData = null;
  }

  getRunLabel(month: number, year: number): string {
    return `${this.monthNames[month] || month} ${year}`;
  }
}

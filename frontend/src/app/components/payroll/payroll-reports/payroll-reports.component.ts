import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { PayrollService } from '../../../services/payroll.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  standalone: false,  selector: 'app-payroll-reports',
  templateUrl: './payroll-reports.component.html',
  styleUrls: ['./payroll-reports.component.css']
})
export class PayrollReportsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
reportType: 'monthly_summary' | 'deduction_summary' | 'department_summary' = 'monthly_summary';
  month = new Date().getMonth() + 1;
  year = new Date().getFullYear();
  loading = false;
  error = '';
  report: any = null;
  currencySymbol = 'KES';
  monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  constructor(
    private payrollService: PayrollService,
    private settingsService: SettingsService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    activatePageLoad(this.router, this.destroy$, '/payroll/reports', () => this.bootstrapPage());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapPage(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || 'KES';
        this.cdr.markForCheck();
        this.loadReport();
      },
      error: () => {
        this.loadReport();
      }
});
  }

  loadReport() {
    this.loading = true;
    this.error = '';
    this.report = null;
    this.cdr.markForCheck();
    this.payrollService
      .getReports(this.reportType, this.month, this.year)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data) => {
          this.report = data;
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load report';
        }
      });
}

  getDepartmentKeys(): string[] {
    if (!this.report?.byDepartment) return [];
    return Object.keys(this.report.byDepartment);
  }

  getDeductionKeys(): string[] {
    if (!this.report?.byComponent) return [];
    return Object.keys(this.report.byComponent);
  }

  get reportTitle(): string {
    if (this.reportType === 'monthly_summary') return 'Monthly Summary';
    if (this.reportType === 'deduction_summary') return 'Deduction Summary';
    return 'Department Report';
  }
}

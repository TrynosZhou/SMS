import { Component, OnInit } from '@angular/core';
import { PayrollService } from '../../../services/payroll.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-payroll-reports',
  templateUrl: './payroll-reports.component.html',
  styleUrls: ['./payroll-reports.component.css']
})
export class PayrollReportsComponent implements OnInit {
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
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => { this.currencySymbol = s?.currencySymbol || 'KES'; }
    });
  }

  loadReport() {
    this.loading = true;
    this.error = '';
    this.report = null;
    this.payrollService.getReports(this.reportType, this.month, this.year).subscribe({
      next: (data) => {
        this.report = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load report';
        this.loading = false;
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

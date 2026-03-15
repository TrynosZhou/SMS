import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { PayrollService } from '../../../services/payroll.service';
import { TeacherService } from '../../../services/teacher.service';

@Component({
  selector: 'app-payroll-dashboard',
  templateUrl: './payroll-dashboard.component.html',
  styleUrls: ['./payroll-dashboard.component.css']
})
export class PayrollDashboardComponent implements OnInit {
  totalTeachers = 0;
  totalAncillary = 0;
  runsThisMonth = 0;
  totalStructures = 0;
  totalAssignments = 0;
  recentRuns: any[] = [];
  loading = false;
  error = '';
  currencySymbol = 'KES';
  monthNames = ['', 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  constructor(
    private payrollService: PayrollService,
    private teacherService: TeacherService
  ) {}

  ngOnInit() {
    this.loadSummary();
  }

  get totalEmployees(): number {
    return this.totalTeachers + this.totalAncillary;
  }

  loadSummary() {
    this.loading = true;
    this.error = '';
    forkJoin({
      teachers: this.teacherService.getTeachersPaginated(1, 5000),
      staff: this.payrollService.getAncillaryStaff(),
      runs: this.payrollService.getPayrollRuns(),
      structures: this.payrollService.getSalaryStructures(),
      assignments: this.payrollService.getSalaryAssignments()
    }).subscribe({
      next: (data) => {
        const arr = Array.isArray(data.teachers) ? data.teachers : (data.teachers?.data || []);
        this.totalTeachers = (arr || []).filter((t: any) => t.isActive !== false).length;
        this.totalAncillary = (data.staff || []).filter((s: any) => s.employmentStatus === 'active').length;
        const runs = data.runs || [];
        const now = new Date();
        this.runsThisMonth = runs.filter((r: any) => r.month === now.getMonth() + 1 && r.year === now.getFullYear()).length;
        this.totalStructures = (data.structures || []).length;
        this.totalAssignments = (data.assignments || []).length;
        this.recentRuns = [...runs]
          .sort((a: any, b: any) => (b.year - a.year) || (b.month - a.month))
          .slice(0, 5);
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load payroll data';
        this.loading = false;
      }
    });
  }

  getRunLabel(r: any): string {
    return `${this.monthNames[r.month] || r.month} ${r.year}`;
  }
}

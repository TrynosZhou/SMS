import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
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

  /** Loans modal */
  loansModalOpen = false;
  loansSearchQuery = '';
  loansAllEmployees: { teachers: any[]; staff: any[] } = { teachers: [], staff: [] };
  loansSearchResults: any[] = [];
  loansSearchFetched = false;
  loansSelectedEmployee: { type: 'teacher' | 'ancillary'; id: string; name: string; employeeId: string } | null = null;
  loansPrincipal: number | null = null;
  loansTenure: 1 | 2 | 3 = 1;
  loansSubmitting = false;
  loansSuccess = '';

  constructor(
    private payrollService: PayrollService,
    private teacherService: TeacherService,
    private router: Router
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

  openLoansModal(): void {
    this.loansModalOpen = true;
    this.loansSearchQuery = '';
    this.loansSearchResults = [];
    this.loansSelectedEmployee = null;
    this.loansPrincipal = null;
    this.loansTenure = 1;
    this.loansSubmitting = false;
    this.loansSuccess = '';
    this.error = '';
    if (!this.loansSearchFetched) {
      this.loansSearchFetched = true;
      forkJoin({
        teachers: this.teacherService.getTeachersPaginated(1, 5000),
        staff: this.payrollService.getAncillaryStaff()
      }).subscribe({
        next: (data: any) => {
          const arr = Array.isArray(data.teachers) ? data.teachers : (data.teachers?.data || []);
          this.loansAllEmployees.teachers = (arr || []).filter((t: any) => t.isActive !== false);
          this.loansAllEmployees.staff = (data.staff || []).filter((s: any) => s.employmentStatus === 'active');
        },
        error: () => { this.loansSearchFetched = false; }
      });
    }
  }

  closeLoansModal(): void {
    this.loansModalOpen = false;
  }

  searchLoansEmployee(): void {
    const q = (this.loansSearchQuery || '').trim().toLowerCase();
    if (!q) {
      this.loansSearchResults = [];
      this.loansSelectedEmployee = null;
      return;
    }
    const results: any[] = [];
    for (const t of this.loansAllEmployees.teachers) {
      const tid = (t.teacherId || t.employeeId || '').toLowerCase();
      const first = (t.firstName || '').toLowerCase();
      const last = (t.lastName || '').toLowerCase();
      if (tid.includes(q) || first.includes(q) || last.includes(q)) {
        results.push({ type: 'teacher', ...t, employeeId: t.teacherId || t.employeeId });
      }
    }
    for (const s of this.loansAllEmployees.staff) {
      const eid = (s.employeeId || '').toLowerCase();
      const first = (s.firstName || '').toLowerCase();
      const last = (s.lastName || '').toLowerCase();
      if (eid.includes(q) || first.includes(q) || last.includes(q)) {
        results.push({ type: 'ancillary', ...s, employeeId: s.employeeId });
      }
    }
    this.loansSearchResults = results;
    this.loansSelectedEmployee = null;
  }

  selectLoansEmployee(emp: any): void {
    const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
    const eid = emp.teacherId || emp.employeeId || '';
    this.loansSelectedEmployee = {
      type: emp.type,
      id: emp.id,
      name: name || eid || '—',
      employeeId: eid
    };
    this.loansPrincipal = null;
  }

  clearLoansSelection(): void {
    this.loansSelectedEmployee = null;
    this.loansPrincipal = null;
  }

  submitLoans(): void {
    if (!this.loansSelectedEmployee || this.loansPrincipal == null || this.loansPrincipal <= 0) {
      this.error = 'Select an employee and enter principal amount';
      return;
    }
    this.loansSubmitting = true;
    this.error = '';
    this.loansSuccess = '';
    const payload: any = {
      principal: Number(this.loansPrincipal),
      repaymentMonths: this.loansTenure
    };
    if (this.loansSelectedEmployee.type === 'teacher') {
      payload.teacherId = this.loansSelectedEmployee.id;
    } else {
      payload.ancillaryStaffId = this.loansSelectedEmployee.id;
    }
    this.payrollService.createLoan(payload).subscribe({
      next: () => {
        this.loansSuccess = 'Loan added to employee account.';
        this.loansSubmitting = false;
        this.clearLoansSelection();
        this.loadSummary();
        setTimeout(() => { this.loansSuccess = ''; }, 4000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to add loan';
        this.loansSubmitting = false;
      }
    });
  }
}

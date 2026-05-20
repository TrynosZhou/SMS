import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { PayrollService } from '../../../services/payroll.service';
import { TeacherService } from '../../../services/teacher.service';

@Component({
  standalone: false,  selector: 'app-payroll-dashboard',
  templateUrl: './payroll-dashboard.component.html',
  styleUrls: ['./payroll-dashboard.component.css']
})
export class PayrollDashboardComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private loadGeneration = 0;

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
    private teacherService: TeacherService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    activatePageLoad(this.router, this.destroy$, '/payroll', () => this.loadSummary());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
}

  get totalEmployees(): number {
    return this.totalTeachers + this.totalAncillary;
  }

  loadSummary() {
    const generation = ++this.loadGeneration;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    let pending = 5;
    const finishIfCurrent = () => {
      pending = Math.max(0, pending - 1);
      if (pending === 0 && generation === this.loadGeneration) {
        this.loading = false;
        const now = new Date();
        this.runsThisMonth = (this.recentRuns || []).filter(
          (r: any) => r.month === now.getMonth() + 1 && r.year === now.getFullYear()
        ).length;
        this.cdr.markForCheck();
      }
    };

    this.teacherService
      .getTeachersPaginated(1, 5000)
      .pipe(finalize(finishIfCurrent))
      .subscribe({
        next: (data: any) => {
          if (generation !== this.loadGeneration) return;
          const arr = Array.isArray(data) ? data : (data?.data || []);
          this.totalTeachers = (arr || []).filter((t: any) => t.isActive !== false).length;
        },
        error: () => {
          if (generation !== this.loadGeneration) return;
          this.totalTeachers = 0;
        }
      });

    this.payrollService
      .getAncillaryStaff()
      .pipe(finalize(finishIfCurrent))
      .subscribe({
        next: (staff: any[]) => {
          if (generation !== this.loadGeneration) return;
          this.totalAncillary = (staff || []).filter((s: any) => s.employmentStatus === 'active').length;
        },
        error: () => {
          if (generation !== this.loadGeneration) return;
          this.totalAncillary = 0;
        }
      });

    this.payrollService
      .getPayrollRuns()
      .pipe(finalize(finishIfCurrent))
      .subscribe({
        next: (runs: any[]) => {
          if (generation !== this.loadGeneration) return;
          const list = runs || [];
          this.recentRuns = [...list]
            .sort((a: any, b: any) => (b.year - a.year) || (b.month - a.month))
            .slice(0, 5);
        },
        error: () => {
          if (generation !== this.loadGeneration) return;
          this.recentRuns = [];
        }
      });

    this.payrollService
      .getSalaryStructures()
      .pipe(finalize(finishIfCurrent))
      .subscribe({
        next: (structures: any[]) => {
          if (generation !== this.loadGeneration) return;
          this.totalStructures = (structures || []).length;
        },
        error: () => {
          if (generation !== this.loadGeneration) return;
          this.totalStructures = 0;
        }
      });

    this.payrollService
      .getSalaryAssignments()
      .pipe(finalize(finishIfCurrent))
      .subscribe({
        next: (assignments: any[]) => {
          if (generation !== this.loadGeneration) return;
          this.totalAssignments = (assignments || []).length;
        },
        error: (err: any) => {
          if (generation !== this.loadGeneration) return;
          this.totalAssignments = 0;
          this.error = err?.error?.message || 'Failed to load payroll data';
        }
      });
}

  getRunLabel(r: any): string {
    return `${this.monthNames[r.month] || r.month} ${r.year}`;
  }
}

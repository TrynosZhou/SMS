<<<<<<< HEAD
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { PayrollService } from '../../../services/payroll.service';

@Component({
  standalone: false,  selector: 'app-payroll-process',
  templateUrl: './payroll-process.component.html',
  styleUrls: ['./payroll-process.component.css']
})
export class PayrollProcessComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
=======
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PayrollService } from '../../../services/payroll.service';

@Component({
  selector: 'app-payroll-process',
  templateUrl: './payroll-process.component.html',
  styleUrls: ['./payroll-process.component.css']
})
export class PayrollProcessComponent implements OnInit {
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  runs: any[] = [];
  month = new Date().getMonth() + 1;
  year = new Date().getFullYear();
  loading = false;
  generating = false;
  error = '';
  success = '';
  statusFilter: 'all' | 'draft' | 'approved' = 'all';

  /** Danger zone: clear all runs for a calendar year */
  clearYear = new Date().getFullYear();
  clearYearConfirm: number | null = null;
  clearingYear = false;

  get filteredRuns(): any[] {
    if (this.statusFilter === 'all') return this.runs;
    return this.runs.filter((r: any) => r.status === this.statusFilter);
  }
  get draftCount(): number { return this.runs.filter((r: any) => r.status === 'draft').length; }
  get approvedCount(): number { return this.runs.filter((r: any) => r.status === 'approved').length; }

  constructor(
    private payrollService: PayrollService,
<<<<<<< HEAD
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    activatePageLoad(this.router, this.destroy$, '/payroll/process', () => this.loadRuns());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
=======
    private router: Router
  ) {}

  ngOnInit() {
    this.loadRuns();
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  }

  loadRuns() {
    this.loading = true;
<<<<<<< HEAD
    this.error = '';
    this.cdr.markForCheck();
    this.payrollService
      .getPayrollRuns()
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any[]) => {
          this.runs = (data || []).sort((a, b) => (b.year - a.year) || (b.month - a.month));
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load runs';
        }
      });
=======
    this.payrollService.getPayrollRuns().subscribe({
      next: (data: any[]) => {
        this.runs = (data || []).sort((a, b) => (b.year - a.year) || (b.month - a.month));
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load runs';
        this.loading = false;
      }
    });
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  }

  generate() {
    this.generating = true;
    this.error = '';
    this.payrollService.createPayrollRun({ month: this.month, year: this.year }).subscribe({
      next: (res: any) => {
        this.success = res.message || 'Payroll run created';
        this.loadRuns();
        this.generating = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Generate failed';
        this.generating = false;
      }
    });
  }

  approve(run: any) {
    if (!confirm(`Approve payroll for ${run.month}/${run.year}?`)) return;
    this.payrollService.approvePayrollRun(run.id).subscribe({
      next: () => {
        this.success = 'Payroll approved';
        this.loadRuns();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = err?.error?.message || 'Approve failed'; }
    });
  }

  viewEntries(runId: string) {
    this.router.navigate(['/payroll/runs', runId, 'entries']);
  }

  numberOrZero(v: any): number {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  clearEntireYear() {
    const y = Number(this.clearYear);
    const c = this.clearYearConfirm != null ? Number(this.clearYearConfirm) : NaN;
    if (isNaN(y) || y !== c) {
      this.error = 'Enter the same year in both fields.';
      return;
    }
    const runsInYear = this.runs.filter((r: any) => r.year === y).length;
    const msg =
      runsInYear > 0
        ? `Delete ALL payroll for ${y} (${runsInYear} run(s), January–December)? This cannot be undone.`
        : `No runs loaded for ${y} in this list—still ask server to clear any runs for that year?`;
    if (!confirm(msg)) return;
    this.clearingYear = true;
    this.error = '';
    this.payrollService.clearPayrollYear(y, c).subscribe({
      next: (res: any) => {
        this.success = res.message || `Cleared payroll for ${y}`;
        this.clearYearConfirm = null;
        this.loadRuns();
        this.clearingYear = false;
        setTimeout(() => (this.success = ''), 8000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Clear failed';
        this.clearingYear = false;
      }
    });
  }

  monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
}

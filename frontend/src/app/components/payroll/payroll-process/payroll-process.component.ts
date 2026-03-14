import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PayrollService } from '../../../services/payroll.service';

@Component({
  selector: 'app-payroll-process',
  templateUrl: './payroll-process.component.html',
  styleUrls: ['./payroll-process.component.css']
})
export class PayrollProcessComponent implements OnInit {
  runs: any[] = [];
  month = new Date().getMonth() + 1;
  year = new Date().getFullYear();
  loading = false;
  generating = false;
  error = '';
  success = '';
  statusFilter: 'all' | 'draft' | 'approved' = 'all';

  get filteredRuns(): any[] {
    if (this.statusFilter === 'all') return this.runs;
    return this.runs.filter((r: any) => r.status === this.statusFilter);
  }
  get draftCount(): number { return this.runs.filter((r: any) => r.status === 'draft').length; }
  get approvedCount(): number { return this.runs.filter((r: any) => r.status === 'approved').length; }

  constructor(
    private payrollService: PayrollService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadRuns();
  }

  loadRuns() {
    this.loading = true;
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

  monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
}

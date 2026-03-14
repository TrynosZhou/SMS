import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PayrollService } from '../../../services/payroll.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-payroll-entries',
  templateUrl: './payroll-entries.component.html',
  styleUrls: ['./payroll-entries.component.css']
})
export class PayrollEntriesComponent implements OnInit {
  runId: string | null = null;
  run: any = null;
  entries: any[] = [];
  loading = false;
  downloadingBulk = false;
  error = '';
  success = '';
  currencySymbol = 'KES';
  editingEntry: any = null;
  editForm: any = { grossSalary: 0, totalAllowances: 0, totalDeductions: 0, netSalary: 0 };

  constructor(
    private payrollService: PayrollService,
    private settingsService: SettingsService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.runId = this.route.snapshot.paramMap.get('runId');
    if (!this.runId) {
      this.router.navigate(['/payroll/process']);
      return;
    }
    this.settingsService.getSettings().subscribe({
      next: (s: any) => { this.currencySymbol = s?.currencySymbol || 'KES'; },
      error: () => {}
    });
    this.loadEntries();
  }

  loadEntries() {
    if (!this.runId) return;
    this.loading = true;
    this.payrollService.getPayrollRuns().subscribe({
      next: (runs: any[]) => {
        this.run = (runs || []).find((r: any) => r.id === this.runId);
      },
      error: () => {}
    });
    this.payrollService.getPayrollEntries(this.runId!).subscribe({
      next: (data: any[]) => {
        this.entries = data || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load entries';
        this.loading = false;
      }
    });
  }

  getEmployeeName(entry: any) {
    if (entry.teacher) return `${entry.teacher.firstName || ''} ${entry.teacher.lastName || ''}`.trim();
    if (entry.ancillaryStaff) return `${entry.ancillaryStaff.firstName || ''} ${entry.ancillaryStaff.lastName || ''}`.trim();
    return '—';
  }

  getPayslipFileName(entry: any): string {
    const emp = entry.teacher || entry.ancillaryStaff;
    if (!emp) return `payslip-${entry.id}.pdf`;
    const last = (emp.lastName || '').trim();
    const first = (emp.firstName || '').trim();
    const name = [last, first].filter(Boolean).join('_') || 'payslip';
    const safe = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${safe}.pdf`;
  }

  openEdit(entry: any) {
    if (this.run?.status === 'approved') return;
    this.editingEntry = entry;
    this.editForm = {
      grossSalary: entry.grossSalary || 0,
      totalAllowances: entry.totalAllowances || 0,
      totalDeductions: entry.totalDeductions || 0,
      netSalary: entry.netSalary || 0
    };
  }

  closeEdit() {
    this.editingEntry = null;
  }

  saveEdit() {
    if (!this.editingEntry) return;
    this.payrollService.updatePayrollEntry(this.editingEntry.id, this.editForm).subscribe({
      next: () => {
        this.success = 'Entry updated';
        this.closeEdit();
        this.loadEntries();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = err?.error?.message || 'Update failed'; }
    });
  }

  downloadAllPayslips() {
    if (!this.runId || !this.entries.length) return;
    this.downloadingBulk = true;
    this.error = '';
    const m = this.run?.month ?? new Date().getMonth() + 1;
    const y = this.run?.year ?? new Date().getFullYear();
    const filename = `payslips-${y}-${String(m).padStart(2, '0')}.zip`;
    this.payrollService.getBulkPayslipsZip(this.runId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
        this.success = `Downloaded ${this.entries.length} payslips as ZIP`;
        this.downloadingBulk = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Bulk download failed';
        this.downloadingBulk = false;
      }
    });
  }

  downloadPayslip(entry: any) {
    this.payrollService.getPayslipPdf(entry.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.getPayslipFileName(entry);
        a.click();
        window.URL.revokeObjectURL(url);
        this.success = 'Payslip downloaded';
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = err?.error?.message || 'Download failed'; }
    });
  }

  back() {
    this.router.navigate(['/payroll/process']);
  }

  isDraft() {
    return this.run?.status === 'draft';
  }
}

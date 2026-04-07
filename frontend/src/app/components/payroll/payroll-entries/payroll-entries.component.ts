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
  editForm: any = { grossSalary: 0, totalAllowances: 0, totalDeductions: 0, netSalary: 0, paymentMethod: 'cash', bankName: null as string | null };
  banks: Array<{ id: string; name: string }> = [];
  loanPrincipal = 0;
  loanMonths: 1 | 2 | 3 = 1;
  addingLoan = false;

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
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || 'KES';
        this.banks = Array.isArray(s?.payrollSettings?.banks) ? s.payrollSettings.banks : [];
      },
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
      netSalary: entry.netSalary || 0,
      paymentMethod: entry.paymentMethod || 'cash',
      bankName: entry.bankName || null
    };
    this.loanPrincipal = 0;
    this.loanMonths = 1;
  }

  closeEdit() {
    this.editingEntry = null;
  }

  addLoanDeduction() {
    if (!this.editingEntry || this.loanPrincipal <= 0) return;
    this.addingLoan = true;
    this.payrollService.addLoanDeduction(this.editingEntry.id, this.loanPrincipal, this.loanMonths).subscribe({
      next: (res: any) => {
        const ld = res?.loanDeduction;
        const total = ld?.totalRepayment ?? 0;
        const inst = ld?.installment ?? 0;
        const mo = ld?.repaymentMonths ?? 1;
        this.success =
          mo <= 1
            ? `Loan applied: ${this.currencySymbol} ${Number(inst).toFixed(2)} deducted (full principal + interest, total ${this.currencySymbol} ${Number(total).toFixed(2)}).`
            : `Loan applied: total ${this.currencySymbol} ${Number(total).toFixed(2)} (P+I). This payslip: ${this.currencySymbol} ${Number(inst).toFixed(2)} (${mo} equal installments).`;
        this.addingLoan = false;
        this.loadEntries();
        this.editingEntry = this.entries.find((e: any) => e.id === this.editingEntry?.id) || this.editingEntry;
        this.editForm.totalDeductions = (this.editingEntry?.totalDeductions ?? 0);
        this.editForm.netSalary = (this.editingEntry?.netSalary ?? 0);
        this.loanPrincipal = 0;
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to add loan deduction';
        this.addingLoan = false;
      }
    });
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

  previewPayslip(entry: any) {
    this.payrollService.getPayslipPdf(entry.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        this.success = 'Payslip opened in new tab';
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = err?.error?.message || 'Preview failed'; }
    });
  }

  back() {
    this.router.navigate(['/payroll/process']);
  }

  isDraft() {
    return this.run?.status === 'draft';
  }
}

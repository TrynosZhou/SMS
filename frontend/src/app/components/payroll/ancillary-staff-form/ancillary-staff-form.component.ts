import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PayrollService } from '../../../services/payroll.service';
import { SettingsService } from '../../../services/settings.service';
import { ThemeService } from '../../../services/theme.service';

@Component({
  selector: 'app-ancillary-staff-form',
  templateUrl: './ancillary-staff-form.component.html',
  styleUrls: ['./ancillary-staff-form.component.css']
})
export class AncillaryStaffFormComponent implements OnInit, OnDestroy {
  id: string | null = null;
  isEdit = false;
  form: any = {
    employeeId: '',
    firstName: '',
    lastName: '',
    nationalId: '',
    role: '',
    designation: '',
    department: '',
    salaryType: 'monthly',
    paymentMethod: 'cash',
    bankName: '',
    bankAccountNumber: '',
    bankBranch: '',
    employmentStatus: 'active',
    phoneNumber: '',
    dateJoined: ''
  };
  banks: Array<{ id: string; name: string }> = [];
  loading = false;
  submitting = false;
  error = '';
  success = '';
  private successTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private payrollService: PayrollService,
    private settingsService: SettingsService,
    private route: ActivatedRoute,
    private router: Router,
    public theme: ThemeService
  ) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.id;
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.banks = Array.isArray(s?.payrollSettings?.banks) ? s.payrollSettings.banks : [];
      }
    });
    if (this.isEdit && this.id) {
      this.loadStaff();
    }
  }

  ngOnDestroy() {
    if (this.successTimer) clearTimeout(this.successTimer);
  }

  get needsBankDetails(): boolean {
    const m = this.form.paymentMethod;
    return m === 'bank' || m === 'both';
  }

  get todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  loadStaff() {
    if (!this.id) return;
    this.loading = true;
    this.error = '';
    this.payrollService.getAncillaryStaff().subscribe({
      next: (staff: any[]) => {
        const s = (staff || []).find((x: any) => x.id === this.id);
        if (s) {
          this.form = {
            employeeId: s.employeeId || '',
            firstName: s.firstName || '',
            lastName: s.lastName || '',
            nationalId: s.nationalId || '',
            role: s.role || '',
            designation: s.designation || '',
            department: s.department || '',
            salaryType: s.salaryType || 'monthly',
            paymentMethod: s.paymentMethod || 'cash',
            bankName: s.bankName || '',
            bankAccountNumber: s.bankAccountNumber || '',
            bankBranch: s.bankBranch || '',
            employmentStatus: s.employmentStatus || 'active',
            phoneNumber: s.phoneNumber || '',
            dateJoined: s.dateJoined ? new Date(s.dateJoined).toISOString().slice(0, 10) : ''
          };
        } else {
          this.error = 'Employee not found.';
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load staff';
        this.loading = false;
      }
    });
  }

  dismissError() {
    this.error = '';
  }

  dismissSuccess() {
    this.success = '';
    if (this.successTimer) {
      clearTimeout(this.successTimer);
      this.successTimer = null;
    }
  }

  submit() {
    if (!this.form.firstName?.trim() || !this.form.lastName?.trim()) {
      this.error = 'First name and last name are required.';
      return;
    }
    this.submitting = true;
    this.error = '';
    this.success = '';
    const payload = { ...this.form };
    if (!payload.dateJoined) delete payload.dateJoined;
    if (!this.isEdit && !payload.employeeId) delete payload.employeeId;

    const done = () => {
      this.submitting = false;
    };

    if (this.isEdit && this.id) {
      this.payrollService.updateAncillaryStaff(this.id, payload).subscribe({
        next: () => {
          this.success = 'Employee updated successfully.';
          this.successTimer = setTimeout(() => this.router.navigate(['/payroll/employees']), 1600);
          done();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Update failed';
          done();
        }
      });
    } else {
      this.payrollService.createAncillaryStaff(payload).subscribe({
        next: () => {
          this.success = 'Employee added. Redirecting to the directory…';
          this.successTimer = setTimeout(() => this.router.navigate(['/payroll/employees']), 1600);
          done();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Create failed';
          done();
        }
      });
    }
  }

  cancel() {
    this.router.navigate(['/payroll/employees']);
  }
}

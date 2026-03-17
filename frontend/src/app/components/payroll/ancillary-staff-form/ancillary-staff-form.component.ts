import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PayrollService } from '../../../services/payroll.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-ancillary-staff-form',
  templateUrl: './ancillary-staff-form.component.html',
  styleUrls: ['./ancillary-staff-form.component.css']
})
export class AncillaryStaffFormComponent implements OnInit {
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

  constructor(
    private payrollService: PayrollService,
    private settingsService: SettingsService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.id;
    this.settingsService.getSettings().subscribe({
      next: (s: any) => { this.banks = Array.isArray(s?.payrollSettings?.banks) ? s.payrollSettings.banks : []; }
    });
    if (this.isEdit && this.id) {
      this.loadStaff();
    }
  }

  loadStaff() {
    if (!this.id) return;
    this.loading = true;
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
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load staff';
        this.loading = false;
      }
    });
  }

  submit() {
    if (!this.form.firstName || !this.form.lastName) {
      this.error = 'First Name and Last Name are required';
      return;
    }
    this.submitting = true;
    this.error = '';
    const payload = { ...this.form };
    if (!payload.dateJoined) delete payload.dateJoined;
    if (!this.isEdit && !payload.employeeId) delete payload.employeeId;

    if (this.isEdit && this.id) {
      this.payrollService.updateAncillaryStaff(this.id, payload).subscribe({
        next: () => {
          this.success = 'Staff updated';
          setTimeout(() => this.router.navigate(['/payroll/employees']), 1500);
        },
        error: (err) => {
          this.error = err?.error?.message || 'Update failed';
          this.submitting = false;
        }
      });
    } else {
      this.payrollService.createAncillaryStaff(payload).subscribe({
        next: () => {
          this.success = 'Staff created';
          setTimeout(() => this.router.navigate(['/payroll/employees']), 1500);
        },
        error: (err) => {
          this.error = err?.error?.message || 'Create failed';
          this.submitting = false;
        }
      });
    }
  }

  cancel() {
    this.router.navigate(['/payroll/employees']);
  }
}

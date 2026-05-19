<<<<<<< HEAD
import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
=======
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
import { PayrollService } from '../../../services/payroll.service';
import { SettingsService } from '../../../services/settings.service';
import { ThemeService } from '../../../services/theme.service';

@Component({
<<<<<<< HEAD
  standalone: false,  selector: 'app-ancillary-staff-form',
=======
  selector: 'app-ancillary-staff-form',
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
  templateUrl: './ancillary-staff-form.component.html',
  styleUrls: ['./ancillary-staff-form.component.css']
})
export class AncillaryStaffFormComponent implements OnInit, OnDestroy {
<<<<<<< HEAD
  private readonly destroy$ = new Subject<void>();
=======
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
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
<<<<<<< HEAD
    public theme: ThemeService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const pagePath = (this.router.url || '').split('?')[0];
    activatePageLoad(this.router, this.destroy$, pagePath, () => this.bootstrapPage());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.successTimer) clearTimeout(this.successTimer);
  }

  private bootstrapPage(): void {
=======
    public theme: ThemeService
  ) {}

  ngOnInit() {
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
    this.id = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.id;
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.banks = Array.isArray(s?.payrollSettings?.banks) ? s.payrollSettings.banks : [];
<<<<<<< HEAD
        this.cdr.markForCheck();
      },
      error: () => {}
=======
      }
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
    });
    if (this.isEdit && this.id) {
      this.loadStaff();
    }
  }

<<<<<<< HEAD
=======
  ngOnDestroy() {
    if (this.successTimer) clearTimeout(this.successTimer);
  }

>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
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
<<<<<<< HEAD
    this.cdr.markForCheck();
    this.payrollService
      .getAncillaryStaff()
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
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
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load staff';
        }
      });
=======
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
>>>>>>> 0f0f1e8c884c64ff417aea43b8858de320e9afe7
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

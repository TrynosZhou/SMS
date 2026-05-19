import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { FinanceService } from '../../../services/finance.service';

type ExemptionType = 'fixed' | 'percentage' | 'staff_sibling';

@Component({
  standalone: false,
  selector: 'app-exemptions-management',
  templateUrl: './exemptions-management.component.html',
  styleUrls: ['./exemptions-management.component.css']
})
export class ExemptionsManagementComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  exemptions: any[] = [];
  loading = false;
  saving = false;
  syncing = false;
  error = '';
  success = '';
  loadError = '';
  currencySymbol = '$';
  exemptionDescription = '';

  studentSearch = '';
  searchResults: any[] = [];
  searchLoading = false;
  searchNoResults = false;
  selectedStudent: any = null;
  private searchTimeout: any;

  exemptionType: ExemptionType = 'fixed';
  fixedAmount = 0;
  exemptionPercent = 0;

  editingId: string | null = null;

  constructor(
    private studentService: StudentService,
    private settingsService: SettingsService,
    private financeService: FinanceService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || '$';
        this.cdr.markForCheck();
      }
    });
    activatePageLoad(this.router, this.destroy$, '/finance/exemptions', () => this.loadExemptions());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadExemptions(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.studentService
      .getStudentsPaginated({ page: 1, limit: 500 })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (resp) => {
          const rows = resp?.data || [];
          this.exemptions = rows.filter(
            (s) => s.isExempted || s.isStaffChild || s.exemptionType
          );
        },
        error: () => {
          this.exemptions = [];
          this.loadError = 'Could not load exemptions. Check your connection and try again.';
        }
      });
  }

  onSearchInput(): void {
    clearTimeout(this.searchTimeout);
    const q = this.studentSearch.trim();
    this.searchNoResults = false;
    if (q.length < 1) {
      this.searchResults = [];
      return;
    }
    this.searchTimeout = setTimeout(() => {
      this.searchLoading = true;
      this.searchNoResults = false;
      this.studentService
        .getStudentsPaginated({ search: q, page: 1, limit: 20 })
        .pipe(finalize(() => (this.searchLoading = false)))
        .subscribe({
          next: (resp) => {
            this.searchResults = resp?.data || [];
            this.searchNoResults = this.searchResults.length === 0;
          },
          error: () => {
            this.searchResults = [];
            this.searchNoResults = true;
          }
        });
    }, 300);
  }

  selectStudent(student: any): void {
    this.selectedStudent = student;
    this.studentSearch = `${student.firstName} ${student.lastName} (${student.studentNumber})`;
    this.searchResults = [];
    this.searchNoResults = false;
    this.error = '';
    if (student.exemptionType) {
      this.exemptionType = student.exemptionType;
    } else if (student.isStaffChild) {
      this.exemptionType = 'staff_sibling';
    } else {
      this.exemptionType = 'fixed';
    }
    this.fixedAmount = Number(student.exemptionAmount) || 0;
    this.exemptionPercent = Number(student.exemptionPercent) || 0;
    this.exemptionDescription = student.exemptionDescription || '';
    const hasExemption =
      student.isExempted || student.isStaffChild || student.exemptionType;
    this.editingId = hasExemption ? student.id : null;
  }

  clearForm(): void {
    this.selectedStudent = null;
    this.studentSearch = '';
    this.searchResults = [];
    this.searchNoResults = false;
    this.exemptionType = 'fixed';
    this.fixedAmount = 0;
    this.exemptionPercent = 0;
    this.exemptionDescription = '';
    this.editingId = null;
  }

  buildPayload(): Record<string, unknown> {
    const base: Record<string, unknown> = {
      exemptionType: this.exemptionType,
      exemptionDescription: this.exemptionDescription.trim() || null
    };
    if (this.exemptionType === 'staff_sibling') {
      return {
        ...base,
        isStaffChild: true,
        isExempted: false,
        usesTransport: false,
        exemptionAmount: null,
        exemptionPercent: null
      };
    }
    if (this.exemptionType === 'fixed') {
      return {
        ...base,
        isStaffChild: false,
        isExempted: true,
        exemptionAmount: this.fixedAmount,
        exemptionPercent: null
      };
    }
    return {
      ...base,
      isStaffChild: false,
      isExempted: true,
      exemptionAmount: null,
      exemptionPercent: this.exemptionPercent
    };
  }

  saveExemption(): void {
    if (!this.selectedStudent?.id) {
      this.error = 'Search and select a student first';
      return;
    }
    if (this.exemptionType === 'fixed' && (this.fixedAmount == null || this.fixedAmount < 0)) {
      this.error = 'Enter a valid fixed amount';
      return;
    }
    if (this.exemptionType === 'percentage' && (this.exemptionPercent <= 0 || this.exemptionPercent > 100)) {
      this.error = 'Percentage must be between 1 and 100';
      return;
    }

    this.saving = true;
    this.error = '';
    const studentId = this.selectedStudent.id;
    this.studentService.updateStudent(studentId, this.buildPayload()).subscribe({
      next: () => {
        this.financeService.syncStudentExemptionInvoices(studentId).subscribe({
          next: (syncResp) => {
            const syncMsg = syncResp?.message ? ` ${syncResp.message}` : '';
            this.success =
              (this.editingId ? 'Exemption updated' : 'Exemption created') + '.' + syncMsg;
            this.saving = false;
            this.clearForm();
            this.loadExemptions();
            setTimeout(() => (this.success = ''), 6000);
          },
          error: (syncErr) => {
            this.success = this.editingId ? 'Exemption saved' : 'Exemption created';
            this.error =
              syncErr?.error?.message ||
              'Exemption saved but open invoices could not be updated. Use Sync open invoices.';
            this.saving = false;
            this.loadExemptions();
          }
        });
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to save exemption';
        this.saving = false;
      }
    });
  }

  syncOpenInvoices(): void {
    if (!this.selectedStudent?.id) {
      this.error = 'Select a student first';
      return;
    }
    this.syncing = true;
    this.error = '';
    this.financeService.syncStudentExemptionInvoices(this.selectedStudent.id).subscribe({
      next: (resp) => {
        this.success = resp?.message || 'Open invoices synced';
        this.syncing = false;
        setTimeout(() => (this.success = ''), 4000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to sync open invoices';
        this.syncing = false;
      }
    });
  }

  removeExemption(student: any): void {
    if (!confirm(`Remove exemption for ${student.firstName} ${student.lastName}?`)) return;
    this.studentService
      .updateStudent(student.id, {
        isExempted: false,
        isStaffChild: false,
        exemptionType: null,
        exemptionAmount: null,
        exemptionPercent: null,
        exemptionDescription: null
      })
      .subscribe({
        next: () => {
          this.financeService.syncStudentExemptionInvoices(student.id).subscribe({
            next: (syncResp) => {
              this.success = 'Exemption removed.' + (syncResp?.message ? ` ${syncResp.message}` : '');
              this.loadExemptions();
              setTimeout(() => (this.success = ''), 6000);
            },
            error: () => {
              this.success = 'Exemption removed (sync open invoices manually if balances look wrong)';
              this.loadExemptions();
              setTimeout(() => (this.success = ''), 6000);
            }
          });
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to remove exemption';
        }
      });
  }

  displayType(student: any): string {
    if (student.exemptionType === 'staff_sibling' || student.isStaffChild) return 'Staff sibling';
    if (student.exemptionType === 'percentage') return 'Percentage';
    if (student.exemptionType === 'fixed') return 'Fixed amount';
    if (student.isExempted) return 'Exempted';
    return '—';
  }

  displayValue(student: any): string {
    if (student.exemptionType === 'staff_sibling' || student.isStaffChild) return '—';
    if (student.exemptionType === 'percentage' && student.exemptionPercent != null) {
      return `${student.exemptionPercent}%`;
    }
    if (student.exemptionAmount != null && Number(student.exemptionAmount) > 0) {
      return `${this.currencySymbol} ${Number(student.exemptionAmount).toFixed(2)}`;
    }
    return '—';
  }
}

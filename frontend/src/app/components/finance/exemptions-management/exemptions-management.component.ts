import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
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
  private readonly studentSearch$ = new Subject<string>();
  private readonly listSearch$ = new Subject<string>();

  readonly skeletonRows = [0, 1, 2, 3];
  readonly typeOptions: { value: ExemptionType; label: string; icon: string }[] = [
    { value: 'fixed', label: 'Fixed amount', icon: '💵' },
    { value: 'percentage', label: 'Percentage', icon: '📊' },
    { value: 'staff_sibling', label: 'Staff sibling', icon: '👨‍👩‍👧' }
  ];

  exemptions: any[] = [];
  filteredExemptions: any[] = [];
  loading = false;
  saving = false;
  syncing = false;
  error = '';
  success = '';
  loadError = '';
  lastLoadedAt: Date | null = null;
  currencySymbol = '$';
  exemptionDescription = '';

  studentSearch = '';
  listSearch = '';
  typeFilter = '';
  searchResults: any[] = [];
  searchLoading = false;
  searchNoResults = false;
  selectedStudent: any = null;

  exemptionType: ExemptionType = 'fixed';
  fixedAmount = 0;
  exemptionPercent = 0;

  editingId: string | null = null;
  confirmRemoveStudent: any | null = null;

  constructor(
    private studentService: StudentService,
    private settingsService: SettingsService,
    private financeService: FinanceService,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.settingsService
      .getSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (s: any) => {
          this.currencySymbol = s?.currencySymbol || '$';
          this.cdr.markForCheck();
        }
      });

    this.studentSearch$
      .pipe(debounceTime(280), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => this.runStudentSearch(q));

    this.listSearch$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.applyListFilters());

    activatePageLoad(this.router, this.destroy$, '/finance/exemptions', () => this.loadExemptions());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get stats() {
    const all = this.exemptions;
    return {
      total: all.length,
      fixed: all.filter((s) => s.exemptionType === 'fixed' || (s.isExempted && !s.exemptionType && s.exemptionAmount)).length,
      percentage: all.filter((s) => s.exemptionType === 'percentage').length,
      staff: all.filter((s) => s.exemptionType === 'staff_sibling' || s.isStaffChild).length
    };
  }

  get filterSummary(): string {
    const parts: string[] = [];
    if (this.listSearch) parts.push(`Search: "${this.listSearch}"`);
    if (this.typeFilter) parts.push(`Type: ${this.displayType({ exemptionType: this.typeFilter })}`);
    parts.push(`${this.filteredExemptions.length} shown`);
    return parts.join(' · ');
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  hasListFilters(): boolean {
    return !!this.listSearch || !!this.typeFilter;
  }

  clearListFilters(): void {
    this.listSearch = '';
    this.typeFilter = '';
    this.listSearch$.next('');
    this.applyListFilters();
  }

  onStudentSearchInput(value: string): void {
    this.studentSearch = value;
    if (this.editingId) return;
    this.studentSearch$.next(value.trim());
  }

  onListSearchInput(value: string): void {
    this.listSearch = value;
    this.listSearch$.next(value.trim());
  }

  selectTypeFilter(value: string): void {
    this.typeFilter = this.typeFilter === value ? '' : value;
    this.applyListFilters();
  }

  selectExemptionType(value: ExemptionType): void {
    this.exemptionType = value;
  }

  refresh(): void {
    this.loadExemptions();
  }

  loadExemptions(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.studentService
      .getStudentsPaginated({ page: 1, limit: 500 })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.lastLoadedAt = new Date();
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (resp) => {
          const rows = resp?.data || [];
          this.exemptions = rows.filter(
            (s: any) => s.isExempted || s.isStaffChild || s.exemptionType
          );
          this.applyListFilters();
        },
        error: () => {
          this.exemptions = [];
          this.filteredExemptions = [];
          this.loadError = 'Could not load exemptions. Check your connection and try again.';
        }
      });
  }

  private runStudentSearch(q: string): void {
    this.searchNoResults = false;
    if (q.length < 1) {
      this.searchResults = [];
      this.searchLoading = false;
      this.cdr.markForCheck();
      return;
    }
    this.searchLoading = true;
    this.studentService
      .getStudentsPaginated({ search: q, page: 1, limit: 20 })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.searchLoading = false;
          this.cdr.markForCheck();
        })
      )
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
  }

  applyListFilters(): void {
    let arr = [...this.exemptions];
    const q = this.listSearch.trim().toLowerCase();
    if (q) {
      arr = arr.filter((s) => {
        const name = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
        const num = (s.studentNumber || '').toLowerCase();
        const desc = (s.exemptionDescription || '').toLowerCase();
        return name.includes(q) || num.includes(q) || desc.includes(q);
      });
    }
    if (this.typeFilter) {
      arr = arr.filter((s) => {
        if (this.typeFilter === 'staff_sibling') {
          return s.exemptionType === 'staff_sibling' || s.isStaffChild;
        }
        if (this.typeFilter === 'fixed') {
          return s.exemptionType === 'fixed' || (s.isExempted && s.exemptionAmount != null);
        }
        if (this.typeFilter === 'percentage') {
          return s.exemptionType === 'percentage';
        }
        return true;
      });
    }
    arr.sort((a, b) =>
      `${a.lastName || ''} ${a.firstName || ''}`.localeCompare(
        `${b.lastName || ''} ${b.firstName || ''}`,
        undefined,
        { sensitivity: 'base' }
      )
    );
    this.filteredExemptions = arr;
    this.cdr.markForCheck();
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
    const hasExemption = student.isExempted || student.isStaffChild || student.exemptionType;
    this.editingId = hasExemption ? student.id : null;
    this.cdr.markForCheck();
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
    this.cdr.markForCheck();
    const studentId = this.selectedStudent.id;
    this.studentService
      .updateStudent(studentId, this.buildPayload())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.financeService
            .syncStudentExemptionInvoices(studentId)
            .pipe(
              takeUntil(this.destroy$),
              finalize(() => {
                this.saving = false;
                this.cdr.markForCheck();
              })
            )
            .subscribe({
              next: (syncResp) => {
                const syncMsg = syncResp?.message ? ` ${syncResp.message}` : '';
                this.success =
                  (this.editingId ? 'Exemption updated' : 'Exemption created') + '.' + syncMsg;
                this.clearForm();
                this.loadExemptions();
              },
              error: (syncErr) => {
                this.success = this.editingId ? 'Exemption saved' : 'Exemption created';
                this.error =
                  syncErr?.error?.message ||
                  'Exemption saved but open invoices could not be updated. Use Sync open invoices.';
                this.loadExemptions();
              }
            });
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to save exemption';
          this.saving = false;
          this.cdr.markForCheck();
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
    this.cdr.markForCheck();
    this.financeService
      .syncStudentExemptionInvoices(this.selectedStudent.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.syncing = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (resp) => {
          this.success = resp?.message || 'Open invoices synced';
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to sync open invoices';
        }
      });
  }

  openRemoveConfirm(student: any): void {
    this.confirmRemoveStudent = student;
    this.cdr.markForCheck();
  }

  cancelRemoveConfirm(): void {
    this.confirmRemoveStudent = null;
  }

  confirmRemoveExemption(): void {
    const student = this.confirmRemoveStudent;
    if (!student?.id) return;
    this.confirmRemoveStudent = null;
    this.studentService
      .updateStudent(student.id, {
        isExempted: false,
        isStaffChild: false,
        exemptionType: null,
        exemptionAmount: null,
        exemptionPercent: null,
        exemptionDescription: null
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.financeService.syncStudentExemptionInvoices(student.id).subscribe({
            next: (syncResp) => {
              this.success = 'Exemption removed.' + (syncResp?.message ? ` ${syncResp.message}` : '');
              if (this.editingId === student.id) this.clearForm();
              this.loadExemptions();
            },
            error: () => {
              this.success = 'Exemption removed (sync open invoices manually if balances look wrong)';
              if (this.editingId === student.id) this.clearForm();
              this.loadExemptions();
            }
          });
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to remove exemption';
          this.cdr.markForCheck();
        }
      });
  }

  exportCsv(): void {
    const rows = this.filteredExemptions;
    if (!rows.length) {
      this.error = 'Nothing to export';
      return;
    }
    const headers = ['Student', 'Student No.', 'Type', 'Value', 'Description'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...rows.map((s) =>
        [
          `${s.firstName || ''} ${s.lastName || ''}`.trim(),
          s.studentNumber,
          this.displayType(s),
          this.displayValue(s),
          s.exemptionDescription || ''
        ]
          .map(esc)
          .join(',')
      )
    ].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exemptions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.success = `Exported ${rows.length} exemption(s)`;
    this.cdr.markForCheck();
  }

  getInitials(student: any): string {
    const name = `${student?.firstName || ''} ${student?.lastName || ''}`.trim();
    if (!name) return '?';
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
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
      return `${this.currencySymbol}${Number(student.exemptionAmount).toFixed(2)}`;
    }
    return '—';
  }

  typeBadgeClass(student: any): string {
    if (student.exemptionType === 'staff_sibling' || student.isStaffChild) return 'fx-badge--staff';
    if (student.exemptionType === 'percentage') return 'fx-badge--pct';
    return 'fx-badge--fixed';
  }

  trackByStudentId(_index: number, s: any): string {
    return s.id || String(_index);
  }
}

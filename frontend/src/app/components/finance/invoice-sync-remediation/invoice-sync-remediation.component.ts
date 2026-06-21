import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../../services/finance.service';
import { PermissionService } from '../../../services/permission.service';
import { SettingsService } from '../../../services/settings.service';

type RemediationPayment = {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  paymentDate: string;
  amountPaid: number;
  paymentMethod: string | null;
  receiptNumber: string | null;
  notes: string | null;
  reversedAt: string | null;
  canReverse: boolean;
  reverseBlockedReason: string | null;
  selected?: boolean;
};

type RemediationInvoice = {
  id: string;
  invoiceNumber: string;
  term: string;
  tuitionAmount: number;
  transportAmount: number;
  diningHallAmount: number;
  registrationAmount: number;
  deskFeeAmount: number;
  balance: number;
  displayBalance: number;
};

type RemediationStudent = {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  className: string;
  totalOutstanding: number;
  payments: RemediationPayment[];
  invoices: RemediationInvoice[];
};

@Component({
  standalone: false,
  selector: 'app-invoice-sync-remediation',
  templateUrl: './invoice-sync-remediation.component.html',
  styleUrls: ['./invoice-sync-remediation.component.css'],
})
export class InvoiceSyncRemediationComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly defaultReversalReason =
    'Reversal of fictitious payment — invoice sync bug correction';
  readonly defaultCreditReason =
    'Credit for duplicated tuition and fee charges — invoice sync bug correction';

  studentIdsInput = '';
  startDate = '';
  endDate = '';
  reversalReason = this.defaultReversalReason;
  creditReason = this.defaultCreditReason;

  loading = false;
  submittingReverse = false;
  submittingCredit = false;
  error = '';
  success = '';

  students: RemediationStudent[] = [];
  notFound: string[] = [];
  activeStudent: RemediationStudent | null = null;

  /** Enabled after at least one successful reversal in this session */
  reversalsCompleted = false;

  showReverseConfirm = false;
  showCreditConfirm = false;

  creditForm = {
    invoiceId: '',
    item: 'combined' as 'combined' | 'tuition' | 'transport' | 'diningHall',
    amount: 0,
  };

  currencySymbol = '';

  constructor(
    private router: Router,
    private financeService: FinanceService,
    private settingsService: SettingsService,
    public permissionService: PermissionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (!this.canAccessPage()) {
      this.router.navigate(['/invoices']);
      return;
    }
    this.settingsService
      .getSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any) => {
          this.currencySymbol = data?.currencySymbol || '';
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  canAccessPage(): boolean {
    return this.permissionService.canAccessFinancePage('invoiceSyncRemediation', 'edit');
  }

  get selectedPayments(): RemediationPayment[] {
    if (!this.activeStudent) return [];
    return this.activeStudent.payments.filter((p) => p.selected && p.canReverse);
  }

  get selectedCreditInvoice(): RemediationInvoice | null {
    if (!this.activeStudent || !this.creditForm.invoiceId) return null;
    return (
      this.activeStudent.invoices.find((i) => i.id === this.creditForm.invoiceId) || null
    );
  }

  get combinedTermFeeTotal(): number {
    const inv = this.selectedCreditInvoice;
    if (!inv) return 0;
    return (
      Number(inv.tuitionAmount || 0) +
      Number(inv.diningHallAmount || 0) +
      Number(inv.transportAmount || 0) +
      Number(inv.registrationAmount || 0) +
      Number(inv.deskFeeAmount || 0)
    );
  }

  get creditLineBreakdown(): string {
    const inv = this.selectedCreditInvoice;
    if (!inv) return '';
    const parts: string[] = [];
    if (inv.tuitionAmount > 0) parts.push(`Tuition ${this.formatMoney(inv.tuitionAmount)}`);
    if (inv.diningHallAmount > 0) parts.push(`DH ${this.formatMoney(inv.diningHallAmount)}`);
    if (inv.transportAmount > 0) parts.push(`Transport ${this.formatMoney(inv.transportAmount)}`);
    if (inv.registrationAmount > 0) parts.push(`Registration ${this.formatMoney(inv.registrationAmount)}`);
    if (inv.deskFeeAmount > 0) parts.push(`Desk ${this.formatMoney(inv.deskFeeAmount)}`);
    return parts.join(' + ');
  }

  get maxCreditAmount(): number {
    const inv = this.selectedCreditInvoice;
    if (!inv) return 0;

    let lineMax = 0;
    if (this.creditForm.item === 'combined') {
      lineMax = this.combinedTermFeeTotal;
    } else if (this.creditForm.item === 'tuition') {
      lineMax = inv.tuitionAmount;
    } else if (this.creditForm.item === 'transport') {
      lineMax = inv.transportAmount;
    } else {
      lineMax = inv.diningHallAmount;
    }

    const balanceCap = Number(inv.displayBalance ?? inv.balance ?? 0);
    return Math.min(lineMax, balanceCap > 0 ? balanceCap : lineMax);
  }

  loadPreview(preserveReversalFlag = false): void {
    this.error = '';
    this.success = '';
    if (!preserveReversalFlag) {
      this.reversalsCompleted = false;
    }

    const ids = this.studentIdsInput.trim();
    if (!ids) {
      this.error = 'Enter at least one Student ID.';
      return;
    }

    this.loading = true;
    this.financeService
      .getRemediationPreview({
        studentIds: ids,
        startDate: this.startDate || undefined,
        endDate: this.endDate || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (resp: any) => {
          this.notFound = resp?.notFound || [];
          this.students = (resp?.students || []).map((s: RemediationStudent) => ({
            ...s,
            payments: (s.payments || []).map((p: RemediationPayment) => ({
              ...p,
              selected: false,
            })),
          }));
          this.activeStudent = this.students.length === 1 ? this.students[0] : null;
          if (!this.students.length) {
            this.error = 'No students found for the given ID(s).';
          } else if (this.students.length > 1 && !this.activeStudent) {
            this.success = 'Multiple students loaded — select one to continue.';
          }
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to load payments.';
          this.students = [];
          this.activeStudent = null;
        },
      });
  }

  selectStudent(student: RemediationStudent): void {
    this.activeStudent = student;
    this.reversalsCompleted = false;
    this.creditForm = { invoiceId: '', item: 'combined', amount: 0 };
    this.error = '';
    this.success = '';
  }

  togglePayment(payment: RemediationPayment, checked: boolean): void {
    if (!payment.canReverse) return;
    payment.selected = checked;
  }

  openReverseConfirm(): void {
    this.error = '';
    if (!this.selectedPayments.length) {
      this.error = 'Select at least one payment to reverse.';
      return;
    }
    this.showReverseConfirm = true;
  }

  cancelReverseConfirm(): void {
    this.showReverseConfirm = false;
  }

  confirmReverse(): void {
    const ids = this.selectedPayments.map((p) => p.id);
    if (!ids.length) return;

    this.submittingReverse = true;
    this.showReverseConfirm = false;
    this.financeService
      .postRemediationReverse({
        paymentLogIds: ids,
        reason: this.reversalReason.trim() || this.defaultReversalReason,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.submittingReverse = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (resp: any) => {
          this.reversalsCompleted = true;
          this.success = resp?.message || 'Payment(s) reversed.';
          if (resp?.student) {
            this.applyStudentSummary(resp.student);
          } else {
            this.loadPreview();
          }
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to reverse payment(s).';
        },
      });
  }

  onCreditInvoiceChange(): void {
    this.creditForm.item = 'combined';
    this.onCreditItemChange();
  }

  onCreditItemChange(): void {
    const max = this.maxCreditAmount;
    if (max > 0) {
      this.creditForm.amount = max;
    }
  }

  openCreditConfirm(): void {
    this.error = '';
    if (!this.reversalsCompleted) {
      this.error = 'Complete payment reversal (Step 2) before applying a credit note.';
      return;
    }
    if (!this.creditForm.invoiceId) {
      this.error = 'Select an invoice for the credit note.';
      return;
    }
    const amt = Number(this.creditForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      this.error = 'Enter a valid credit amount.';
      return;
    }
    if (amt > this.maxCreditAmount + 0.005) {
      this.error = `Amount cannot exceed ${this.itemLabel(this.creditForm.item)} maximum (${this.maxCreditAmount.toFixed(2)}).`;
      return;
    }
    this.showCreditConfirm = true;
  }

  cancelCreditConfirm(): void {
    this.showCreditConfirm = false;
  }

  confirmCreditNote(): void {
    this.showCreditConfirm = false;
    this.submittingCredit = true;
    this.financeService
      .postRemediationCreditNote({
        invoiceId: this.creditForm.invoiceId,
        item: this.creditForm.item,
        amount: Number(this.creditForm.amount),
        reason: this.creditReason.trim() || this.defaultCreditReason,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.submittingCredit = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (resp: any) => {
          const before = resp?.balanceBefore != null ? Number(resp.balanceBefore).toFixed(2) : null;
          const after = resp?.balanceAfter != null ? Number(resp.balanceAfter).toFixed(2) : null;
          this.success =
            resp?.message +
            (before != null && after != null
              ? ` Balance: ${this.currencySymbol} ${before} → ${this.currencySymbol} ${after}.`
              : '');
          if (resp?.student) {
            this.applyStudentSummary(resp.student);
          }
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to apply credit note.';
        },
      });
  }

  private applyStudentSummary(summary: any): void {
    const activeId = summary.id;
    this.financeService
      .getRemediationPreview({
        studentIds: summary.studentNumber || activeId,
        startDate: this.startDate || undefined,
        endDate: this.endDate || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp: any) => {
          this.notFound = resp?.notFound || [];
          this.students = (resp?.students || []).map((s: RemediationStudent) => ({
            ...s,
            payments: (s.payments || []).map((p: RemediationPayment) => ({
              ...p,
              selected: false,
            })),
          }));
          this.activeStudent =
            this.students.find((s) => s.id === activeId) || this.students[0] || null;
          if (this.activeStudent) {
            this.activeStudent.totalOutstanding = summary.totalOutstanding;
            this.activeStudent.invoices = summary.invoices || this.activeStudent.invoices;
          }
        },
      });
  }

  itemLabel(item: string): string {
    if (item === 'combined') return 'Tuition + fees';
    if (item === 'tuition') return 'Tuition';
    if (item === 'transport') return 'Transport';
    return 'Dining Hall';
  }

  formatMoney(value: number): string {
    return `${this.currencySymbol}${Number(value || 0).toFixed(2)}`;
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  }

  goBack(): void {
    this.router.navigate(['/invoices']);
  }
}

import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { FinanceService } from '../../../services/finance.service';
import { PermissionService } from '../../../services/permission.service';
import { SettingsService } from '../../../services/settings.service';
import { StudentService } from '../../../services/student.service';

export type InvoiceNoteType = 'credit' | 'debit';

@Component({
  standalone: false,
  selector: 'app-invoice-note-page',
  templateUrl: './invoice-note-page.component.html',
  styleUrls: ['./invoice-note-page.component.css'],
})
export class InvoiceNotePageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  @ViewChild('noteSearchInput') noteSearchInput?: ElementRef<HTMLInputElement>;

  noteType: InvoiceNoteType = 'credit';
  invoices: any[] = [];
  loadingInvoices = false;

  selectedInvoice: any = null;
  noteForm = { item: '', amount: 0 };
  noteSearchQuery = '';
  noteLookupError = '';
  noteCandidates: any[] = [];
  noteSubmitting = false;
  noteRefreshing = false;
  noteSuccess = '';
  noteError = '';

  currencySymbol = '';
  transportCostFromSettings: number | null = null;
  diningHallCostFromSettings: number | null = null;
  isNoteAmountAuto = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private financeService: FinanceService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    public authService: AuthService,
    private permissionService: PermissionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const path = this.route.snapshot.routeConfig?.path || '';
    this.noteType = path.includes('debit') ? 'debit' : 'credit';

    if (!this.canAccessPage()) {
      this.router.navigate(['/invoices']);
      return;
    }

    this.loadSettings();
    this.loadInvoices();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isCredit(): boolean {
    return this.noteType === 'credit';
  }

  get pageTitle(): string {
    return this.isCredit ? 'Credit Note' : 'Debit Note';
  }

  get sectionTitle(): string {
    return this.isCredit ? 'Correct Overcharge (Credit Note)' : 'Correct Undercharge (Debit Note)';
  }

  canAccessPage(): boolean {
    return this.isCredit
      ? this.permissionService.canAccessFinancePage('creditNotes', 'edit')
      : this.permissionService.canAccessFinancePage('debitNotes', 'edit');
  }

  loadSettings(): void {
    this.settingsService
      .getSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any) => this.applySettings(data),
      });
  }

  private applySettings(data: any): void {
    this.currencySymbol = data?.currencySymbol || '';
    const rawTransport = data?.feesSettings?.transportCost;
    const parsedTransport = parseFloat(String(rawTransport));
    this.transportCostFromSettings =
      !isNaN(parsedTransport) && parsedTransport > 0 ? parsedTransport : null;
    const rawDh = data?.feesSettings?.diningHallCost;
    const parsedDh = parseFloat(String(rawDh));
    this.diningHallCostFromSettings =
      !isNaN(parsedDh) && parsedDh > 0 ? parsedDh : null;
  }

  loadInvoices(): void {
    this.loadingInvoices = true;
    this.financeService
      .getInvoices()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingInvoices = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          this.invoices = Array.isArray(data) ? data : data?.data || [];
        },
        error: () => {
          this.invoices = [];
        },
      });
  }

  onNoteItemChange(item: string): void {
    this.isNoteAmountAuto = false;
    if (item === 'transport' && this.transportCostFromSettings != null) {
      this.noteForm.amount = this.transportCostFromSettings;
      this.isNoteAmountAuto = true;
    } else if (item === 'diningHall' && this.diningHallCostFromSettings != null) {
      let dh = this.diningHallCostFromSettings;
      const stu = this.selectedInvoice?.student;
      if (stu?.isStaffChild || stu?.isExempted) {
        dh = dh * 0.5;
      }
      this.noteForm.amount = dh;
      this.isNoteAmountAuto = true;
    }
  }

  lookupNoteStudent(): void {
    this.noteLookupError = '';
    this.selectedInvoice = null;
    this.noteCandidates = [];
    const queryRaw = (this.noteSearchQuery || '').trim();
    if (!queryRaw) {
      this.noteLookupError = 'Enter a Student ID or Name.';
      return;
    }
    const query = queryRaw.toLowerCase();
    const invoicesArray = Array.isArray(this.invoices) ? this.invoices : [];

    let matches = invoicesArray.filter(
      (inv) => String(inv.student?.studentNumber || '').toLowerCase() === query
    );

    if (matches.length === 0) {
      const tokens = query.split(/\s+/).filter(Boolean);
      matches = invoicesArray.filter((inv) => {
        const fn = String(inv.student?.firstName || '').toLowerCase();
        const ln = String(inv.student?.lastName || '').toLowerCase();
        return tokens.every((t) => fn.includes(t) || ln.includes(t));
      });
      if (tokens.length === 1) {
        const byToken = invoicesArray
          .map((inv) => inv.student)
          .filter((stu) => !!stu)
          .filter((stu) => {
            const fn = String(stu.firstName || '').toLowerCase();
            const ln = String(stu.lastName || '').toLowerCase();
            const t = tokens[0];
            return fn.includes(t) || ln.includes(t);
          });
        const uniqueMap: Record<string, any> = {};
        byToken.forEach((stu) => {
          const id = stu.id || stu.studentId || '';
          if (id && !uniqueMap[id]) uniqueMap[id] = stu;
        });
        const candidates = Object.values(uniqueMap);
        if (candidates.length > 1) {
          this.noteCandidates = candidates.map((stu: any) => ({
            id: stu.id,
            studentNumber: stu.studentNumber,
            firstName: stu.firstName,
            lastName: stu.lastName,
            className: stu.classEntity?.name || '',
          }));
          return;
        }
      }
    }

    if (matches.length === 0) {
      this.studentService.getStudentsPaginated({ search: queryRaw, page: 1, limit: 50 }).subscribe({
        next: (resp: any) => {
          const students = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
          if (!students.length) {
            this.noteLookupError = 'No students found for provided ID/Name.';
            return;
          }
          const studentIds = new Set(students.map((s: any) => s.id));
          const invs = invoicesArray.filter((inv) => studentIds.has(inv.student?.id || inv.studentId));
          if (!invs.length) {
            this.noteLookupError = 'No invoices found for matching student(s).';
            return;
          }
          if (students.length > 1) {
            this.noteCandidates = students.map((s: any) => ({
              id: s.id,
              studentNumber: s.studentNumber,
              firstName: s.firstName,
              lastName: s.lastName,
              className: s.classEntity?.name || '',
            }));
            return;
          }
          this.selectedInvoice = this.pickLatestInvoice(invs);
        },
        error: () => {
          this.noteLookupError = 'Failed to search students. Please try again.';
        },
      });
      return;
    }

    this.selectedInvoice = this.pickLatestInvoice(matches);
  }

  chooseNoteCandidate(candidateId: string): void {
    this.noteLookupError = '';
    this.selectedInvoice = null;
    const invoicesArray = Array.isArray(this.invoices) ? this.invoices : [];
    const invs = invoicesArray.filter((inv) => (inv.student?.id || inv.studentId) === candidateId);
    if (invs.length > 0) {
      this.selectedInvoice = this.pickLatestInvoice(invs);
      this.noteCandidates = [];
      return;
    }
    this.financeService.getInvoices(candidateId, undefined).subscribe({
      next: (list: any[]) => {
        if (!list?.length) {
          this.noteLookupError = 'No invoices found for selected student.';
          return;
        }
        this.selectedInvoice = this.pickLatestInvoice(list);
        this.noteCandidates = [];
      },
      error: () => {
        this.noteLookupError = 'Failed to fetch invoices for selected student.';
      },
    });
  }

  refreshNoteData(): void {
    if (this.noteRefreshing || this.noteSubmitting) {
      return;
    }

    this.resetPageState();
    this.noteRefreshing = true;

    forkJoin({
      settings: this.settingsService.getSettings(),
      invoices: this.financeService.getInvoices(),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.noteRefreshing = false;
          this.focusSearchInput();
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ settings, invoices }) => {
          this.applySettings(settings);
          this.invoices = invoices || [];
        },
        error: () => {
          this.invoices = [];
          this.noteError = 'Failed to reload page data. Please try again.';
        },
      });
  }

  /** Clear all user-entered and fetched note-page data (fresh start). */
  private resetPageState(): void {
    this.noteSearchQuery = '';
    this.selectedInvoice = null;
    this.noteCandidates = [];
    this.noteLookupError = '';
    this.noteSuccess = '';
    this.noteError = '';
    this.noteForm = { item: '', amount: 0 };
    this.isNoteAmountAuto = false;
    this.invoices = [];
    this.cdr.markForCheck();
  }

  private focusSearchInput(): void {
    setTimeout(() => {
      const el = this.noteSearchInput?.nativeElement;
      if (el) {
        el.focus();
      }
    }, 0);
  }

  submitNote(): void {
    this.noteSuccess = '';
    this.noteError = '';

    if (!this.canAccessPage()) {
      this.noteError = `You do not have permission to apply ${this.isCredit ? 'credit' : 'debit'} notes.`;
      return;
    }
    if (!this.selectedInvoice) {
      this.noteError = 'Please select an invoice first.';
      return;
    }
    if (!this.noteForm.item) {
      this.noteError = 'Please select a cost item to adjust.';
      return;
    }
    const noteAmount = parseFloat(String(this.noteForm.amount ?? 0));
    if (!Number.isFinite(noteAmount) || noteAmount <= 0) {
      this.noteError = 'Please enter a valid amount greater than 0.';
      return;
    }

    const invoiceBalance = parseFloat(String(this.selectedInvoice.balance ?? 0));
    if (this.isCredit && noteAmount > invoiceBalance + 0.005) {
      this.noteError = 'Credit note amount cannot be greater than the current balance.';
      return;
    }

    const invoiceId = this.normalizeInvoiceId(this.selectedInvoice.id);
    if (!invoiceId) {
      this.noteError = 'Invalid invoice. Please search for the student again.';
      return;
    }

    this.noteSubmitting = true;
    this.financeService
      .applyInvoiceNote(invoiceId, {
        type: this.noteType,
        item: this.noteForm.item,
        amount: noteAmount,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.noteSubmitting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response: any) => {
          const updatedInvoice = response?.invoice ?? response;
          if (!updatedInvoice?.id) {
            this.noteError = 'Unexpected response from server. Please refresh and try again.';
            return;
          }
          this.selectedInvoice = {
            ...updatedInvoice,
            balance:
              response?.balanceAfter != null
                ? response.balanceAfter
                : updatedInvoice.balance,
          };
          const idx = this.invoices.findIndex((inv) => inv.id === updatedInvoice.id);
          if (idx !== -1) this.invoices[idx] = this.selectedInvoice;

          const itemLabel = this.noteItemLabel(this.noteForm.item);
          const student = updatedInvoice.student;
          const studentName = student
            ? `${student.firstName || ''} ${student.lastName || ''}`.trim()
            : 'Student';
          const invNum = updatedInvoice.invoiceNumber || updatedInvoice.id;
          const newBal = parseFloat(
            String(response?.balanceAfter ?? updatedInvoice.balance ?? 0)
          ).toFixed(2);
          const prevBal =
            response?.balanceBefore != null
              ? parseFloat(String(response.balanceBefore)).toFixed(2)
              : null;
          const amtStr = noteAmount.toFixed(2);

          const balChange =
            prevBal != null
              ? ` Balance changed from ${this.currencySymbol} ${prevBal} to ${this.currencySymbol} ${newBal}.`
              : ` Updated balance: ${this.currencySymbol} ${newBal}.`;

          if (this.isCredit) {
            this.noteSuccess =
              `${this.currencySymbol} ${amtStr} was deducted from ${itemLabel} for ${studentName} ` +
              `(Invoice ${invNum}).${balChange}`;
          } else {
            this.noteSuccess =
              `${this.currencySymbol} ${amtStr} was added to ${itemLabel} for ${studentName} ` +
              `(Invoice ${invNum}).${balChange}`;
          }
        },
        error: (err: any) => {
          this.noteError =
            err.status === 401
              ? 'Authentication required. Please log in again.'
              : err?.error?.message || 'Failed to apply note';
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/invoices']);
  }

  private pickLatestInvoice(list: any[]): any {
    return list.slice().sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    })[0];
  }

  private normalizeInvoiceId(id: unknown): string {
    const raw = String(id ?? '').trim();
    if (!raw) return '';
    return raw.replace(/:.*$/, '');
  }

  private noteItemLabel(item: string): string {
    if (item === 'tuition') return 'Tuition';
    if (item === 'transport') return 'Transport Fee';
    if (item === 'diningHall') return 'Dining Hall Fee';
    return 'Fees';
  }
}

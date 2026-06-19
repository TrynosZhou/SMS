import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { pdfBlobViewerUrl } from '../../../utils/pdf-preview.util';
import { FinanceService } from '../../../services/finance.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { PermissionService } from '../../../services/permission.service';

type FinancialTab = 'overview' | 'cashbook' | 'debtors' | 'statements';
type CashbookViewMode = 'table' | 'cards';

@Component({
  standalone: false,
  selector: 'app-financial-books',
  templateUrl: './financial-books.component.html',
  styleUrls: ['./financial-books.component.css'],
})
export class FinancialBooksComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly cashbookSearch$ = new Subject<string>();
  private readonly debtorSearch$ = new Subject<string>();
  private readonly studentSearch$ = new Subject<string>();
  private pdfBlobUrl: string | null = null;

  readonly activeTab = signal<FinancialTab>('overview');
  readonly cashbookFrom = signal('');
  readonly cashbookTo = signal('');
  readonly cashbookSearch = signal('');
  readonly debtorSearch = signal('');
  readonly studentPickerSearch = signal('');
  readonly cashbookViewMode = signal<CashbookViewMode>('table');
  readonly selectedStudentId = signal('');
  readonly showAddEntryModal = signal(false);

  /** Draft date filters — applied via Apply dates button */
  cashbookFromDraft = '';
  cashbookToDraft = '';

  currencySymbol = '';
  lastLoadedAt: Date | null = null;
  success = '';
  error = '';

  loadingKpis = false;
  loadingOverview = false;
  loadingCashbook = false;
  loadingDebtors = false;
  loadingStatement = false;
  loadingPdf = false;
  sendingReminders = false;
  savingCashbookEntry = false;

  balanceSheet = { cashBalance: 0, totalDebtors: 0, monthlyCollections: 0, debtorCount: 0 };
  agingBuckets: Array<{ bucket: string; count: number; amount: number }> = [];
  classDebtRows: Array<{ id: string; name: string; formName: string | null; owed: number; studentsOwing: number }> = [];
  recentPayments: any[] = [];
  cashbookEntries: any[] = [];
  cashbookSummary = { count: 0, totalIn: 0, totalOut: 0 };
  debtors: any[] = [];
  filteredDebtors: any[] = [];
  students: any[] = [];
  filteredStudents: any[] = [];
  statement: any = null;

  showPdfViewer = false;
  safePdfUrl: SafeResourceUrl | null = null;

  cashbookForm = {
    entryDate: this.todayIso(),
    type: 'receipt' as 'receipt' | 'payment',
    description: '',
    amount: 0,
    paymentMethod: 'Cash',
    reference: '',
  };

  readonly showDebtorAlert = computed(() => this.balanceSheetSignal().debtorCount > 0);
  readonly debtorTabBadge = computed(() => this.debtorsSignal().length || this.balanceSheetSignal().debtorCount);
  readonly maxAgingAmount = computed(() => {
    const amounts = this.agingBucketsSignal().map((b) => b.amount);
    return amounts.length ? Math.max(...amounts, 1) : 1;
  });

  private readonly balanceSheetSignal = signal({ cashBalance: 0, totalDebtors: 0, monthlyCollections: 0, debtorCount: 0 });
  private readonly agingBucketsSignal = signal<Array<{ bucket: string; count: number; amount: number }>>([]);
  private readonly debtorsSignal = signal<any[]>([]);

  constructor(
    private financeService: FinanceService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    private permissionService: PermissionService,
    private sanitizer: DomSanitizer,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cashbookSearch$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.cashbookSearch.set(q);
        this.loadCashbook();
      });
    this.debtorSearch$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.debtorSearch.set(q);
        this.applyDebtorFilter();
      });
    this.studentSearch$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.studentPickerSearch.set(q);
        this.applyStudentFilter();
      });

    const reload = () => this.bootstrap();
    reload();
    activatePageLoad(this.router, this.destroy$, '/finance/financial-books', reload);
  }

  ngOnDestroy(): void {
    this.revokePdfUrl();
    this.destroy$.next();
    this.destroy$.complete();
  }

  canEditCashbook(): boolean {
    return this.permissionService.canAccessFinancePage('financialBooks', 'edit');
  }

  setTab(tab: FinancialTab): void {
    this.activeTab.set(tab);
    if (tab === 'cashbook') {
      if (!this.cashbookEntries.length && !this.loadingCashbook) {
        this.loadCashbook();
      }
    }
    if (tab === 'debtors' && !this.debtors.length && !this.loadingDebtors) {
      this.loadDebtors();
    }
    if (tab === 'statements' && !this.students.length) {
      this.loadStudents();
    }
    this.cdr.markForCheck();
  }

  bootstrap(): void {
    this.loadSettings();
    this.refreshAll();
  }

  refreshAll(): void {
    this.loadKpis();
    this.loadOverview();
    if (this.activeTab() === 'cashbook') this.loadCashbook();
    if (this.activeTab() === 'debtors') this.loadDebtors();
  }

  loadSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || '';
        this.cdr.markForCheck();
      },
    });
  }

  loadKpis(): void {
    this.loadingKpis = true;
    this.financeService
      .getBalanceSheet()
      .pipe(
        finalize(() => {
          this.loadingKpis = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data) => {
          this.balanceSheet = {
            cashBalance: Number(data?.cashBalance || 0),
            totalDebtors: Number(data?.totalDebtors || 0),
            monthlyCollections: Number(data?.monthlyCollections || 0),
            debtorCount: Number(data?.debtorCount || 0),
          };
          this.balanceSheetSignal.set(this.balanceSheet);
          this.lastLoadedAt = new Date();
        },
        error: () => {
          this.error = 'Failed to load financial summary';
        },
      });
  }

  loadOverview(): void {
    this.loadingOverview = true;
    forkJoin({
      aging: this.financeService.getDebtorsAging(),
      classes: this.financeService.getClassDebtSummary(),
      payments: this.financeService.getRecentPayments(12),
    })
      .pipe(
        finalize(() => {
          this.loadingOverview = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ aging, classes, payments }) => {
          this.agingBuckets = aging;
          this.agingBucketsSignal.set(aging);
          this.classDebtRows = classes;
          this.recentPayments = payments;
        },
        error: () => {
          this.error = 'Failed to load overview data';
        },
      });
  }

  loadCashbook(): void {
    this.loadingCashbook = true;
    const params: { from?: string; to?: string; search?: string } = {};
    if (this.cashbookFrom()) params.from = this.cashbookFrom();
    if (this.cashbookTo()) params.to = this.cashbookTo();
    if (this.cashbookSearch()) params.search = this.cashbookSearch();

    this.financeService
      .getCashbook(params)
      .pipe(
        finalize(() => {
          this.loadingCashbook = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data) => {
          this.cashbookEntries = data?.entries || [];
          this.cashbookSummary = data?.summary || { count: 0, totalIn: 0, totalOut: 0 };
        },
        error: () => {
          this.error = 'Failed to load cashbook';
        },
      });
  }

  loadDebtors(): void {
    this.loadingDebtors = true;
    this.financeService
      .getFinanceDebtors()
      .pipe(
        finalize(() => {
          this.loadingDebtors = false;
          this.applyDebtorFilter();
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (rows) => {
          this.debtors = rows;
          this.debtorsSignal.set(rows);
        },
        error: () => {
          this.error = 'Failed to load debtors';
        },
      });
  }

  loadStudents(): void {
    this.studentService.getStudents().subscribe({
      next: (rows: any) => {
        this.students = Array.isArray(rows) ? rows : rows?.data || [];
        this.applyStudentFilter();
        this.cdr.markForCheck();
      },
    });
  }

  onCashbookSearchInput(value: string): void {
    this.cashbookSearch$.next(value);
  }

  applyCashbookDates(): void {
    this.cashbookFrom.set(this.cashbookFromDraft || '');
    this.cashbookTo.set(this.cashbookToDraft || '');
    this.loadCashbook();
  }

  clearCashbookDates(): void {
    this.cashbookFromDraft = '';
    this.cashbookToDraft = '';
    this.cashbookFrom.set('');
    this.cashbookTo.set('');
    this.loadCashbook();
  }

  openAddEntryModal(): void {
    this.cashbookForm = {
      entryDate: this.todayIso(),
      type: 'receipt',
      description: '',
      amount: 0,
      paymentMethod: 'Cash',
      reference: '',
    };
    this.showAddEntryModal.set(true);
    this.cdr.markForCheck();
  }

  closeAddEntryModal(): void {
    this.showAddEntryModal.set(false);
    this.cdr.markForCheck();
  }

  setCashbookViewMode(mode: CashbookViewMode): void {
    this.cashbookViewMode.set(mode);
  }

  formatCashbookDate(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(String(value));
    if (isNaN(d.getTime())) return String(value).split('T')[0] || '—';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  moneyCell(amount: number): string {
    const n = Number(amount) || 0;
    return `${this.currencySymbol}${this.formatMoney(n)}`;
  }

  /** Single-line label for table display (matches reference layout). */
  shortDescription(text: string | null | undefined): string {
    const line = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    const max = 72;
    if (line.length <= max) return line;
    return `${line.slice(0, max - 1).trim()}…`;
  }

  onDebtorSearchInput(value: string): void {
    this.debtorSearch$.next(value);
  }

  onStudentSearchInput(value: string): void {
    this.studentSearch$.next(value);
  }

  applyDebtorFilter(): void {
    const q = this.debtorSearch().trim().toLowerCase();
    if (!q) {
      this.filteredDebtors = [...this.debtors];
      return;
    }
    this.filteredDebtors = this.debtors.filter((d) => {
      const name = `${d.firstName || ''} ${d.lastName || ''}`.toLowerCase();
      return (
        name.includes(q) ||
        String(d.studentNumber || '').toLowerCase().includes(q) ||
        String(d.className || '').toLowerCase().includes(q)
      );
    });
    this.cdr.markForCheck();
  }

  applyStudentFilter(): void {
    const q = this.studentPickerSearch().trim().toLowerCase();
    if (!q) {
      this.filteredStudents = this.students.slice(0, 50);
      return;
    }
    this.filteredStudents = this.students
      .filter((s) => {
        const name = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
        return (
          name.includes(q) ||
          String(s.studentNumber || '').toLowerCase().includes(q) ||
          String(s.classEntity?.name || s.className || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
    this.cdr.markForCheck();
  }

  selectStudentForStatement(studentId: string): void {
    this.selectedStudentId.set(studentId);
    this.loadingStatement = true;
    this.statement = null;
    this.closePdfViewer();
    this.financeService
      .getStudentStatement(studentId)
      .pipe(
        finalize(() => {
          this.loadingStatement = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data) => {
          this.statement = data;
        },
        error: () => {
          this.error = 'Failed to load student statement';
        },
      });
  }

  viewDebtorStatement(debtor: any): void {
    this.setTab('statements');
    this.selectStudentForStatement(debtor.studentId);
  }

  submitCashbookEntry(): void {
    if (!this.canEditCashbook()) return;
    if (!this.cashbookForm.description.trim() || !this.cashbookForm.amount) {
      this.error = 'Description and amount are required';
      return;
    }
    this.savingCashbookEntry = true;
    this.financeService
      .createCashbookEntry({
        entryDate: this.cashbookForm.entryDate,
        type: this.cashbookForm.type,
        description: this.cashbookForm.description.trim(),
        amount: Number(this.cashbookForm.amount),
        paymentMethod: this.cashbookForm.paymentMethod,
        reference: this.cashbookForm.reference || undefined,
      })
      .pipe(
        finalize(() => {
          this.savingCashbookEntry = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.success = 'Cashbook entry saved';
          this.closeAddEntryModal();
          this.cashbookForm = {
            ...this.cashbookForm,
            description: '',
            amount: 0,
            reference: '',
          };
          this.loadCashbook();
          this.loadKpis();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to save cashbook entry';
        },
      });
  }

  sendRemindersToAllDebtors(): void {
    if (!this.canEditCashbook() || !this.debtors.length) return;
    this.sendingReminders = true;
    const studentIds = this.debtors.map((d) => d.studentId);
    this.financeService
      .sendDebtorReminders(studentIds)
      .pipe(
        finalize(() => {
          this.sendingReminders = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res) => {
          this.success = `Reminders sent to ${res.sent} parent(s)`;
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to send reminders';
        },
      });
  }

  previewStatementPdf(): void {
    const id = this.selectedStudentId();
    if (!id) return;
    this.loadingPdf = true;
    this.financeService
      .getStudentStatementPDF(id)
      .pipe(
        finalize(() => {
          this.loadingPdf = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ blob }) => {
          this.revokePdfUrl();
          this.pdfBlobUrl = URL.createObjectURL(blob);
          this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(pdfBlobViewerUrl(this.pdfBlobUrl));
          this.showPdfViewer = true;
        },
        error: () => {
          this.error = 'Failed to load statement PDF';
        },
      });
  }

  downloadStatementPdf(): void {
    const id = this.selectedStudentId();
    if (!id) return;
    this.loadingPdf = true;
    this.financeService
      .getStudentStatementPDF(id)
      .pipe(
        finalize(() => {
          this.loadingPdf = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ blob, filename }) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
          this.success = 'Statement downloaded';
        },
        error: () => {
          this.error = 'Failed to download statement PDF';
        },
      });
  }

  closePdfViewer(): void {
    this.showPdfViewer = false;
    this.safePdfUrl = null;
    this.revokePdfUrl();
  }

  toggleCashbookView(): void {
    this.cashbookViewMode.set(this.cashbookViewMode() === 'table' ? 'cards' : 'table');
  }

  goManageFees(): void {
    this.router.navigate(['/invoices']);
  }

  agingBarPct(amount: number): number {
    const max = this.maxAgingAmount();
    return max > 0 ? Math.round((amount / max) * 100) : 0;
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number(value) || 0
    );
  }

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  goRecordPayment(): void {
    this.router.navigate(['/payments/record']);
  }

  private todayIso(): string {
    return new Date().toISOString().split('T')[0];
  }

  private revokePdfUrl(): void {
    if (this.pdfBlobUrl) {
      URL.revokeObjectURL(this.pdfBlobUrl);
      this.pdfBlobUrl = null;
    }
  }
}

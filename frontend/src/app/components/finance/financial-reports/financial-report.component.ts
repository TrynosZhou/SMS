import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { StudentService } from '../../../services/student.service';

export type FinancialReportId =
  | 'aged-debtors'
  | 'enrolment-vs-billing'
  | 'revenue-recognition'
  | 'student-reconciliation'
  | 'analytics-forecasts'
  | 'class-reconciliation';

const REPORT_META: Record<
  FinancialReportId,
  { title: string; icon: string; subtitle: string }
> = {
  'aged-debtors': {
    title: 'Aged Debtors',
    icon: '⏳',
    subtitle: 'Outstanding balances grouped by how long fees have been due'
  },
  'enrolment-vs-billing': {
    title: 'Enrolment vs Billing',
    icon: '📈',
    subtitle: 'Compare enrolled students with those billed for the term'
  },
  'revenue-recognition': {
    title: 'Revenue Recognition',
    icon: '📊',
    subtitle: 'Invoiced, collected, and outstanding amounts for the term'
  },
  'student-reconciliation': {
    title: 'Student Reconciliation',
    icon: '⚖️',
    subtitle: 'Students with earlier unpaid invoices and a newer invoice on file'
  },
  'analytics-forecasts': {
    title: 'Analytics & Forecasts',
    icon: '🔮',
    subtitle: 'Collection performance and simple projections'
  },
  'class-reconciliation': {
    title: 'Class Reconciliation',
    icon: '🏫',
    subtitle: 'Outstanding balances summarized by class'
  }
};

@Component({
  standalone: false,
  selector: 'app-financial-report',
  templateUrl: './financial-report.component.html',
  styleUrls: ['./financial-report.component.css']
})
export class FinancialReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly agedSearchInput$ = new Subject<string>();
  private readonly revenueSearchInput$ = new Subject<string>();
  reportId: FinancialReportId = 'aged-debtors';
  meta = REPORT_META['aged-debtors'];
  loading = false;
  error = '';
  currencySymbol = '';
  term = '';
  availableTerms: string[] = [];
  lastLoadedAt: Date | null = null;

  agedBuckets: Array<{ label: string; count: number; total: number }> = [];
  agedRows: Array<{
    studentNumber: string;
    lastName: string;
    firstName: string;
    invoiceNumber: string;
    dueDate: string;
    daysOverdue: number;
    balance: number;
    bucket: string;
  }> = [];
  agedDisplayedRows: typeof this.agedRows = [];
  agedSearchQuery = '';
  agedSelectedBucket = 'all';
  agedSortBy: 'daysOverdue' | 'balance' | 'dueDate' = 'daysOverdue';
  agedSortDir: 'asc' | 'desc' = 'desc';

  enrolmentStats = {
    enrolledActive: 0,
    withInvoice: 0,
    enrolledNotBilled: 0,
    billedNotEnrolled: 0
  };
  enrolmentRows: Array<{
    studentNumber: string;
    name: string;
    className: string;
    status: string;
  }> = [];

  revenue = {
    totalInvoiced: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    collectionRate: 0,
    invoicesCount: 0,
    studentsWithInvoices: 0,
    studentsFullyPaid: 0,
    studentsPartiallyPaid: 0,
    studentsUnpaid: 0
  };

  /** Cash receipt lines for revenue-recognition (term scope). */
  revenueReceiptItems: Array<{
    receiptNumber?: string;
    paymentDate?: string;
    studentName?: string;
    studentNumber?: string;
    invoiceNumber?: string;
    invoiceTerm?: string;
    amountPaid?: number;
    paymentMethod?: string;
  }> = [];
  revenueDisplayedItems: typeof this.revenueReceiptItems = [];
  revenueSearchQuery = '';
  revenueSelectedMethod = 'all';
  revenueAvailableMethods: string[] = [];
  revenueSortBy:
    | 'paymentDate'
    | 'amountPaid'
    | 'studentName'
    | 'invoiceNumber'
    | 'paymentMethod'
    | 'receiptNumber' = 'paymentDate';
  revenueSortDir: 'asc' | 'desc' = 'desc';
  readonly revenueSkeletonRows = [0, 1, 2, 3, 4, 5];

  reconcile: any = null;
  analytics: {
    totalStudentsOwing: number;
    totalOutstanding: number;
    averageBalance: number;
    collectionRate: number;
    projectedCollection: number;
  } = {
    totalStudentsOwing: 0,
    totalOutstanding: 0,
    averageBalance: 0,
    collectionRate: 0,
    projectedCollection: 0
  };

  classRows: Array<{
    className: string;
    studentCount: number;
    totalOutstanding: number;
  }> = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private studentService: StudentService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.agedSearchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.agedSearchQuery = q;
        this.applyAgedView();
        this.cdr.markForCheck();
      });

    this.revenueSearchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.revenueSearchQuery = q;
        this.applyRevenueView();
        this.cdr.markForCheck();
      });

    this.route.data.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      const id = (data['report'] || 'aged-debtors') as FinancialReportId;
      this.reportId = REPORT_META[id] ? id : 'aged-debtors';
      this.meta = REPORT_META[this.reportId];
      activatePageLoad(this.router, this.destroy$, this.router.url, () => this.bootstrap());
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrap(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || '';
      }
    });
    this.settingsService.getActiveTerm().subscribe({
      next: (r: any) => {
        if (!this.term && r?.activeTerm) {
          this.term = r.activeTerm;
        }
        this.loadReport();
      },
      error: () => this.loadReport()
    });
  }

  onTermChange(val: string): void {
    this.term = val;
    this.loadReport();
  }

  loadReport(): void {
    this.loading = true;
    this.error = '';
    switch (this.reportId) {
      case 'aged-debtors':
        this.loadAgedDebtors();
        break;
      case 'enrolment-vs-billing':
        this.loadEnrolmentVsBilling();
        break;
      case 'revenue-recognition':
        this.loadRevenueRecognition();
        break;
      case 'student-reconciliation':
        this.loadStudentReconciliation();
        break;
      case 'analytics-forecasts':
        this.loadAnalytics();
        break;
      case 'class-reconciliation':
        this.loadClassReconciliation();
        break;
    }
  }

  private finish(): void {
    this.loading = false;
    this.lastLoadedAt = new Date();
    this.cdr.markForCheck();
  }

  private loadAgedDebtors(): void {
    this.financeService
      .getInvoices(undefined, undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.finish())
      )
      .subscribe({
        next: (invoices) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const rows: typeof this.agedRows = [];
          for (const inv of invoices || []) {
            if (inv.isVoided) continue;
            const bal = parseFloat(String(inv.balance || 0)) || 0;
            if (bal <= 0.005) continue;
            const due = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.createdAt);
            due.setHours(0, 0, 0, 0);
            const days = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
            let bucket = 'Current';
            if (days > 90) bucket = '90+ days';
            else if (days > 60) bucket = '61–90 days';
            else if (days > 30) bucket = '31–60 days';
            else if (days > 0) bucket = '1–30 days';
            const st = inv.student || {};
            rows.push({
              studentNumber: st.studentNumber || inv.studentNumber || '—',
              lastName: (st.lastName && String(st.lastName).trim()) || '—',
              firstName: (st.firstName && String(st.firstName).trim()) || '—',
              invoiceNumber: inv.invoiceNumber || '—',
              dueDate: due.toISOString().slice(0, 10),
              daysOverdue: days,
              balance: bal,
              bucket
            });
          }
          rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
          this.agedRows = rows;
          this.applyAgedView();
        },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to load aged debtors';
          this.agedRows = [];
          this.agedDisplayedRows = [];
          this.agedBuckets = [];
        }
      });
  }

  onAgedSearchInput(value: string): void {
    this.agedSearchInput$.next((value || '').trim());
  }

  onAgedBucketChange(value: string): void {
    this.agedSelectedBucket = value || 'all';
    this.applyAgedView();
  }

  onAgedSortChange(value: 'daysOverdue' | 'balance' | 'dueDate'): void {
    this.agedSortBy = value;
    this.applyAgedView();
  }

  onAgedSortDirChange(value: 'asc' | 'desc'): void {
    this.agedSortDir = value;
    this.applyAgedView();
  }

  clearAgedFilters(): void {
    this.agedSearchQuery = '';
    this.agedSelectedBucket = 'all';
    this.agedSortBy = 'daysOverdue';
    this.agedSortDir = 'desc';
    this.applyAgedView();
  }

  getAgedTotalOutstanding(): number {
    return this.agedDisplayedRows.reduce((sum, row) => sum + (Number(row.balance) || 0), 0);
  }

  getAgedStudentsCount(): number {
    const keys = new Set(this.agedDisplayedRows.map((r) => `${r.studentNumber}|${r.lastName}|${r.firstName}`));
    return keys.size;
  }

  getOldestAgedDays(): number {
    if (!this.agedDisplayedRows.length) return 0;
    return Math.max(...this.agedDisplayedRows.map((r) => Number(r.daysOverdue) || 0));
  }

  private applyAgedView(): void {
    const q = this.agedSearchQuery.toLowerCase();
    let list = [...this.agedRows];
    if (this.agedSelectedBucket !== 'all') {
      list = list.filter((row) => row.bucket === this.agedSelectedBucket);
    }
    if (q) {
      list = list.filter((row) =>
        [row.studentNumber, row.lastName, row.firstName, row.invoiceNumber, row.bucket]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }

    const dir = this.agedSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (this.agedSortBy === 'balance') return (a.balance - b.balance) * dir;
      if (this.agedSortBy === 'dueDate') return (a.dueDate.localeCompare(b.dueDate)) * dir;
      return (a.daysOverdue - b.daysOverdue) * dir;
    });

    this.agedDisplayedRows = list;
    this.agedBuckets = this.buildAgedBuckets(list);
  }

  private buildAgedBuckets(rows: typeof this.agedRows): Array<{ label: string; count: number; total: number }> {
    const labels = ['Current', '1–30 days', '31–60 days', '61–90 days', '90+ days'];
    return labels.map((label) => {
      const inBucket = rows.filter((r) => r.bucket === label);
      return {
        label,
        count: inBucket.length,
        total: inBucket.reduce((s, r) => s + r.balance, 0)
      };
    });
  }

  private loadEnrolmentVsBilling(): void {
    const term = this.term;
    forkJoin({
      students: this.studentService.getStudents().pipe(catchError(() => of([]))),
      invoices: this.financeService.getInvoices().pipe(catchError(() => of([])))
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.finish())
      )
      .subscribe({
        next: ({ students, invoices }) => {
          const studentList = Array.isArray(students) ? students : [];
          const enrolled = studentList.filter(
            (s: any) =>
              String(s.status || 'active').toLowerCase() === 'active' &&
              (s.classId || s.classEntity?.id)
          );
          const termNorm = (term || '').trim().toLowerCase();
          const invoicedStudentIds = new Set<string>();
          for (const inv of invoices || []) {
            if (inv.isVoided) continue;
            const invTerm = String(inv.term || '').trim().toLowerCase();
            if (termNorm && invTerm && invTerm !== termNorm) continue;
            if (inv.studentId) invoicedStudentIds.add(inv.studentId);
          }
          const enrolledIds = new Set(enrolled.map((s: any) => s.id));
          const rows: typeof this.enrolmentRows = [];
          for (const s of enrolled) {
            if (!invoicedStudentIds.has(s.id)) {
              rows.push({
                studentNumber: s.studentNumber || '—',
                name: [s.firstName, s.lastName].filter(Boolean).join(' '),
                className: s.classEntity?.name || s.class?.name || 'Unassigned',
                status: 'Enrolled — not billed'
              });
            }
          }
          for (const inv of invoices || []) {
            if (inv.isVoided) continue;
            const invTerm = String(inv.term || '').trim().toLowerCase();
            if (termNorm && invTerm && invTerm !== termNorm) continue;
            if (inv.studentId && !enrolledIds.has(inv.studentId)) {
              const st = inv.student || {};
              rows.push({
                studentNumber: st.studentNumber || '—',
                name: [st.firstName, st.lastName].filter(Boolean).join(' ') || '—',
                className: '—',
                status: 'Billed — not enrolled in class'
              });
            }
          }
          this.enrolmentRows = rows.slice(0, 500);
          this.enrolmentStats = {
            enrolledActive: enrolled.length,
            withInvoice: [...enrolledIds].filter((id) => invoicedStudentIds.has(id)).length,
            enrolledNotBilled: enrolled.filter((s: any) => !invoicedStudentIds.has(s.id)).length,
            billedNotEnrolled: rows.filter((r) => r.status.startsWith('Billed')).length
          };
        },
        error: () => {
          this.error = 'Failed to load enrolment vs billing';
        }
      });
  }

  private loadRevenueRecognition(): void {
    this.financeService
      .getCashReceipts(this.term || undefined, 'all', 1, 100, undefined, undefined, { fetchAll: true })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.finish())
      )
      .subscribe({
        next: (res) => {
          this.availableTerms = Array.isArray(res?.availableTerms) ? res.availableTerms : [];
          if (!this.term && res?.term) this.term = res.term;
          const invoiced = Number(res?.totalInvoiced) || 0;
          const collected = Number(res?.totalCollected ?? res?.totalPayments) || 0;
          const outstanding = Number(res?.totalOutstanding) || 0;
          this.revenue = {
            totalInvoiced: invoiced,
            totalCollected: collected,
            totalOutstanding: outstanding,
            collectionRate: invoiced > 0 ? Math.round((collected / invoiced) * 1000) / 10 : 0,
            invoicesCount: Number(res?.invoicesCount) || 0,
            studentsWithInvoices: Number(res?.studentsWithInvoices) || 0,
            studentsFullyPaid: Number(res?.studentsFullyPaid) || 0,
            studentsPartiallyPaid: Number(res?.studentsPartiallyPaid) || 0,
            studentsUnpaid: Number(res?.studentsUnpaid) || 0
          };
          this.revenueReceiptItems = Array.isArray(res?.items) ? res.items : [];
          this.revenueAvailableMethods = this.buildRevenueMethods(this.revenueReceiptItems);
          this.applyRevenueView();
        },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to load revenue data';
          this.revenueReceiptItems = [];
          this.revenueDisplayedItems = [];
          this.revenueAvailableMethods = [];
          this.revenue = {
            totalInvoiced: 0,
            totalCollected: 0,
            totalOutstanding: 0,
            collectionRate: 0,
            invoicesCount: 0,
            studentsWithInvoices: 0,
            studentsFullyPaid: 0,
            studentsPartiallyPaid: 0,
            studentsUnpaid: 0
          };
        }
      });
  }

  getRevenueOutstandingSharePct(): number {
    const inv = this.revenue.totalInvoiced;
    if (inv <= 0) return 0;
    return Math.min(100, Math.round((this.revenue.totalOutstanding / inv) * 1000) / 10);
  }

  getRevenueCollectedSharePct(): number {
    const inv = this.revenue.totalInvoiced;
    if (inv <= 0) return 0;
    return Math.min(100, Math.round((this.revenue.totalCollected / inv) * 1000) / 10);
  }

  onRevenueSearchInput(value: string): void {
    this.revenueSearchInput$.next((value || '').trim());
  }

  onRevenueMethodChange(value: string): void {
    this.revenueSelectedMethod = value || 'all';
    this.applyRevenueView();
  }

  clearRevenueFilters(): void {
    this.revenueSearchQuery = '';
    this.revenueSearchInput$.next('');
    this.revenueSelectedMethod = 'all';
    this.revenueSortBy = 'paymentDate';
    this.revenueSortDir = 'desc';
    this.applyRevenueView();
  }

  revenueSortIndicator(
    column: 'paymentDate' | 'amountPaid' | 'studentName' | 'invoiceNumber' | 'paymentMethod' | 'receiptNumber'
  ): string {
    if (this.revenueSortBy !== column) return '';
    return this.revenueSortDir === 'asc' ? '▲' : '▼';
  }

  setRevenueSort(
    column: 'paymentDate' | 'amountPaid' | 'studentName' | 'invoiceNumber' | 'paymentMethod' | 'receiptNumber'
  ): void {
    if (this.revenueSortBy === column) {
      this.revenueSortDir = this.revenueSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.revenueSortBy = column;
      this.revenueSortDir = column === 'amountPaid' || column === 'paymentDate' ? 'desc' : 'asc';
    }
    this.applyRevenueView();
  }

  private buildRevenueMethods(items: typeof this.revenueReceiptItems): string[] {
    const set = new Set<string>();
    for (const it of items) {
      const m = String(it?.paymentMethod || '').trim();
      if (m) set.add(m);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  private applyRevenueView(): void {
    const q = (this.revenueSearchQuery || '').toLowerCase();
    let list = [...this.revenueReceiptItems];
    if (this.revenueSelectedMethod !== 'all') {
      list = list.filter((r) => String(r?.paymentMethod || '').trim() === this.revenueSelectedMethod);
    }
    if (q) {
      list = list.filter((r) =>
        [r.studentNumber, r.studentName, r.invoiceNumber, r.invoiceTerm, r.receiptNumber, r.paymentMethod]
          .map((x) => String(x || '').toLowerCase())
          .join(' ')
          .includes(q)
      );
    }
    const dir = this.revenueSortDir === 'asc' ? 1 : -1;
    const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
    const str = (v: unknown) => String(v ?? '').toLowerCase();
    const dateMs = (v: unknown) => new Date(String(v || 0)).getTime() || 0;
    list.sort((a, b) => {
      switch (this.revenueSortBy) {
        case 'amountPaid':
          return (num(a.amountPaid) - num(b.amountPaid)) * dir;
        case 'studentName':
          return str(a.studentName).localeCompare(str(b.studentName)) * dir;
        case 'invoiceNumber':
          return str(a.invoiceNumber).localeCompare(str(b.invoiceNumber)) * dir;
        case 'paymentMethod':
          return str(a.paymentMethod).localeCompare(str(b.paymentMethod)) * dir;
        case 'receiptNumber':
          return str(a.receiptNumber).localeCompare(str(b.receiptNumber)) * dir;
        case 'paymentDate':
        default:
          return (dateMs(a.paymentDate) - dateMs(b.paymentDate)) * dir;
      }
    });
    this.revenueDisplayedItems = list;
  }

  private loadStudentReconciliation(): void {
    this.financeService
      .getReconcileSummary(this.term || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.finish())
      )
      .subscribe({
        next: (res) => {
          this.reconcile = res;
          if (!this.term && res?.term) this.term = res.term;
        },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to load reconciliation';
        }
      });
  }

  private loadAnalytics(): void {
    forkJoin({
      cash: this.financeService.getCashReceipts(this.term || undefined, 'all').pipe(catchError(() => of(null))),
      outstanding: this.financeService.getOutstandingBalances().pipe(catchError(() => of([])))
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.finish())
      )
      .subscribe({
        next: ({ cash, outstanding }) => {
          const balances = Array.isArray(outstanding) ? outstanding : [];
          const totalOutstanding = balances.reduce(
            (s, b) => s + (parseFloat(String(b.invoiceBalance || 0)) || 0),
            0
          );
          const invoiced = Number(cash?.totalInvoiced) || 0;
          const collected = Number(cash?.totalCollected ?? cash?.totalPayments) || 0;
          const rate = invoiced > 0 ? collected / invoiced : 0;
          this.availableTerms = Array.isArray(cash?.availableTerms) ? cash.availableTerms : [];
          if (!this.term && cash?.term) this.term = cash.term;
          this.analytics = {
            totalStudentsOwing: balances.length,
            totalOutstanding: totalOutstanding,
            averageBalance: balances.length ? totalOutstanding / balances.length : 0,
            collectionRate: Math.round(rate * 1000) / 10,
            projectedCollection: Math.round(totalOutstanding * rate * 100) / 100
          };
        },
        error: () => {
          this.error = 'Failed to load analytics';
        }
      });
  }

  private loadClassReconciliation(): void {
    this.financeService
      .getOutstandingBalances()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.finish())
      )
      .subscribe({
        next: (rows) => {
          const map = new Map<string, { count: number; total: number }>();
          for (const r of rows || []) {
            const cls = (r.className || 'Unassigned').trim() || 'Unassigned';
            const prev = map.get(cls) || { count: 0, total: 0 };
            prev.count += 1;
            prev.total += parseFloat(String(r.invoiceBalance || 0)) || 0;
            map.set(cls, prev);
          }
          this.classRows = Array.from(map.entries())
            .map(([className, v]) => ({
              className,
              studentCount: v.count,
              totalOutstanding: Math.round(v.total * 100) / 100
            }))
            .sort((a, b) => b.totalOutstanding - a.totalOutstanding);
        },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to load class reconciliation';
        }
      });
  }

  formatAmount(n: number): string {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  }

  exportCsv(): void {
    let header: string[] = [];
    let lines: string[] = [];
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    switch (this.reportId) {
      case 'aged-debtors':
        header = ['Student ID', 'Last name', 'First name', 'Invoice', 'Due', 'Days', 'Bucket', 'Balance'];
        lines = [header.join(',')];
        for (const r of this.agedDisplayedRows) {
          lines.push(
            [
              r.studentNumber,
              r.lastName,
              r.firstName,
              r.invoiceNumber,
              r.dueDate,
              r.daysOverdue,
              r.bucket,
              r.balance.toFixed(2)
            ]
              .map(esc)
              .join(',')
          );
        }
        break;
      case 'enrolment-vs-billing':
        header = ['Student #', 'Name', 'Class', 'Status'];
        lines = [header.join(',')];
        for (const r of this.enrolmentRows) {
          lines.push([r.studentNumber, r.name, r.className, r.status].map(esc).join(','));
        }
        break;
      case 'class-reconciliation':
        header = ['Class', 'Students', 'Outstanding'];
        lines = [header.join(',')];
        for (const r of this.classRows) {
          lines.push([r.className, r.studentCount, r.totalOutstanding.toFixed(2)].map(esc).join(','));
        }
        break;
      case 'student-reconciliation':
        header = ['Student #', 'Name', 'Earlier outstanding', 'Earlier invoices', 'Latest invoice', 'Latest balance'];
        lines = [header.join(',')];
        for (const s of this.reconcile?.discrepancyStudents || []) {
          lines.push(
            [
              s.studentNumber,
              s.studentName,
              (s.earlierOutstandingTotal ?? 0).toFixed(2),
              s.earlierInvoicesCount,
              s.latestInvoiceNumber,
              (s.latestBalance ?? 0).toFixed(2)
            ]
              .map(esc)
              .join(',')
          );
        }
        break;
      case 'revenue-recognition':
        header = ['Receipt', 'Date', 'Student #', 'Student', 'Invoice', 'Term', 'Amount', 'Method'];
        lines = [header.join(',')];
        for (const r of this.revenueDisplayedItems) {
          lines.push(
            [
              r.receiptNumber,
              r.paymentDate,
              r.studentNumber,
              r.studentName,
              r.invoiceNumber,
              r.invoiceTerm,
              (parseFloat(String(r.amountPaid ?? 0)) || 0).toFixed(2),
              r.paymentMethod
            ]
              .map(esc)
              .join(',')
          );
        }
        break;
      default:
        return;
    }
    if (lines.length <= 1) return;
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.meta.title.replace(/\s+/g, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { StudentService } from '../../../services/student.service';

export type FinancialReportId =
  | 'enrolment-vs-billing'
  | 'student-reconciliation'
  | 'analytics-forecasts'
  | 'class-reconciliation';

const REPORT_META: Record<
  FinancialReportId,
  { title: string; icon: string; subtitle: string }
> = {
  'enrolment-vs-billing': {
    title: 'Enrolment vs Billing',
    icon: '📈',
    subtitle: 'Compare enrolled students with those billed for the term'
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
  styleUrls: ['./financial-report.component.css', './financial-report-modern.css']
})
export class FinancialReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly enrolmentSearchInput$ = new Subject<string>();
  private readonly reconcileSearchInput$ = new Subject<string>();
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  reportId: FinancialReportId = 'enrolment-vs-billing';
  meta = REPORT_META['enrolment-vs-billing'];
  loading = false;
  error = '';
  success = '';
  currencySymbol = '';
  term = '';
  availableTerms: string[] = [];
  lastLoadedAt: Date | null = null;

  searchQuery = '';
  statusFilter: 'all' | 'enrolled-not-billed' | 'billed-not-enrolled' = 'all';
  displayedEnrolmentRows: Array<{
    studentNumber: string;
    name: string;
    className: string;
    status: string;
  }> = [];
  enrolmentSortColumn: 'studentNumber' | 'name' | 'className' | 'status' = 'name';
  enrolmentSortDir: 'asc' | 'desc' = 'asc';

  reconcileSearchQuery = '';
  reconcileFilter: 'all' | 'high-balance' | 'multi-invoice' = 'all';
  displayedReconcileStudents: any[] = [];
  reconcileSortColumn:
    | 'studentNumber'
    | 'studentName'
    | 'earlierOutstandingTotal'
    | 'earlierInvoicesCount'
    | 'latestBalance' = 'earlierOutstandingTotal';
  reconcileSortDir: 'asc' | 'desc' = 'desc';

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
    this.enrolmentSearchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.searchQuery = q;
        if (this.isEnrolmentReport) this.applyEnrolmentView();
        this.cdr.markForCheck();
      });

    this.reconcileSearchInput$
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => {
        this.reconcileSearchQuery = q;
        if (this.isStudentReconcileReport) this.applyReconcileView();
        this.cdr.markForCheck();
      });

    this.route.data.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      const id = (data['report'] || 'enrolment-vs-billing') as FinancialReportId;
      this.reportId = REPORT_META[id] ? id : 'enrolment-vs-billing';
      this.meta = REPORT_META[this.reportId];
      this.resetReportFilters();
      activatePageLoad(this.router, this.destroy$, this.router.url, () => this.bootstrap());
    });
  }

  private resetReportFilters(): void {
    this.searchQuery = '';
    this.reconcileSearchQuery = '';
    this.statusFilter = 'all';
    this.reconcileFilter = 'all';
    this.displayedEnrolmentRows = [];
    this.displayedReconcileStudents = [];
    this.error = '';
    this.success = '';
  }

  get isEnrolmentReport(): boolean {
    return this.reportId === 'enrolment-vs-billing';
  }

  get isStudentReconcileReport(): boolean {
    return this.reportId === 'student-reconciliation';
  }

  get isLegacyReport(): boolean {
    return !this.isEnrolmentReport && !this.isStudentReconcileReport;
  }

  get hasEnrolmentData(): boolean {
    return this.lastLoadedAt != null;
  }

  get hasReconcileData(): boolean {
    return this.lastLoadedAt != null && !!this.reconcile;
  }

  get reconcileStudents(): any[] {
    return Array.isArray(this.reconcile?.discrepancyStudents)
      ? this.reconcile.discrepancyStudents
      : [];
  }

  get reconcileAlignmentPct(): number {
    const term = parseFloat(String(this.reconcile?.totalOutstandingTerm || 0)) || 0;
    const latest = parseFloat(String(this.reconcile?.totalOutstandingLatest || 0)) || 0;
    if (term <= 0) return latest <= 0 ? 100 : 0;
    return Math.round((latest / term) * 1000) / 10;
  }

  get reconcileFilterSummary(): string {
    const parts: string[] = [];
    if (this.term) parts.push(`Term: ${this.term}`);
    if (this.reconcileFilter === 'high-balance') parts.push('Earlier outstanding > 1,000');
    if (this.reconcileFilter === 'multi-invoice') parts.push('Multiple earlier invoices');
    if (this.reconcileSearchQuery) parts.push(`Search: "${this.reconcileSearchQuery}"`);
    parts.push(
      `${this.displayedReconcileStudents.length} of ${this.reconcileStudents.length} shown`
    );
    return parts.join(' · ');
  }

  get reconcileChipCounts(): { all: number; highBalance: number; multiInvoice: number } {
    const all = this.reconcileStudents.length;
    const highBalance = this.reconcileStudents.filter(
      (s) => (parseFloat(String(s.earlierOutstandingTotal || 0)) || 0) > 1000
    ).length;
    const multiInvoice = this.reconcileStudents.filter(
      (s) => (Number(s.earlierInvoicesCount) || 0) > 1
    ).length;
    return { all, highBalance, multiInvoice };
  }

  get billingRate(): number {
    const enrolled = this.enrolmentStats.enrolledActive;
    if (!enrolled) return 0;
    return Math.round((this.enrolmentStats.withInvoice / enrolled) * 1000) / 10;
  }

  get enrolmentFilterSummary(): string {
    const parts: string[] = [];
    if (this.term) parts.push(`Term: ${this.term}`);
    if (this.statusFilter !== 'all') {
      parts.push(
        this.statusFilter === 'enrolled-not-billed' ? 'Enrolled — not billed' : 'Billed — not in class'
      );
    }
    if (this.searchQuery) parts.push(`Search: "${this.searchQuery}"`);
    parts.push(`${this.displayedEnrolmentRows.length} of ${this.enrolmentRows.length} shown`);
    return parts.join(' · ');
  }

  get statusChipCounts(): { all: number; enrolledNotBilled: number; billedNotEnrolled: number } {
    const enrolledNotBilled = this.enrolmentRows.filter((r) =>
      r.status.startsWith('Enrolled')
    ).length;
    const billedNotEnrolled = this.enrolmentRows.filter((r) => r.status.startsWith('Billed')).length;
    return {
      all: this.enrolmentRows.length,
      enrolledNotBilled,
      billedNotEnrolled
    };
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
      case 'enrolment-vs-billing':
        this.loadEnrolmentVsBilling();
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
          const termSet = new Set<string>();
          for (const inv of invoices || []) {
            const t = String(inv.term || '').trim();
            if (t) termSet.add(t);
          }
          this.availableTerms = Array.from(termSet).sort((a, b) => b.localeCompare(a));
          this.applyEnrolmentView();
        },
        error: () => {
          this.error = 'Failed to load enrolment vs billing';
        }
      });
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
          if (res?.term) {
            const terms = new Set(this.availableTerms);
            terms.add(String(res.term).trim());
            this.availableTerms = Array.from(terms).sort((a, b) => b.localeCompare(a));
          }
          this.applyReconcileView();
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

  clearAlert(kind: 'success' | 'error'): void {
    if (kind === 'success') this.success = '';
    else this.error = '';
  }

  onSearchInput(value: string): void {
    this.enrolmentSearchInput$.next((value || '').trim());
  }

  onReconcileSearchInput(value: string): void {
    this.reconcileSearchInput$.next((value || '').trim());
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.enrolmentSearchInput$.next('');
    this.applyEnrolmentView();
    this.cdr.markForCheck();
  }

  clearReconcileSearch(): void {
    this.reconcileSearchQuery = '';
    this.reconcileSearchInput$.next('');
    this.applyReconcileView();
    this.cdr.markForCheck();
  }

  onReconcileFilterChange(filter: 'all' | 'high-balance' | 'multi-invoice'): void {
    this.reconcileFilter = filter;
    this.applyReconcileView();
    this.cdr.markForCheck();
  }

  toggleReconcileSort(
    column:
      | 'studentNumber'
      | 'studentName'
      | 'earlierOutstandingTotal'
      | 'earlierInvoicesCount'
      | 'latestBalance'
  ): void {
    if (this.reconcileSortColumn === column) {
      this.reconcileSortDir = this.reconcileSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.reconcileSortColumn = column;
      this.reconcileSortDir = column === 'studentName' || column === 'studentNumber' ? 'asc' : 'desc';
    }
    this.applyReconcileView();
    this.cdr.markForCheck();
  }

  reconcileSortIcon(column: string): string {
    if (this.reconcileSortColumn !== column) return '↕';
    return this.reconcileSortDir === 'asc' ? '↑' : '↓';
  }

  trackByReconcileStudent(_index: number, s: { studentId?: string; studentNumber?: string }): string {
    return s.studentId || s.studentNumber || String(_index);
  }

  isHighEarlierBalance(amount: number): boolean {
    return (parseFloat(String(amount || 0)) || 0) > 1000;
  }

  private applyReconcileView(): void {
    let rows = [...this.reconcileStudents];
    if (this.reconcileFilter === 'high-balance') {
      rows = rows.filter((s) => this.isHighEarlierBalance(s.earlierOutstandingTotal));
    } else if (this.reconcileFilter === 'multi-invoice') {
      rows = rows.filter((s) => (Number(s.earlierInvoicesCount) || 0) > 1);
    }
    const q = (this.reconcileSearchQuery || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (s) =>
          (s.studentNumber || '').toLowerCase().includes(q) ||
          (s.studentName || '').toLowerCase().includes(q) ||
          (s.latestInvoiceNumber || '').toLowerCase().includes(q) ||
          (s.latestInvoiceTerm || '').toLowerCase().includes(q)
      );
    }
    const col = this.reconcileSortColumn;
    const dir = this.reconcileSortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let av: string | number = (a as any)[col] ?? '';
      let bv: string | number = (b as any)[col] ?? '';
      if (col === 'earlierOutstandingTotal' || col === 'earlierInvoicesCount' || col === 'latestBalance') {
        av = parseFloat(String(av)) || 0;
        bv = parseFloat(String(bv)) || 0;
        return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      }
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    this.displayedReconcileStudents = rows;
  }

  printStudentReconciliationReport(): void {
    if (!this.displayedReconcileStudents.length) return;
    const rows = this.displayedReconcileStudents
      .map(
        (s) => `
      <tr>
        <td>${this.escapeHtml(s.studentNumber)}</td>
        <td>${this.escapeHtml(s.studentName)}</td>
        <td style="text-align:right">${this.escapeHtml(this.currencySymbol)} ${this.formatAmount(s.earlierOutstandingTotal)}</td>
        <td>${s.earlierInvoicesCount}</td>
        <td>${this.escapeHtml(s.latestInvoiceNumber)} (${this.escapeHtml(s.latestInvoiceTerm)})</td>
        <td style="text-align:right">${this.escapeHtml(this.currencySymbol)} ${this.formatAmount(s.latestBalance || 0)}</td>
      </tr>`
      )
      .join('');
    const html = `
      <!DOCTYPE html><html><head><title>Student Reconciliation</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; color: #0f172a; }
        h1 { font-size: 1.25rem; margin-bottom: 4px; }
        p.meta { color: #64748b; font-size: 0.85rem; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.85rem; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
        th { background: #f8fafc; text-transform: uppercase; font-size: 0.7rem; }
      </style></head><body>
      <h1>Student Reconciliation</h1>
      <p class="meta">Term: ${this.escapeHtml(this.term || 'All')} · Term outstanding: ${this.escapeHtml(this.currencySymbol)} ${this.formatAmount(this.reconcile?.totalOutstandingTerm)} ·
      Difference: ${this.escapeHtml(this.currencySymbol)} ${this.formatAmount(this.reconcile?.difference)} ·
      ${this.displayedReconcileStudents.length} row(s) · Printed ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>Student #</th><th>Name</th><th>Earlier outstanding</th><th># Earlier inv.</th><th>Latest invoice</th><th>Latest balance</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  onStatusFilterChange(filter: 'all' | 'enrolled-not-billed' | 'billed-not-enrolled'): void {
    this.statusFilter = filter;
    this.applyEnrolmentView();
    this.cdr.markForCheck();
  }

  toggleEnrolmentSort(column: 'studentNumber' | 'name' | 'className' | 'status'): void {
    if (this.enrolmentSortColumn === column) {
      this.enrolmentSortDir = this.enrolmentSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.enrolmentSortColumn = column;
      this.enrolmentSortDir = 'asc';
    }
    this.applyEnrolmentView();
    this.cdr.markForCheck();
  }

  enrolmentSortIcon(column: string): string {
    if (this.enrolmentSortColumn !== column) return '↕';
    return this.enrolmentSortDir === 'asc' ? '↑' : '↓';
  }

  trackByEnrolmentRow(_index: number, r: { studentNumber: string }): string {
    return `${r.studentNumber}-${_index}`;
  }

  isEnrolledNotBilled(status: string): boolean {
    return String(status || '').startsWith('Enrolled');
  }

  private applyEnrolmentView(): void {
    let rows = [...this.enrolmentRows];
    if (this.statusFilter === 'enrolled-not-billed') {
      rows = rows.filter((r) => r.status.startsWith('Enrolled'));
    } else if (this.statusFilter === 'billed-not-enrolled') {
      rows = rows.filter((r) => r.status.startsWith('Billed'));
    }
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.studentNumber || '').toLowerCase().includes(q) ||
          (r.name || '').toLowerCase().includes(q) ||
          (r.className || '').toLowerCase().includes(q) ||
          (r.status || '').toLowerCase().includes(q)
      );
    }
    const col = this.enrolmentSortColumn;
    const dir = this.enrolmentSortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = String((a as any)[col] ?? '').toLowerCase();
      const bv = String((b as any)[col] ?? '').toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    this.displayedEnrolmentRows = rows;
  }

  printEnrolmentReport(): void {
    if (!this.displayedEnrolmentRows.length) return;
    const rows = this.displayedEnrolmentRows
      .map(
        (r) => `
      <tr>
        <td>${this.escapeHtml(r.studentNumber)}</td>
        <td>${this.escapeHtml(r.name)}</td>
        <td>${this.escapeHtml(r.className)}</td>
        <td>${this.escapeHtml(r.status)}</td>
      </tr>`
      )
      .join('');
    const html = `
      <!DOCTYPE html><html><head><title>Enrolment vs Billing</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; color: #0f172a; }
        h1 { font-size: 1.25rem; margin-bottom: 4px; }
        p.meta { color: #64748b; font-size: 0.85rem; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.85rem; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
        th { background: #f8fafc; text-transform: uppercase; font-size: 0.7rem; }
      </style></head><body>
      <h1>Enrolment vs Billing</h1>
      <p class="meta">Term: ${this.escapeHtml(this.term || 'All')} · Billing rate: ${this.billingRate}% ·
      ${this.displayedEnrolmentRows.length} row(s) · Printed ${new Date().toLocaleString()}</p>
      <table><thead><tr><th>Student #</th><th>Name</th><th>Class</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  private escapeHtml(s: unknown): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  exportCsv(): void {
    let header: string[] = [];
    let lines: string[] = [];
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    switch (this.reportId) {
      case 'enrolment-vs-billing': {
        const exportRows =
          this.displayedEnrolmentRows.length > 0
            ? this.displayedEnrolmentRows
            : this.enrolmentRows;
        header = ['Student #', 'Name', 'Class', 'Status'];
        lines = [header.join(',')];
        for (const r of exportRows) {
          lines.push([r.studentNumber, r.name, r.className, r.status].map(esc).join(','));
        }
        if (lines.length > 1) {
          this.success = `Exported ${exportRows.length} row(s) to CSV`;
          setTimeout(() => {
            this.success = '';
            this.cdr.markForCheck();
          }, 3000);
        }
        break;
      }
      case 'class-reconciliation':
        header = ['Class', 'Students', 'Outstanding'];
        lines = [header.join(',')];
        for (const r of this.classRows) {
          lines.push([r.className, r.studentCount, r.totalOutstanding.toFixed(2)].map(esc).join(','));
        }
        break;
      case 'student-reconciliation': {
        const exportRows =
          this.displayedReconcileStudents.length > 0
            ? this.displayedReconcileStudents
            : this.reconcileStudents;
        header = ['Student #', 'Name', 'Earlier outstanding', 'Earlier invoices', 'Latest invoice', 'Latest balance'];
        lines = [header.join(',')];
        for (const s of exportRows) {
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
        if (lines.length > 1) {
          this.success = `Exported ${exportRows.length} row(s) to CSV`;
          setTimeout(() => {
            this.success = '';
            this.cdr.markForCheck();
          }, 3000);
        }
        break;
      }
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

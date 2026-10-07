import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { activatePageLoad } from '../../../utils/route-activation';

type LedgerLineType = 'opening' | 'invoice' | 'payment' | 'advance_payment' | 'late_payment' | 'brought_forward' | 'all';
type BalanceStatus = 'owed' | 'credit' | 'settled';

interface TermOption {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface LedgerLine {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerReport {
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    className: string | null;
    formName: string | null;
  };
  term: { id: string; name: string; startDate: string; endDate: string };
  lines: LedgerLine[];
  summary: {
    openingBalance: number;
    totalDebits: number;
    totalCredits: number;
    closingBalance: number;
    totalOutstanding: number;
  };
  outstandingInvoices?: Array<{
    invoiceId: string;
    invoiceNumber: string;
    term: string | null;
    owed: number;
  }>;
}

@Component({
  standalone: false,
  selector: 'app-student-ledger-report',
  templateUrl: './student-ledger-report.component.html',
  styleUrls: ['./student-ledger-report.component.css'],
})
export class StudentLedgerReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private autoLoadFromRoute = false;

  loading = false;
  loadingTerms = false;
  exportingPdf = false;
  error = '';
  success = '';

  currencySymbol = '$';
  terms: TermOption[] = [];
  selectedTermId = '';
  searchQuery = '';
  resolvedStudentId = '';

  report: LedgerReport | null = null;
  matches: any[] = [];
  needsSelection = false;

  lineFilter = '';
  typeFilter: LedgerLineType = 'all';
  filteredLines: LedgerLine[] = [];

  readonly typeChips: { key: LedgerLineType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'opening', label: 'Opening' },
    { key: 'invoice', label: 'Invoices' },
    { key: 'payment', label: 'Payments' },
    { key: 'advance_payment', label: 'Advance Payments' },
    { key: 'late_payment', label: 'Late Payments' },
    { key: 'brought_forward', label: 'Balance brought forward' },
  ];

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.bootstrap();
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.applyRouteQueryParams(params as Record<string, string>);
    });
    activatePageLoad(this.router, this.destroy$, '/financial-reports/student-ledger', () => {
      this.bootstrap();
      this.applyRouteQueryParams(this.route.snapshot.queryParams as Record<string, string>);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasReport(): boolean {
    return !!this.report;
  }

  get transactionCount(): number {
    return this.report?.lines?.length || 0;
  }

  get totalCredits(): number {
    return this.report?.summary?.totalCredits || 0;
  }

  get closingBalance(): number {
    return this.report?.summary?.closingBalance || 0;
  }

  /** Matches outstanding-fees / balance enquiry (all terms, carry-forward aware). */
  get totalOutstanding(): number {
    return this.report?.summary?.totalOutstanding ?? 0;
  }

  get balanceStatus(): BalanceStatus {
    const b = this.totalOutstanding;
    if (Math.abs(b) < 0.005) return 'settled';
    return b > 0 ? 'owed' : 'credit';
  }

  get balanceStatusLabel(): string {
    if (this.balanceStatus === 'owed') return 'Amount owed';
    if (this.balanceStatus === 'credit') return 'Credit balance';
    return 'Settled';
  }

  get canExportPdf(): boolean {
    return !!this.report && !!this.selectedTermId && !!this.resolvedStudentId && !this.needsSelection;
  }

  get filterActive(): boolean {
    return !!this.lineFilter.trim() || this.typeFilter !== 'all';
  }

  get selectedTermName(): string {
    return this.terms.find((t) => t.id === this.selectedTermId)?.name || '';
  }

  get studentInitials(): string {
    if (!this.report?.student) return '?';
    const f = this.report.student.firstName?.[0] || '';
    const l = this.report.student.lastName?.[0] || '';
    return (f + l).toUpperCase() || '?';
  }

  bootstrap(): void {
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.currencySymbol = s?.currencySymbol || '$';
        this.cdr.markForCheck();
      },
    });
    this.loadTerms();
  }

  loadTerms(): void {
    this.loadingTerms = true;
    // Only fetch from settings to ensure we use the same active term as academic-settings
    this.settingsService.getSettings()
      .pipe(
        finalize(() => {
          this.loadingTerms = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (settings: any) => {
          const rawTerms = this.termsFromSettings(settings);
          
          // Determine the active term using the same logic as academic-settings
          const activeTerm = this.determineActiveTerm(rawTerms, settings);

          if (activeTerm) {
            const name =
              activeTerm.label || activeTerm.name || `${activeTerm.term || ''} ${activeTerm.year || ''}`.trim() || 'Active Term';
            this.terms = [{
              id: activeTerm.id || this.slugTermId(name, 0),
              name,
              startDate: activeTerm.startDate || '',
              endDate: activeTerm.endDate || '',
            }];
            this.selectedTermId = this.terms[0].id;
          } else {
            this.terms = [];
            this.selectedTermId = '';
            this.error = 'No active school term found. Configure terms under Academic Settings.';
          }

          this.tryAutoLoadFromRoute();
        },
        error: () => {
          this.error = 'Could not load school terms. Configure terms under Academic Settings.';
        },
      });
  }

  private determineActiveTerm(terms: any[], settings: any): any {
    if (!terms || terms.length === 0) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // First, try to find a term that is currently active based on dates
    for (const term of terms) {
      if (!term.startDate || !term.endDate) continue;
      
      const start = new Date(term.startDate);
      const end = new Date(term.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      if (today >= start && today <= end) {
        return term;
      }
    }

    // If no term is currently active based on dates, use the settings activeTerm
    const activeTermName = settings?.activeTerm || settings?.currentTerm;
    if (activeTermName) {
      const activeTerm = terms.find((t: any) => {
        const termName = t.term || t.label || t.name || '';
        return termName.toLowerCase() === activeTermName.toLowerCase();
      });
      if (activeTerm) return activeTerm;
    }

    // Fallback to the most recent term that has started
    const startedTerms = terms.filter((t: any) => {
      if (!t.startDate) return false;
      const start = new Date(t.startDate);
      start.setHours(0, 0, 0, 0);
      return start <= today;
    });

    if (startedTerms.length > 0) {
      // Sort by start date descending and return the most recent
      return startedTerms.sort((a: any, b: any) => {
        const dateA = new Date(a.startDate).getTime();
        const dateB = new Date(b.startDate).getTime();
        return dateB - dateA;
      })[0];
    }

    // Final fallback to the first term
    return terms[0];
  }

  private termsFromSettings(settings: any): any[] {
    if (!settings) return [];
    const raw = settings.academicTerms;
    const parsed = Array.isArray(raw)
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? (() => {
            try {
              const v = JSON.parse(raw);
              return Array.isArray(v) ? v : [];
            } catch {
              return [];
            }
          })()
        : [];

    if (parsed.length) {
      return parsed.map((t: any, index: number) => {
        const name =
          t.label || t.name || `${t.term || ''} ${t.year || ''}`.trim() || `Term ${index + 1}`;
        return {
          id: t.id || this.slugTermId(name, index),
          name,
          label: t.label,
          term: t.term,
          year: t.year,
          startDate: t.startDate,
          endDate: t.endDate,
        };
      });
    }

    const active = String(settings.activeTerm || settings.currentTerm || '').trim();
    if (!active) return [];
    return [
      {
        id: 'legacy-active-term',
        name: active,
        startDate: settings.termStartDate || '',
        endDate: settings.termEndDate || '',
      },
    ];
  }

  private slugTermId(name: string, index: number): string {
    const slug = String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return slug ? `term-${slug}` : `term-${index}`;
  }

  private matchActiveTermId(terms: TermOption[], activeTerm?: string | null): string | null {
    const label = String(activeTerm || '').trim().toLowerCase();
    if (!label) return null;
    const hit = terms.find((t) => t.name.toLowerCase() === label || t.id.toLowerCase() === label);
    return hit?.id || null;
  }

  selectTerm(termId: string): void {
    // Only allow selecting the active term (which is already selected)
    // This method is kept for compatibility but effectively does nothing
    if (termId === this.selectedTermId && this.resolvedStudentId) {
      this.loadReport({ studentId: this.resolvedStudentId });
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.getReport();
    }
  }

  getReport(): void {
    if (!this.selectedTermId) {
      this.error = 'Please select a term';
      return;
    }
    const q = this.searchQuery.trim();
    if (!q && !this.resolvedStudentId) {
      this.error = 'Enter a Student ID or name to search';
      return;
    }
    this.loadReport(q ? { q } : { studentId: this.resolvedStudentId });
  }

  selectMatch(studentId: string): void {
    this.resolvedStudentId = studentId;
    this.needsSelection = false;
    this.matches = [];
    this.loadReport({ studentId });
  }

  private applyRouteQueryParams(params: Record<string, string>): void {
    const studentId = String(params['studentId'] || '').trim();
    const q = String(params['q'] || '').trim();
    if (!studentId && !q) {
      return;
    }

    if (q) {
      this.searchQuery = q;
    }

    if (studentId) {
      this.resolvedStudentId = studentId;
      this.autoLoadFromRoute = true;
      this.tryAutoLoadFromRoute();
    }
  }

  private tryAutoLoadFromRoute(): void {
    if (!this.autoLoadFromRoute || !this.resolvedStudentId || !this.selectedTermId || this.loadingTerms) {
      return;
    }
    this.autoLoadFromRoute = false;
    this.loadReport({ studentId: this.resolvedStudentId });
  }

  private loadReport(opts: { studentId?: string; q?: string }): void {
    this.loading = true;
    this.error = '';
    this.success = '';
    this.financeService
      .getStudentLedgerReport({ termId: this.selectedTermId, ...opts })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res) => {
          if (res?.needsSelection) {
            this.needsSelection = true;
            this.matches = res.matches || [];
            this.report = null;
            this.resolvedStudentId = '';
            return;
          }
          this.needsSelection = false;
          this.matches = [];
          const report = res.report;
          if (report?.summary) {
            const s = report.summary;
            const outstanding = Number(s.totalOutstanding) || 0;
            const opening = Number(s.openingBalance) || 0;
            const debits = Number(s.totalDebits) || 0;
            const credits = Number(s.totalCredits) || 0;
            const closing = Number(s.closingBalance) || 0;
            const allZero =
              Math.abs(opening) < 0.005 &&
              Math.abs(debits) < 0.005 &&
              Math.abs(credits) < 0.005 &&
              Math.abs(closing) < 0.005;
            if (outstanding > 0.005 && allZero) {
              const fallbackDebits = outstanding;
              const fallbackClosing = outstanding;
              report.summary = {
                ...s,
                openingBalance: 0,
                totalDebits: parseFloat(fallbackDebits.toFixed(2)),
                totalCredits: 0,
                closingBalance: parseFloat(fallbackClosing.toFixed(2)),
              };
            } else if (outstanding > 0.005 && Math.abs(closing) < 0.005) {
              report.summary = {
                ...s,
                closingBalance: parseFloat(outstanding.toFixed(2)),
                totalDebits: parseFloat(
                  (Math.max(debits, closing + credits - opening)).toFixed(2)
                ),
              };
            }
          }
          this.report = report;
          this.resolvedStudentId = res.report?.student?.id || opts.studentId || '';
          this.applyLineFilters();
        },
        error: (err) => {
          this.report = null;
          this.error = err?.error?.message || 'Failed to load student ledger';
        },
      });
  }

  applyLineFilters(): void {
    if (!this.report) {
      this.filteredLines = [];
      return;
    }
    const q = this.lineFilter.trim().toLowerCase();
    this.filteredLines = (this.report.lines || []).filter((line) => {
      if (this.typeFilter !== 'all' && line.type !== this.typeFilter) return false;
      if (!q) return true;
      return (
        line.reference.toLowerCase().includes(q) ||
        line.description.toLowerCase().includes(q) ||
        line.type.toLowerCase().includes(q) ||
        line.date.includes(q)
      );
    });
  }

  setTypeFilter(type: LedgerLineType): void {
    this.typeFilter = type;
    this.applyLineFilters();
  }

  typeLabel(type: string): string {
    switch (String(type || '').toLowerCase()) {
      case 'opening': return 'Opening Balance';
      case 'invoice': return 'Invoice';
      case 'payment': return 'Payment';
      case 'advance_payment': return 'Advance Payment';
      case 'late_payment': return 'Late Payment';
      case 'brought_forward': return 'Balance brought forward';
      case 'carry_forward': return 'Carry forward';
      default: return String(type || '').trim() || '—';
    }
  }

  clearAll(): void {
    this.searchQuery = '';
    this.report = null;
    this.matches = [];
    this.needsSelection = false;
    this.resolvedStudentId = '';
    this.lineFilter = '';
    this.typeFilter = 'all';
    this.filteredLines = [];
    this.error = '';
    this.success = '';
  }

  previewStatement(): void {
    this.exportStatement(true);
  }

  downloadStatement(): void {
    this.exportStatement(false);
  }

  private exportStatement(preview: boolean): void {
    if (!this.canExportPdf) return;
    this.exportingPdf = true;
    this.financeService
      .getStudentLedgerPdf(this.selectedTermId, this.resolvedStudentId, preview)
      .pipe(
        finalize(() => {
          this.exportingPdf = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const admission = this.report?.student?.admissionNumber || 'student';
          if (preview) {
            window.open(url, '_blank', 'noopener,noreferrer');
          } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = `student-ledger-${admission}.html`;
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          this.success = preview
            ? 'Statement opened in a new tab. Use Print → Save as PDF to export.'
            : 'Student ledger statement downloaded.';
          this.error = '';
        },
        error: () => {
          this.error = 'Failed to generate statement';
        },
      });
  }

  /** @deprecated */
  previewPdf(): void {
    this.previewStatement();
  }

  /** @deprecated */
  downloadPdf(): void {
    this.downloadStatement();
  }

  private exportPdf(preview: boolean): void {
    this.exportStatement(preview);
  }

  formatAmount(n: number): string {
    return (Number(n) || 0).toFixed(2);
  }

  formatBalance(n: number): string {
    const num = Number(n) || 0;
    if (num < 0) {
      return `(${this.currencySymbol}${Math.abs(num).toFixed(2)})`;
    }
    return `${this.currencySymbol}${num.toFixed(2)}`;
  }

  absAmount(n: number): number {
    return Math.abs(Number(n) || 0);
  }

  recordPaymentLink(): string[] {
    const id = this.report?.student?.admissionNumber || this.searchQuery.trim();
    return id ? ['/payments/record'] : ['/payments/record'];
  }

  recordPaymentQuery(): { studentId?: string } {
    const id = this.report?.student?.admissionNumber;
    return id ? { studentId: id } : {};
  }

  clearLineFilter(): void {
    this.lineFilter = '';
    this.typeFilter = 'all';
    this.applyLineFilters();
  }
}

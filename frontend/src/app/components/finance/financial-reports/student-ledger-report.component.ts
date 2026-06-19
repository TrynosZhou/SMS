import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';
import { activatePageLoad } from '../../../utils/route-activation';

type LedgerLineType = 'opening' | 'invoice' | 'payment' | 'all';
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
  };
}

@Component({
  standalone: false,
  selector: 'app-student-ledger-report',
  templateUrl: './student-ledger-report.component.html',
  styleUrls: ['./student-ledger-report.component.css'],
})
export class StudentLedgerReportComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

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
  ];

  constructor(
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.bootstrap();
    activatePageLoad(this.router, this.destroy$, '/financial-reports/student-ledger', () => this.bootstrap());
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

  get balanceStatus(): BalanceStatus {
    const b = this.closingBalance;
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
    forkJoin({
      api: this.financeService.getSchoolTermsForReports().pipe(catchError(() => of(null))),
      settings: this.settingsService.getSettings().pipe(catchError(() => of(null))),
    })
      .pipe(
        finalize(() => {
          this.loadingTerms = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: ({ api, settings }) => {
          const rawTerms =
            Array.isArray(api?.terms) && api.terms.length
              ? api.terms
              : this.termsFromSettings(settings);
          this.terms = rawTerms.map((t: any, index: number) => ({
            id: t.id || `term-${index}`,
            name: t.name || t.label || `${t.term || ''} ${t.year || ''}`.trim() || `Term ${index + 1}`,
            startDate: t.startDate || '',
            endDate: t.endDate || '',
          }));

          const activeTermId =
            api?.activeTermId ||
            this.matchActiveTermId(this.terms, settings?.activeTerm || settings?.currentTerm);

          if (!this.selectedTermId && activeTermId) {
            this.selectedTermId = activeTermId;
          } else if (!this.selectedTermId && this.terms.length) {
            this.selectedTermId = this.terms[0].id;
          }

          if (!this.terms.length) {
            this.error =
              'No school terms found. Add terms under Academic Settings or create invoices for a term.';
          }
        },
        error: () => {
          this.error = 'Could not load school terms. Configure terms under Academic Settings.';
        },
      });
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
      return parsed.map((t: any, index: number) => ({
        id: t.id || `term-${index}`,
        name: t.label || t.term || `${t.term || ''} ${t.year || ''}`.trim(),
        label: t.label,
        term: t.term,
        year: t.year,
        startDate: t.startDate,
        endDate: t.endDate,
      }));
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

  private matchActiveTermId(terms: TermOption[], activeTerm?: string | null): string | null {
    const label = String(activeTerm || '').trim().toLowerCase();
    if (!label) return null;
    const hit = terms.find((t) => t.name.toLowerCase() === label || t.id.toLowerCase() === label);
    return hit?.id || null;
  }

  selectTerm(termId: string): void {
    this.selectedTermId = termId;
    if (this.resolvedStudentId) {
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
          this.report = res.report;
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

  previewPdf(): void {
    this.exportPdf(true);
  }

  downloadPdf(): void {
    this.exportPdf(false);
  }

  private exportPdf(preview: boolean): void {
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
            a.download = `student-ledger-${admission}.pdf`;
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        },
        error: () => {
          this.error = 'Failed to generate PDF';
        },
      });
  }

  formatAmount(n: number): string {
    return (Number(n) || 0).toFixed(2);
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
}

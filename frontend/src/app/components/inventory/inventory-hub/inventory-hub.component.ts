import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Observable, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { InventoryService } from '../../../services/inventory.service';
import { StudentService } from '../../../services/student.service';
import { AuthService } from '../../../services/auth.service';
import { ModuleAccessService } from '../../../services/module-access.service';
import { ThemeService } from '../../../services/theme.service';

export type InvTab = 'textbooks' | 'furniture' | 'teacherAlloc' | 'ops' | 'fines' | 'reports' | 'settings';
export type CatalogView = 'table' | 'cards';
export type StockFilter = 'all' | 'low' | 'out' | 'healthy';
export type FurnStatusFilter = 'all' | 'available' | 'issued' | 'lost' | 'damaged';

@Component({
  standalone: false,  selector: 'app-inventory-hub',
templateUrl: './inventory-hub.component.html',
  styleUrls: ['./inventory-hub.component.css']
})
export class InventoryHubComponent implements OnInit, OnDestroy {
  tab: InvTab = 'textbooks';

  readonly tabs: { id: InvTab; label: string; icon: string; hint: string }[] = [
    { id: 'textbooks', label: 'Textbooks', icon: '📖', hint: 'Catalog & stock' },
    { id: 'furniture', label: 'Furniture', icon: '🪑', hint: 'Desks & chairs' },
    { id: 'teacherAlloc', label: 'Teacher Allocations', icon: '🧑‍🏫', hint: 'Bulk issue to teachers' },
    { id: 'ops', label: 'Issuance', icon: '🔄', hint: 'Issue & return' },
    { id: 'fines', label: 'Fines', icon: '💳', hint: 'Assess & collect' },
    { id: 'reports', label: 'Reports', icon: '📊', hint: 'Export views' },
    { id: 'settings', label: 'Settings', icon: '⚙️', hint: 'Loan rules' }
  ];

  textbooks: any[] = [];
  furniture: any[] = [];
  tbIssuances: any[] = [];
  furnIssuances: any[] = [];
  fines: any[] = [];
  students: any[] = [];

  /* ---- Teacher allocation ---- */
  teacherList: any[] = [];
  teacherTbAllocations: any[] = [];
  teacherFurnAllocations: any[] = [];
  teacherAllocLoading = false;

  bulkTbAllocForm: { teacherUserId: string; catalogId: string; quantity: number; notes: string } = {
    teacherUserId: '', catalogId: '', quantity: 1, notes: ''
  };
  bulkFurnAllocForm: { teacherUserId: string; deskQuantity: number; chairQuantity: number; condition: string; locationLabel: string; notes: string } = {
    teacherUserId: '', deskQuantity: 0, chairQuantity: 0, condition: 'good', locationLabel: '', notes: ''
  };

  settings: any = {};
  loading = false;
  reportsLoading = false;
  err = '';
  lastRefreshedAt: Date | null = null;

  toast: { type: 'success' | 'error' | 'info'; message: string } | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  tbSearch = '';
  furnSearch = '';
  opsSearch = '';
  finesSearch = '';
  studentPickerSearch = '';

  catalogView: CatalogView = 'cards';
  stockFilter: StockFilter = 'all';
  furnStatusFilter: FurnStatusFilter = 'all';
  showQuickIssue = true;
  formsCollapsed = false;

  private readonly destroy$ = new Subject<void>();

  tbForm: any = { title: '', isbn: '', gradeLevel: '', condition: 'good', quantityTotal: 0, subjectId: null };
  furnForm: any = { itemType: 'desk', itemCode: '', condition: 'good', locationLabel: '' };

  op = { catalogId: '', furnitureId: '', studentId: '', loanDueAt: '', notes: '', mode: 'perm' as 'perm' | 'loan' };

  fineForm: any = { studentId: '', fineType: 'furniture_damage', amount: 0, description: '' };

  rFrom = '';
  rTo = '';
  reportLost: { textbooks?: any[]; furniture?: any[] } | null = null;
  reportTb: any[] = [];
  reportFurn: any[] = [];
  reportLoans: any[] = [];
  reportFines: any[] = [];

  canManageStock = false;
  canAssessFines = false;

  constructor(
    private inventory: InventoryService,
    private studentService: StudentService,
    public auth: AuthService,
    private moduleAccess: ModuleAccessService,
    public theme: ThemeService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    const r = (this.auth.getCurrentUser()?.role || '').toLowerCase();
    const inv = this.moduleAccess.canAccessModule('inventory');
    this.canManageStock = this.auth.isAdmin() || (r === 'teacher' && inv);
    this.canAssessFines =
      this.canManageStock || r === 'accountant' || (r === 'teacher' && inv);

    const tabParam = this.route.snapshot.queryParamMap.get('tab') as InvTab | null;
    if (tabParam && this.tabs.some((t) => t.id === tabParam)) {
      this.tab = tabParam;
    }

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const t = params.get('tab') as InvTab | null;
      if (t && this.tabs.some((x) => x.id === t) && t !== this.tab) {
        this.setTab(t, false);
      }
    });

    this.refresh();
    this.loadStudents();
    if (this.tab === 'teacherAlloc') {
      this.loadTeacherAllocationData();
    }
    this.applyDefaultLoanDueDate();
  }

  ngOnDestroy() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(t: InvTab, updateUrl = true) {
    this.tab = t;
    this.err = '';
    if (updateUrl) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: t },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    if (t === 'teacherAlloc' && !this.teacherList.length) {
      this.loadTeacherAllocationData();
    }
    if (t === 'ops') {
      this.applyDefaultLoanDueDate();
    }
  }

  tabBadgeCount(id: InvTab): number | null {
    switch (id) {
      case 'textbooks':
        return this.statLowStockCount > 0 ? this.statLowStockCount : null;
      case 'ops':
        if (this.statOverdueLoans > 0) return this.statOverdueLoans;
        return this.statActiveLoans > 0 ? this.statActiveLoans : null;
      case 'fines':
        return this.statPendingFines.count > 0 ? this.statPendingFines.count : null;
      default:
        return null;
    }
  }

  tabBadgeClass(id: InvTab): string {
    if (id === 'fines' && this.statPendingFines.count > 0) return 'inv-tab-badge--warn';
    if (id === 'textbooks' && this.statLowStockCount > 0) return 'inv-tab-badge--warn';
    if (id === 'ops' && this.statOverdueLoans > 0) return 'inv-tab-badge--danger';
    return '';
  }

  private showToast(type: 'success' | 'error' | 'info', message: string) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { type, message };
    this.toastTimer = setTimeout(() => (this.toast = null), 4200);
  }

  loadStudents() {
    this.studentService.getStudentsPaginated({ page: 1, limit: 500 }).subscribe({
      next: (res: any) => {
        this.students = Array.isArray(res?.data) ? res.data : [];
      },
      error: () => (this.students = [])
    });
  }

  private loadInventoryArray(obs: Observable<any[]>, label: string): Observable<any[]> {
    return obs.pipe(
      catchError((e: any) => {
        if (!this.err) {
          this.err = e?.error?.message || `Failed to load ${label}`;
        }
        return of([]);
      })
    );
  }

  refresh() {
    this.loading = true;
    this.err = '';

    forkJoin({
      textbooks: this.loadInventoryArray(this.inventory.listTextbooks(), 'textbook catalog'),
      furniture: this.loadInventoryArray(this.inventory.listFurniture(), 'furniture'),
      settings: this.inventory.getSettings().pipe(
        catchError((e: any) => {
          if (!this.err) {
            this.err = e?.error?.message || 'Failed to load inventory settings';
          }
          return of({});
        })
      )
    })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ textbooks, furniture, settings }) => {
          this.textbooks = Array.isArray(textbooks) ? textbooks : [];
          this.furniture = Array.isArray(furniture) ? furniture : [];
          this.settings = settings && typeof settings === 'object' ? settings : {};
          this.lastRefreshedAt = new Date();
          this.reloadIssuances();
          this.cdr.markForCheck();
        }
      });
  }

  reloadIssuances() {
    this.inventory.listTextbookIssuances().subscribe({ next: x => (this.tbIssuances = x) });
    this.inventory.listFurnitureIssuances().subscribe({ next: x => (this.furnIssuances = x) });
    this.inventory.listFines().subscribe({ next: x => (this.fines = x) });
  }

  get statTextbookTitles(): number {
    return this.textbooks?.length || 0;
  }

  get statCopiesAvailable(): number {
    return (this.textbooks || []).reduce((s, t) => s + (Number(t.quantityAvailable) || 0), 0);
  }

  get statCopiesTotal(): number {
    return (this.textbooks || []).reduce((s, t) => s + (Number(t.quantityTotal) || 0), 0);
  }

  get statFurnitureAvailable(): number {
    return (this.furniture || []).filter((f: any) => f.status === 'available').length;
  }

  get statActiveLoans(): number {
    return (this.tbIssuances || []).filter(
      i => i.issuanceType === 'loan' && (i.status === 'active' || i.status === 'overdue')
    ).length;
  }

  get statOverdueLoans(): number {
    return (this.tbIssuances || []).filter((i) => i.status === 'overdue').length;
  }

  get statLowStockCount(): number {
    return (this.textbooks || []).filter((t) => this.getStockLevel(t) === 'low' || this.getStockLevel(t) === 'out').length;
  }

  get statUtilizationPct(): number {
    const total = this.statCopiesTotal;
    if (!total) return 0;
    const issued = total - this.statCopiesAvailable;
    return Math.round((issued / total) * 100);
  }

  get filteredStudentsForPicker(): any[] {
    const q = this.studentPickerSearch.trim().toLowerCase();
    if (!q) return this.students.slice(0, 80);
    return this.students
      .filter((s) => {
        const label = this.studentLabel(s).toLowerCase();
        return label.includes(q);
      })
      .slice(0, 80);
  }

  get statPendingFines(): { count: number; total: number } {
    const pending = (this.fines || []).filter((f: any) => f.status === 'pending');
    const total = pending.reduce((s: number, f: any) => s + (Number(f.amount) || 0), 0);
    return { count: pending.length, total };
  }

  get filteredTextbooks(): any[] {
    let list = [...(this.textbooks || [])];
    const q = this.tbSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          (t.title || '').toLowerCase().includes(q) ||
          (t.isbn || '').toLowerCase().includes(q) ||
          (t.gradeLevel || '').toLowerCase().includes(q)
      );
    }
    if (this.stockFilter !== 'all') {
      list = list.filter((t) => this.getStockLevel(t) === this.stockFilter);
    }
    return list;
  }

  get filteredFurniture(): any[] {
    let list = [...(this.furniture || [])];
    const q = this.furnSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f: any) =>
          (f.itemCode || '').toLowerCase().includes(q) ||
          (f.itemType || '').toLowerCase().includes(q) ||
          (f.status || '').toLowerCase().includes(q) ||
          (f.locationLabel || '').toLowerCase().includes(q)
      );
    }
    if (this.furnStatusFilter !== 'all') {
      list = list.filter((f) => (f.status || '').toLowerCase() === this.furnStatusFilter);
    }
    return list;
  }

  getStockLevel(t: any): StockFilter {
    const total = Number(t.quantityTotal) || 0;
    const avail = Number(t.quantityAvailable) || 0;
    if (total <= 0 || avail <= 0) return 'out';
    if (avail <= Math.max(1, Math.ceil(total * 0.2))) return 'low';
    return 'healthy';
  }

  stockLevelLabel(level: StockFilter): string {
    const m: Record<StockFilter, string> = {
      all: 'All',
      low: 'Low stock',
      out: 'Out of stock',
      healthy: 'In stock',
    };
    return m[level] || level;
  }

  stockPct(t: any): number {
    const total = Number(t.quantityTotal) || 0;
    const avail = Number(t.quantityAvailable) || 0;
    if (!total) return 0;
    return Math.round((avail / total) * 100);
  }

  applyDefaultLoanDueDate(): void {
    if (this.op.mode !== 'loan') return;
    const days = Number(this.settings?.loanDaysDefault) || 14;
    const d = new Date();
    d.setDate(d.getDate() + days);
    this.op.loanDueAt = d.toISOString().slice(0, 10);
  }

  onIssueModeChange(): void {
    if (this.op.mode === 'loan') {
      this.applyDefaultLoanDueDate();
    } else {
      this.op.loanDueAt = '';
    }
  }

  exportCsv(filename: string, headers: string[], rows: string[][]): void {
    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('success', `Exported ${rows.length} row(s)`);
  }

  exportTextbooksCsv(): void {
    const rows = this.filteredTextbooks.map((t) => [
      t.title,
      t.isbn || '',
      t.gradeLevel || '',
      String(t.quantityAvailable),
      String(t.quantityTotal),
      t.condition || '',
    ]);
    this.exportCsv('textbook-catalog.csv', ['Title', 'ISBN', 'Grade', 'Available', 'Total', 'Condition'], rows);
  }

  exportFurnitureCsv(): void {
    const rows = this.filteredFurniture.map((f) => [
      f.itemCode,
      f.itemType,
      f.status,
      f.locationLabel || '',
      f.condition || '',
    ]);
    this.exportCsv('furniture.csv', ['Code', 'Type', 'Status', 'Location', 'Condition'], rows);
  }

  exportActiveIssuancesCsv(): void {
    const rows = [
      ...this.filteredActiveTb.map((i) => [
        'Textbook',
        `${i.student?.firstName || ''} ${i.student?.lastName || ''}`.trim(),
        i.catalog?.title || '',
        i.issuanceType || '',
        i.status || '',
        i.loanDueAt ? new Date(i.loanDueAt).toLocaleDateString() : '',
      ]),
      ...this.filteredActiveFurn.map((i) => [
        'Furniture',
        `${i.student?.firstName || ''} ${i.student?.lastName || ''}`.trim(),
        i.furnitureItem?.itemCode || '',
        i.furnitureItem?.itemType || '',
        i.status || '',
        '',
      ]),
    ];
    this.exportCsv(
      'active-issuances.csv',
      ['Category', 'Student', 'Item', 'Type', 'Status', 'Due'],
      rows
    );
  }

  formatRelativeTime(dateStr?: string): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  clearCatalogFilters(which: 'tb' | 'furn'): void {
    if (which === 'tb') {
      this.tbSearch = '';
      this.stockFilter = 'all';
    } else {
      this.furnSearch = '';
      this.furnStatusFilter = 'all';
    }
  }

  furnitureIcon(type: string): string {
    return (type || '').toLowerCase() === 'chair' ? '🪑' : '🖥️';
  }

  get filteredActiveTb(): any[] {
    const q = this.opsSearch.trim().toLowerCase();
    const rows = this.activeTbIssuances || [];
    if (!q) return rows;
    return rows.filter((row: any) => {
      const name = `${row.student?.firstName || ''} ${row.student?.lastName || ''}`.toLowerCase();
      const book = (row.catalog?.title || '').toLowerCase();
      return name.includes(q) || book.includes(q) || (row.issuanceType || '').toLowerCase().includes(q);
    });
  }

  get filteredActiveFurn(): any[] {
    const q = this.opsSearch.trim().toLowerCase();
    const rows = this.activeFurnIssuances || [];
    if (!q) return rows;
    return rows.filter((row: any) => {
      const name = `${row.student?.firstName || ''} ${row.student?.lastName || ''}`.toLowerCase();
      const code = (row.furnitureItem?.itemCode || '').toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }

  get filteredFines(): any[] {
    const q = this.finesSearch.trim().toLowerCase();
    if (!q) return this.fines || [];
    return (this.fines || []).filter((f: any) => {
      const name = `${f.student?.firstName || ''} ${f.student?.lastName || ''}`.toLowerCase();
      return (
        name.includes(q) ||
        (f.fineType || '').toLowerCase().includes(q) ||
        (f.status || '').toLowerCase().includes(q)
      );
    });
  }

  get lostTextbookRows(): any[] {
    return this.reportLost?.textbooks || [];
  }

  get lostFurnitureRows(): any[] {
    return this.reportLost?.furniture || [];
  }

  saveSettings() {
    this.inventory
      .updateSettings({
        loanDaysDefault: Number(this.settings.loanDaysDefault),
        overdueFinePerDay: Number(this.settings.overdueFinePerDay),
        lossGraceDaysAfterDue: Number(this.settings.lossGraceDaysAfterDue)
      })
      .subscribe({
        next: () => this.showToast('success', 'Settings saved'),
        error: e => this.showToast('error', e.error?.message || 'Save failed')
      });
  }

  addTextbook() {
    this.inventory.createTextbook(this.tbForm).subscribe({
      next: () => {
        this.tbForm = { title: '', isbn: '', gradeLevel: '', condition: 'good', quantityTotal: 0, subjectId: null };
        this.showToast('success', 'Textbook added to catalog');
        this.refresh();
      },
      error: e => this.showToast('error', e.error?.message || 'Failed to add textbook')
    });
  }

  addFurniture() {
    this.inventory.createFurniture(this.furnForm).subscribe({
      next: () => {
        this.furnForm = { itemType: 'desk', itemCode: '', condition: 'good', locationLabel: '' };
        this.showToast('success', 'Furniture registered');
        this.refresh();
      },
      error: e => this.showToast('error', e.error?.message || 'Failed')
    });
  }

  doIssue() {
    if (!this.op.catalogId || !this.op.studentId) {
      this.showToast('error', 'Select textbook and student');
      return;
    }
    const req =
      this.op.mode === 'perm'
        ? this.inventory.issuePermanent(this.op.catalogId, this.op.studentId, this.op.notes)
        : this.inventory.borrowTextbook(
            this.op.catalogId,
            this.op.studentId,
            this.op.loanDueAt || undefined,
            this.op.notes
          );
    req.subscribe({
      next: () => {
        this.showToast('success', this.op.mode === 'perm' ? 'Textbook issued (permanent)' : 'Loan recorded');
        this.refresh();
        this.reloadIssuances();
      },
      error: e => this.showToast('error', e.error?.message || 'Issue failed')
    });
  }

  doFurnIssue() {
    if (!this.op.furnitureId || !this.op.studentId) {
      this.showToast('error', 'Select furniture and student');
      return;
    }
    this.inventory.issueFurniture(this.op.furnitureId, this.op.studentId, this.op.notes).subscribe({
      next: () => {
        this.showToast('success', 'Furniture issued');
        this.refresh();
        this.reloadIssuances();
      },
      error: e => this.showToast('error', e.error?.message || 'Issue failed')
    });
  }

  retTb(id: string) {
    this.inventory.returnTextbookIssuance(id).subscribe({
      next: () => {
        this.showToast('success', 'Textbook returned');
        this.reloadIssuances();
        this.refresh();
      },
      error: e => this.showToast('error', e.error?.message || 'Return failed')
    });
  }

  lostTb(id: string) {
    if (!confirm('Mark this textbook issuance as lost?')) return;
    this.inventory.markTextbookLost(id).subscribe({
      next: () => {
        this.showToast('info', 'Marked as lost');
        this.reloadIssuances();
        this.refresh();
      },
      error: e => this.showToast('error', e.error?.message || 'Failed')
    });
  }

  retFurn(id: string) {
    this.inventory.returnFurnitureIssuance(id).subscribe({
      next: () => {
        this.showToast('success', 'Furniture returned');
        this.reloadIssuances();
        this.refresh();
      },
      error: e => this.showToast('error', e.error?.message || 'Failed')
    });
  }

  lostFurn(id: string) {
    if (!confirm('Mark furniture as lost?')) return;
    this.inventory.markFurnitureLost(id).subscribe({
      next: () => {
        this.showToast('info', 'Furniture marked lost');
        this.reloadIssuances();
        this.refresh();
      },
      error: e => this.showToast('error', e.error?.message || 'Failed')
    });
  }

  addFine() {
    this.inventory.createFine(this.fineForm).subscribe({
      next: () => {
        this.fineForm = { studentId: '', fineType: 'furniture_damage', amount: 0, description: '' };
        this.showToast('success', 'Fine recorded');
        this.reloadIssuances();
      },
      error: e => this.showToast('error', e.error?.message || 'Failed')
    });
  }

  markFinePaid(id: string, status: string) {
    this.inventory.updateFineStatus(id, status).subscribe({
      next: () => {
        this.showToast('success', `Fine marked ${status}`);
        this.reloadIssuances();
      },
      error: e => this.showToast('error', e.error?.message || 'Update failed')
    });
  }

  runReports() {
    const p = { from: this.rFrom || undefined, to: this.rTo || undefined };
    this.reportsLoading = true;
    this.reportLost = null;
    forkJoin({
      lost: this.inventory.reportLost(p).pipe(catchError(() => of({ textbooks: [], furniture: [] }))),
      tb: this.inventory.reportTextbookIssuance(p).pipe(catchError(() => of([]))),
      furn: this.inventory.reportFurnitureIssuance(p).pipe(catchError(() => of([]))),
      loans: this.inventory.reportLoanHistory(p).pipe(catchError(() => of([]))),
      fines: this.inventory.listFines(p).pipe(catchError(() => of([])))
    })
      .pipe(finalize(() => (this.reportsLoading = false)))
      .subscribe({
        next: ({ lost, tb, furn, loans, fines }) => {
          this.reportLost = lost;
          this.reportTb = tb as any[];
          this.reportFurn = furn as any[];
          this.reportLoans = loans as any[];
          this.reportFines = fines as any[];
        },
        error: () => this.showToast('error', 'Could not load reports')
      });
  }

  /* ---- Teacher allocation methods ---- */

  loadTeacherAllocationData() {
    this.teacherAllocLoading = true;
    this.inventory.listTeachers().subscribe({
      next: t => {
        this.teacherList = t;
        this.inventory.listTeacherTextbookAllocations().subscribe({
          next: a => (this.teacherTbAllocations = a),
          error: () => {}
        });
        this.inventory.listTeacherFurnitureAllocations().subscribe({
          next: a => {
            this.teacherFurnAllocations = a;
            this.teacherAllocLoading = false;
          },
          error: () => (this.teacherAllocLoading = false)
        });
      },
      error: () => (this.teacherAllocLoading = false)
    });
  }

  bulkAllocateTextbooksToTeacher() {
    const f = this.bulkTbAllocForm;
    if (!f.teacherUserId || !f.catalogId || f.quantity < 1) {
      this.showToast('error', 'Select teacher, textbook, and quantity ≥ 1');
      return;
    }
    this.inventory.issueTextbookToTeacher(f.catalogId, f.teacherUserId, f.quantity, f.notes || undefined).subscribe({
      next: () => {
        this.showToast('success', `${f.quantity} copy/copies allocated to teacher with auto J-numbers`);
        this.bulkTbAllocForm = { teacherUserId: '', catalogId: '', quantity: 1, notes: '' };
        this.loadTeacherAllocationData();
        this.refresh();
      },
      error: e => this.showToast('error', e.error?.message || 'Allocation failed')
    });
  }

  bulkAllocateFurnitureToTeacher() {
    const f = this.bulkFurnAllocForm;
    if (!f.teacherUserId || (f.deskQuantity < 1 && f.chairQuantity < 1)) {
      this.showToast('error', 'Select a teacher and provide at least 1 desk or chair');
      return;
    }
    this.inventory.bulkAllocateFurnitureToTeacher({
      teacherUserId: f.teacherUserId,
      deskQuantity: Number(f.deskQuantity),
      chairQuantity: Number(f.chairQuantity),
      condition: f.condition || 'good',
      locationLabel: f.locationLabel || undefined,
      notes: f.notes || undefined
    } as any).subscribe({
      next: () => {
        const total = Number(f.deskQuantity) + Number(f.chairQuantity);
        this.showToast('success', `${total} furniture item(s) created & allocated with auto JP-numbers`);
        this.bulkFurnAllocForm = { teacherUserId: '', deskQuantity: 0, chairQuantity: 0, condition: 'good', locationLabel: '', notes: '' };
        this.loadTeacherAllocationData();
        this.refresh();
      },
      error: e => this.showToast('error', e.error?.message || 'Furniture allocation failed')
    });
  }

  teacherNameByUserId(teacherUserId: string): string {
    const t = this.teacherList.find((t: any) => t.userId === teacherUserId || t.id === teacherUserId);
    if (!t) return teacherUserId || '—';
    return `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.email || teacherUserId;
  }

  get availableFurniture(): any[] {
    return (this.furniture || []).filter((f: any) => f.status === 'available');
  }

  studentLabel(s: any) {
    return s ? `${s.firstName || ''} ${s.lastName || ''} (${s.studentNumber || s.id})`.trim() : '';
  }

  fineTypeLabel(t: string): string {
    const m: Record<string, string> = {
      furniture_damage: 'Furniture damage',
      lost_book: 'Lost book',
      lost_furniture: 'Lost furniture',
      loan_overdue: 'Loan overdue'
    };
    return m[t] || t;
  }

  statusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'active' || s === 'paid' || s === 'available') return 'inv-badge--ok';
    if (s === 'overdue' || s === 'pending' || s === 'lost') return 'inv-badge--warn';
    if (s === 'damaged' || s === 'returned') return 'inv-badge--neutral';
    return 'inv-badge--neutral';
  }

  dismissToast() {
    this.toast = null;
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  get activeTbIssuances(): any[] {
    return (this.tbIssuances || []).filter(i => i.status === 'active' || i.status === 'overdue');
  }

  get activeFurnIssuances(): any[] {
    return (this.furnIssuances || []).filter(i => i.status === 'active');
  }

  formatRefreshed(): string {
    if (!this.lastRefreshedAt) return '';
    return this.lastRefreshedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  scrollToPanel(id: string): void {
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
}

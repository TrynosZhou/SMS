import { Component, OnDestroy, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { InventoryService } from '../../../services/inventory.service';
import { StudentService } from '../../../services/student.service';
import { AuthService } from '../../../services/auth.service';
import { ModuleAccessService } from '../../../services/module-access.service';
import { ThemeService } from '../../../services/theme.service';

export type InvTab = 'textbooks' | 'furniture' | 'ops' | 'fines' | 'reports' | 'settings';

@Component({
  selector: 'app-inventory-hub',
  templateUrl: './inventory-hub.component.html',
  styleUrls: ['./inventory-hub.component.css']
})
export class InventoryHubComponent implements OnInit, OnDestroy {
  tab: InvTab = 'textbooks';

  readonly tabs: { id: InvTab; label: string; icon: string; hint: string }[] = [
    { id: 'textbooks', label: 'Textbooks', icon: '📖', hint: 'Catalog & stock' },
    { id: 'furniture', label: 'Furniture', icon: '🪑', hint: 'Desks & chairs' },
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
    public theme: ThemeService
  ) {}

  ngOnInit() {
    const r = (this.auth.getCurrentUser()?.role || '').toLowerCase();
    const inv = this.moduleAccess.canAccessModule('inventory');
    this.canManageStock = r === 'admin' || r === 'superadmin' || (r === 'teacher' && inv);
    this.canAssessFines =
      r === 'admin' || r === 'superadmin' || r === 'accountant' || (r === 'teacher' && inv);
    this.refresh();
    this.loadStudents();
  }

  ngOnDestroy() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  setTab(t: InvTab) {
    this.tab = t;
    this.err = '';
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

  refresh() {
    this.loading = true;
    this.err = '';
    this.inventory.listTextbooks().subscribe({
      next: t => {
        this.textbooks = t;
        this.inventory.listFurniture().subscribe({
          next: f => {
            this.furniture = f;
            this.reloadIssuances();
            this.inventory.getSettings().subscribe({
              next: s => {
                this.settings = s;
                this.loading = false;
                this.lastRefreshedAt = new Date();
              },
              error: () => {
                this.loading = false;
                this.lastRefreshedAt = new Date();
              }
            });
          },
          error: () => (this.loading = false)
        });
      },
      error: e => {
        this.err = e.error?.message || 'Failed to load inventory';
        this.loading = false;
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

  get statPendingFines(): { count: number; total: number } {
    const pending = (this.fines || []).filter((f: any) => f.status === 'pending');
    const total = pending.reduce((s: number, f: any) => s + (Number(f.amount) || 0), 0);
    return { count: pending.length, total };
  }

  get filteredTextbooks(): any[] {
    const q = this.tbSearch.trim().toLowerCase();
    if (!q) return this.textbooks || [];
    return (this.textbooks || []).filter(
      t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.isbn || '').toLowerCase().includes(q) ||
        (t.gradeLevel || '').toLowerCase().includes(q)
    );
  }

  get filteredFurniture(): any[] {
    const q = this.furnSearch.trim().toLowerCase();
    if (!q) return this.furniture || [];
    return (this.furniture || []).filter(
      (f: any) =>
        (f.itemCode || '').toLowerCase().includes(q) ||
        (f.itemType || '').toLowerCase().includes(q) ||
        (f.status || '').toLowerCase().includes(q) ||
        (f.locationLabel || '').toLowerCase().includes(q)
    );
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
}

import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuditService } from '../../../services/audit.service';
import { Subscription, Subject, interval } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-user-log',
  templateUrl: './user-log.component.html',
  styleUrls: ['./user-log.component.css']
})
export class UserLogComponent implements OnInit, OnDestroy {
  loading = false;
  error = '';
  sessions: any[] = [];
  // Filters and pagination
  role: string = 'all';
  search: string = '';
  startDate?: string;
  endDate?: string;
  page = 1;
  limit = 20;
  total = 0;
  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }
  autoRefresh = false;
  refreshMs = 30000;
  private refreshSub?: Subscription;
  private searchSub?: Subscription;
  private searchInput$ = new Subject<string>();
  sortKey: string = 'loginAt';
  sortDir: 'asc' | 'desc' = 'desc';
  columns = {
    user: true,
    role: true,
    loginAt: true,
    lastActivityAt: true,
    logoutAt: true,
    duration: true,
    modules: true,
    sessionId: true,
    ipAddress: true,
    userAgent: false
  };

  constructor(private auditService: AuditService) {}

  ngOnInit(): void {
    this.restoreState();
    this.searchSub = this.searchInput$.pipe(debounceTime(300)).subscribe(v => {
      this.search = v || '';
      this.page = 1;
      this.load();
    });
    this.load();
    this.updateAutoRefresh();
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
    this.searchSub?.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const params: any = {
      startDate: this.startDate,
      endDate: this.endDate,
      role: this.role !== 'all' ? this.role : undefined,
      search: this.search || undefined,
      page: String(this.page),
      limit: String(this.limit),
      sortKey: this.sortKey,
      sortDir: this.sortDir.toUpperCase()
    };
    this.auditService.getUserSessions(params).subscribe({
      next: (res: any) => {
        this.sessions = Array.isArray(res) ? res : (res?.data || []);
        this.total = Array.isArray(res) ? this.sessions.length : (res?.total || this.sessions.length);
        this.loading = false;
        this.saveState();
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to load user sessions';
        this.loading = false;
      }
    });
  }

  resetFilters(): void {
    this.role = 'all';
    this.search = '';
    this.startDate = undefined;
    this.endDate = undefined;
    this.page = 1;
    this.load();
  }

  exportCSV(): void {
    const rows = this.sessions.map(s => ({
      user: s.username || s.userId,
      role: s.role,
      loginAt: s.loginAt,
      lastActivityAt: s.lastActivityAt,
      logoutAt: s.logoutAt,
      timeSpentSeconds: s.timeSpentSeconds,
      modules: s.modules,
      sessionId: s.sessionId,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent
    }));
    const header = [
      ...(this.columns.user ? ['User'] : []),
      ...(this.columns.role ? ['Role'] : []),
      ...(this.columns.loginAt ? ['Login Time'] : []),
      ...(this.columns.lastActivityAt ? ['Last Activity'] : []),
      ...(this.columns.logoutAt ? ['Logout Time'] : []),
      ...(this.columns.duration ? ['Time Spent (s)'] : []),
      ...(this.columns.modules ? ['Modules'] : []),
      ...(this.columns.sessionId ? ['Session ID'] : []),
      ...(this.columns.ipAddress ? ['IP Address'] : []),
      ...(this.columns.userAgent ? ['User Agent'] : [])
    ];
    const csv = [header.join(','), ...rows.map(r => [
      ...(this.columns.user ? [`"${(r.user || '').replace(/"/g,'""')}"`] : []),
      ...(this.columns.role ? [r.role || ''] : []),
      ...(this.columns.loginAt ? [r.loginAt ? new Date(r.loginAt).toISOString() : ''] : []),
      ...(this.columns.lastActivityAt ? [r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : ''] : []),
      ...(this.columns.logoutAt ? [r.logoutAt ? new Date(r.logoutAt).toISOString() : ''] : []),
      ...(this.columns.duration ? [String(r.timeSpentSeconds || 0)] : []),
      ...(this.columns.modules ? [`"${(r.modules || '').replace(/"/g,'""')}"`] : []),
      ...(this.columns.sessionId ? [r.sessionId || ''] : []),
      ...(this.columns.ipAddress ? [r.ipAddress || ''] : []),
      ...(this.columns.userAgent ? [`"${(r.userAgent || '').replace(/"/g,'""')}"`] : [])
    ].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user_sessions_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onPageChange(next: boolean): void {
    const maxPage = this.totalPages;
    this.page = next ? Math.min(this.page + 1, maxPage) : Math.max(this.page - 1, 1);
    this.load();
  }

  applySort(key: string): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = 'asc';
    }
    this.load();
  }

  setSearch(value: string): void {
    this.searchInput$.next(value);
  }

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    this.updateAutoRefresh();
    this.saveState();
  }

  updateAutoRefresh(): void {
    this.refreshSub?.unsubscribe();
    if (this.autoRefresh) {
      this.refreshSub = interval(this.refreshMs).subscribe(() => this.load());
    }
  }

  quickPreset(days: number): void {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    this.startDate = start.toISOString().slice(0,10);
    this.endDate = end.toISOString().slice(0,10);
    this.page = 1;
    this.load();
  }

  copy(text: string | null | undefined): void {
    const value = text || '';
    if ((navigator as any).clipboard && (navigator as any).clipboard.writeText) {
      (navigator as any).clipboard.writeText(value);
    } else {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  get totalActive(): number {
    return this.sessions.filter(s => !s.logoutAt).length;
  }

  get averageMinutes(): number {
    if (!this.sessions.length) return 0;
    const sum = this.sessions.reduce((acc, s) => acc + (s.timeSpentSeconds || 0), 0);
    return Math.round(sum / this.sessions.length / 60);
  }

  saveState(): void {
    const state = {
      role: this.role,
      search: this.search,
      startDate: this.startDate,
      endDate: this.endDate,
      page: this.page,
      limit: this.limit,
      autoRefresh: this.autoRefresh,
      columns: this.columns
    };
    localStorage.setItem('userLogState', JSON.stringify(state));
  }

  restoreState(): void {
    const raw = localStorage.getItem('userLogState');
    if (!raw) return;
    try {
      const s = JSON.parse(raw || '{}');
      this.role = s.role || this.role;
      this.search = s.search || this.search;
      this.startDate = s.startDate || this.startDate;
      this.endDate = s.endDate || this.endDate;
      this.page = s.page || this.page;
      this.limit = s.limit || this.limit;
      this.autoRefresh = !!s.autoRefresh;
      this.columns = { ...this.columns, ...(s.columns || {}) };
    } catch {}
  }

  // Simple bar chart: sessions by day

  // PDF export
  exportingPdf = false;
  async exportPDF(): Promise<void> {
    try {
      this.exportingPdf = true;
      const element = document.getElementById('user-log-export-container');
      if (!element) {
        this.error = 'Table element not found for PDF export';
        this.exportingPdf = false;
        return;
      }
      const { jsPDF } = await import('jspdf');
      const defaultScale = 2;
      const canvas = await (await import('html2canvas')).default(element, { scale: defaultScale });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`user-sessions-${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (e: any) {
      this.error = e?.message || 'Failed to export PDF';
    } finally {
      this.exportingPdf = false;
    }
  }

  downloadServerCSV(): void {
    const params: any = {
      startDate: this.startDate,
      endDate: this.endDate,
      role: this.role !== 'all' ? this.role : undefined,
      search: this.search || undefined,
      sortKey: this.sortKey,
      sortDir: this.sortDir.toUpperCase()
    };
    this.auditService.exportSessionsCsv(params).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user_sessions_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to export CSV';
      }
    });
  }

  downloadServerPDF(): void {
    const params: any = {
      startDate: this.startDate,
      endDate: this.endDate,
      role: this.role !== 'all' ? this.role : undefined,
      search: this.search || undefined,
      sortKey: this.sortKey,
      sortDir: this.sortDir.toUpperCase()
    };
    this.auditService.exportSessionsPdf(params).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user_sessions_${new Date().toISOString().slice(0,10)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to export PDF';
      }
    });
  }
}

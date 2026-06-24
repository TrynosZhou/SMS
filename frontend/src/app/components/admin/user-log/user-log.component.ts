import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuditService } from '../../../services/audit.service';
import { Subject } from 'rxjs';
import { debounceTime, finalize, takeUntil } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { pdfBlobViewerUrl } from '../../../utils/pdf-preview.util';

@Component({
  standalone: false,
  selector: 'app-user-log',
  templateUrl: './user-log.component.html',
  styleUrls: ['./user-log.component.css']
})
export class UserLogComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private loadSeq = 0;
  private entityIdInput$ = new Subject<string>();
  private performedByInput$ = new Subject<string>();

  loading = false;
  error = '';
  sessions: any[] = [];

  action = 'all';
  role = 'all';
  entityId = '';
  performedBy = '';
  startDate?: string;
  endDate?: string;
  page = 1;
  limit = 50;
  total = 0;

  sortKey = 'loginAt';
  sortDir: 'asc' | 'desc' = 'desc';

  previewLoading = false;
  pdfPreviewBlobUrl: string | null = null;
  pdfPreviewSafeUrl: SafeResourceUrl | null = null;

  constructor(
    private auditService: AuditService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {}

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  get dashboardStats() {
    return {
      total: this.total,
      showing: this.sessions.length,
      active: this.sessions.filter((s) => !s.logoutAt).length,
      loggedOut: this.sessions.filter((s) => !!s.logoutAt).length,
    };
  }

  get sortLabel(): string {
    const labels: Record<string, string> = {
      loginAt: 'login time',
      lastActivityAt: 'last activity',
      logoutAt: 'logout time',
      timeSpentSeconds: 'duration',
      username: 'username',
      role: 'role',
      sessionId: 'session ID',
      ipAddress: 'IP address',
    };
    return labels[this.sortKey] || this.sortKey;
  }

  ngOnInit(): void {
    this.entityIdInput$
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => {
        this.page = 1;
        this.load();
      });

    this.performedByInput$
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => {
        this.page = 1;
        this.load();
      });

    activatePageLoad(this.router, this.destroy$, '/user-log', () => this.bootstrapPage());
  }

  private bootstrapPage(): void {
    this.restoreState();
    this.load();
  }

  ngOnDestroy(): void {
    this.closePdfPreview();
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFilterChange(): void {
    this.page = 1;
    this.load();
  }

  onEntityIdChange(value: string): void {
    this.entityId = value || '';
    this.entityIdInput$.next(this.entityId);
  }

  onPerformedByChange(value: string): void {
    this.performedBy = value || '';
    this.performedByInput$.next(this.performedBy);
  }

  load(): void {
    const seq = ++this.loadSeq;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    const params: Record<string, string> = {
      page: String(this.page),
      limit: String(this.limit),
      sortKey: this.sortKey,
      sortDir: this.sortDir.toUpperCase()
    };
    if (this.startDate) params['startDate'] = this.startDate;
    if (this.endDate) params['endDate'] = this.endDate;
    if (this.role !== 'all') params['role'] = this.role;
    if (this.action !== 'all') params['action'] = this.action;
    if (this.entityId.trim()) params['entityId'] = this.entityId.trim();
    if (this.performedBy.trim()) params['performedBy'] = this.performedBy.trim();

    this.auditService
      .getUserSessions(params)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (seq !== this.loadSeq) return;
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res: any) => {
          if (seq !== this.loadSeq) return;
          this.sessions = Array.isArray(res) ? res : res?.data || [];
          this.total = Array.isArray(res) ? this.sessions.length : Number(res?.total ?? this.sessions.length);
          this.saveState();
        },
        error: (err: any) => {
          if (seq !== this.loadSeq) return;
          this.error = err?.error?.message || 'Failed to load audit logs';
        }
      });
  }

  clearFilters(): void {
    this.action = 'all';
    this.role = 'all';
    this.entityId = '';
    this.performedBy = '';
    this.startDate = undefined;
    this.endDate = undefined;
    this.page = 1;
    this.load();
  }

  hasActiveFilters(): boolean {
    return (
      this.action !== 'all' ||
      this.role !== 'all' ||
      !!this.entityId.trim() ||
      !!this.performedBy.trim() ||
      !!this.startDate ||
      !!this.endDate
    );
  }

  clearAlert(): void {
    this.error = '';
    this.cdr.markForCheck();
  }

  sortIndicator(key: string): string {
    if (this.sortKey !== key) {
      return '↕';
    }
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  formatDuration(seconds: number | null | undefined): string {
    const total = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(total / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem ? `${hours}h ${rem}m` : `${hours}h`;
  }

  formatRole(role: string | null | undefined): string {
    if (!role) {
      return '—';
    }
    return String(role).replace(/_/g, ' ');
  }

  getInitials(value: string | null | undefined): string {
    const raw = String(value || 'U').trim();
    if (raw.length <= 2) {
      return raw.slice(0, 2).toUpperCase();
    }
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase();
  }

  isSessionActive(session: any): boolean {
    return !session?.logoutAt;
  }

  parseModules(modules: string | null | undefined): string[] {
    return String(modules || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  }

  truncateSessionId(sessionId: string): string {
    if (!sessionId || sessionId.length <= 14) {
      return sessionId;
    }
    return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
  }

  private buildExportParams(): Record<string, string> {
    const params: Record<string, string> = {
      sortKey: this.sortKey,
      sortDir: this.sortDir.toUpperCase()
    };
    if (this.startDate) params['startDate'] = this.startDate;
    if (this.endDate) params['endDate'] = this.endDate;
    if (this.role !== 'all') params['role'] = this.role;
    if (this.action !== 'all') params['action'] = this.action;
    if (this.entityId.trim()) params['entityId'] = this.entityId.trim();
    if (this.performedBy.trim()) params['performedBy'] = this.performedBy.trim();
    return params;
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
      ipAddress: s.ipAddress
    }));
    const header = ['User', 'Role', 'Login Time', 'Last Activity', 'Logout Time', 'Time Spent (s)', 'Modules', 'Session ID', 'IP Address'];
    const csv = [
      header.join(','),
      ...rows.map(r =>
        [
          `"${(r.user || '').replace(/"/g, '""')}"`,
          r.role || '',
          r.loginAt ? new Date(r.loginAt).toISOString() : '',
          r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : '',
          r.logoutAt ? new Date(r.logoutAt).toISOString() : '',
          String(r.timeSpentSeconds || 0),
          `"${(r.modules || '').replace(/"/g, '""')}"`,
          r.sessionId || '',
          r.ipAddress || ''
        ].join(',')
      )
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onPageChange(next: boolean): void {
    this.page = next ? Math.min(this.page + 1, this.totalPages) : Math.max(this.page - 1, 1);
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

  copy(text: string | null | undefined): void {
    const value = text || '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  saveState(): void {
    const state = {
      action: this.action,
      role: this.role,
      entityId: this.entityId,
      performedBy: this.performedBy,
      startDate: this.startDate,
      endDate: this.endDate,
      page: this.page,
      limit: this.limit
    };
    localStorage.setItem('userLogState', JSON.stringify(state));
  }

  restoreState(): void {
    const raw = localStorage.getItem('userLogState');
    if (!raw) return;
    try {
      const s = JSON.parse(raw || '{}');
      this.action = s.action || this.action;
      this.role = s.role || this.role;
      this.entityId = s.entityId || this.entityId;
      this.performedBy = s.performedBy || s.search || this.performedBy;
      this.startDate = s.startDate || this.startDate;
      this.endDate = s.endDate || this.endDate;
      this.page = s.page || this.page;
      this.limit = s.limit || this.limit;
    } catch {
      /* ignore */
    }
  }

  downloadServerPDF(): void {
    this.auditService.exportSessionsPdf(this.buildExportParams()).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user_activity_log_${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to export PDF';
        this.cdr.markForCheck();
      }
    });
  }

  previewPdf(): void {
    if (!this.sessions.length) return;
    this.previewLoading = true;
    this.error = '';
    this.closePdfPreview(false);
    this.cdr.markForCheck();

    this.auditService
      .exportSessionsPdf(this.buildExportParams(), true)
      .pipe(
        finalize(() => {
          this.previewLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (blob: Blob) => {
          this.pdfPreviewBlobUrl = URL.createObjectURL(blob);
          this.pdfPreviewSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
            pdfBlobViewerUrl(this.pdfPreviewBlobUrl)
          );
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to preview PDF';
        }
      });
  }

  closePdfPreview(revoke = true): void {
    if (revoke && this.pdfPreviewBlobUrl) {
      URL.revokeObjectURL(this.pdfPreviewBlobUrl);
    }
    this.pdfPreviewBlobUrl = null;
    this.pdfPreviewSafeUrl = null;
  }

  downloadFromPreview(): void {
    this.downloadServerPDF();
  }
}

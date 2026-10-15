import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

type OutboxFilter = 'all' | 'attachments';

@Component({
  standalone: false,
  selector: 'app-parent-outbox',
  templateUrl: './parent-outbox.component.html',
  styleUrls: ['./parent-outbox.component.css']
})
export class ParentOutboxComponent implements OnInit, OnDestroy {
  allMessages: any[] = [];
  messages: any[] = [];
  loading = false;
  error = '';
  success = '';
  parentName = '';
  inboxCount = 0;
  lastRefreshedAt: Date | null = null;

  searchQuery = '';
  outboxFilter: OutboxFilter = 'all';
  sortNewestFirst = true;
  expandedId: string | null = null;

  readonly tips = [
    'Tap a message to view the full content and attached files.',
    'Use Send follow-up to continue the conversation with the school.',
    'Search by subject, recipient, or message body.',
  ];

  private readonly destroy$ = new Subject<void>();
  private readonly requestTimeoutMs = 60000;

  constructor(
    private messageService: MessageService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get withAttachmentsCount(): number {
    return this.allMessages.filter(m => this.getAttachments(m).length > 0).length;
  }

  load() {
    this.loading = true;
    this.error = '';

    forkJoin({
      outbox: this.messageService.getParentOutbox().pipe(
        timeout(this.requestTimeoutMs),
        catchError((err: any) => this.handleLoadError(err))
      ),
      inbox: this.messageService.getParentMessages().pipe(
        timeout(this.requestTimeoutMs),
        catchError(() => of({ messages: [] }))
      ),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.lastRefreshedAt = new Date();
          this.cdr.markForCheck();
        })
      )
      .subscribe(({ outbox, inbox }) => {
        this.allMessages = outbox?.messages || [];
        this.inboxCount = (inbox?.messages || []).length;
        this.applyFilter();
        this.cdr.markForCheck();
      });
  }

  private handleLoadError(err: any) {
    if (err?.status === 401) {
      this.error = 'Session expired. Redirecting to login…';
      setTimeout(() => this.authService.logout(), 2000);
    } else {
      this.error =
        err?.name === 'TimeoutError'
          ? 'Request timed out while loading messages.'
          : err?.error?.message || err?.message || 'Failed to load sent messages';
    }
    setTimeout(() => {
      this.error = '';
      this.cdr.markForCheck();
    }, 8000);
    return of({ messages: [] });
  }

  setFilter(filter: OutboxFilter): void {
    this.outboxFilter = filter;
    this.applyFilter();
  }

  toggleSort(): void {
    this.sortNewestFirst = !this.sortNewestFirst;
    this.applyFilter();
  }

  applyFilter() {
    let list = [...this.allMessages];

    if (this.outboxFilter === 'attachments') {
      list = list.filter(m => this.getAttachments(m).length > 0);
    }

    const q = (this.searchQuery || '').toLowerCase().trim();
    if (q) {
      list = list.filter(m =>
        (m.subject || '').toLowerCase().includes(q) ||
        (m.message || '').toLowerCase().includes(q) ||
        (this.recipientLabel(m).toLowerCase().includes(q)));
    }

    list.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return this.sortNewestFirst ? tb - ta : ta - tb;
    });

    this.messages = list;
  }

  toggleExpand(m: any) {
    this.expandedId = this.expandedId === m.id ? null : m.id;
  }

  formatRefreshedAt(): string {
    if (!this.lastRefreshedAt) return '';
    return this.lastRefreshedAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getMessagePreview(text?: string, max = 100): string {
    if (!text) return '';
    const oneLine = text.replace(/\s+/g, ' ').trim();
    return oneLine.length <= max ? oneLine : oneLine.slice(0, max) + '…';
  }

  getAttachments(message: any): { name: string; url: string; icon: string }[] {
    const raw = message?.attachments;
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed) || parsed.length === 0) return [];
      const base = (environment.apiUrl || '').replace(/\/api$/, '');
      return parsed.map((p: string) => ({
        name: p.split('/').pop() || p,
        url: `${base}${p}`,
        icon: this.fileIcon(p.split('/').pop() || '')
      }));
    } catch { return []; }
  }

  fileIcon(name: string): string {
    const e = name.split('.').pop()?.toLowerCase();
    const m: Record<string, string> = {
      pdf: '📄', doc: '📝', docx: '📝',
      xls: '📊', xlsx: '📊',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️',
      zip: '🗜️', txt: '📃'
    };
    return m[e || ''] || '📎';
  }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatDateFull(dateString: string): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  recipientLabel(m: any): string {
    const r = String(m?.recipient || '');
    const parts = r.toLowerCase().split(',').map((s) => s.trim());
    if (parts.includes('accountant')) return 'Accountant';
    if (parts.includes('admin')) {
      if (parts.includes('headmaster') || parts.includes('deputy_headmaster')) {
        return 'Administrator (+ Headmaster & Deputy Headmaster)';
      }
      return 'School Admin';
    }
    if (r === 'admin') return 'School Admin';
    if (r === 'accountant') return 'Accountant';
    return r || 'School';
  }

  recipientInitial(m: any): string {
    return this.recipientLabel(m).charAt(0).toUpperCase();
  }

  logout() { this.authService.logout(); }
}

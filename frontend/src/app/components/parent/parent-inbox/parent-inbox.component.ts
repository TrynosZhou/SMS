import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';
import { ParentService } from '../../../services/parent.service';
import { environment } from '../../../../environments/environment';

type InboxFilter = 'all' | 'unread' | 'attachments';

@Component({
  standalone: false,
  selector: 'app-parent-inbox',
  templateUrl: './parent-inbox.component.html',
  styleUrls: ['./parent-inbox.component.css'],
})
export class ParentInboxComponent implements OnInit, OnDestroy {
  allMessages: any[] = [];
  messages: any[] = [];
  loading = false;
  error = '';
  success = '';
  parentName = '';
  sentCount = 0;
  lastRefreshedAt: Date | null = null;

  searchQuery = '';
  inboxFilter: InboxFilter = 'all';
  sortNewestFirst = true;
  expandedId: string | null = null;
  readIds: Set<string> = new Set();

  replyingForId: string | null = null;
  replyRecipient: 'admin' | 'accountant' = 'admin';
  replySubject = '';
  replyBody = '';
  sending = false;
  attachments: File[] = [];
  isDragging = false;

  readonly tips = [
    'Tap a message to read the full content and attachments.',
    'Use Reply to respond without leaving your inbox.',
    'Search by subject, sender, or message body.',
  ];

  private readonly destroy$ = new Subject<void>();
  private readonly requestTimeoutMs = 60000;

  constructor(
    private messageService: MessageService,
    private authService: AuthService,
    private parentService: ParentService,
    private cdr: ChangeDetectorRef
  ) {
    this.loadParentName();
  }

  ngOnInit(): void {
    this.loadMessages();
    this.fetchParentProfile();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get unreadCount(): number {
    return this.allMessages.filter((m) => this.isUnread(m)).length;
  }

  get readCount(): number {
    return this.allMessages.length - this.unreadCount;
  }

  get withAttachmentsCount(): number {
    return this.allMessages.filter((m) => this.getAttachments(m).length > 0).length;
  }

  private loadParentName(): void {
    const user = this.authService.getCurrentUser();
    const portalParent = this.authService.getParentPortalParent();
    const p = user?.parent || portalParent;
    if (p) {
      this.parentName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = user?.fullName?.trim() || 'Parent';
    }
  }

  private fetchParentProfile(): void {
    this.parentService
      .getCurrentProfile()
      .pipe(
        timeout(this.requestTimeoutMs),
        takeUntil(this.destroy$),
        catchError(() => of(null))
      )
      .subscribe((profile: any) => {
        if (profile) {
          const lastName = (profile.lastName || '').trim();
          const firstName = (profile.firstName || '').trim();
          this.parentName = `${lastName} ${firstName}`.trim() || profile.fullName || 'Parent';
          this.cdr.markForCheck();
        }
      });
  }

  loadMessages(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      inbox: this.messageService.getParentMessages().pipe(
        timeout(this.requestTimeoutMs),
        catchError((err: any) => this.handleLoadError(err))
      ),
      outbox: this.messageService.getParentOutbox().pipe(
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
      .subscribe(({ inbox, outbox }) => {
        this.allMessages = inbox?.messages || [];
        this.sentCount = (outbox?.messages || []).length;
        this.applyFilter();
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
          : err?.error?.message || err?.message || 'Failed to load messages';
    }
    setTimeout(() => {
      this.error = '';
      this.cdr.markForCheck();
    }, 8000);
    return of({ messages: [] });
  }

  setFilter(filter: InboxFilter): void {
    this.inboxFilter = filter;
    this.applyFilter();
  }

  toggleSort(): void {
    this.sortNewestFirst = !this.sortNewestFirst;
    this.applyFilter();
  }

  markAllRead(): void {
    this.allMessages.forEach((m) => this.readIds.add(m.id));
    this.applyFilter();
    this.cdr.markForCheck();
  }

  applyFilter(): void {
    let list = [...this.allMessages];

    if (this.inboxFilter === 'unread') {
      list = list.filter((m) => this.isUnread(m));
    } else if (this.inboxFilter === 'attachments') {
      list = list.filter((m) => this.getAttachments(m).length > 0);
    }

    const q = (this.searchQuery || '').toLowerCase().trim();
    if (q) {
      list = list.filter(
        (m) =>
          (m.subject || '').toLowerCase().includes(q) ||
          (m.message || '').toLowerCase().includes(q) ||
          (m.senderName || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return this.sortNewestFirst ? tb - ta : ta - tb;
    });

    this.messages = list;
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

  toggleExpand(m: any): void {
    if (this.expandedId === m.id) {
      this.expandedId = null;
    } else {
      this.expandedId = m.id;
      this.readIds.add(m.id);
      if (this.replyingForId && this.replyingForId !== m.id) {
        this.cancelReply();
      }
    }
  }

  isUnread(m: any): boolean {
    return !m.isRead && !this.readIds.has(m.id);
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
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  openReply(m: any): void {
    this.expandedId = m?.id || null;
    this.readIds.add(m?.id);
    this.replyingForId = m?.id || null;
    this.replyRecipient = 'admin';
    this.replySubject = `Re: ${m?.subject || ''}`.trim();
    this.replyBody = '';
    this.success = '';
    this.error = '';
    this.attachments = [];
  }

  cancelReply(): void {
    this.replyingForId = null;
    this.replySubject = '';
    this.replyBody = '';
    this.sending = false;
    this.attachments = [];
    this.isDragging = false;
  }

  sendReply(): void {
    if (!this.replyingForId) return;
    const subject = this.replySubject.trim();
    const body = this.replyBody.trim();
    if (!subject || !body) {
      this.error = 'Please enter subject and message.';
      setTimeout(() => (this.error = ''), 4000);
      return;
    }
    this.sending = true;
    this.error = '';
    this.success = '';
    const obs =
      this.attachments.length > 0
        ? this.messageService.sendParentMessageWithAttachments(
            this.replyRecipient,
            subject,
            body,
            this.attachments
          )
        : this.messageService.sendParentMessage(this.replyRecipient, subject, body);
    obs
      .pipe(
        timeout(this.requestTimeoutMs),
        takeUntil(this.destroy$),
        finalize(() => {
          this.sending = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res: any) => {
          this.success = res?.message || 'Reply sent successfully!';
          this.sentCount += 1;
          setTimeout(() => {
            this.success = '';
            this.cdr.markForCheck();
          }, 5000);
          this.cancelReply();
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to send reply.';
          setTimeout(() => {
            this.error = '';
            this.cdr.markForCheck();
          }, 5000);
        },
      });
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files || []));
    input.value = '';
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    this.isDragging = false;
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging = false;
    this.addFiles(Array.from(e.dataTransfer?.files || []));
  }

  private addFiles(files: File[]): void {
    const maxSize = 10 * 1024 * 1024;
    files.forEach((f) => {
      if (f.size > maxSize) {
        this.error = `${f.name} exceeds 10 MB limit.`;
        setTimeout(() => (this.error = ''), 5000);
        return;
      }
      if (!this.attachments.find((a) => a.name === f.name && a.size === f.size)) {
        this.attachments.push(f);
      }
    });
  }

  removeAttachment(i: number): void {
    this.attachments.splice(i, 1);
  }

  getAttachments(message: any): { name: string; url: string; icon: string }[] {
    const raw = message?.attachments;
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) return [];
      const base = (environment.apiUrl || '').replace(/\/api$/, '');
      return parsed.map((p: string) => ({
        name: p.split('/').pop() || p,
        url: `${base}${p}`,
        icon: this.fileIcon(p.split('/').pop() || ''),
      }));
    } catch {
      return [];
    }
  }

  fileIcon(name: string): string {
    const e = name.split('.').pop()?.toLowerCase();
    const m: Record<string, string> = {
      pdf: '📄',
      doc: '📝',
      docx: '📝',
      xls: '📊',
      xlsx: '📊',
      jpg: '🖼️',
      jpeg: '🖼️',
      png: '🖼️',
      gif: '🖼️',
      zip: '🗜️',
      txt: '📃',
    };
    return m[e || ''] || '📎';
  }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  logout(): void {
    this.authService.logout();
  }
}

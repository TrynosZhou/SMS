import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';

const DRAFT_KEY = 'parent-send-message-draft';
const REQUEST_TIMEOUT_MS = 60000;

interface MessageTemplate {
  id: string;
  label: string;
  icon: string;
  subject: string;
  body: string;
  recipient?: 'admin' | 'accountant';
}

@Component({
  standalone: false,
  selector: 'app-parent-send-message',
  templateUrl: './parent-send-message.component.html',
  styleUrls: ['./parent-send-message.component.css'],
})
export class ParentSendMessageComponent implements OnInit, OnDestroy {
  recipient: 'admin' | 'accountant' = 'admin';
  subject = '';
  body = '';
  loading = false;
  statsLoading = false;
  error = '';
  success = '';
  parentName = '';
  attachments: File[] = [];
  isDragging = false;
  selectedTemplateId: string | null = null;
  draftSavedAt: Date | null = null;
  unreadCount = 0;
  sentCount = 0;
  recentSent: any[] = [];

  readonly charLimit = 2000;
  private readonly destroy$ = new Subject<void>();
  private draftTimer: ReturnType<typeof setTimeout> | null = null;

  readonly templates: MessageTemplate[] = [
    {
      id: 'fee',
      label: 'Fee enquiry',
      icon: '💰',
      recipient: 'accountant',
      subject: 'Fee Balance Enquiry',
      body:
        "Dear Finance Office,\n\nI would like to enquire about my child's current fee balance and any outstanding payments.\n\nPlease advise at your earliest convenience.\n\nThank you.",
    },
    {
      id: 'absence',
      label: 'Absence notice',
      icon: '🏥',
      subject: 'Notice of Absence',
      body:
        'Dear Administrator,\n\nI wish to inform the school that my child will be absent on [date] due to [reason].\n\nPlease note this accordingly.\n\nThank you.',
    },
    {
      id: 'general',
      label: 'General enquiry',
      icon: '💬',
      subject: 'General Enquiry',
      body:
        'Dear Administrator,\n\nI am writing to enquire about [topic]. Could you please provide more information at your earliest convenience?\n\nThank you.',
    },
    {
      id: 'meeting',
      label: 'Request meeting',
      icon: '📅',
      subject: 'Request for Meeting',
      body:
        'Dear Administrator,\n\nI would like to request a meeting to discuss [topic] regarding my child.\n\nPlease let me know your available times.\n\nThank you.',
    },
    {
      id: 'transport',
      label: 'Transport',
      icon: '🚌',
      subject: 'Transport Enquiry',
      body:
        'Dear Administrator,\n\nI am writing regarding school transport arrangements for my child.\n\nPlease provide details on routes, pick-up times, and fees.\n\nThank you.',
    },
  ];

  readonly tips = [
    'Include your child’s name and class for faster replies.',
    'Attach receipts or documents when asking about fees.',
    'Use the Accountant for billing and payment questions.',
  ];

  constructor(
    private messageService: MessageService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName =
        `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
    this.restoreDraft();
    this.loadMessagingStats();
  }

  ngOnDestroy(): void {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  get charCount(): number {
    return this.body.length;
  }

  get charClass(): string {
    if (this.charCount > this.charLimit * 0.9) return 'danger';
    if (this.charCount > this.charLimit * 0.75) return 'warn';
    return 'ok';
  }

  get formProgress(): number {
    let score = 0;
    if (this.recipient) score += 25;
    if (this.subject.trim()) score += 25;
    if (this.body.trim()) score += 40;
    if (this.attachments.length > 0) score += 10;
    return Math.min(100, score);
  }

  get recipientLabel(): string {
    return this.recipient === 'accountant' ? 'Accountant' : 'Administrator';
  }

  get hasDraftContent(): boolean {
    return !!(this.subject.trim() || this.body.trim());
  }

  canSend(): boolean {
    return (
      !!this.subject.trim() &&
      !!this.body.trim() &&
      !!this.recipient &&
      this.charCount <= this.charLimit &&
      !this.loading
    );
  }

  loadMessagingStats(): void {
    this.statsLoading = true;
    forkJoin({
      inbox: this.messageService.getParentMessages().pipe(
        timeout(REQUEST_TIMEOUT_MS),
        catchError(() => of({ messages: [] }))
      ),
      outbox: this.messageService.getParentOutbox().pipe(
        timeout(REQUEST_TIMEOUT_MS),
        catchError(() => of({ messages: [] }))
      ),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.statsLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe(({ inbox, outbox }) => {
        const inboxMsgs = inbox?.messages || [];
        const outboxMsgs = outbox?.messages || [];
        this.unreadCount = inboxMsgs.filter((m: any) => !m.isRead).length;
        this.sentCount = outboxMsgs.length;
        this.recentSent = outboxMsgs.slice(0, 5);
      });
  }

  applyTemplate(t: MessageTemplate): void {
    this.selectedTemplateId = t.id;
    this.subject = t.subject;
    this.body = t.body;
    if (t.recipient) this.recipient = t.recipient;
    this.scheduleDraftSave();
  }

  selectRecipient(r: 'admin' | 'accountant'): void {
    this.recipient = r;
    this.scheduleDraftSave();
  }

  onSubjectChange(): void {
    this.scheduleDraftSave();
  }

  onBodyChange(): void {
    this.scheduleDraftSave();
  }

  clearForm(): void {
    if (this.hasContent() && !confirm('Discard this message?')) return;
    this.subject = '';
    this.body = '';
    this.attachments = [];
    this.selectedTemplateId = null;
    this.recipient = 'admin';
    this.clearDraft();
    this.error = '';
  }

  send(): void {
    if (!this.canSend()) {
      this.error = 'Please fill in the subject and message.';
      setTimeout(() => (this.error = ''), 4000);
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = '';
    const req$ =
      this.attachments.length > 0
        ? this.messageService.sendParentMessageWithAttachments(
            this.recipient,
            this.subject.trim(),
            this.body.trim(),
            this.attachments
          )
        : this.messageService.sendParentMessage(
            this.recipient,
            this.subject.trim(),
            this.body.trim()
          );
    req$
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res: any) => {
          this.success = res?.message || 'Message sent successfully!';
          this.subject = '';
          this.body = '';
          this.attachments = [];
          this.selectedTemplateId = null;
          this.clearDraft();
          this.loadMessagingStats();
          setTimeout(() => (this.success = ''), 6000);
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to send message.';
          setTimeout(() => (this.error = ''), 6000);
        },
      });
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files || []));
    input.value = '';
    this.scheduleDraftSave();
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
    this.scheduleDraftSave();
  }

  removeAttachment(i: number): void {
    this.attachments.splice(i, 1);
    this.scheduleDraftSave();
  }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  formatRecipient(value?: string): string {
    if (!value) return 'School';
    const v = value.toLowerCase();
    if (v.includes('account')) return 'Accountant';
    if (v.includes('admin')) return 'Administrator';
    return value;
  }

  formatMessageDate(dateString?: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatDraftTime(): string {
    if (!this.draftSavedAt) return '';
    return this.draftSavedAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
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

  logout(): void {
    this.authService.logout();
  }

  private hasContent(): boolean {
    return !!(this.subject.trim() || this.body.trim() || this.attachments.length);
  }

  private scheduleDraftSave(): void {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.saveDraft(), 500);
  }

  private saveDraft(): void {
    if (!this.hasContent()) {
      this.clearDraft();
      return;
    }
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          recipient: this.recipient,
          subject: this.subject,
          body: this.body,
          selectedTemplateId: this.selectedTemplateId,
        })
      );
      this.draftSavedAt = new Date();
      this.cdr.markForCheck();
    } catch {
      /* ignore quota errors */
    }
  }

  private restoreDraft(): void {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.recipient) this.recipient = d.recipient;
      if (d.subject) this.subject = d.subject;
      if (d.body) this.body = d.body;
      if (d.selectedTemplateId) this.selectedTemplateId = d.selectedTemplateId;
      this.draftSavedAt = new Date();
    } catch {
      /* ignore */
    }
  }

  private clearDraft(): void {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    this.draftSavedAt = null;
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
}

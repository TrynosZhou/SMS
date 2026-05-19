import { Component, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-parent-inbox',
  templateUrl: './parent-inbox.component.html',
  styleUrls: ['./parent-inbox.component.css']
})
export class ParentInboxComponent implements OnInit {
  allMessages: any[] = [];
  messages: any[] = [];
  loading = false;
  error = '';
  success = '';
  parentName = '';

  searchQuery = '';
  expandedId: string | null = null;
  readIds: Set<string> = new Set();

  replyingForId: string | null = null;
  replyRecipient: 'admin' | 'accountant' = 'admin';
  replySubject = '';
  replyBody = '';
  sending = false;
  attachments: File[] = [];
  isDragging = false;

  constructor(private messageService: MessageService, private authService: AuthService) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  ngOnInit() { this.loadMessages(); }

  loadMessages() {
    this.loading = true;
    this.error = '';
    this.messageService.getParentMessages().subscribe({
      next: (response: any) => {
        this.allMessages = response.messages || [];
        this.applyFilter();
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Session expired. Redirecting to login…';
          setTimeout(() => this.authService.logout(), 2000);
        } else {
          this.error = err.error?.message || 'Failed to load messages';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  applyFilter() {
    const q = (this.searchQuery || '').toLowerCase().trim();
    this.messages = q
      ? this.allMessages.filter(m =>
          (m.subject || '').toLowerCase().includes(q) ||
          (m.message || '').toLowerCase().includes(q) ||
          (m.senderName || '').toLowerCase().includes(q))
      : [...this.allMessages];
  }

  get unreadCount(): number {
    return this.allMessages.filter(m => !this.readIds.has(m.id) && !m.isRead).length;
  }

  toggleExpand(m: any) {
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
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  openReply(m: any) {
    this.replyingForId = m?.id || null;
    this.replyRecipient = 'admin';
    this.replySubject = `Re: ${m?.subject || ''}`.trim();
    this.replyBody = '';
    this.success = '';
    this.error = '';
    this.attachments = [];
  }

  cancelReply() {
    this.replyingForId = null;
    this.replySubject = '';
    this.replyBody = '';
    this.sending = false;
    this.attachments = [];
    this.isDragging = false;
  }

  sendReply() {
    if (!this.replyingForId) return;
    const subject = this.replySubject.trim();
    const body = this.replyBody.trim();
    if (!subject || !body) {
      this.error = 'Please enter subject and message.';
      setTimeout(() => this.error = '', 4000);
      return;
    }
    this.sending = true;
    this.error = '';
    this.success = '';
    const obs = this.attachments.length > 0
      ? this.messageService.sendParentMessageWithAttachments(this.replyRecipient, subject, body, this.attachments)
      : this.messageService.sendParentMessage(this.replyRecipient, subject, body);
    obs.subscribe({
      next: (res: any) => {
        this.sending = false;
        this.success = res?.message || 'Reply sent successfully!';
        setTimeout(() => this.success = '', 5000);
        this.cancelReply();
      },
      error: (err: any) => {
        this.sending = false;
        this.error = err?.error?.message || 'Failed to send reply.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onFileChange(event: any) {
    this.addFiles(Array.from(event.target.files as FileList));
    event.target.value = '';
  }

  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragging = true; }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.isDragging = false; }
  onDrop(e: DragEvent) {
    e.preventDefault(); this.isDragging = false;
    this.addFiles(Array.from(e.dataTransfer?.files || []));
  }

  private addFiles(files: File[]) {
    files.forEach(f => {
      if (!this.attachments.find(a => a.name === f.name && a.size === f.size)) this.attachments.push(f);
    });
  }

  removeAttachment(i: number) { this.attachments.splice(i, 1); }

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
        icon: this.fileIcon(p.split('/').pop() || '')
      }));
    } catch { return []; }
  }

  fileIcon(name: string): string {
    const e = name.split('.').pop()?.toLowerCase();
    const m: Record<string, string> = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', zip: '🗜️', txt: '📃' };
    return m[e || ''] || '📎';
  }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  logout() { this.authService.logout(); }
}


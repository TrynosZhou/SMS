import { Component, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-parent-outbox',
  templateUrl: './parent-outbox.component.html',
  styleUrls: ['./parent-outbox.component.css']
})
export class ParentOutboxComponent implements OnInit {
  allMessages: any[] = [];
  messages: any[] = [];
  loading = false;
  error = '';
  success = '';
  parentName = '';

  searchQuery = '';
  expandedId: string | null = null;

  constructor(private messageService: MessageService, private authService: AuthService) {
    const user = this.authService.getCurrentUser();
    if (user?.parent) {
      this.parentName = `${user.parent.firstName || ''} ${user.parent.lastName || ''}`.trim() || 'Parent';
    } else {
      this.parentName = 'Parent';
    }
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.error = '';
    this.messageService.getParentOutbox().subscribe({
      next: (res: any) => {
        this.allMessages = res?.messages || [];
        this.applyFilter();
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        if (err.status === 401) {
          this.error = 'Session expired. Redirecting to login…';
          setTimeout(() => this.authService.logout(), 2000);
        } else {
          this.error = err?.error?.message || 'Failed to load sent messages';
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
          (m.recipient || '').toLowerCase().includes(q))
      : [...this.allMessages];
  }

  get withAttachmentsCount(): number {
    return this.allMessages.filter(m => this.getAttachments(m).length > 0).length;
  }

  toggleExpand(m: any) {
    this.expandedId = this.expandedId === m.id ? null : m.id;
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
    const r = m.recipient || '';
    if (r === 'admin') return 'School Admin';
    if (r === 'accountant') return 'Accountant';
    return r || 'School';
  }

  recipientInitial(m: any): string {
    return this.recipientLabel(m).charAt(0).toUpperCase();
  }

  logout() { this.authService.logout(); }
}

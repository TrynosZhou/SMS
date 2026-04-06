import { Component, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';
import { ThemeService } from '../../../services/theme.service';

export type InboxFilterTab = 'all' | 'unread' | 'read';

@Component({
  selector: 'app-accountant-inbox',
  templateUrl: './accountant-inbox.component.html',
  styleUrls: ['./accountant-inbox.component.css']
})
export class AccountantInboxComponent implements OnInit {
  messages: any[] = [];
  filtered: any[] = [];
  loading = false;
  error = '';
  userName = '';
  query = '';
  filterTab: InboxFilterTab = 'all';
  selectedMessage: any | null = null;

  constructor(
    private messageService: MessageService,
    private authService: AuthService,
    public themeService: ThemeService
  ) {
    const user = this.authService.getCurrentUser();
    this.userName = user?.username || user?.email || 'Account';
  }

  ngOnInit(): void {
    this.loadMessages();
  }

  get unreadCount(): number {
    return this.messages.filter(m => !m.isRead).length;
  }

  loadMessages() {
    this.loading = true;
    this.error = '';
    this.messageService.getStaffMessages('accountant').subscribe({
      next: (res: any) => {
        this.loading = false;
        if (Array.isArray(res)) {
          this.messages = res;
        } else if (res && Array.isArray(res.messages)) {
          this.messages = res.messages;
        } else if (res && res.data && Array.isArray(res.data)) {
          this.messages = res.data;
        } else {
          this.messages = [];
        }
        this.applyFilter();
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to load inbox';
        setTimeout(() => (this.error = ''), 6000);
      }
    });
  }

  setFilterTab(tab: InboxFilterTab) {
    this.filterTab = tab;
    this.applyFilter();
  }

  applyFilter() {
    let list = [...this.messages];
    const q = (this.query || '').trim().toLowerCase();
    if (q) {
      list = list.filter(
        m =>
          (m.subject || '').toLowerCase().includes(q) ||
          (m.message || '').toLowerCase().includes(q) ||
          (m.senderName || '').toLowerCase().includes(q) ||
          (m.recipientName || '').toLowerCase().includes(q) ||
          (m.parentName || '').toLowerCase().includes(q)
      );
    }
    if (this.filterTab === 'unread') {
      list = list.filter(m => !m.isRead);
    } else if (this.filterTab === 'read') {
      list = list.filter(m => m.isRead);
    }
    this.filtered = list;
    this.syncSelection();
  }

  private syncSelection() {
    if (!this.filtered.length) {
      this.selectedMessage = null;
      return;
    }
    const current =
      this.selectedMessage && this.filtered.find((x: any) => x.id === this.selectedMessage!.id);
    if (current) {
      this.selectedMessage = current;
      return;
    }
    this.selectedMessage = this.filtered[0];
  }

  clearQuery() {
    this.query = '';
    this.applyFilter();
  }

  selectMessage(m: any) {
    this.selectedMessage = m;
    if (m?.id && !m.isRead) {
      this.messageService.markIncomingRead(m.id).subscribe({
        next: () => {
          m.isRead = true;
        },
        error: () => {}
      });
    }
  }

  markUnread(m: any) {
    if (!m?.id) {
      return;
    }
    this.messageService.markIncomingUnread(m.id).subscribe({
      next: () => {
        m.isRead = false;
      },
      error: () => {}
    });
  }

  refresh() {
    this.loadMessages();
  }

  formatDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch {
      return dateStr;
    }
  }

  formatRelative(dateStr: string): string {
    if (!dateStr) {
      return '';
    }
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) {
      return 'Just now';
    }
    const min = Math.floor(diff / 60_000);
    if (min < 60) {
      return `${min}m ago`;
    }
    const hr = Math.floor(min / 60);
    if (hr < 24) {
      return `${hr}h ago`;
    }
    const day = Math.floor(hr / 24);
    if (day < 7) {
      return `${day}d ago`;
    }
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  }

  senderInitials(m: any): string {
    const raw = (m?.senderName || m?.recipientName || m?.parentName || 'P').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase() || 'P';
  }

  previewBody(text: string): string {
    if (!text) {
      return '';
    }
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length > 120 ? t.slice(0, 117) + '…' : t;
  }

  trackById(_index: number, m: any) {
    return m.id;
  }
}

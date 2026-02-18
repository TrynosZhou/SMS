import { Component, OnDestroy, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-incoming-from-parents',
  templateUrl: './incoming-from-parents.component.html',
  styleUrls: ['./incoming-from-parents.component.css']
})
export class IncomingFromParentsComponent implements OnInit, OnDestroy {
  messages: any[] = [];
  filtered: any[] = [];
  paged: any[] = [];
  selected: any | null = null;
  loading = false;
  error = '';
  query = '';
  roleBox: 'admin' | 'accountant' = 'admin';
  replying = false;
  replySubject = '';
  replyBody = '';
  replyFiles: File[] = [];
  filterMode: 'all' | 'unread' | 'read' = 'all';
  sortMode: 'newest' | 'oldest' = 'newest';
  pageSize = 10;
  currentPage = 1;
  selectedIds = new Set<string>();
  autoRefresh = true;
  refreshHandle: any = null;

  constructor(private messageService: MessageService, private authService: AuthService) {
    const user = this.authService.getCurrentUser();
    const role = (user?.role || '').toLowerCase();
    this.roleBox = role === 'accountant' ? 'accountant' as const : 'admin';
  }

  ngOnInit(): void {
    this.load();
    this.setupAutoRefresh();
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }
  }

  load() {
    this.loading = true;
    this.error = '';
    this.messageService.getIncomingFromParents(this.roleBox).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.messages = Array.isArray(res?.messages) ? res.messages : [];
        this.applyFilterAndPaginate();
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load incoming messages';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  setupAutoRefresh() {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }
    if (this.autoRefresh) {
      this.refreshHandle = setInterval(() => this.load(), 60000);
    }
  }

  applyFilterAndPaginate() {
    const q = (this.query || '').toLowerCase();
    let arr = this.messages.slice();
    if (this.filterMode === 'unread') arr = arr.filter(m => !m.isRead);
    if (this.filterMode === 'read') arr = arr.filter(m => !!m.isRead);
    if (q) {
      arr = arr.filter(m =>
        (m.subject || '').toLowerCase().includes(q) ||
        (m.message || '').toLowerCase().includes(q) ||
        (m.senderName || '').toLowerCase().includes(q) ||
        (m.parentName || '').toLowerCase().includes(q)
      );
    }
    arr.sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return this.sortMode === 'newest' ? db - da : da - db;
    });
    this.filtered = arr;
    this.currentPage = Math.min(this.currentPage, this.totalPages() || 1);
    this.slicePage();
  }

  slicePage() {
    const start = (this.currentPage - 1) * this.pageSize;
    this.paged = this.filtered.slice(start, start + this.pageSize);
  }

  totalPages(): number {
    return Math.ceil(this.filtered.length / this.pageSize);
  }

  nextPage() {
    if (this.currentPage < this.totalPages()) {
      this.currentPage++;
      this.slicePage();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.slicePage();
    }
  }

  open(msg: any) {
    this.selected = msg;
    this.replying = false;
    this.replySubject = `Re: ${msg.subject || ''}`.trim();
    this.replyBody = '';
    this.replyFiles = [];
  }

  formatDate(d: string) {
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  }

  timeAgo(d: string): string {
    try {
      const t = new Date(d).getTime();
      const diff = Date.now() - t;
      const m = Math.floor(diff / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      const days = Math.floor(h / 24);
      return `${days}d ago`;
    } catch {
      return d;
    }
  }

  markRead() {
    if (!this.selected) return;
    this.messageService.markIncomingRead(this.selected.id).subscribe({
      next: () => {
        this.selected.isRead = true;
        const idx = this.messages.findIndex(m => m.id === this.selected!.id);
        if (idx >= 0) this.messages[idx].isRead = true;
        this.applyFilterAndPaginate();
      },
      error: () => {}
    });
  }

  markUnread() {
    if (!this.selected) return;
    this.messageService.markIncomingUnread(this.selected.id).subscribe({
      next: () => {
        this.selected.isRead = false;
        const idx = this.messages.findIndex(m => m.id === this.selected!.id);
        if (idx >= 0) this.messages[idx].isRead = false;
        this.applyFilterAndPaginate();
      },
      error: () => {}
    });
  }

  toggleReply() {
    this.replying = !this.replying;
  }

  onReplyFilesChange(event: any) {
    const files: FileList = event.target.files;
    this.replyFiles = [];
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i)!;
      this.replyFiles.push(f);
    }
  }

  removeReplyFile(i: number) {
    this.replyFiles.splice(i, 1);
  }

  canSendReply(): boolean {
    return !!this.selected && !!this.replySubject.trim() && !!this.replyBody.trim();
    }

  sendReply() {
    if (!this.selected) return;
    if (!this.canSendReply()) return;
    const id = this.selected.id;
    const subject = this.replySubject.trim();
    const body = this.replyBody.trim();
    const files = this.replyFiles || [];
    this.messageService.replyToIncoming(id, subject, body, files).subscribe({
      next: () => {
        this.replying = false;
        this.replySubject = '';
        this.replyBody = '';
        this.replyFiles = [];
      },
      error: () => {}
    });
  }

  unreadCount(): number {
    return this.messages.filter(m => !m.isRead).length;
  }

  toggleId(id: string) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  selectAllCurrentPage() {
    this.paged.forEach(m => this.selectedIds.add(m.id));
  }

  clearSelection() {
    this.selectedIds.clear();
  }

  bulkMarkRead() {
    const ids = Array.from(this.selectedIds);
    const run = (i: number) => {
      if (i >= ids.length) {
        this.applyFilterAndPaginate();
        return;
      }
      this.messageService.markIncomingRead(ids[i]).subscribe({
        next: () => {
          const idx = this.messages.findIndex(m => m.id === ids[i]);
          if (idx >= 0) this.messages[idx].isRead = true;
          run(i + 1);
        },
        error: () => run(i + 1)
      });
    };
    run(0);
  }

  bulkMarkUnread() {
    const ids = Array.from(this.selectedIds);
    const run = (i: number) => {
      if (i >= ids.length) {
        this.applyFilterAndPaginate();
        return;
      }
      this.messageService.markIncomingUnread(ids[i]).subscribe({
        next: () => {
          const idx = this.messages.findIndex(m => m.id === ids[i]);
          if (idx >= 0) this.messages[idx].isRead = false;
          run(i + 1);
        },
        error: () => run(i + 1)
      });
    };
    run(0);
  }
}

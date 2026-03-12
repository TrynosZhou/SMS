import { Component, OnDestroy, OnInit, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  senderFilter = '';
  senders: string[] = [];
  dateStart: string = '';
  dateEnd: string = '';
  showFilters = false;
  private storageKey = 'incomingFilters';
  replyTemplates: { name: string; subject: string; body: string }[] = [
    { name: 'Acknowledgement', subject: 'Re: Your message', body: 'Dear Parent,\n\nThank you for reaching out. We acknowledge receipt of your message and will respond shortly.\n\nRegards.' },
    { name: 'Follow-up', subject: 'Re: Follow-up on your query', body: 'Dear Parent,\n\nFollowing up on your query. Please provide any additional details if needed.\n\nRegards.' },
    { name: 'Meeting Request', subject: 'Re: Meeting Request', body: 'Dear Parent,\n\nCan we schedule a meeting to discuss your message? Please suggest a suitable date and time.\n\nRegards.' }
  ];
  selectedReplyTemplate = '';
  pinnedIds = new Set<string>();
  pinnedOnly = false;
  showPinnedFirst = true;
  private pinnedStorageKey = 'incomingPinnedIds';
  private templatesStorageKey = 'incomingReplyTemplates';
  showTemplateManager = false;

  constructor(
    private messageService: MessageService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    const role = (user?.role || '').toLowerCase();
    this.roleBox = role === 'accountant' ? 'accountant' as const : 'admin';
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showTemplateManager) {
      this.showTemplateManager = false;
    } else if (this.replying) {
      this.replying = false;
    }
  }

  ngOnInit(): void {
    this.loadStoredFilters();
    this.loadPinnedIds();
    this.loadTemplates();
    this.route.queryParamMap.subscribe(p => {
      const id = p.get('id');
      if (id && this.messages.length > 0) {
        const m = this.messages.find(x => String(x.id || '') === String(id));
        if (m) this.selected = m;
      }
    });
    this.load();
    this.setupAutoRefresh();
  }

  private loadStoredFilters(): void {
    const raw = localStorage.getItem(this.storageKey);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        this.query = s.query || '';
        this.filterMode = s.filterMode || this.filterMode;
        this.sortMode = s.sortMode || this.sortMode;
        this.pageSize = s.pageSize || this.pageSize;
        this.senderFilter = s.senderFilter || '';
        this.dateStart = s.dateStart || '';
        this.dateEnd = s.dateEnd || '';
        this.pinnedOnly = !!s.pinnedOnly;
        this.showPinnedFirst = s.showPinnedFirst !== undefined ? !!s.showPinnedFirst : this.showPinnedFirst;
      } catch {}
    }
  }

  private loadPinnedIds(): void {
    const p = localStorage.getItem(this.pinnedStorageKey);
    if (p) {
      try {
        const arr = JSON.parse(p);
        if (Array.isArray(arr)) {
          arr.forEach((id: string) => this.pinnedIds.add(String(id)));
        }
      } catch {}
    }
  }

  private loadTemplates(): void {
    const t = localStorage.getItem(this.templatesStorageKey);
    if (t) {
      try {
        const arr = JSON.parse(t);
        if (Array.isArray(arr)) {
          this.replyTemplates = arr.filter((x: any) => x && typeof x.name === 'string' && typeof x.subject === 'string' && typeof x.body === 'string');
        }
      } catch {}
    }
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.messageService.getIncomingFromParents(this.roleBox).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.messages = Array.isArray(res?.messages) ? res.messages : Array.isArray(res) ? res : [];
        this.senders = Array.from(new Set(this.messages.map(m => (m.senderName || m.parentName || '').trim()).filter(Boolean)));
        this.applyFilterAndPaginate();
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load incoming messages';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  setupAutoRefresh(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }
    if (this.autoRefresh) {
      this.refreshHandle = setInterval(() => this.load(), 60000);
    }
  }

  applyFilterAndPaginate(): void {
    const q = (this.query || '').toLowerCase();
    const start = this.dateStart ? new Date(this.dateStart).getTime() : 0;
    const end = this.dateEnd ? new Date(this.dateEnd).getTime() : Number.MAX_SAFE_INTEGER;
    const sender = (this.senderFilter || '').toLowerCase();
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
    
    if (sender) {
      arr = arr.filter(m => ((m.senderName || m.parentName || '').toLowerCase()) === sender);
    }
    
    arr = arr.filter(m => {
      const t = m.createdAt ? new Date(m.createdAt).getTime() : 0;
      return (!start || t >= start) && (!end || t <= end);
    });
    
    if (this.pinnedOnly) {
      arr = arr.filter(m => this.isPinned(m));
    }
    
    arr.sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      const pinCmp = this.showPinnedFirst ? ((this.isPinned(b) ? 1 : 0) - (this.isPinned(a) ? 1 : 0)) : 0;
      if (pinCmp !== 0) return pinCmp;
      return this.sortMode === 'newest' ? db - da : da - db;
    });
    
    this.filtered = arr;
    this.currentPage = Math.min(this.currentPage, this.totalPages() || 1);
    this.slicePage();
    this.saveFilters();
  }

  private saveFilters(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        query: this.query,
        filterMode: this.filterMode,
        sortMode: this.sortMode,
        pageSize: this.pageSize,
        senderFilter: this.senderFilter,
        dateStart: this.dateStart,
        dateEnd: this.dateEnd,
        pinnedOnly: this.pinnedOnly,
        showPinnedFirst: this.showPinnedFirst
      }));
    } catch {}
  }

  slicePage(): void {
    const start = (this.currentPage - 1) * this.pageSize;
    this.paged = this.filtered.slice(start, start + this.pageSize);
  }

  totalPages(): number {
    return Math.ceil(this.filtered.length / this.pageSize);
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages()) {
      this.currentPage++;
      this.slicePage();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.slicePage();
    }
  }

  open(msg: any): void {
    this.selected = msg;
    this.replying = false;
    this.replySubject = `Re: ${msg.subject || ''}`.trim();
    this.replyBody = '';
    this.replyFiles = [];
    this.selectedReplyTemplate = '';
    const id = msg?.id;
    if (id) {
      this.router.navigate([], { queryParams: { id }, queryParamsHandling: 'merge' });
    }
    if (!msg.isRead) {
      this.markRead();
    }
  }

  getInitial(msg: any): string {
    const name = msg?.parentName || msg?.senderName || 'P';
    return name.charAt(0).toUpperCase();
  }

  getPreview(message: string): string {
    if (!message) return '';
    const clean = message.replace(/\s+/g, ' ').trim();
    return clean.length > 80 ? clean.substring(0, 80) + '...' : clean;
  }

  formatDate(d: string): string {
    try {
      return new Date(d).toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
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
      if (days < 7) return `${days}d ago`;
      return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    } catch {
      return d;
    }
  }

  markRead(): void {
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

  markUnread(): void {
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

  toggleReply(): void {
    this.replying = !this.replying;
    if (this.replying && this.selected) {
      this.replySubject = `Re: ${this.selected.subject || ''}`.trim();
      this.replyBody = '';
      this.replyFiles = [];
      this.selectedReplyTemplate = '';
    }
  }

  onReplyFilesChange(event: any): void {
    const files: FileList = event.target.files;
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i)!;
      this.replyFiles.push(f);
    }
    event.target.value = '';
  }

  removeReplyFile(i: number): void {
    this.replyFiles.splice(i, 1);
  }

  canSendReply(): boolean {
    return !!this.selected && !!this.replySubject.trim() && !!this.replyBody.trim();
  }

  sendReply(): void {
    if (!this.selected || !this.canSendReply()) return;
    
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
        this.selectedReplyTemplate = '';
      },
      error: () => {
        this.error = 'Failed to send reply. Please try again.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  unreadCount(): number {
    return this.messages.filter(m => !m.isRead).length;
  }

  toggleId(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  isAllPageSelected(): boolean {
    return this.paged.length > 0 && this.paged.every(m => this.selectedIds.has(m.id));
  }

  toggleSelectAllPage(): void {
    if (this.isAllPageSelected()) {
      this.paged.forEach(m => this.selectedIds.delete(m.id));
    } else {
      this.paged.forEach(m => this.selectedIds.add(m.id));
    }
  }

  selectAllCurrentPage(): void {
    this.paged.forEach(m => this.selectedIds.add(m.id));
  }

  clearSelection(): void {
    this.selectedIds.clear();
  }

  bulkMarkRead(): void {
    const ids = Array.from(this.selectedIds);
    const run = (i: number) => {
      if (i >= ids.length) {
        this.applyFilterAndPaginate();
        this.clearSelection();
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

  bulkMarkUnread(): void {
    const ids = Array.from(this.selectedIds);
    const run = (i: number) => {
      if (i >= ids.length) {
        this.applyFilterAndPaginate();
        this.clearSelection();
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

  clearFilters(): void {
    this.query = '';
    this.filterMode = 'all';
    this.sortMode = 'newest';
    this.senderFilter = '';
    this.dateStart = '';
    this.dateEnd = '';
    this.pinnedOnly = false;
    this.applyFilterAndPaginate();
  }

  exportCSV(): void {
    const base = this.selectedIds.size > 0 ? this.filtered.filter(m => this.selectedIds.has(m.id)) : this.filtered;
    const rows = base.map(m => ({
      Subject: m.subject || '',
      From: m.senderName || m.parentName || '',
      Date: this.formatDate(m.createdAt),
      Message: (m.message || '').replace(/\r?\n/g, ' ')
    }));
    const header = Object.keys(rows[0] || { Subject: '', From: '', Date: '', Message: '' });
    const csv = [
      header.join(','),
      ...rows.map(r => header.map(h => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'incoming-messages.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  copySelected(): void {
    if (!this.selected) return;
    const text = `Subject: ${this.selected.subject || ''}\nFrom: ${this.selected.senderName || this.selected.parentName || ''}\nDate: ${this.formatDate(this.selected.createdAt)}\n\n${this.selected.message || ''}`;
    navigator.clipboard?.writeText(text);
  }

  downloadSelected(): void {
    if (!this.selected) return;
    const text = `Subject: ${this.selected.subject || ''}\nFrom: ${this.selected.senderName || this.selected.parentName || ''}\nDate: ${this.formatDate(this.selected.createdAt)}\n\n${this.selected.message || ''}`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (this.selected.subject || 'message') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  printSelected(): void {
    if (!this.selected) return;
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    const html = `
      <html>
      <head>
        <title>Message - ${this.selected.subject || 'No Subject'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h2 { color: #1e293b; margin-bottom: 8px; }
          .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
          .body { white-space: pre-wrap; line-height: 1.6; color: #334155; }
        </style>
      </head>
      <body>
        <h2>${this.selected.subject || '(No Subject)'}</h2>
        <div class="meta">From: ${this.selected.senderName || this.selected.parentName || ''} • ${this.formatDate(this.selected.createdAt)}</div>
        <div class="body">${this.selected.message || ''}</div>
      </body>
      </html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  applyReplyTemplate(): void {
    const t = this.replyTemplates.find(x => x.name === this.selectedReplyTemplate);
    if (!t) return;
    if (!this.replySubject.trim() || this.replySubject.startsWith('Re:')) {
      this.replySubject = t.subject;
    }
    if (!this.replyBody.trim()) {
      this.replyBody = t.body;
    }
  }

  isPinned(msg: any): boolean {
    return this.pinnedIds.has(String(msg?.id || ''));
  }

  togglePin(msg: any): void {
    const id = String(msg?.id || '');
    if (!id) return;
    if (this.pinnedIds.has(id)) {
      this.pinnedIds.delete(id);
    } else {
      this.pinnedIds.add(id);
    }
    try {
      localStorage.setItem(this.pinnedStorageKey, JSON.stringify(Array.from(this.pinnedIds)));
    } catch {}
    this.applyFilterAndPaginate();
  }

  addReplyTemplate(): void {
    this.replyTemplates.push({ name: 'New Template', subject: '', body: '' });
  }

  removeReplyTemplate(index: number): void {
    if (index < 0 || index >= this.replyTemplates.length) return;
    this.replyTemplates.splice(index, 1);
    this.saveReplyTemplates();
  }

  saveReplyTemplates(): void {
    try {
      localStorage.setItem(this.templatesStorageKey, JSON.stringify(this.replyTemplates));
    } catch {}
  }
}

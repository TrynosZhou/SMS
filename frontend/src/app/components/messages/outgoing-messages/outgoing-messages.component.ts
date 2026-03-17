import { Component, OnInit, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-outgoing-messages',
  templateUrl: './outgoing-messages.component.html',
  styleUrls: ['./outgoing-messages.component.css']
})
export class OutgoingMessagesComponent implements OnInit {
  messages: any[] = [];
  filtered: any[] = [];
  displayed: any[] = [];
  selected: any | null = null;
  loading = false;
  error = '';
  query = '';
  recipientFilter = '';
  recipients: string[] = [];
  dateStart: string = '';
  dateEnd: string = '';
  dateFilter: string = '';
  sortDesc = true;
  page = 1;
  pageSize = 10;
  totalPages = 1;
  showFilters = false;
  private pendingSelectId: string | null = null;
  selectedIds = new Set<string>();
  private storageKey = 'outboxFilters';

  constructor(
    private messageService: MessageService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.selected) {
      this.selected = null;
    }
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(p => {
      const id = p.get('id');
      this.pendingSelectId = id;
      if (this.messages.length > 0 && id) {
        const m = this.messages.find(x => String(x.id || '') === String(id));
        if (m) this.selected = m;
      }
    });
    this.loadStoredFilters();
    this.load();
  }

  private loadStoredFilters(): void {
    const raw = localStorage.getItem(this.storageKey);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        this.query = s.query || '';
        this.recipientFilter = s.recipientFilter || '';
        this.dateStart = s.dateStart || '';
        this.dateEnd = s.dateEnd || '';
        this.sortDesc = s.sortDesc !== undefined ? !!s.sortDesc : this.sortDesc;
        this.pageSize = s.pageSize || this.pageSize;
      } catch {}
    }
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const box = this.authService.hasRole('accountant') ? 'accountant' : 'admin';
    this.messageService.getStaffMessages(box as any).subscribe({
      next: (res: any) => {
        this.loading = false;
        if (Array.isArray(res?.messages)) this.messages = res.messages;
        else if (Array.isArray(res)) this.messages = res;
        else this.messages = [];
        this.recipients = Array.from(new Set(this.messages.map(m => (m.recipientName || m.recipient || '').trim()).filter(Boolean)));
        this.applyFilter();
        if (this.pendingSelectId) {
          const m = this.messages.find(x => String(x.id || '') === String(this.pendingSelectId));
          if (m) this.selected = m;
        }
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load outgoing messages';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  applyFilter(): void {
    const q = (this.query || '').toLowerCase();
    let start = this.dateStart ? new Date(this.dateStart).getTime() : 0;
    let end = this.dateEnd ? new Date(this.dateEnd).getTime() : Number.MAX_SAFE_INTEGER;
    
    if (this.dateFilter) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      
      if (this.dateFilter === 'today') {
        start = today;
        end = today + 86400000;
      } else if (this.dateFilter === 'week') {
        const dayOfWeek = now.getDay();
        const weekStart = today - (dayOfWeek * 86400000);
        start = weekStart;
        end = Number.MAX_SAFE_INTEGER;
      } else if (this.dateFilter === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        start = monthStart;
        end = Number.MAX_SAFE_INTEGER;
      }
    }
    
    const recipient = (this.recipientFilter || '').toLowerCase();
    
    this.filtered = this.messages.filter(m => {
      const subject = (m.subject || '').toLowerCase();
      const body = (m.message || '').toLowerCase();
      const recip = (m.recipientName || m.recipient || '').toLowerCase();
      const t = m.createdAt ? new Date(m.createdAt).getTime() : 0;
      const matchesQuery = !q || subject.includes(q) || body.includes(q) || recip.includes(q);
      const matchesRecipient = !recipient || recip === recipient;
      const matchesDate = (!start || t >= start) && (!end || t <= end);
      return matchesQuery && matchesRecipient && matchesDate;
    }).sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return this.sortDesc ? (tb - ta) : (ta - tb);
    });
    
    this.page = 1;
    this.updatePagination();
    this.saveFilters();
  }

  private saveFilters(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        query: this.query,
        recipientFilter: this.recipientFilter,
        dateStart: this.dateStart,
        dateEnd: this.dateEnd,
        sortDesc: this.sortDesc,
        pageSize: this.pageSize
      }));
    } catch {}
  }

  setDateFilter(filter: string): void {
    this.dateFilter = filter;
    if (filter) {
      this.dateStart = '';
      this.dateEnd = '';
    }
    this.applyFilter();
  }

  open(m: any): void {
    this.selected = m;
    const id = m?.id;
    if (id) {
      this.router.navigate([], { queryParams: { id }, queryParamsHandling: 'merge' });
    }
  }

  getRecipientInitial(m: any): string {
    const name = m?.recipientName || m?.recipient || 'P';
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

  getTodayCount(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();
    return this.messages.filter(m => {
      const t = m.createdAt ? new Date(m.createdAt).getTime() : 0;
      return t >= todayTime;
    }).length;
  }

  getThisWeekCount(): number {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
    return this.messages.filter(m => {
      const t = m.createdAt ? new Date(m.createdAt).getTime() : 0;
      return t >= weekStart;
    }).length;
  }

  clearFilters(): void {
    this.query = '';
    this.recipientFilter = '';
    this.dateStart = '';
    this.dateEnd = '';
    this.dateFilter = '';
    this.applyFilter();
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.page = 1;
    this.updatePagination();
    this.saveFilters();
  }

  goToPage(p: number): void {
    if (p < 1) p = 1;
    if (p > this.totalPages) p = this.totalPages;
    this.page = p;
    this.updatePagination();
  }

  updatePagination(): void {
    this.totalPages = Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    const startIndex = (this.page - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.displayed = this.filtered.slice(startIndex, endIndex);
  }

  exportCSV(): void {
    this.exportMessages(this.filtered);
  }

  exportSelectedCSV(): void {
    const selectedMessages = this.filtered.filter(m => this.isRowSelected(m));
    this.exportMessages(selectedMessages);
  }

  private exportMessages(messages: any[]): void {
    const rows = messages.map(m => ({
      Subject: m.subject || '',
      Recipient: m.recipientName || m.recipient || '',
      Date: this.formatDate(m.createdAt),
      Message: (m.message || '').replace(/\r?\n/g, ' ')
    }));
    const header = Object.keys(rows[0] || { Subject: '', Recipient: '', Date: '', Message: '' });
    const csv = [
      header.join(','),
      ...rows.map(r => header.map(h => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sent-messages.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  copySelected(): void {
    if (!this.selected) return;
    const text = `Subject: ${this.selected.subject || ''}\nTo: ${this.selected.recipientName || this.selected.recipient || ''}\nDate: ${this.formatDate(this.selected.createdAt)}\n\n${this.selected.message || ''}`;
    navigator.clipboard?.writeText(text);
  }

  downloadSelected(): void {
    if (!this.selected) return;
    const text = `Subject: ${this.selected.subject || ''}\nTo: ${this.selected.recipientName || this.selected.recipient || ''}\nDate: ${this.formatDate(this.selected.createdAt)}\n\n${this.selected.message || ''}`;
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
        <div class="meta">To: ${this.selected.recipientName || this.selected.recipient || ''} • ${this.formatDate(this.selected.createdAt)}</div>
        <div class="body">${this.selected.message || ''}</div>
      </body>
      </html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  rowKey(m: any): string {
    const id = String(m?.id || '');
    if (id) return id;
    return `${m.subject || ''}-${m.recipientName || m.recipient || ''}-${m.createdAt || ''}`;
  }

  toggleRowSelection(m: any): void {
    const k = this.rowKey(m);
    if (this.selectedIds.has(k)) {
      this.selectedIds.delete(k);
    } else {
      this.selectedIds.add(k);
    }
  }

  isRowSelected(m: any): boolean {
    return this.selectedIds.has(this.rowKey(m));
  }

  isAllPageSelected(): boolean {
    return this.displayed.length > 0 && this.displayed.every(m => this.selectedIds.has(this.rowKey(m)));
  }

  toggleSelectAllPage(): void {
    if (this.isAllPageSelected()) {
      this.displayed.forEach(m => this.selectedIds.delete(this.rowKey(m)));
    } else {
      this.displayed.forEach(m => this.selectedIds.add(this.rowKey(m)));
    }
  }

  selectPage(): void {
    this.displayed.forEach(m => this.selectedIds.add(this.rowKey(m)));
  }

  clearSelection(): void {
    this.selectedIds.clear();
  }

  get selectedCount(): number {
    return this.filtered.filter(m => this.isRowSelected(m)).length;
  }

  resendSelected(): void {
    if (!this.selected) return;
    const subj = this.selected.subject || '';
    const body = this.selected.message || '';
    this.router.navigate(['/messages/send'], { queryParams: { subject: subj, message: body } });
  }

  forwardMessage(): void {
    if (!this.selected) return;
    const subj = `Fwd: ${this.selected.subject || ''}`;
    const originalInfo = `\n\n--- Original Message ---\nTo: ${this.selected.recipientName || this.selected.recipient || ''}\nDate: ${this.formatDate(this.selected.createdAt)}\n\n`;
    const body = originalInfo + (this.selected.message || '');
    this.router.navigate(['/messages/send'], { queryParams: { subject: subj, message: body } });
  }
}

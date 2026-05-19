import { Component, OnInit } from '@angular/core';
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
  sortDesc = true;
  page = 1;
  pageSize = 10;
  totalPages = 1;
  private pendingSelectId: string | null = null;
  selectedIds = new Set<string>();
  private storageKey = 'outboxFilters';

  constructor(private messageService: MessageService, private authService: AuthService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(p => {
      const id = p.get('id');
      this.pendingSelectId = id;
      if (this.messages.length > 0 && id) {
        const m = this.messages.find(x => String(x.id || '') === String(id));
        if (m) this.selected = m;
      }
    });
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
    this.load();
  }

  load() {
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
      }
    });
  }

  applyFilter() {
    const q = (this.query || '').toLowerCase();
    const start = this.dateStart ? new Date(this.dateStart).getTime() : 0;
    const end = this.dateEnd ? new Date(this.dateEnd).getTime() : Number.MAX_SAFE_INTEGER;
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

  open(m: any) {
    this.selected = m;
    const id = m?.id;
    if (id) {
      this.router.navigate([], { queryParams: { id }, queryParamsHandling: 'merge' });
    }
  }

  formatDate(d: string): string {
    try {
      return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return d;
    }
  }

  toggleSort() {
    this.sortDesc = !this.sortDesc;
    this.applyFilter();
  }

  clearFilters() {
    this.query = '';
    this.recipientFilter = '';
    this.dateStart = '';
    this.dateEnd = '';
    this.applyFilter();
  }

  setPageSize(size: number) {
    this.pageSize = size;
    this.page = 1;
    this.updatePagination();
  }

  goToPage(p: number) {
    if (p < 1) p = 1;
    if (p > this.totalPages) p = this.totalPages;
    this.page = p;
    this.updatePagination();
  }

  updatePagination() {
    this.totalPages = Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    const startIndex = (this.page - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.displayed = this.filtered.slice(startIndex, endIndex);
  }

  exportCSV() {
    const base = this.selectedIds.size > 0 ? this.filtered.filter(m => this.isRowSelected(m)) : this.filtered;
    const rows = base.map(m => ({
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
    a.download = 'outbox.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  copySelected() {
    if (!this.selected) return;
    const text = `Subject: ${this.selected.subject || ''}\nTo: ${this.selected.recipientName || this.selected.recipient || ''}\nDate: ${this.formatDate(this.selected.createdAt)}\n\n${this.selected.message || ''}`;
    navigator.clipboard?.writeText(text);
  }

  downloadSelected() {
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

  printSelected() {
    if (!this.selected) return;
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    const html = `
      <html><head><title>Message</title></head>
      <body>
        <h2>${this.selected.subject || ''}</h2>
        <div>To: ${this.selected.recipientName || this.selected.recipient || ''} • ${this.formatDate(this.selected.createdAt)}</div>
        <pre style="white-space: pre-wrap;">${this.selected.message || ''}</pre>
      </body></html>`;
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

  toggleRowSelection(m: any) {
    const k = this.rowKey(m);
    if (this.selectedIds.has(k)) this.selectedIds.delete(k);
    else this.selectedIds.add(k);
  }

  isRowSelected(m: any): boolean {
    return this.selectedIds.has(this.rowKey(m));
  }

  selectPage() {
    this.displayed.forEach(m => this.selectedIds.add(this.rowKey(m)));
  }

  clearSelection() {
    this.selectedIds.clear();
  }

  get selectedCount(): number {
    return this.filtered.filter(m => this.isRowSelected(m)).length;
  }

  resendSelected() {
    if (!this.selected) return;
    const subj = this.selected.subject || '';
    const body = this.selected.message || '';
    this.router.navigate(['/messages/send'], { queryParams: { subject: subj, message: body } });
  }
}

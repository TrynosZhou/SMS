import { Component, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-draft-messages',
  templateUrl: './draft-messages.component.html',
  styleUrls: ['./draft-messages.component.css']
})
export class DraftMessagesComponent implements OnInit {
  messages: any[] = [];
  filtered: any[] = [];
  selected: any | null = null;
  loading = false;
  resending = false;
  error = '';
  successMessage = '';
  query = '';
  statusFilter: 'all' | 'failed' | 'pending' = 'all';
  sortDesc = true;
  selectedIds = new Set<string>();
  showDeleteConfirm = false;
  draftToDelete: any | null = null;

  constructor(
    private messageService: MessageService,
    private authService: AuthService,
    private router: Router
  ) {}

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showDeleteConfirm) {
      this.showDeleteConfirm = false;
    } else if (this.selected) {
      this.selected = null;
    }
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.messageService.getDraftMessages().subscribe({
      next: (res: any) => {
        this.loading = false;
        this.messages = Array.isArray(res?.messages) ? res.messages : Array.isArray(res) ? res : [];
        this.applyFilter();
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load drafts';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  applyFilter(): void {
    const q = (this.query || '').toLowerCase();
    
    let arr = this.messages.filter(m => {
      const s = (m.subject || '').toLowerCase();
      const b = (m.message || '').toLowerCase();
      const p = (m.parentName || '').toLowerCase();
      const r = (m.failedReason || '').toLowerCase();
      const matchesQuery = !q || s.includes(q) || b.includes(q) || p.includes(q) || r.includes(q);
      
      let matchesStatus = true;
      if (this.statusFilter === 'failed') {
        matchesStatus = !!m.failedReason;
      } else if (this.statusFilter === 'pending') {
        matchesStatus = !m.failedReason;
      }
      
      return matchesQuery && matchesStatus;
    });

    arr.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return this.sortDesc ? (tb - ta) : (ta - tb);
    });

    this.filtered = arr;
  }

  setStatusFilter(filter: 'all' | 'failed' | 'pending'): void {
    this.statusFilter = filter;
    this.applyFilter();
  }

  toggleSort(): void {
    this.sortDesc = !this.sortDesc;
    this.applyFilter();
  }

  select(m: any): void {
    this.selected = m;
  }

  getInitial(name: string): string {
    return (name || 'P').charAt(0).toUpperCase();
  }

  getPreview(message: string): string {
    if (!message) return '';
    const clean = message.replace(/\s+/g, ' ').trim();
    return clean.length > 60 ? clean.substring(0, 60) + '...' : clean;
  }

  timeAgo(d: string): string {
    if (!d) return '';
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

  formatDate(d: string): string {
    if (!d) return '';
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

  getFailedCount(): number {
    return this.messages.filter(m => m.failedReason).length;
  }

  getPendingCount(): number {
    return this.messages.filter(m => !m.failedReason).length;
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

  resend(m: any): void {
    if (!m?.id) return;
    this.resending = true;
    this.error = '';
    this.messageService.resendDraftMessage(m.id).subscribe({
      next: () => {
        this.resending = false;
        this.messages = this.messages.filter(x => x.id !== m.id);
        this.applyFilter();
        this.selected = null;
        this.successMessage = 'Message sent successfully!';
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err: any) => {
        this.resending = false;
        this.error = err?.error?.message || 'Failed to resend message';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  editDraft(m: any): void {
    if (!m) return;
    this.router.navigate(['/messages/send'], { 
      queryParams: { 
        subject: m.subject || '', 
        message: m.message || '',
        draftId: m.id
      } 
    });
  }

  copyDraft(m: any): void {
    if (!m) return;
    const text = `Subject: ${m.subject || ''}\nTo: ${m.parentName || 'Parent'}\n\n${m.message || ''}`;
    navigator.clipboard?.writeText(text);
    this.successMessage = 'Draft copied to clipboard!';
    setTimeout(() => this.successMessage = '', 3000);
  }

  confirmDelete(m: any): void {
    this.draftToDelete = m;
    this.showDeleteConfirm = true;
  }

  deleteDraft(): void {
    if (!this.draftToDelete?.id) {
      this.showDeleteConfirm = false;
      return;
    }
    
    const id = this.draftToDelete.id;
    this.messageService.deleteDraftMessage(id).subscribe({
      next: () => {
        this.messages = this.messages.filter(x => x.id !== id);
        this.applyFilter();
        if (this.selected?.id === id) {
          this.selected = null;
        }
        this.selectedIds.delete(id);
        this.showDeleteConfirm = false;
        this.draftToDelete = null;
        this.successMessage = 'Draft deleted successfully!';
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err: any) => {
        this.showDeleteConfirm = false;
        this.error = err?.error?.message || 'Failed to delete draft';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  isAllSelected(): boolean {
    return this.filtered.length > 0 && this.filtered.every(m => this.selectedIds.has(m.id));
  }

  toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.filtered.forEach(m => this.selectedIds.delete(m.id));
    } else {
      this.filtered.forEach(m => this.selectedIds.add(m.id));
    }
  }

  clearSelection(): void {
    this.selectedIds.clear();
  }

  bulkResend(): void {
    const ids = Array.from(this.selectedIds);
    if (ids.length === 0) return;
    
    this.loading = true;
    let completed = 0;
    let failed = 0;

    const processNext = (index: number) => {
      if (index >= ids.length) {
        this.loading = false;
        this.clearSelection();
        this.applyFilter();
        if (failed > 0) {
          this.error = `${failed} message(s) failed to send`;
          setTimeout(() => this.error = '', 5000);
        }
        if (completed > 0) {
          this.successMessage = `${completed} message(s) sent successfully!`;
          setTimeout(() => this.successMessage = '', 3000);
        }
        return;
      }

      this.messageService.resendDraftMessage(ids[index]).subscribe({
        next: () => {
          completed++;
          this.messages = this.messages.filter(x => x.id !== ids[index]);
          if (this.selected?.id === ids[index]) {
            this.selected = null;
          }
          processNext(index + 1);
        },
        error: () => {
          failed++;
          processNext(index + 1);
        }
      });
    };

    processNext(0);
  }

  bulkDelete(): void {
    const ids = Array.from(this.selectedIds);
    if (ids.length === 0) return;

    this.loading = true;
    let completed = 0;
    let failed = 0;

    const processNext = (index: number) => {
      if (index >= ids.length) {
        this.loading = false;
        this.clearSelection();
        this.applyFilter();
        if (failed > 0) {
          this.error = `${failed} draft(s) failed to delete`;
          setTimeout(() => this.error = '', 5000);
        }
        if (completed > 0) {
          this.successMessage = `${completed} draft(s) deleted successfully!`;
          setTimeout(() => this.successMessage = '', 3000);
        }
        return;
      }

      this.messageService.deleteDraftMessage(ids[index]).subscribe({
        next: () => {
          completed++;
          this.messages = this.messages.filter(x => x.id !== ids[index]);
          if (this.selected?.id === ids[index]) {
            this.selected = null;
          }
          processNext(index + 1);
        },
        error: () => {
          failed++;
          processNext(index + 1);
        }
      });
    };

    processNext(0);
  }
}

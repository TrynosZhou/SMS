import { Component, OnInit } from '@angular/core';
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
  error = '';
  query = '';

  constructor(private messageService: MessageService, private authService: AuthService) {}

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
      }
    });
  }

  applyFilter(): void {
    const q = (this.query || '').toLowerCase();
    this.filtered = this.messages.filter(m => {
      const s = (m.subject || '').toLowerCase();
      const b = (m.message || '').toLowerCase();
      const p = (m.parentName || '').toLowerCase();
      const r = (m.failedReason || '').toLowerCase();
      return !q || s.includes(q) || b.includes(q) || p.includes(q) || r.includes(q);
    });
  }

  select(m: any): void {
    this.selected = m;
  }

  resend(m: any): void {
    if (!m?.id) return;
    this.loading = true;
    this.error = '';
    this.messageService.resendDraftMessage(m.id).subscribe({
      next: () => {
        this.loading = false;
        this.messages = this.messages.filter(x => x.id !== m.id);
        this.applyFilter();
        this.selected = null;
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to resend';
      }
    });
  }

  formatDate(d: string): string {
    if (!d) return '';
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  }
}

import { Component, OnInit } from '@angular/core';
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
  selected: any | null = null;
  loading = false;
  error = '';
  query = '';

  constructor(private messageService: MessageService, private authService: AuthService) {}

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.loading = true;
    this.error = '';
    this.messageService.getStaffMessages('accountant').subscribe({
      next: (res: any) => {
        this.loading = false;
        if (Array.isArray(res?.messages)) this.messages = res.messages;
        else if (Array.isArray(res)) this.messages = res;
        else this.messages = [];
        this.applyFilter();
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load outgoing messages';
      }
    });
  }

  applyFilter() {
    const q = (this.query || '').toLowerCase();
    if (!q) {
      this.filtered = this.messages;
      return;
    }
    this.filtered = this.messages.filter(m =>
      (m.subject || '').toLowerCase().includes(q) ||
      (m.message || '').toLowerCase().includes(q) ||
      (m.recipientName || '').toLowerCase().includes(q)
    );
  }

  open(m: any) {
    this.selected = m;
  }

  formatDate(d: string): string {
    try { return new Date(d).toLocaleString(); } catch { return d; }
  }
}

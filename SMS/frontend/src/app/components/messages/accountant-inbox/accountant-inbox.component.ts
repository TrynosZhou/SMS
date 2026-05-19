import { Component, OnInit } from '@angular/core';
import { MessageService } from '../../../services/message.service';
import { AuthService } from '../../../services/auth.service';

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

  constructor(
    private messageService: MessageService,
    private authService: AuthService
  ) {
    const user = this.authService.getCurrentUser();
    this.userName = user?.username || user?.email || 'Accountant';
  }

  ngOnInit(): void {
    this.loadMessages();
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
        setTimeout(() => this.error = '', 5000);
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
      (m.senderName || '').toLowerCase().includes(q)
    );
  }

  formatDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString();
    } catch {
      return dateStr;
    }
  }
}

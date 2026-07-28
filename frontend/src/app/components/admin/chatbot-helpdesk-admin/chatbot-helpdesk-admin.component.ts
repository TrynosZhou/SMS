import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import {
  ChatbotConversation,
  ChatbotService,
  ChatbotTicket,
} from '../../../services/chatbot.service';

@Component({
  standalone: false,
  selector: 'app-chatbot-helpdesk-admin',
  templateUrl: './chatbot-helpdesk-admin.component.html',
  styleUrls: ['./chatbot-helpdesk-admin.component.css'],
})
export class ChatbotHelpdeskAdminComponent implements OnInit {
  tab: 'tickets' | 'conversations' = 'tickets';
  tickets: ChatbotTicket[] = [];
  conversations: ChatbotConversation[] = [];
  selectedMessages: any[] = [];
  selectedConversation: ChatbotConversation | null = null;
  statusFilter = 'open';
  ticketSearch = '';
  loading = true;
  error = '';
  success = '';
  notesDraft = '';
  updatingId: string | null = null;
  aiStatus = { configured: false, model: 'gpt-4o-mini' };

  readonly statuses = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
  ];

  constructor(
    private chatbot: ChatbotService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.chatbot.getStatus().subscribe({
      next: (s) => {
        this.aiStatus = s;
        this.cdr.detectChanges();
      },
    });
    this.loadTickets();
    this.preloadConversationCount();
  }

  get openTicketCount(): number {
    return this.tickets.filter((t) => t.status === 'open').length;
  }

  get filteredTickets(): ChatbotTicket[] {
    const q = (this.ticketSearch || '').trim().toLowerCase();
    if (!q) return this.tickets;
    return this.tickets.filter((t) => {
      const hay = [
        t.subject,
        t.description,
        t.contactEmail,
        t.contactPhone,
        t.userRole,
        t.adminNotes,
        t.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  statusLabel(status: string): string {
    const found = this.statuses.find((s) => s.value === status);
    return found?.label || status;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'open':
        return 'hd-badge--open';
      case 'in_progress':
        return 'hd-badge--progress';
      case 'resolved':
        return 'hd-badge--resolved';
      case 'closed':
        return 'hd-badge--closed';
      default:
        return '';
    }
  }

  roleInitial(role?: string | null): string {
    const r = (role || 'g').trim();
    return (r[0] || 'G').toUpperCase();
  }

  refresh(): void {
    if (this.tab === 'tickets') this.loadTickets();
    else this.loadConversations();
  }

  setTab(tab: 'tickets' | 'conversations'): void {
    this.tab = tab;
    this.error = '';
    this.success = '';
    if (tab === 'tickets') this.loadTickets();
    else this.loadConversations();
  }

  private preloadConversationCount(): void {
    this.chatbot.listConversations().subscribe({
      next: (list) => {
        this.conversations = Array.isArray(list) ? list : [];
        this.cdr.detectChanges();
      },
    });
  }

  loadTickets(): void {
    this.loading = true;
    this.error = '';
    this.chatbot.listTickets(this.statusFilter).subscribe({
      next: (list) => {
        this.tickets = Array.isArray(list) ? list : [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load tickets';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  loadConversations(): void {
    this.loading = true;
    this.error = '';
    this.selectedConversation = null;
    this.selectedMessages = [];
    this.chatbot.listConversations().subscribe({
      next: (list) => {
        this.conversations = Array.isArray(list) ? list : [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load conversations';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  openConversation(c: ChatbotConversation): void {
    this.selectedConversation = c;
    this.error = '';
    this.chatbot.getConversationMessages(c.id).subscribe({
      next: (res) => {
        this.selectedMessages = res?.messages || [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load messages';
        this.cdr.detectChanges();
      },
    });
  }

  updateTicket(t: ChatbotTicket, status: string): void {
    this.updatingId = t.id;
    this.error = '';
    this.success = '';
    this.chatbot
      .updateTicket(t.id, { status, adminNotes: this.notesDraft || t.adminNotes || undefined })
      .subscribe({
        next: () => {
          this.notesDraft = '';
          this.updatingId = null;
          this.success = `Ticket marked as ${this.statusLabel(status).toLowerCase()}.`;
          this.loadTickets();
        },
        error: (err) => {
          this.updatingId = null;
          this.error = err?.error?.message || 'Update failed';
          this.cdr.detectChanges();
        },
      });
  }
}

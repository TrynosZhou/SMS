import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ChatbotService, ChatbotChatResponse } from '../../../services/chatbot.service';

interface ChatUiMessage {
  role: 'user' | 'assistant';
  content: string;
  fromCache?: boolean;
}

@Component({
  standalone: false,
  selector: 'app-chatbot-widget',
  templateUrl: './chatbot-widget.component.html',
  styleUrls: ['./chatbot-widget.component.css'],
})
export class ChatbotWidgetComponent implements OnInit, OnDestroy {
  open = false;
  escalateMode = false;
  sending = false;
  escalating = false;
  error = '';
  draft = '';
  escalateSubject = 'Helpdesk support request';
  escalateDescription = '';
  escalateEmail = '';
  escalatePhone = '';
  escalateSuccess = '';
  messages: ChatUiMessage[] = [];
  aiConfigured = true;

  private sub?: Subscription;
  private onLoginPage = false;

  constructor(
    private chatbot: ChatbotService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.onLoginPage = (this.router.url || '').startsWith('/login');
    this.sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.onLoginPage = (e.urlAfterRedirects || e.url || '').startsWith('/login');
        this.cdr.markForCheck();
      });

    this.chatbot.getStatus().subscribe({
      next: (s: { configured: boolean; model: string }) => {
        this.aiConfigured = !!s?.configured;
        this.cdr.markForCheck();
      },
      error: () => {
        this.aiConfigured = false;
      },
    });

    if (!this.messages.length) {
      this.messages = [
        {
          role: 'assistant',
          content:
            'Hi! I am the school helpdesk assistant. Ask me about admissions, fees, report cards, passwords, or how to use this system. If I cannot help, escalate to human support.',
        },
      ];
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** Show on authenticated app pages and on login (prospective applicants). */
  get visible(): boolean {
    if (this.onLoginPage) return true;
    return this.auth.isAuthenticated();
  }

  toggle(): void {
    this.open = !this.open;
    this.error = '';
    this.escalateSuccess = '';
    if (!this.open) this.escalateMode = false;
  }

  private currentRole(): string {
    try {
      const effective = (this.auth as any).getEffectiveRole?.();
      if (effective) return String(effective).toLowerCase();
    } catch {
      /* ignore */
    }
    const user = this.auth.getCurrentUser();
    if (user?.role) return String(user.role).toLowerCase();
    if (this.onLoginPage) return 'public';
    return 'public';
  }

  send(): void {
    const text = (this.draft || '').trim();
    if (!text || this.sending) return;

    this.error = '';
    this.messages.push({ role: 'user', content: text });
    this.draft = '';
    this.sending = true;
    this.cdr.detectChanges();

    this.chatbot.chat(text, this.currentRole()).subscribe({
      next: (res: ChatbotChatResponse) => {
        if (res?.conversationId) this.chatbot.storeConversationId(res.conversationId);
        this.messages.push({
          role: 'assistant',
          content: res?.reply || 'No response received.',
          fromCache: !!res?.fromCache,
        });
        this.sending = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.sending = false;
        this.error =
          err?.error?.message ||
          (err?.status === 429
            ? 'Rate limit reached. Please wait and try again.'
            : 'Could not reach helpdesk. Please try again.');
        this.cdr.detectChanges();
      },
    });
  }

  openEscalate(): void {
    this.escalateMode = true;
    this.escalateSuccess = '';
    this.error = '';
    if (!this.escalateDescription) {
      const lastUser = [...this.messages].reverse().find((m) => m.role === 'user');
      this.escalateDescription = lastUser?.content || '';
    }
    const user = this.auth.getCurrentUser();
    if (user?.email && !this.escalateEmail) {
      this.escalateEmail = String(user.email);
    }
  }

  cancelEscalate(): void {
    this.escalateMode = false;
  }

  submitEscalate(): void {
    const description = (this.escalateDescription || '').trim();
    if (!description || this.escalating) return;
    this.escalating = true;
    this.error = '';
    this.chatbot
      .escalate({
        subject: this.escalateSubject || 'Helpdesk support request',
        description,
        contactEmail: this.escalateEmail || undefined,
        contactPhone: this.escalatePhone || undefined,
        role: this.currentRole(),
      })
      .subscribe({
        next: (res: { ticket: any; message: string }) => {
          this.escalating = false;
          this.escalateMode = false;
          this.escalateSuccess = res?.message || 'Ticket created.';
          this.messages.push({
            role: 'assistant',
            content:
              'Your support ticket was created. School administrators will follow up using the contact details you provided.',
          });
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.escalating = false;
          this.error = err?.error?.message || 'Failed to create ticket';
          this.cdr.detectChanges();
        },
      });
  }

  newChat(): void {
    this.chatbot.clearConversation();
    this.messages = [
      {
        role: 'assistant',
        content: 'New conversation started. How can I help you?',
      },
    ];
    this.error = '';
    this.escalateSuccess = '';
    this.escalateMode = false;
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }
}

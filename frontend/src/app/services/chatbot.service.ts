import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ChatbotFaq {
  id?: string;
  question: string;
  answer: string;
  keywords?: string | null;
  category?: string;
  audience?: string;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatbotChatResponse {
  conversationId: string;
  sessionId: string;
  reply: string;
  fromCache?: boolean;
  escalateHint?: string;
}

export interface ChatbotTicket {
  id: string;
  conversationId?: string | null;
  userId?: string | null;
  userRole?: string | null;
  subject: string;
  description: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  adminNotes?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ChatbotConversation {
  id: string;
  userId?: string | null;
  sessionId: string;
  userRole?: string | null;
  lastUserMessage?: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private readonly apiUrl = `${environment.apiUrl}/chatbot`;
  private static readonly SESSION_KEY = 'sms_chatbot_session';
  private static readonly CONV_KEY = 'sms_chatbot_conversation';

  constructor(private http: HttpClient) {}

  getOrCreateSessionId(): string {
    try {
      let id = sessionStorage.getItem(ChatbotService.SESSION_KEY);
      if (!id) {
        id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem(ChatbotService.SESSION_KEY, id);
      }
      return id;
    } catch {
      return `sess_${Date.now()}`;
    }
  }

  getStoredConversationId(): string | null {
    try {
      return sessionStorage.getItem(ChatbotService.CONV_KEY);
    } catch {
      return null;
    }
  }

  storeConversationId(id: string): void {
    try {
      sessionStorage.setItem(ChatbotService.CONV_KEY, id);
    } catch {
      /* ignore */
    }
  }

  clearConversation(): void {
    try {
      sessionStorage.removeItem(ChatbotService.CONV_KEY);
    } catch {
      /* ignore */
    }
  }

  getStatus(): Observable<{ configured: boolean; model: string }> {
    return this.http.get<{ configured: boolean; model: string }>(`${this.apiUrl}/status`);
  }

  listFaqs(includeInactive = false): Observable<ChatbotFaq[]> {
    let params = new HttpParams();
    if (includeInactive) params = params.set('includeInactive', '1');
    return this.http.get<ChatbotFaq[]>(`${this.apiUrl}/faqs`, { params });
  }

  chat(message: string, role?: string): Observable<ChatbotChatResponse> {
    return this.http.post<ChatbotChatResponse>(`${this.apiUrl}/chat`, {
      message,
      sessionId: this.getOrCreateSessionId(),
      conversationId: this.getStoredConversationId(),
      role: role || undefined,
    });
  }

  escalate(payload: {
    subject?: string;
    description: string;
    contactEmail?: string;
    contactPhone?: string;
    role?: string;
  }): Observable<{ ticket: ChatbotTicket; message: string }> {
    return this.http.post<{ ticket: ChatbotTicket; message: string }>(`${this.apiUrl}/escalate`, {
      ...payload,
      sessionId: this.getOrCreateSessionId(),
      conversationId: this.getStoredConversationId(),
    });
  }

  createFaq(faq: ChatbotFaq): Observable<ChatbotFaq> {
    return this.http.post<ChatbotFaq>(`${this.apiUrl}/faqs`, faq);
  }

  updateFaq(id: string, faq: Partial<ChatbotFaq>): Observable<ChatbotFaq> {
    return this.http.put<ChatbotFaq>(`${this.apiUrl}/faqs/${id}`, faq);
  }

  deleteFaq(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/faqs/${id}`);
  }

  listConversations(): Observable<ChatbotConversation[]> {
    return this.http.get<ChatbotConversation[]>(`${this.apiUrl}/admin/conversations`);
  }

  getConversationMessages(id: string): Observable<{ conversation: ChatbotConversation; messages: any[] }> {
    const params = new HttpParams().set('sessionId', this.getOrCreateSessionId());
    return this.http.get<{ conversation: ChatbotConversation; messages: any[] }>(
      `${this.apiUrl}/conversations/${id}/messages`,
      { params }
    );
  }

  listTickets(status = 'all'): Observable<ChatbotTicket[]> {
    const params = new HttpParams().set('status', status);
    return this.http.get<ChatbotTicket[]>(`${this.apiUrl}/admin/tickets`, { params });
  }

  updateTicket(
    id: string,
    body: { status?: string; adminNotes?: string }
  ): Observable<ChatbotTicket> {
    return this.http.patch<ChatbotTicket>(`${this.apiUrl}/admin/tickets/${id}`, body);
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  sendBulkMessage(messageData: { subject: string; message: string; recipients: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/bulk`, messageData);
  }

  sendBulkMessageWithAttachments(subject: string, message: string, recipients: string, files: File[] = []): Observable<any> {
    const form = new FormData();
    form.append('subject', subject);
    form.append('message', message);
    form.append('recipients', recipients);
    files.forEach(f => {
      form.append('attachments', f);
    });
    return this.http.post(`${this.apiUrl}/messages/bulk`, form);
  }

  sendMessageToSpecificParents(subject: string, message: string, parentIds: string[], files: File[] = []): Observable<any> {
    const form = new FormData();
    form.append('subject', subject);
    form.append('message', message);
    parentIds.forEach(id => {
      form.append('parentIds', id);
      form.append('parent_ids', id);
      form.append('parents', id);
    });
    files.forEach(f => {
      form.append('attachments', f);
      form.append('files', f);
    });
    return this.http.post(`${this.apiUrl}/messages/send`, form);
  }

  sendMessageToSpecificParentsJSON(subject: string, message: string, parentIds: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/send`, {
      subject,
      message,
      parentIds
    });
  }

  getParentMessages(): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/parent`);
  }

  getParentInboxUnreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.apiUrl}/messages/parent/unread-count`);
  }

  markParentMessageRead(messageId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/parent/${messageId}/read`, {});
  }

  deleteParentInboxMessage(messageId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/messages/parent/${messageId}`);
  }

  sendParentMessage(recipient: 'admin' | 'accountant', subject: string, message: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/parent/send`, {
      recipient,
      subject,
      message
    });
  }

  sendParentMessageWithAttachments(recipient: 'admin' | 'accountant', subject: string, message: string, files: File[]): Observable<any> {
    const form = new FormData();
    form.append('recipient', recipient);
    form.append('subject', subject);
    form.append('message', message);
    files.forEach(f => form.append('attachments', f));
    return this.http.post(`${this.apiUrl}/messages/parent/send`, form);
  }

  getParentOutbox(): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/parent/outbox`);
  }

  getParentOutboxById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/parent/outbox/${id}`);
  }

  getIncomingFromParents(box: 'admin' | 'accountant'): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/incoming/parents`, { params: { box } as any });
  }

  getIncomingFromParentsUnreadCount(box: 'admin' | 'accountant'): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.apiUrl}/messages/incoming/parents/unread-count`, {
      params: { box } as any
    });
  }

  /** Lightweight parent list for staff compose-message recipient picker */
  getParentRecipients(): Observable<{ parents: Array<{ id: string; firstName: string; lastName: string; email?: string | null; phoneNumber?: string | null }> }> {
    return this.http.get<{ parents: Array<{ id: string; firstName: string; lastName: string; email?: string | null; phoneNumber?: string | null }> }>(
      `${this.apiUrl}/messages/parents/recipients`
    );
  }

  markIncomingRead(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/incoming/${id}/read`, {});
  }

  markIncomingUnread(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/incoming/${id}/unread`, {});
  }

  deleteIncomingMessage(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/messages/incoming/${id}`);
  }

  replyToIncoming(id: string, subject: string, message: string, files: File[] = []): Observable<any> {
    const form = new FormData();
    form.append('subject', subject);
    form.append('message', message);
    files.forEach(f => form.append('attachments', f));
    return this.http.post(`${this.apiUrl}/messages/incoming/${id}/reply`, form);
  }

  /** Staff outbox: messages sent by the signed-in user (optional box filter for admins). */
  getStaffMessages(box?: 'accountant' | 'admin' | 'teacher'): Observable<any> {
    const params: Record<string, string> = {};
    if (box) {
      params['box'] = box;
    }
    return this.http.get(`${this.apiUrl}/messages/staff`, { params });
  }

  getDraftMessages(): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/drafts`);
  }

  resendDraftMessage(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/drafts/${id}/resend`, {});
  }

  deleteDraftMessage(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/messages/drafts/${id}`);
  }
}
